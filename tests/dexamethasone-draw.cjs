// TEST_WEBKIT=1 adds WebKit. COMPARE_REF checks that only croup's volume was added.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(process.env.COMPARE_REF){
  const old=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  const added=' ml: `${fmt(mlRound(dexC / CONC.dexamethasone.v))} mL`,';
  assert.equal(clinical(html).split(added).length,2,'Exactly one new croup draw-volume field');
  assert.equal(clinical(html).replace(added,''),clinical(old),'All doses, stock defaults, gates, cautions and directives unchanged');
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const samples=await page.evaluate(()=>{
        const rows=(ageYears,weightKg)=>drugCalcs(buildPatient({ageYears,weightKg,suppressWeightEstimate:true})).resp.filter(r=>r.name.startsWith('Dexamethasone'));
        return{stock:CONC.dexamethasone.v,weights:[6,7.4,14,16,20].map(w=>({w,rows:rows(2,w)})),ages:[0.49,0.5,7.99,8,null].map(a=>({a,rows:rows(a,14)})),missing:rows(2,null)};
      });
      assert.equal(samples.stock,10);
      for(const {w,rows} of samples.weights){
        assert.equal(rows.length,2);
        const expected={6:'0.3 mL',7.4:'0.37 mL',14:'0.7 mL',16:'0.8 mL',20:'0.8 mL'}[w];
        for(const r of rows)assert.equal(r.ml,expected,r.name+' at '+w+' kg');
      }
      for(const {a,rows} of samples.ages)assert.equal(rows.some(r=>r.name.includes('croup')),a!=null&&a>=0.5&&a<8,'Croup age gate: '+a);
      assert.ok(samples.missing.every(r=>!r.dose&&!r.ml&&r.needW),'No fabricated dose/volume without weight');
      await page.locator('#ageIn').fill('2'); // Reproduce the supplied 14 kg estimated-weight screenshot.
      assert.equal(await page.evaluate(()=>S.pt.weightKg),14);
      await page.locator('nav [data-pane="critical"]').click();
      for(const width of [320,390])for(const large of [false,true])for(const daylight of [false,true]){
        await page.setViewportSize({width,height:844});
        await page.evaluate(({large,daylight})=>{document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',daylight);},{large,daylight});
        for(const id of ['croup','bronch']){
          await page.evaluate(id=>{switchPane('critical');selectCriticalPath(id);},id);
          const row=page.locator('#crit-treatment .row').filter({hasText:'Dexamethasone'});
          assert.equal(await row.count(),1);
          assert.match(await row.locator('.rdose').innerText(),/^7 mg/);
          assert.match(await row.locator('.rml').innerText(),/Draw volume:\s*0\.7 mL/);
          await row.locator('summary').click();
          assert.match(await row.locator('.card-details').innerText(),/dexamethasone: 10 mg\/mL/);
          await row.locator('summary').click();
          const fits=await row.locator('.rml').evaluate(el=>{const box=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&box.left>=0&&box.right<=innerWidth;});
          assert.ok(fits,`${engine} Critical ${id} ${width} large=${large} daylight=${daylight}`);
          if(process.env.SCREENSHOT_DIR&&id==='croup'&&width===390&&!large&&!daylight){
            fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
            await row.evaluate(el=>{const panel=document.querySelector('#critical'),header=panel.querySelector('.crit-sticky');panel.scrollTop+=el.getBoundingClientRect().top-header.getBoundingClientRect().bottom-12;});
            await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,engine+'-croup-card.png')});
          }
          await page.locator('#critContent [onclick="openCriticalCalculations()"]').click();
          const calc=page.locator('#results .row').filter({hasText:'Dexamethasone'});
          assert.equal(await calc.count(),1);
          assert.match(await calc.locator('.rml').innerText(),/Draw volume:\s*0\.7 mL/);
          assert.match(await calc.locator('.card-details summary').innerText(),/Concentration & reference/);
        }
      }
      for(const mode of ['field','reference']){
        await page.evaluate(mode=>{applyViewMode(mode);updateCalcSearch('dexamethasone');},mode);
        const rows=page.locator('#results .row');assert.equal(await rows.count(),2);
        for(const row of await rows.all())assert.match(await row.locator('.rml').innerText(),/Draw volume:\s*0\.7 mL/);
      }
      // Both indications must use the same configured stock, not a hard-coded divisor.
      const changed=await page.evaluate(()=>{CONC.dexamethasone.v=4;const p=buildPatient({ageYears:2,weightKg:14});return drugCalcs(p).resp.filter(r=>r.name.startsWith('Dexamethasone')).map(r=>({dose:r.dose,ml:r.ml,stock:concentrationDetails(r)}));});
      for(const r of changed){assert.match(r.dose,/^7 mg/);assert.equal(r.ml,'1.8 mL');assert.match(r.stock,/4 mg\/mL/);}
      assert.deepEqual(errors,[]);
      console.log('PASS '+engine+': dexamethasone dose/volume, maximum and age/weight gates, shared stock, Calculator/Critical and 320/390px normal/Large dark/daylight.');
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
