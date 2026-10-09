// Related-condition chooser, uncluttered Critical pathways and retained safety cards.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const shots=process.env.SCREENSHOT_DIR;
if(shots)fs.mkdirSync(shots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const click=async s=>{await page.locator(s).click();await settle();};
      const noReadback=async()=>{
        assert.equal(await page.locator('#critReadbackPanel,.crit-readback,#critReadbackTreatment,#critReadbackSelected,#critReadbackFindings,.readback-reset').count(),0,'Retired BHP read-back section is absent');
        assert.equal(await page.evaluate(()=>typeof criticalReadback),'undefined','No retired read-back encounter state remains');
      };
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('90');
      await page.evaluate(()=>{S.entryCollapsed=true;renderEntryState();switchPane('critical');});
      assert.equal(await page.evaluate(()=>critScenario),null);
      assert.equal(await page.locator('#critPaths button').count(),6);
      await click('#critPaths [onclick="selectCriticalGroup(\'rhythm\')"]');
      await page.evaluate(()=>document.getElementById('critical').scrollTop=650);await settle();
      const before=await page.locator('#critical').evaluate(e=>e.scrollTop);
      await click('#critChange');
      assert.equal(await page.locator('#critical').evaluate(e=>e.scrollTop),before,'Chooser retains current scroll');
      assert.equal(await page.locator('#critPicker .crit-subpaths button').count(),4);
      assert.equal(await page.locator('#critPicker .crit-paths button').count(),0,'Related conditions first, not six categories');
      assert.match(await page.locator('#critPicker').innerText(),/Brady.*Tachy.*Cardiogenic shock.*ACPE/s);
      await page.keyboard.press('Escape');assert.equal(await page.locator('#critPicker').isVisible(),false);
      assert.equal(await page.locator('#critChange').evaluate(e=>e===document.activeElement),true,await page.evaluate(()=>document.activeElement.outerHTML));
      assert.equal(await page.locator('#critical').evaluate(e=>e.scrollTop),before);
      await click('#critChange');await click('#critPicker [onclick="showCriticalPicker(\'all\')"]');
      assert.equal(await page.locator('#critPicker .crit-paths button').count(),6);
      await click('#critPicker [onclick="selectCriticalGroup(\'painsedation\')"]');
      assert.equal(await page.evaluate(()=>critGroup),'painsedation');assert.equal(await page.locator('#critPicker').isVisible(),false);
      await click('#critChange');
      assert.deepEqual(await page.locator('#critPicker .crit-subpaths button').evaluateAll(es=>es.map(e=>e.dataset.path)),['pain','combative','psed'],'Pain / Sedation retains the sole Procedural Sedation entry');
      await page.keyboard.press('Escape');await settle();
      await noReadback();
      const opioid=page.locator('#crit-treatment .row').filter({hasText:'FentaNYL IV/IN'});
      assert.match(await opioid.innerText(),/Draw volume/);assert.match(await opioid.innerText(),/Conditions/);assert.match(await opioid.innerText(),/Contraindications/);
      await page.evaluate(()=>selectCriticalPath('psed'));await settle();await noReadback();
      const sedation=await page.locator('#crit-treatment').innerText();
      assert.match(sedation,/FentaNYL IV\/IO\/CVAD\/IN/);assert.match(sedation,/Midazolam IV\/IO\/CVAD\/IN/,'Original procedural sedation card retains both medication/route lines');
      await click('#critChange');await click('#critPicker [onclick="showCriticalPicker(\'all\')"]');await click('#critPicker [onclick="selectCriticalGroup(\'airbreath\')"]');
      await click('#critChange');
      assert.deepEqual(await page.locator('#critPicker .crit-subpaths button').evaluateAll(es=>es.map(e=>e.dataset.path)),['bronch','allergy','croup'],'Respiratory related chooser has no duplicate Procedural Sedation');
      await page.keyboard.press('Escape');await settle();
      await page.evaluate(()=>{switchPane('calc');S.ageVal=2;S.wtVal=14;recompute();switchPane('critical');selectCriticalPath('croup');});await settle();
      await noReadback();
      const dex=page.locator('#crit-treatment .row').filter({hasText:'Dexamethasone PO — croup'});
      assert.match(await dex.innerText(),/7 mg/);assert.match(await dex.innerText(),/0.7 mL/,'Draw amount remains on the original medication card');
      await page.evaluate(()=>{switchPane('calc');S.wtVal=10;recompute();switchPane('critical');});
      assert.match(await dex.innerText(),/5 mg/);assert.match(await dex.innerText(),/0.5 mL/,'Original card recalculates after patient edits');
      await page.evaluate(()=>{switchPane('calc');S.ageVal=10;S.wtVal=30;recompute();switchPane('critical');selectCriticalPath('brady');});
      await noReadback();assert.equal(await page.locator('#crit-treatment .row').count(),0,'No pediatric Brady standing drug dose');
      assert.match(await page.locator('#critContent>.crit-alert.patch').innerText(),/Adult targets and standing treatment doses are suppressed/);
      await page.evaluate(()=>selectCriticalPath('tachy'));await settle();await noReadback();
      const tachyWarning=page.locator('#critContent>.crit-alert.patch');
      assert.equal(await tachyWarning.isVisible(),true,'Pediatric patch requirement remains visible without the retired panel');
      assert.match(await tachyWarning.innerText(),/MANDATORY BHP PATCH — PEDIATRIC TACHYDYSRHYTHMIA/);
      assert.match(await tachyWarning.innerText(),/patch-reference data only; treatment requires a BHP order/);
      assert.ok(!(await tachyWarning.innerText()).includes('MANDATORY ×2'),'No adult Tachy patch instruction in pediatric warning');
      assert.match(await tachyWarning.innerText(),/PDC v5\.4 p\.\d+ \(PDF \d+\)/,'Pediatric chart source remains available');
      assert.match(await page.locator('#crit-treatment').innerText(),/Adenosine IV fast push — pediatric patch reference/);
      assert.match(await page.locator('#crit-treatment').innerText(),/Amiodarone IV — pediatric patch reference/);
      assert.match(await page.locator('#crit-electrical').innerText(),/Synchronized cardioversion — pediatric patch reference/);
      await page.evaluate(()=>{switchPane('calc');S.ageVal=1;S.wtVal=10;recompute();selectCase('rosc');});
      assert.equal(await page.locator('#results .rosc-age-review').count(),1,'Older fluid-age mismatch flagged in Calculator');
      await page.evaluate(()=>{switchPane('critical');selectCriticalPath('rosc');});
      assert.equal(await page.locator('#critContent>.rosc-age-review').count(),1,'Same source-review flag in Critical');
      await noReadback();
      // Every pathway retains exactly its original visible treatment cards and
      // airway/electrical sections across adult, pediatric and unknown-age data.
      const paths=await page.evaluate(()=>CRIT_PATHS.map(path=>path.id));
      for(const patient of [{age:28,weight:80},{age:10,weight:30},{age:2,weight:14},{age:null,weight:20}]){
        await page.evaluate(({age,weight})=>{S.ageVal=age;S.wtVal=weight;recompute();},patient);
        for(const id of paths){
          const expected=await page.evaluate(id=>{selectCriticalPath(id);const rows=critRowsForPath(S.pt,id);return{treatment:rows.rows.length,electrical:rows.electrical.length};},id);
          await noReadback();
          assert.equal(await page.locator('#crit-treatment .row').count(),expected.treatment,`${id}: no treatment cards removed or duplicated`);
          assert.equal(await page.locator('#crit-electrical .row').count(),expected.electrical,`${id}: electrical references retained`);
          assert.equal(await page.locator('#crit-airway').count(),1,`${id}: airway equipment retained`);
          if(!expected.treatment)assert.match(await page.locator('#crit-treatment').innerText(),/No treatment calculation available/);
        }
      }
      await page.evaluate(()=>{newPatient();switchPane('critical');selectCriticalPath('pain');});
      await noReadback();assert.equal(await page.locator('#crit-treatment .row').count(),0,'New patient retains no stale treatment result');
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const large of [false,true])for(const daylight of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({large,daylight})=>{S.ageVal=28;S.wtVal=80;recompute();document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',daylight);selectCriticalPath('brady');document.getElementById('critical').scrollTop=800;},{large,daylight});await settle();
        await click('#critChange');
        const metrics=await page.locator('#critPicker').evaluate(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,height:r.height,buttons:[...e.querySelectorAll('button')].map(b=>({h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width})),overflow:e.scrollWidth>e.clientWidth+1};});
        assert.ok(metrics.left>=0&&metrics.right<=size.width+1&&!metrics.overflow,'Picker fits width');
        assert.ok(metrics.height>0&&metrics.bottom<=size.height+1,'Picker fits visible height');
        assert.ok(metrics.buttons.every(b=>b.h>=44&&b.w>=44),'Chooser touch targets');
        await click('#critPicker [onclick="showCriticalPicker(\'all\')"]');
        const all=await page.locator('#critPicker').evaluate(e=>({bottom:e.getBoundingClientRect().bottom,overflow:e.scrollWidth>e.clientWidth+1}));
        assert.ok(all.bottom<=size.height+1&&!all.overflow,'All-category chooser fits viewport');
        if(shots&&daylight===false&&size.width===390&&!large)await page.screenshot({path:path.join(shots,`${engine}-critical-chooser.png`)});
        await page.keyboard.press('Escape');await page.evaluate(()=>{document.getElementById('critical').scrollTop=0;});await settle();
        await noReadback();
        assert.equal(await page.locator('#critical').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'Uncluttered Critical content fits phone/landscape width');
        assert.ok(await page.locator('#crit-treatment .row').count()>0,'Brady treatment cards remain available in every display mode');
        if(shots&&size.width===390&&!large)await page.screenshot({path:path.join(shots,`${engine}-critical-${daylight?'day':'dark'}.png`)});
      }
      assert.deepEqual(errors,[]);console.log(`PASS ${engine}: related/all chooser, preserved scroll/focus, read-back absence across all pathways, retained treatment and pediatric patch references, resets and phone layout`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
