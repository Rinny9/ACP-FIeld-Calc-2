// Source-locked Directive weight-based treatment presentation regression.
// TEST_WEBKIT=1 adds WebKit; CHROME_PATH selects an installed Chrome browser.
// SCREENSHOT_DIR optionally saves representative treatment viewports.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show',`${process.env.COMPARE_REF||'30d9755'}:index.html`],{cwd:root,encoding:'utf8'});
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const sources=s=>s.slice(s.indexOf('const SRC_LINKS='),s.indexOf('function rowHTML(')).replace(/\r/g,'');
assert.equal(clinical(html),clinical(baseline),'Directive text, concentrations, dose formulas and clinical data unchanged');
assert.equal(sources(html),sources(baseline),'Reference URLs, mappings and source-link helpers unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],baseline.match(/const PEDS54\s*=([^\n]+)/)[1],'Printed pediatric chart data unchanged');
const shots=process.env.SCREENSHOT_DIR;if(shots)fs.mkdirSync(shots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});

function inspectTreatmentSources(){
  const failures=[],referenceText=value=>{const el=document.createElement('div');el.innerHTML=referenceHTML(value);return el.textContent;};
  const visible=el=>!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('details:not([open]),[hidden],[aria-hidden="true"]');
  for(const d of DIR){
    const card=document.querySelector(`.dcard[data-id="${d.id}"]`),items=[...card.querySelectorAll('.dir-treatment-list>li')];
    if(items.length!==(d.tx||[]).length)failures.push(d.id+': missing or duplicated treatment entries');
    for(const [index,source]of(d.tx||[]).entries()){
      const item=items[index],key=d.id+'|'+index;if(!item)continue;
      const fragments=[...item.querySelectorAll('.dir-tx-source[data-tx-source]')],rendered=fragments.length?fragments.map(el=>el.textContent).join(''):item.textContent;
      if(rendered!==referenceText(source))failures.push(key+': source text/order changed: '+JSON.stringify({rendered,source:referenceText(source)}));
      if(/\/\s*kg\b|\bkg\b/i.test(source)&&!item.querySelector('.dir-tx-structured'))failures.push(key+': weight-based entry not structured');
      if(item.querySelector('.dir-tx-structured')){
        if(!item.querySelector('.dir-tx-title.dir-tx-source[data-tx-source]'))failures.push(key+': missing source heading');
        if(!item.querySelector('.dir-tx-field .dir-tx-label')||!item.querySelector('.dir-tx-value.dir-tx-source[data-tx-source]'))failures.push(key+': missing labelled source fields');
        for(const el of fragments)if(!visible(el))failures.push(key+': hidden source fragment');
        if(item.querySelector('details,input,select,textarea,button,[contenteditable="true"]'))failures.push(key+': presentation unexpectedly adds interaction or editable values');
      }
      if(!visible(item))failures.push(key+': treatment hidden after directive expansion');
    }
  }
  return failures;
}

function inspectWeightLayout(){
  const failures=[],pane=document.getElementById('pane-dir');
  if(pane.scrollWidth>pane.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1)failures.push('horizontal page overflow');
  for(const item of pane.querySelectorAll('.dir-treatment-list>li:has(.dir-tx-structured)')){
    const card=item.closest('.dcard'),label=card.dataset.id+'|'+[...item.parentElement.children].indexOf(item),box=item.getBoundingClientRect();
    if(item.scrollWidth>item.clientWidth+1)failures.push(label+': treatment scroll overflow');
    for(const el of item.querySelectorAll('.dir-tx-title,.dir-tx-label,.dir-tx-value,.hld,.hlr')){
      if(!el.getClientRects().length)continue;
      const range=document.createRange();range.selectNodeContents(el);
      if([...range.getClientRects()].some(rect=>rect.left<box.left-.5||rect.right>box.right+.5))failures.push(label+': clipped field '+el.textContent.slice(0,70));
    }
    for(const field of item.querySelectorAll('.dir-tx-field')){
      const value=field.querySelector('.dir-tx-value'),rect=value?.getBoundingClientRect();
      if(value&&value.textContent.trim()&&rect.width<Math.min(140,field.clientWidth-12))failures.push(label+': source dose compressed into a narrow column');
    }
    // A numeric dose/unit or repeat/max highlight must remain intact, not
    // degrade into one-character vertical columns or overflow the treatment.
    for(const token of item.querySelectorAll('.hld,.hlr')){
      const range=document.createRange();range.selectNodeContents(token);
      const rects=[...range.getClientRects()].filter(r=>r.width>.1);
      if(new Set(rects.map(r=>Math.round(r.top))).size>1)failures.push(label+': split dose/highlight '+token.textContent);
    }
    const fields=[...item.querySelectorAll('.dir-tx-field')].map(el=>el.getBoundingClientRect());
    for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
      const a=fields[i],b=fields[j];
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)failures.push(label+': overlapping regimen fields');
    }
  }
  return [...new Set(failures)];
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.equal(await page.evaluate(()=>typeof directiveTreatmentHTML),'function');
      const pure=await page.evaluate(()=>{
        const before=JSON.stringify({DIR,CONC,PEDS54,S,PS}),failures=[];
        for(const d of DIR)for(const [index,source]of(d.tx||[]).entries()){
          const key=d.id+'|'+index,el=document.createElement('div'),expected=document.createElement('div');
          for(const candidate of [source+' changed',source+' <img src=x onerror=alert(1)>']){
            el.innerHTML=directiveTreatmentHTML(d.id,index,candidate);expected.innerHTML=referenceHTML(candidate,s=>hlTx(esc(s)));
            if(el.querySelector('.dir-tx-structured'))failures.push(key+': stale metadata did not fall back');
            if(el.textContent!==expected.textContent||el.querySelector('img,script'))failures.push(key+': fallback changed or executed source text');
          }
          el.innerHTML=directiveTreatmentHTML('unknown-directive',index,source);expected.innerHTML=referenceHTML(source,s=>hlTx(esc(s)));
          if(el.querySelector('.dir-tx-structured')||el.textContent!==expected.textContent)failures.push(key+': unknown directive fallback changed');
        }
        return{failures,unchanged:before===JSON.stringify({DIR,CONC,PEDS54,S,PS}),weightCount:DIR.flatMap(d=>d.tx||[]).filter(source=>/\/\s*kg\b|\bkg\b/i.test(source)).length};
      });
      assert.deepEqual(pure.failures,[]);assert.equal(pure.unchanged,true,'Formatting has no clinical/patient state side effects');assert.ok(pure.weightCount>25);
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');await page.locator('nav [data-pane="dir"]').click();
      await page.evaluate(()=>{for(const d of DIR)directiveOpen[d.id]=true;renderDirectives('');});await settle();
      assert.deepEqual(await page.evaluate(inspectTreatmentSources),[]);
      const associations=await page.evaluate(()=>{
        const failures=[];
        const expectField=(id,index,needle,companions)=>{
          const item=document.querySelector(`.dcard[data-id="${id}"] .dir-treatment-list`).children[index],fields=[...item.querySelectorAll('.dir-tx-value')].map(el=>el.textContent);
          if(!fields.some(text=>text.includes(needle)&&companions.every(part=>text.includes(part))))failures.push(`${id}|${index}: ${needle} not kept with ${companions.join(', ')}`);
        };
        expectField('seizure',0,'IV/IO',['0.1 mg/kg','max 5 mg']);expectField('seizure',0,'IM/IN/buccal',['0.2 mg/kg','max 10 mg']);
        expectField('bronch',0,'<25 kg:',['MDI ≤600 mcg (6 puffs)','NEB 2.5 mg']);expectField('bronch',0,'≥25 kg:',['MDI ≤800 mcg (8 puffs)','NEB 5 mg']);
        expectField('allergy',1,'25–<50 kg',['25 mg']);expectField('allergy',1,'≥50 kg',['50 mg']);
        expectField('croup',0,'<10 kg:',['2.5 mg']);expectField('croup',0,'≥10 kg:',['5 mg']);
        expectField('hypogly',0,'<2 y:',['5 g (50 mL)']);expectField('hypogly',0,'≥2 y:',['25 g (250 mL)']);
        expectField('analgesia',2,'1–17 y:',['≤1 mcg/kg','max 75']);expectField('analgesia',2,'≥18:',['25–75 mcg']);
        expectField('analgesia',3,'1–17 y:',['0.05–0.1 mg/kg','max 5']);expectField('analgesia',3,'≥18:',['2–10 mg','max 10']);
        expectField('analgesia',4,'IV',['0.25 mg/kg','max 10 peds/20 adult']);expectField('analgesia',4,'IN',['1 mg/kg','max 30/75']);
        expectField('combative',1,'18–<65 y:',['5 mg/kg','max 500 mg']);expectField('combative',1,'≥65 y:',['3 mg/kg','max 300 mg']);
        expectField('arrest',0,'<8 y:',['2 J/kg','4 J/kg']);expectField('arrest',0,'≥8 y:',['RBHP/manufacturer']);
        expectField('arrest',1,'<12 y:',['0.01 mg/kg','0.1 mL/kg','min 0.05 mg']);expectField('arrest',1,'≥12 y:',['1 mg']);
        expectField('arrest',1,'ETT:',['0.1 mg/kg max 2 mg (<12 y)','2 mg (≥12 y)']);
        expectField('arrest',2,'<12 y:',['5 mg/kg (max 300)','5 mg/kg (max 150)']);expectField('arrest',2,'≥12 y:',['300 → 150']);
        expectField('arrest',3,'<12 y:',['1 mg/kg (ETT 2)']);expectField('arrest',3,'≥12 y:',['1.5 → 0.75 mg/kg','ETT 3/1.5']);
        expectField('tachy',2,'150 mg IV',['over 10 min','max 2']);expectField('tachy',2,'OR lidocaine',['1.5 → 0.75 mg/kg','max single 150','max 3']);
        return failures;
      });
      assert.deepEqual(associations,[],'Original route/age/weight doses stay with their associated maxima and alternate regimens');
      const maxHighlights=await page.evaluate(()=>[
        ['seizure',0,['max 5 mg','max 10 mg']],
        ['bronch',2,['max 8 mg']],
        ['croup',1,['max 8 mg']],
        ['combative',0,['max single 5 mg','max total 10 mg']]
      ].flatMap(([id,index,expected])=>{
        const row=document.querySelector(`.dcard[data-id="${id}"] .dir-treatment-list`).children[index],highlights=[...row.querySelectorAll('.hlr')].map(el=>el.textContent);
        return expected.filter(text=>!highlights.some(value=>value.includes(text))).map(text=>`${id}|${index}: missing intact repeat/maximum highlight ${text}`);
      }));
      assert.deepEqual(maxHighlights,[],'Amber maximum/repeat highlighting keeps the complete original maximum and unit');
      const layouts=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const large of [false,true])for(const daylight of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({large,daylight})=>{document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',daylight);},{large,daylight});await settle();
        const failures=await page.evaluate(inspectWeightLayout);if(failures.length)layouts.push({size,large,daylight,failures});
        assert.deepEqual(await page.evaluate(inspectTreatmentSources),[],'Changing display options preserves every treatment fragment');
      }
      assert.deepEqual(layouts,[],engine+': no narrow dose columns, split measurements, overlapping regimens or clipped text');
      if(shots)for(const display of [{width:390,height:844,large:false,daylight:false},{width:320,height:568,large:true,daylight:true}]){
        await page.setViewportSize({width:display.width,height:display.height});await page.evaluate(({large,daylight})=>{document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',daylight);},display);
        for(const [id,index]of [['bronch',0],['seizure',0],['analgesia',2]]){
          await page.evaluate(({id,index})=>{
            for(const d of DIR)directiveOpen[d.id]=d.id===id;renderDirectives('');
            const target=document.querySelector(`.dcard[data-id="${id}"] .dir-treatment-list`).children[index],offset=document.getElementById('ptbar').getBoundingClientRect().height+document.querySelector('#pane-dir .search').getBoundingClientRect().height+12;
            window.scrollTo(0,Math.max(0,scrollY+target.getBoundingClientRect().top-offset));
          },{id,index});await settle();
          await page.screenshot({path:path.join(shots,`${engine}-${id}-weight-treatment-${display.width}-${display.large?'large':'normal'}-${display.daylight?'day':'dark'}.png`)});
        }
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine}: ${pure.weightCount} source-locked weight-based entries; exact clinical text and associations, metadata fallback/purity, intact highlights and all normal/Large dark/day phone/landscape layouts.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
