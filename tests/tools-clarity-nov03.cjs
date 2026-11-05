// Focused Tools navigation, pediatric shortcut, infusion-row and ETT wording QA.
// TEST_WEBKIT=1 adds WebKit. No clinical source PDF is fetched by this test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show','ef95168:index.html'],{cwd:root,encoding:'utf8'});
const clinical=source=>source.slice(source.indexOf('const CONC ='),source.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const plain=value=>JSON.parse(JSON.stringify(value));
const engine=source=>{const context=vm.createContext({module:{exports:{}}});vm.runInContext(clinical(source)+'\nglobalThis.engine={...module.exports,DIR,dopamineLines};',context);return context.engine;};
assert.equal(clinical(html),clinical(baseline),'All clinical constants, doses, formulas, gates and directive strings are unchanged');
assert.equal(html.slice(html.indexOf('const SRC_LINKS='),html.indexOf('function rowHTML(')),baseline.slice(baseline.indexOf('const SRC_LINKS='),baseline.indexOf('function rowHTML(')),'All source links, page mappings and reference helpers unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],baseline.match(/const PEDS54\s*=([^\n]+)/)[1],'Published pediatric chart values remain exact');
assert.match(html,/const APP_BUILD='2026\.11\.05\.1'/);
const current=engine(html),previous=engine(baseline);
for(const ageYears of [0,1/365.25,2,8,12,18,28,65,null])for(const weightKg of [4,18,33.3,40,80,125,null]){
  const input={ageYears,weightKg,suppressWeightEstimate:weightKg==null},pt=current.buildPatient(input);
  assert.deepEqual(plain(pt),plain(previous.buildPatient(input)));assert.deepEqual(plain(current.drugCalcs(pt)),plain(previous.drugCalcs(pt)),'All medication/ETT/dopamine results unchanged');
  if(weightKg)assert.deepEqual(plain(current.dopamineLines(weightKg)),plain(previous.dopamineLines(weightKg)),'Dopamine steps and drop timings unchanged');
}
const assets=['field-ui.css','field-shell.js','field-home.js','manifest.webmanifest','icon.svg'];
const files=new Map([['/',html],['/index.html',html],...assets.map(name=>['/'+name,fs.readFileSync(path.join(root,name),'utf8')])]);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,body=files.get(name);res.writeHead(body?200:404,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});res.end(body||'Not found');});
const shots=process.env.SCREENSHOT_DIR;if(shots)fs.mkdirSync(shots,{recursive:true});
function inspectTools(){
  const issues=[],nav=document.getElementById('fieldNav').getBoundingClientRect(),header=document.querySelector('body>header').getBoundingClientRect();
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Horizontal page overflow');
  const back=[...document.querySelectorAll('#toolView button')].find(button=>/All tools/.test(button.textContent));
  if(!back)return['Missing explicit All tools control'];
  const rect=back.getBoundingClientRect();let sticky=back;while(sticky&&getComputedStyle(sticky).position!=='sticky')sticky=sticky.parentElement;
  if(!sticky)issues.push('All tools has no sticky container');
  if(rect.height<43.5||rect.width<43.5)issues.push('All tools has a small touch target');
  if(rect.top<header.bottom-.5||rect.bottom>nav.top+.5||rect.left<-.5||rect.right>innerWidth+.5)issues.push('All tools is obscured/outside the usable viewport');
  const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);if(hit&&!back.contains(hit))issues.push('All tools is covered by another control');
  for(const target of document.querySelectorAll('#toolView button,#toolView input,#toolView select')){
    if(!target.getClientRects().length)continue;const r=target.getBoundingClientRect();if(r.width<43.5||r.height<43.5)issues.push('Small tool target '+(target.id||target.textContent.trim().slice(0,30)));
  }
  for(const panel of document.querySelectorAll('#toolView .toolpanel')){
    const box=panel.getBoundingClientRect();
    for(const element of panel.querySelectorAll('.k,.v,.p,.tsrc,h3')){
      if(!element.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(element);
      if([...range.getClientRects()].some(r=>r.left<box.left-.5||r.right>box.right+.5))issues.push('Clipped tool text '+element.textContent.slice(0,50));
    }
  }
  return [...new Set(issues)];
}
function contrastInspection(selector){
  const rgb=value=>{const parts=value.match(/[\d.]+/g)?.map(Number)||[];return[parts[0]||0,parts[1]||0,parts[2]||0,parts[3]??1];};
  const blend=(front,back)=>front.slice(0,3).map((value,index)=>value*front[3]+back[index]*(1-front[3]));
  const background=element=>{const chain=[];for(let node=element;node;node=node.parentElement)chain.unshift(node);let color=[255,255,255];for(const node of chain)color=blend(rgb(getComputedStyle(node).backgroundColor),color);return color;};
  const luminance=color=>color.map(value=>{const c=value/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);}).reduce((total,value,index)=>total+value*[.2126,.7152,.0722][index],0);
  const ratio=(a,b)=>{const light=luminance(a),dark=luminance(b);return(Math.max(light,dark)+.05)/(Math.min(light,dark)+.05);};
  const output=[];
  for(const element of document.querySelectorAll(selector)){
    if(!element.getClientRects().length)continue;const style=getComputedStyle(element),strip=element.matches('.field-infusion-step'),color=blend(rgb(strip?style.borderLeftColor:style.color),background(element));output.push({text:element.textContent.trim(),strip,ratio:ratio(color,background(element))});
  }
  return output;
}
function inspectClinicalCards(selector){
  const issues=[],region=document.querySelector(selector);if(region.scrollWidth>region.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1)issues.push('Horizontal content overflow');
  for(const row of region.querySelectorAll('.row')){
    const box=row.getBoundingClientRect();
    for(const element of row.querySelectorAll('.field-ett-route,.rseq small,.rlL,.rlD,.rlM')){
      if(!element.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(element);
      if([...range.getClientRects()].some(r=>r.left<box.left-.5||r.right>box.right+.5))issues.push('Clipped treatment label/dose '+element.textContent.slice(0,45));
    }
    for(const element of row.querySelectorAll('.dose-amount')){if(!element.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(element);if(new Set([...range.getClientRects()].filter(r=>r.width>.1).map(r=>Math.round(r.top))).size>1)issues.push('Split quantity '+element.textContent);}
  }
  return [...new Set(issues)];
}
async function assertInfusionPresentation(page,region,daylight,weight,description){
  const rows=page.locator(region+' .field-infusion-step');
  assert.deepEqual(await rows.evaluateAll(elements=>elements.map(element=>element.dataset.infusionRate)),['5','10','15','20'],description+': four existing infusion rates');
  const lineData=await rows.evaluateAll(elements=>elements.map(element=>({l:element.querySelector('.rlL').textContent.trim(),d:element.querySelector('.rlD').textContent.trim(),m:element.querySelector('.rlM').textContent.trim()})));
  assert.deepEqual(lineData,plain(previous.dopamineLines(weight)),description+': all original rates and drop timings unchanged');
  const expectedDose=daylight?'rgb(0, 108, 99)':'rgb(129, 219, 203)',expectedFlow=daylight?'rgb(23, 46, 60)':'rgb(255, 255, 255)';
  const colors=await rows.evaluateAll(elements=>elements.map(element=>({dose:getComputedStyle(element.querySelector('.rlL')).color,flow:getComputedStyle(element.querySelector('.rlD')).color,rail:getComputedStyle(element).borderLeftColor})));
  assert.deepEqual(colors.map(color=>color.dose),Array(4).fill(expectedDose),description+': all dosage labels use one teal color');
  assert.deepEqual(colors.map(color=>color.flow),Array(4).fill(expectedFlow),description+': all flow quantities use neutral white/navy');
  assert.notEqual(expectedDose,expectedFlow,description+': dosage and flow have distinct semantic colors');
  assert.equal(new Set(colors.map(color=>color.rail)).size,4,description+': original four rail colors remain distinct');
  const heading=page.locator(region+' .row:has(.field-infusion-step) .rdose');assert.equal(await heading.count(),1);assert.equal((await heading.textContent()).trim(),'Start 5 mcg/kg/min');assert.equal(await heading.evaluate(element=>getComputedStyle(element).color),expectedDose,description+': starting-dose heading uses the same teal');
  const contrasts=await page.evaluate(contrastInspection,region+' .field-infusion-step,'+region+' .field-infusion-step .rlL,'+region+' .field-infusion-step .rlD,'+region+' .field-infusion-step .rlM,'+region+' .row:has(.field-infusion-step) .rdose');
  for(const item of contrasts)assert.ok(item.ratio>=(item.strip?3:4.5)-.01,description+': contrast '+item.ratio.toFixed(2)+' for '+item.text);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const name of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      const tools=()=>click('#fieldNav [data-pane="tools"]');
      const open=async id=>{await page.evaluate(id=>openTool(id),id);await settle();};
      const back=async()=>{await page.getByRole('button',{name:/All tools/}).click();await settle();assert.equal(await page.evaluate(()=>S.tool),null);};
      await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>!!window.FIELD_UI?.openDirective);
      if(process.env.INFUSION_ONLY){
        await page.locator('#ageIn').fill('28');
        for(const weight of [80,90]){
          await page.locator('#wtIn').fill(String(weight));await settle();
          for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const daylight of [false,true])for(const large of [false,true]){
            await page.setViewportSize(size);await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
            for(const id of ['brady','cshock'])for(const view of ['home','calculator','critical']){
              await page.evaluate(({id,view})=>{if(view==='home')FIELD_UI.openDirective(id);else if(view==='critical'){switchPane('critical');selectCriticalPath(id);}else{FIELD_UI.showAllCalculations();selectCase(id==='brady'?'brady':'crit-cshock');}},{id,view});await settle();
              const region=view==='home'?'#homeDirectiveDetail':view==='calculator'?'#results':'#crit-treatment',description=JSON.stringify({name,weight,size,daylight,large,id,view});
              await assertInfusionPresentation(page,region,daylight,weight,description);assert.deepEqual(await page.evaluate(inspectClinicalCards,region),[],description+': dose/flow layout fits');
            }
          }
        }
        assert.deepEqual(errors,[]);console.log(`PASS ${name}: one teal dosage color, white/navy flow values, distinct rails, starting-dose heading, contrast and unchanged80/90kg rates across Home/Calculator/Critical at320–844px in normal/Large themes.`);await page.close();continue;
      }
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');await settle();await tools();
      await open('gcs');await page.locator('#gcsRows .gcsrow').first().locator('button').first().click();
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await settle();assert.deepEqual(await page.evaluate(inspectTools),[],'All tools remains usable after scrolling a long GCS panel');
      await back();assert.equal(await page.locator('#toolHome [data-tool-id="gcs"]').evaluate(element=>element===document.activeElement),true,'All tools restores focus to the original GCS tile');
      await open('gcs');assert.equal(await page.locator('#gcsRows button.on').count(),1,'Partial tool entry survives All tools');
      await open('apgar');await page.locator('#apRows .gcsrow').first().locator('button').first().click();await click('#apStart');await page.evaluate(()=>{apT0-=65000;renderApgarTimer();});await back();assert.equal(await page.evaluate(()=>apInt),null,'Leaving through All tools pauses APGAR');await open('apgar');assert.equal(await page.locator('#apRows button.on').count(),1);assert.match(await page.locator('#apTimerLbl').innerText(),/Paused/);
      await open('drip');await page.locator('#dvol').fill('250');await page.locator('#dmin').fill('30');await page.locator('#dset').selectOption('60');const drip=await page.locator('#dripLbl').innerText();await back();await open('drip');assert.equal(await page.locator('#dvol').inputValue(),'250');assert.equal(await page.locator('#dset').inputValue(),'60');assert.equal(await page.locator('#dripLbl').innerText(),drip);
      const geometry=[],contrasts=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        await tools();
        for(const id of ['gcs','dopa']){
          await open(id);await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await settle();const issues=await page.evaluate(inspectTools);if(issues.length)geometry.push({size,daylight,large,id,issues});
          const text=await page.evaluate(contrastInspection,'#toolView .backbtn,#toolView .kv .k,#toolView .kv .v');for(const item of text)if(item.ratio<4.5-.01)contrasts.push({size,daylight,large,id,...item});
          if(shots&&size.width===320&&large&&!daylight&&id==='dopa')await page.screenshot({path:path.join(shots,`${name}-dopamine-320-large-night.png`)});
          if(shots&&size.width===390&&!large&&daylight&&id==='dopa')await page.screenshot({path:path.join(shots,`${name}-dopamine-390-normal-day.png`)});
        }
        for(const id of ['brady','cshock'])for(const view of ['home','calculator','critical']){
          await page.evaluate(({id,view})=>{if(view==='home')FIELD_UI.openDirective(id);else if(view==='critical'){switchPane('critical');selectCriticalPath(id);}else{FIELD_UI.showAllCalculations();selectCase(id==='brady'?'brady':'crit-cshock');}},{id,view});await settle();
          const region=view==='home'?'#homeDirectiveDetail':view==='calculator'?'#results':'#crit-treatment',rows=page.locator(region+' .field-infusion-step');assert.deepEqual(await rows.evaluateAll(elements=>elements.map(element=>element.dataset.infusionRate)),['5','10','15','20'],view+' '+id+': four distinct labeled infusion rates');
          const lineData=await rows.evaluateAll(elements=>elements.map(element=>({l:element.querySelector('.rlL').textContent.trim(),d:element.querySelector('.rlD').textContent.trim(),m:element.querySelector('.rlM').textContent.trim()})));assert.deepEqual(lineData,await page.evaluate(()=>dopamineLines(80)),view+' '+id+': all numeric rates/drop timing unchanged');
          assert.equal(await rows.evaluateAll(elements=>new Set(elements.map(element=>getComputedStyle(element).borderLeftColor)).size),4,'Color strips distinguish all four existing dose labels');
          await assertInfusionPresentation(page,region,daylight,80,view+' '+id);
          const issues=await page.evaluate(inspectClinicalCards,region);if(issues.length)geometry.push({size,daylight,large,id,view,issues});
          const colors=await page.evaluate(contrastInspection,region+' .field-infusion-step,'+region+' .field-infusion-step .rlL,'+region+' .field-infusion-step .rlD,'+region+' .field-infusion-step .rlM');for(const item of colors)if(item.ratio<(item.strip?3:4.5)-.01)contrasts.push({size,daylight,large,id,view,...item});
        }
        for(const view of ['home','critical']){
          await page.evaluate(view=>{if(view==='home')FIELD_UI.openDirective('arrest');else{switchPane('critical');selectCriticalPath('arrest');}},view);await settle();const region=view==='home'?'#homeDirectiveDetail':'#crit-treatment',issues=await page.evaluate(inspectClinicalCards,region);if(issues.length)geometry.push({size,daylight,large,id:'lidocaine',view,issues});
        }
      }
      assert.deepEqual(geometry,[],name+': sticky return, touch targets and changed tool content fit every display mode');assert.deepEqual(contrasts,[],name+': return/infusion labels and quantities retain4.5:1 contrast');
      await tools();await open('drip');await back();
      // The new shortcut uses the original chart view and preserves existing
      // patient/tool/chart data, with an explicit contextual route back.
      // A nonempty chart search opens its chooser; seed a consistent visible
      // search state instead of racing WebKit's native details toggle event.
      await page.evaluate(()=>{pedSelectBand('b30_36');PS.query='Midazolam';PS.patch=true;PS.selectorOpen=true;PS.sel={'Midazolam — seizure|IV/IO':true};renderPeds();});await settle();
      const before=await page.evaluate(()=>JSON.stringify({pt:S.pt,age:S.ageVal,weight:S.wtVal,tools:toolFields,gcs:gcsSel,apgar:apSel,chart:PS}));
      await click('#pediatricChartsTool');assert.equal(await page.evaluate(()=>activePane),'peds');assert.equal(await page.locator('#pedFind').inputValue(),'Midazolam');assert.match(await page.locator('#pedBody').innerText(),/PDC reference band/i);
      assert.equal(await page.locator('#fieldNav [data-pane="dir"]').getAttribute('aria-current'),'page','Existing Reference navigation reflects the chart view');
      const returnButton=page.locator('#pedsToolsBack');assert.equal(await returnButton.isVisible(),true);const returnRect=await returnButton.boundingBox();assert.ok(returnRect.width>=44&&returnRect.height>=44);
      const after=await page.evaluate(()=>JSON.stringify({pt:S.pt,age:S.ageVal,weight:S.wtVal,tools:toolFields,gcs:gcsSel,apgar:apSel,chart:PS}));assert.equal(after,before,'Shortcut preserves patient, scoring, drip and selected chart entries');
      await returnButton.click();await settle();assert.equal(await page.evaluate(()=>activePane),'tools');assert.equal(await page.evaluate(()=>S.tool),null);assert.equal(await page.locator('#pediatricChartsTool').evaluate(element=>element===document.activeElement),true,'Return to Tools restores shortcut focus');await open('drip');assert.equal(await page.locator('#dripLbl').innerText(),drip,'Pediatric round trip preserves drip entries');await back();
      await click('#fieldNav [data-pane="dir"]');await click('#referenceTabs [data-reference-pane="peds"]');assert.equal(await page.locator('#pedsToolsNav').isVisible(),false,'Ordinary Reference entry does not retain an unrelated Tools return');
      for(const [age,weight]of [[2,14],[28,80],[65,90]]){
        await page.locator('#ageIn').fill(String(age));await page.locator('#wtIn').fill(String(weight));await settle();
        const original=await page.evaluate(()=>drugCalcs(S.pt).arrest.find(row=>row.name==='Lidocaine (if not amiodarone)')),ett=original.sub.match(/^ETT ([\d.,]+)\/([\d.,]+) mg$/).slice(1);
        for(const view of ['home','calculator','critical']){
          await page.evaluate(view=>{if(view==='home')FIELD_UI.openDirective('arrest');else if(view==='critical'){switchPane('critical');selectCriticalPath('arrest');}else{FIELD_UI.showAllCalculations();selectCase('arrest');}},view);await settle();
          const region=view==='home'?'#homeDirectiveDetail':view==='calculator'?'#results':'#crit-treatment',card=page.locator(region+' .row').filter({hasText:'Lidocaine (if not amiodarone)'});assert.equal(await card.count(),1);
          const section=card.locator('.field-ett-route');assert.equal(await section.isVisible(),true);assert.deepEqual(await section.locator('dd').allTextContents(),ett.map(value=>value+' mg'),'Original ETT first/second quantities preserved');
          assert.deepEqual(await card.locator('.rseq .rsv>small').allTextContents(),['1st vascular dose · IV/IO/CVAD','2nd vascular dose · IV/IO/CVAD'],'Vascular route clearly separate from ETT alternative');
          assert.deepEqual(await card.locator('.rseq .rsv>.num:not(.rsml)').allTextContents(),[original.dose,original.d2],'Original vascular mass doses unchanged');
          assert.match(await section.innerText(),/vascular access \(IV\/IO\/CVAD\) is delayed, e\.g\. ≥5 min/);assert.match(await section.innerText(),/Second dose after 4 min if indicated/);assert.match(await section.innerText(),/alternative-route doses, not additional doses/);
          assert.deepEqual(await section.locator('a[data-source="PCS"]').evaluateAll(elements=>elements.map(element=>({page:element.dataset.page,href:element.href}))),await page.evaluate(()=>[105,107].map(page=>({page:String(page),href:srcHref('PCS',page)}))),'ETT explanation cites verified directive pages');
          assert.doesNotMatch(await card.locator('.field-stock').innerText(),/amiodarone/i,'Stock strip lists only the selected lidocaine formulation');
          await card.locator('.card-details').evaluate(element=>element.open=true);assert.match(await card.locator('.card-details').innerText(),/lidocaine.*20 mg\/mL/i);assert.doesNotMatch(await card.locator('.card-details').innerText(),/amiodarone/i,'Detailed concentration also excludes the alternative drug');
        }
      }
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('60');await settle();await click('#fieldNav [data-pane="calc"]');await click('#settingsTop');const lidocaineStock=page.locator('#concList .settingsrow').filter({hasText:'lidocaine'}).locator('input');await lidocaineStock.fill('10');await lidocaineStock.dispatchEvent('change');await settle();
      for(const view of ['home','calculator','critical']){
        await page.evaluate(view=>{if(view==='home')FIELD_UI.openDirective('arrest');else if(view==='critical'){switchPane('critical');selectCriticalPath('arrest');}else{FIELD_UI.showAllCalculations();selectCase('arrest');}},view);await settle();
        const region=view==='home'?'#homeDirectiveDetail':view==='calculator'?'#results':'#crit-treatment',card=page.locator(region+' .row').filter({hasText:'Lidocaine (if not amiodarone)'});
        assert.deepEqual(await card.locator('.rseq .rsv>.num:not(.rsml)').allTextContents(),['90 mg IV','45 mg']);assert.match(await card.locator('.rsml').first().innerText(),/9 mL/);assert.match(await card.locator('.rsml').nth(1).innerText(),/4\.5 mL/);
        assert.match(await card.locator('.field-stock').innerText(),/lidocaine: 10 mg\/mL/);assert.doesNotMatch(await card.locator('.field-stock').innerText(),/2%|amiodarone/i);
        await card.locator('.card-details').evaluate(element=>element.open=true);assert.match(await card.locator('.card-details').innerText(),/lidocaine: 10 mg\/mL/);assert.doesNotMatch(await card.locator('.card-details').innerText(),/2%|amiodarone/i);
        if(view==='critical'){assert.match(await card.locator('.rsml').first().innerText(),/9 mL @ 10 mg\/mL/);assert.doesNotMatch(await card.locator('.rsml').first().innerText(),/2%/);}
      }
      await click('#fieldNav [data-pane="calc"]');await click('#settingsTop');await lidocaineStock.fill('20');await lidocaineStock.dispatchEvent('change');await page.locator('#wtIn').fill('');await settle();assert.equal(await page.evaluate(()=>S.pt.weightKg),null);
      for(const view of ['home','calculator','critical']){
        await page.evaluate(view=>{if(view==='home')FIELD_UI.openDirective('arrest');else if(view==='critical'){switchPane('critical');selectCriticalPath('arrest');}else{FIELD_UI.showAllCalculations();selectCase('arrest');}},view);await settle();
        const region=view==='home'?'#homeDirectiveDetail':view==='calculator'?'#results':'#crit-treatment',card=page.locator(region+' .row').filter({hasText:'Lidocaine (if not amiodarone)'});
        assert.deepEqual(await card.locator('.field-ett-route dd').allTextContents(),['3 mg/kg','1.5 mg/kg'],'Missing weight retains explicit original ETT formulas');assert.match(await card.locator('.field-ett-route').innerText(),/IV\/IO\/CVAD: first 1\.5 mg\/kg; second 0\.75 mg\/kg/);assert.equal(await card.locator('.rneed').count(),1);assert.equal(await card.locator('.rseq,.field-stock').count(),0,'Missing weight does not imply a calculated dose or draw');
      }
      assert.deepEqual(errors,[],'No browser errors');console.log(`PASS ${name}: sticky Tools return, retained tool entries, pediatric chart round trip, phone/landscape layouts and readable infusion controls.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
