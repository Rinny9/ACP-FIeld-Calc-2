// Draw-volume rounding regression against the last published clinical engine.
// Independent decimal arithmetic supplies expected step values; the old engine
// supplies every original dose, condition, limit, route, source and age gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const {migrateDrawFixture}=require('./draw-volume-fixture.cjs');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show',`${process.env.COMPARE_REF||'721bc4a'}:index.html`],{cwd:root,encoding:'utf8'});
const plain=value=>JSON.parse(JSON.stringify(value));
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE'));
const block=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end));
const model=s=>{const ctx=vm.createContext({module:{exports:{}}});vm.runInContext(clinical(s)+'\nglobalThis.engine={buildPatient,airway,drugCalcs,shockIndex,ivDrip,parkland,dopamineRate,dopamineLines,pushDoseEpi,CONC,DIR,mlRound,...(typeof drawInfo===\'function\'?{drawInfo,drawMl,drawMlRange}:{})};',ctx);return ctx;};
// Decimal rational rounding, independent of the implementation's Number math.
// Twelve significant figures discard arithmetic representation noise at ties.
function expectedStep(value){
  const text=Number(value).toPrecision(12),match=text.match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);assert.ok(match,'Nonnegative finite draw input');
  let numerator=BigInt(match[1]+(match[2]||'')),denominator=10n**BigInt((match[2]||'').length),exponent=Number(match[3]||0);
  if(exponent>=0)numerator*=10n**BigInt(exponent);else denominator*=10n**BigInt(-exponent);
  const steps=(40n*numerator+denominator)/(2n*denominator);
  return Number(steps)/20;
}
function replaceFormattedDraws(source,replacement){
  let position=0,out='';
  while(true){
    const start=source.indexOf('fmt(mlRound(',position);if(start<0)return out+source.slice(position);
    const arg=start+'fmt(mlRound('.length;let depth=1,end=arg;
    for(;end<source.length&&depth;end++){if(source[end]==='(')depth++;else if(source[end]===')')depth--;}
    assert.equal(source[end],')','Expected outer fmt wrapper');
    out+=source.slice(position,start)+replacement(source.slice(arg,end-1));position=end+1;
  }
}
const old=model(baseline),current=model(html);
const migratedBaseline=migrateDrawFixture(baseline,html);
assert.equal(clinical(html).replace(/\r/g,''),clinical(migratedBaseline).replace(/\r/g,''),'Clinical source differs only in tested draw helpers and original volume wrappers');
assert.deepEqual(plain(current.engine.CONC),plain(old.engine.CONC),'Stock concentrations unchanged');
assert.deepEqual(plain(current.engine.DIR),plain(old.engine.DIR),'Every directive, dose, condition and caution unchanged');
assert.equal(block(html,'const SRC_LINKS=','function drawHTML(').replace(/\r/g,''),block(baseline,'const SRC_LINKS=','function drawHTML(').replace(/\r/g,''),'Source URLs, page mappings and reference helpers unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],baseline.match(/const PEDS54\s*=([^\n]+)/)[1],'Published pediatric chart transcription unchanged');
for(const key of ['buildPatient','airway','shockIndex','ivDrip','parkland','dopamineRate','dopamineLines','pushDoseEpi'])assert.equal(current.engine[key].toString(),old.engine[key].toString(),key+' source/formula unchanged');

const boundaryCases=[[0,0],[.02499999,0],[.025,.05],[.02500001,.05],[.04999999,.05],[.05,.05],[.07499999,.05],[.075,.1],[.07500001,.1],[.12499999,.1],[.125,.15],[.17499999,.15],[.175,.2],[.22499999,.2],[.225,.25],[.975,1],[1.025,1.05],[9.975,10],[10.025,10.05],[19.975,20],[100.025,100.05]];
for(const [value,expected]of boundaryCases){assert.equal(expectedStep(value),expected,'Independent boundary oracle');assert.equal(current.engine.mlRound(value),expected,'Nearest0.05 mL boundary '+value);}
assert.equal(typeof current.engine.drawInfo,'function','Structured rounding result is testable independently of the renderer');
for(const [raw,options,status,value]of [
  [.05,{},'exact',.05],[.1,{},'exact',.1],
  [.001,{},'precision',.001],[.024,{},'precision',.024],[.025,{max:1},'precision',.025],[.049,{max:1},'precision',.049],
  [.074,{},'rounded',.05],[.075,{},'limit',.075],[.075,{max:1},'rounded',.1],
  [.175,{max:1},'rounded',.2],[.525,{max:1},'rounded',.55],[.525,{},'limit',.525],
  [.7185,{max:.8},'rounded',.7],[.788,{max:.79},'limit',.788],
  [.17,{min:.17,max:.335},'limit',.17],[.335,{min:.17,max:.335},'limit',.335],
  [10.025,{max:12},'rounded',10.05],[100.025,{max:101},'rounded',100.05]
]){
  const info=plain(current.engine.drawInfo(raw,options));assert.equal(info.status,status,'Draw status '+JSON.stringify({raw,options}));assert.ok(nearNumber(info.value,value),'Bound-aware draw value '+raw);assert.ok(nearNumber(info.calculated,raw),'Original calculated volume retained '+raw);assert.ok(nearNumber(info.nearest,expectedStep(raw)),'Nearest increment retained '+raw);
}
for(const invalid of [0,NaN,Infinity,-1])assert.equal(current.engine.drawInfo(invalid).status,'invalid','Invalid input must not produce a draw');
for(const options of [{min:-1},{min:2,max:1},{min:NaN},{max:NaN}])assert.equal(current.engine.drawInfo(1,options).status,'invalid','Invalid bounds must not produce a draw');
assert.match(current.engine.drawMl(1e-9),/Calculated <0\.000001 mL/,'Extremely small positive draw retains a nonzero representation');
assert.match(current.engine.drawMl(1e-9),/verify/);
assert.match(current.engine.drawMl(.074),/Calculated 0\.074 mL.*Verify rounded draw against dose/,'Even a nonzero rounded draw requires visible dose verification');
assert.match(current.engine.drawMlRange(1e15,2e15),/^Verify dose \/ concentration/,'Unsupported numeric ranges do not display a draw');
assert.match(current.engine.drawMlRange(.17,.335),/^Calculated 0\.17–0\.335 mL\n.*verify/,'Range outside both allowable rounding endpoints remains exact');
assert.match(current.engine.drawMlRange(.13125,.2625),/^≈ 0\.15–0\.25 mL\nCalculated 0\.13125–0\.2625 mL/,'Permitted range endpoints independently round inward');
function nearNumber(a,b){return typeof a==='number'&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));}

const bypasses=['Math.min(2 * w, 50)','Math.min(2 * w, 250)','Math.min(1 * w, 50)'];
let instrumented=replaceFormattedDraws(baseline,arg=>'__rawDraw('+arg+')');
for(const expression of bypasses){const before='${Math.round('+expression+')} mL';assert.equal(instrumented.split(before).length-1,1,'Known dextrose draw bypass');instrumented=instrumented.replace(before,'${__rawDraw('+expression+')} mL');}
const reference=model(instrumented);
reference.__draws=[];reference.__rawDraw=value=>{const index=reference.__draws.push(value)-1;return '§'+index+'§';};
const near=(a,b)=>Math.abs(a-b)<=5.1e-7+1e-10*Math.max(1,Math.abs(a),Math.abs(b));
const escaped=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let drawsChecked=0,roundedChecked=0,precisionChecked=0;
function compareDraw(actual,expected,description){
  assert.equal(typeof actual,'string',description+': draw text retained');
  const rawValues=[],pattern=escaped(expected).replace(/§(\d+)§/g,(_,id)=>{rawValues.push(reference.__draws[Number(id)]);return '([0-9]+(?:\\.[0-9]+)?(?:e[+-]?[0-9]+)?)';});
  const [first,...notes]=actual.split('\n'),main=first.replace(/≈\s*/g,'').replace(/^Calculated /,'');
  if(rawValues.every(value=>value===0)){
    assert.match(first,/Verify dose \/ concentration/);assert.match(notes.join(' '),/No valid positive draw/);assert.doesNotMatch(first,/(?:^|\s)0(?:\.0+)?\s*mL\b/);return;
  }
  const match=main.match(new RegExp('^'+pattern+'$','i'));assert.ok(match,description+': draw route/formulation/range text unchanged: '+actual);
  const note=notes.join(' ');
  const tolerance=raw=>1e-10*Math.max(1,Math.abs(raw));
  const outside=(nearest,min,max)=>nearest<min-tolerance(min)||nearest>max+tolerance(max);
  const retain=rawValues.some(raw=>raw>0&&raw<.05)||rawValues.some(raw=>outside(expectedStep(raw),rawValues.length>1?rawValues[0]:0,rawValues.length>1?rawValues.at(-1):raw));
  const expectedValues=rawValues.map(raw=>retain?Number(raw.toFixed(6)):expectedStep(raw));
  expectedValues.forEach((expected,index)=>assert.ok(nearNumber(Number(match[index+1]),expected),description+': correct bounded rounding choice for endpoint'+index));
  if(retain){assert.ok(first.startsWith('Calculated '),description+': exception identifies original calculation');assert.match(note,/verify/i,description+': exception requires verification');}
  else if(rawValues.some((raw,index)=>!nearNumber(raw,expectedValues[index])))assert.ok(first.startsWith('≈ '),description+': rounded approximation clearly identified');
  rawValues.forEach((raw,index)=>{
    const value=Number(match[index+1]),nearest=expectedStep(raw);drawsChecked++;
    assert.ok(near(value,raw)||near(value,nearest),description+': displayed draw is exact or nearest0.05 step');
    if(raw>0&&raw<.05){
      precisionChecked++;assert.ok(value>0&&near(value,raw),description+': positive sub-step draw is never zero or rounded up');assert.match(note,/verify|precision|measure/i,description+': small draw verification visible');
    }else if(!near(value,raw)){
      roundedChecked++;assert.ok(first.includes('≈'),description+': changed draw clearly approximate');assert.ok(near(value*20,Math.round(value*20)),description+': rounded draw follows0.05 step');assert.match(note,/Calculated/i,description+': exact calculated volume remains available');
    }else if(!near(raw,nearest))assert.match(note,/verify|limit|precision|measure/i,description+': retained non-step draw requires verification');
  });
  if(rawValues.some(raw=>raw>0))assert.doesNotMatch(first,/(?:^|\s)0(?:\.0+)?\s*mL\b/i,description+': no zero-mL clinical draw');
}
function compareClinical(actual,expected,description){
  if(typeof expected==='string'&&/§\d+§/.test(expected)){compareDraw(actual,expected,description);return;}
  if(Array.isArray(expected)){assert.ok(Array.isArray(actual),description);assert.equal(actual.length,expected.length,description+': no treatment removed/added');expected.forEach((value,index)=>compareClinical(actual[index],value,description+'['+index+']'));return;}
  if(expected&&typeof expected==='object'){
    assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),description+': clinical fields preserved');
    for(const key of Object.keys(expected))compareClinical(actual[key],expected[key],description+'.'+key);return;
  }
  assert.deepEqual(actual,expected,description+': original clinical content unchanged');
}
const ages=[0,.5/365.25,1/365.25,.5,1,1.99,2,7.99,8,11.99,12,15,16,17,18,28,65,90,null];
const weights=[.8,2.5,4.375,6.25,8.5,9.33,10.25,12.25,14.37,18.75,24.99,25,26.25,33.3,49.5,50,73.25,80,125.5,null];
let checked=0;
for(const stockScale of [1,.73,2.4]){
  for(const key of Object.keys(current.engine.CONC)){
    const original=old.engine.CONC[key].v;
    current.engine.CONC[key].v=reference.engine.CONC[key].v=current.engine.CONC[key].fixed?original:original*stockScale;
  }
  for(const ageYears of ages)for(const weightKg of weights){
    const input={ageYears,weightKg,suppressWeightEstimate:weightKg==null},pt=current.engine.buildPatient(input);
    assert.deepEqual(plain(pt),plain(old.engine.buildPatient(input)),'Patient classification and age gates unchanged');
    reference.__draws.length=0;
    const expected=plain(reference.engine.drugCalcs(pt)),actual=plain(current.engine.drugCalcs(pt));
    compareClinical(actual,expected,JSON.stringify({ageYears,weightKg,stockScale}));checked++;
  }
}
for(const key of Object.keys(current.engine.CONC))current.engine.CONC[key].v=old.engine.CONC[key].v;
assert.ok(drawsChecked>15000&&roundedChecked>1000&&precisionChecked>100,'Rounding sweep exercises medication draws, changed results and tiny positive draws');
assert.match(html,/const APP_BUILD='2026\.11\.03\.1'/);

const assets=['field-ui.css','field-shell.js','field-home.js','manifest.webmanifest','icon.svg'];
const files=new Map([['/',html],['/index.html',html],...assets.map(name=>['/'+name,fs.readFileSync(path.join(root,name),'utf8')])]);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,body=files.get(name);res.writeHead(body?200:404,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});res.end(body||'Not found');});
function doseGeometry(){
  const issues=[],root=document.querySelector(activePane==='critical'?'#critical':'#homeDirectiveDetail');
  if(document.documentElement.scrollWidth>innerWidth+1||root.scrollWidth>root.clientWidth+1)issues.push('Horizontal overflow');
  for(const row of root.querySelectorAll('.row')){
    const box=row.getBoundingClientRect();
    for(const element of row.querySelectorAll('.rdose,.rml,.rlD,.rlM,.rsml,.rsv>.num')){
      if(!element.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(element);
      if([...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1))issues.push('Clipped dose '+row.querySelector('.rname')?.textContent);
    }
    for(const element of row.querySelectorAll('.dose-amount')){
      if(!element.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(element);
      if(new Set([...range.getClientRects()].filter(r=>r.width>.1).map(r=>Math.round(r.top))).size>1)issues.push('Vertically split quantity '+element.textContent);
    }
  }
  return [...new Set(issues)];
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const name of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>!!window.FIELD_UI?.openDirective);
      await page.evaluate(()=>{FIELD_UI.goHome();document.getElementById('ageIn').focus();});await settle();assert.equal(await page.evaluate(()=>document.activeElement.id),'ageIn','Queued Home focus does not interrupt patient entry');
      await page.evaluate(()=>{FIELD_UI.openDirective('seizure');document.getElementById('wtIn').focus();});await settle();assert.equal(await page.evaluate(()=>document.activeElement.id),'wtIn','Queued detail focus does not interrupt weight entry');
      await page.locator('#ageIn').fill('5');await page.locator('#wtIn').fill('26.25');await settle();
      for(const [id,drug,expected]of [['seizure','Midazolam — active seizure','Calculated 0.525 mL'],['pain','Morphine IV/SC (1–17 y)','0.15–0.25 mL'],['arrest','Amiodarone (VF/pVT)','Calculated 2.625 mL']]){
        const actualId=id==='pain'?'analgesia':id;
        await page.evaluate(id=>FIELD_UI.openDirective(id),actualId);await settle();
        const card=page.locator('#homeDirectiveDetail .home-dose-list .row').filter({hasText:drug});assert.equal(await card.count(),1);assert.ok((await card.innerText()).includes(expected),drug+' exact rounding in Home detail');
        await page.evaluate(id=>{switchPane('critical');selectCriticalPath(id);},id);await settle();
        const critical=page.locator('#crit-treatment .row').filter({hasText:drug});assert.equal(await critical.count(),1);assert.ok((await critical.innerText()).includes(expected),drug+' identical rounding in Critical');
      }
      await page.evaluate(()=>{FIELD_UI.showAllCalculations();updateCalcSearch('Midazolam');});await settle();
      let seizure=page.locator('#results .row').filter({hasText:'Midazolam — active seizure'});assert.equal(await seizure.count(),1);assert.match(await seizure.innerText(),/Calculated 0\.525 mL/,'All calculations uses the same selected-dose limit');
      assert.equal(await seizure.locator('.draw-rounding-warning').first().isVisible(),true,'Rounding exception is visible without opening source details');
      await page.locator('#settingsTop').click();const stock=page.locator('#concList .settingsrow').filter({hasText:'midazolam'}).locator('input');await stock.fill('1000');await stock.dispatchEvent('change');
      for(const view of ['home','critical','all']){
        await page.evaluate(view=>{if(view==='home')FIELD_UI.openDirective('seizure');else if(view==='critical'){switchPane('critical');selectCriticalPath('seizure');}else{FIELD_UI.showAllCalculations();updateCalcSearch('Midazolam');}},view);await settle();
        const region=view==='home'?'#homeDirectiveDetail':view==='critical'?'#crit-treatment':'#results',card=page.locator(region+' .row').filter({hasText:'Midazolam — active seizure'});
        assert.equal(await card.count(),1);assert.match(await card.innerText(),/Calculated 0\.002625 mL/,'Positive tiny draw retained in '+view);assert.doesNotMatch(await card.innerText(),/(?:^|\s)0(?:\.0+)?\s*mL\b/);assert.equal(await card.locator('.draw-rounding-warning').first().isVisible(),true,'Tiny draw verification visible in '+view);
      }
      await page.locator('#settingsTop').click();await stock.fill('5');await stock.dispatchEvent('change');await settle();
      const layout=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        for(const id of ['seizure','pain','arrest']){
          await page.evaluate(id=>{switchPane('critical');selectCriticalPath(id);},id);await settle();let issues=await page.evaluate(doseGeometry);if(issues.length)layout.push({size,daylight,large,id,view:'critical',issues});
          await page.evaluate(id=>FIELD_UI.openDirective(id==='pain'?'analgesia':id),id);await settle();issues=await page.evaluate(doseGeometry);if(issues.length)layout.push({size,daylight,large,id,view:'home',issues});
        }
      }
      assert.deepEqual(layout,[],name+': updated draw values stay readable in every phone mode');
      assert.deepEqual(errors,[],'No browser errors');console.log(`PASS ${name}: nearest0.05 mL draw cards/ranges/route lines/sequential doses and phone readability; ${checked} full engine snapshots preserve all other clinical fields.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
