// Peds chart -> patient-specific Calculator navigation regression.
// Run with Playwright available: node tests/peds-handoff-oct08.cjs
// CHROME_PATH may select installed Chrome; TEST_WEBKIT=1 also runs WebKit.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const before=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show','HEAD:index.html'],{cwd:root,encoding:'utf8'});
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
assert.equal(clinical(html),clinical(before),'Clinical formulas and dose data unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],before.match(/const PEDS54\s*=([^\n]+)/)[1],'Printed chart transcription unchanged');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const patient=async(age,weight)=>page.evaluate(({age,weight})=>{S.ageVal=age;S.wtVal=weight;recompute();},{age,weight});
      const peds=()=>page.locator('nav [data-pane="peds"]').click();
      const cards=()=>page.locator('#results .row');
      const cardNames=()=>cards().locator('.rname').allTextContents();
      const clickDrug=key=>page.locator('#pedBody [data-ped-exact]').evaluateAll((els,key)=>{const match=els.find(el=>el.dataset.pedExact===key);if(!match)throw Error('Missing action: '+key);match.click();},key);
      await patient(5,21);await page.locator('#calcSearch').fill('ondansetron');await peds();
      await page.locator('#pedFind').fill('midazolam');
      await page.locator('#pedBody .warnbanner button').click();await settle();
      assert.equal(await page.evaluate(()=>activePane),'calc');
      assert.equal(await page.locator('#calcSearch').inputValue(),'Midazolam — seizure');
      assert.deepEqual(await cardNames(),['Midazolam — active seizure PCS']);
      assert.match(await cards().innerText(),/2\.1 mg/,'Uses current 21 kg patient, not the printed band midpoint');
      assert.equal(await page.locator('#results .sec:not(.open)').count(),0,'Matching dose cards already revealed');
      assert.match(await page.locator('#searchStatus').innerText(),/Patient-specific results from Peds/);
      assert.notEqual(await page.evaluate(()=>document.activeElement.id),'wtIn','No keyboard detour with patient already entered');
      assert.equal(await page.evaluate(()=>S.entryCollapsed),true);
      await page.locator('#clearCalcSearch').click();assert.equal(await page.evaluate(()=>pedsExactKeys.length),0);
      assert.equal(await page.locator('#calcSearch').inputValue(),'');
      const labels=await page.locator('#results .sec').evaluateAll(els=>els.filter(el=>!['summary','airway'].includes(el.dataset.sec)).map(el=>el.querySelector('h2').textContent));
      assert.deepEqual(labels,[...labels].sort((a,b)=>a.localeCompare(b)),'All calculations keeps alphabetical directives');
      await peds();await page.evaluate(()=>{PS.patch=true;PS.query='';PS.sel={'FentaNYL|IV/IN':true,'Morphine — analgesia|IV/SC':true};renderPeds();});
      await clickDrug('FentaNYL|IV/IN');await settle();
      assert.ok((await cardNames()).every(name=>name.startsWith('FentaNYL')),'Explicit card action chooses one drug despite multi-selection');
      await peds();await page.locator('#pedBody .warnbanner button').click();await settle();
      const selected=await cardNames();assert.ok(selected.some(name=>name.startsWith('FentaNYL'))&&selected.some(name=>name.startsWith('Morphine')));
      assert.ok(selected.every(name=>/^(FentaNYL|Morphine)/.test(name)),'Generic patch handoff transfers selected drugs only');
      await page.locator('#calcSearch').fill('dexamethasone');assert.equal(await page.evaluate(()=>pedsExactKeys.length),0,'Typing ordinary search removes the exact filter');
      await patient(1,10);await peds();await page.evaluate(()=>{PS.patch=false;PS.query='';renderPeds();});
      await clickDrug('Atropine|IV — bradycardia, toxins');await settle();
      assert.equal(await cards().count(),0,'Peds reference must not create an age-ineligible atropine dose');
      assert.match(await page.locator('#results').innerText(),/No matching patient-specific calculation available/);
      assert.match(await page.locator('#results').innerText(),/chart values do not establish treatment eligibility/);
      await page.evaluate(()=>{PS.patch=true;PS.sel={'Atropine|IV — bradycardia, toxins':true,'Midazolam — seizure|IV/IO':true};PS.query='';useExactCalc();});await settle();
      assert.deepEqual(await cardNames(),['Midazolam — active seizure PCS']);
      assert.match(await page.locator('#results').innerText(),/No patient-specific Calculator result for: Atropine/,'Partially unavailable selections are identified, not silently dropped');
      await peds();await page.evaluate(()=>{PS.patch=false;renderPeds();});await clickDrug('Dextrose 50%|IV');await settle();assert.equal(await cards().count(),0,'D50 age gate remains enforced');
      await peds();await clickDrug('Normal saline — ROSC|IV');await settle();
      assert.ok((await cardNames()).every(name=>name.startsWith('NS bolus')),'Saline chart name maps to its Calculator row');
      assert.match(await cards().innerText(),/Outside directive conditions/,'ROSC fluid age gate preserved');
      await patient(5,21);await peds();await page.evaluate(()=>{PS.patch=false;PS.query='';renderPeds();});
      for(const width of [320,390,430])for(const large of [false,true]){
        await page.setViewportSize({width,height:844});await page.evaluate(large=>document.body.classList.toggle('large-text',large),large);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px Peds no overflow`);
        const buttons=await page.locator('#pedBody [data-ped-exact]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
        assert.ok(buttons.every(h=>h>=44),'Exact actions remain touch sized');
      }
      await page.evaluate(()=>{PS.sel={};PS.query='';PS.patch=false;renderPeds();useExactCalc();});await settle();
      assert.equal(await page.locator('#calcSearch').inputValue(),'','No selection clears an old Calculator query');
      assert.equal(await page.locator('#results [data-sec="summary"]').evaluate(el=>el.classList.contains('open')),true,'No selection opens the patient summary');
      assert.notEqual(await page.evaluate(()=>document.activeElement.id),'wtIn');
      await page.locator('#newPtTop').click();await peds();await page.evaluate(()=>{pedSelectBand('b19_23');useExactCalc('Midazolam — seizure|IV/IO');});await settle();
      assert.equal(await page.locator('#results .row').count(),0,'No patient does not use the manual chart band as patient weight');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'ageIn','Missing patient returns directly to patient entry');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine}: searched/selected/per-card Peds handoff, current patient arithmetic, unchanged source data, age gates, alphabetical browsing, keyboard focus and 320–430px touch layout.`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
