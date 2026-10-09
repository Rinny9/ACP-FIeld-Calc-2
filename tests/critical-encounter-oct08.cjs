// Related-condition chooser and encounter-only BHP read-back checks.
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
      assert.equal(await page.locator('#critReadbackPanel').getAttribute('open'),null,'Read-back initially collapsed');
      await click('#critReadbackPanel>summary');
      const treatment=page.locator('#critReadbackTreatment'),options=await treatment.locator('option').evaluateAll(es=>es.map(e=>({v:e.value,t:e.textContent})));
      const opioid=options.find(o=>/FentaNYL/.test(o.t));assert.ok(opioid);
      await treatment.selectOption(opioid.v);await settle();
      assert.match(await page.locator('#critReadbackSelected').innerText(),/Draw volume/);
      assert.match(await page.locator('#critReadbackSelected').innerText(),/Conditions/);
      assert.match(await page.locator('#critReadbackSelected').innerText(),/Contraindications/);
      await page.locator('#critReadbackFindings').fill('Observed pain; vitals recorded separately. <script>not executed</script>');
      await page.evaluate(()=>selectCriticalPath('psed'));await settle();
      await click('#critReadbackPanel>summary');
      assert.equal(await page.locator('#critReadbackFindings').inputValue(),'Observed pain; vitals recorded separately. <script>not executed</script>');
      const routeOptions=await page.locator('#critReadbackTreatment option').allTextContents();
      assert.ok(routeOptions.some(t=>/FentaNYL IV\/IO\/CVAD\/IN/.test(t)));
      assert.ok(routeOptions.some(t=>/Midazolam IV\/IO\/CVAD\/IN/.test(t)),'Combined card offers each medication / route separately');
      await page.evaluate(()=>{switchPane('calc');S.ageVal=2;S.wtVal=14;recompute();switchPane('critical');selectCriticalPath('croup');});await settle();
      await click('#critReadbackPanel>summary');
      const dex=await page.locator('#critReadbackTreatment option').evaluateAll(es=>es.find(e=>e.textContent.includes('Dexamethasone')).value);
      await page.locator('#critReadbackTreatment').selectOption(dex);
      assert.match(await page.locator('#critReadbackSelected').innerText(),/7 mg/);assert.match(await page.locator('#critReadbackSelected').innerText(),/0.7 mL/);
      await page.evaluate(()=>{switchPane('calc');S.wtVal=10;recompute();switchPane('critical');});
      assert.equal(await page.locator('#critReadbackTreatment').inputValue(),'','Patient edits clear selected reference');
      await page.evaluate(()=>{switchPane('calc');S.ageVal=10;S.wtVal=30;recompute();switchPane('critical');selectCriticalPath('brady');});
      await click('#critReadbackPanel>summary');
      assert.equal(await page.locator('#critReadbackTreatment option').count(),1,'No pediatric Brady standing drug reference');
      await page.evaluate(()=>selectCriticalPath('tachy'));await click('#critReadbackPanel>summary');
      assert.match(await page.locator('#critReadbackPanel').innerText(),/MANDATORY BHP PATCH/);
      assert.match(await page.locator('#critReadbackPanel').innerText(),/Chart-reference basis — not an exact patient calculation/);
      assert.ok(!(await page.locator('#critReadbackPanel').innerText()).includes('MANDATORY ×2'),'No adult Tachy patch instruction in pediatric read-back');
      const adeno=await page.locator('#critReadbackTreatment option').evaluateAll(es=>es.find(e=>e.textContent.includes('Adenosine')&&e.textContent.includes('1st')).value);
      await page.locator('#critReadbackTreatment').selectOption(adeno);
      await click('#critReadbackSelected .card-details summary');
      assert.match(await page.locator('#critReadbackSelected').innerText(),/PDC p\.\d+ \(PDF \d+\)/);
      await page.evaluate(()=>{switchPane('calc');S.ageVal=1;S.wtVal=10;recompute();selectCase('rosc');});
      assert.equal(await page.locator('#results .rosc-age-review').count(),1,'Older fluid-age mismatch flagged in Calculator');
      await page.evaluate(()=>{switchPane('critical');selectCriticalPath('rosc');});
      assert.equal(await page.locator('#critContent>.rosc-age-review').count(),1,'Same source-review flag in Critical');
      await click('#critReadbackPanel>summary');
      assert.ok((await page.locator('#critReadbackTreatment option').allTextContents()).every(t=>!t.includes('age <2')&&!t.includes('age <8')),'No age-status placeholders offered as drugs');
      await page.evaluate(()=>{newPatient();switchPane('critical');selectCriticalPath('pain');});
      assert.equal(await page.evaluate(()=>criticalReadback.findings),'');assert.deepEqual(await page.evaluate(()=>Object.keys(criticalReadback.selection)),[]);
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
        await click('#critReadbackPanel>summary');
        await page.locator('#critReadbackTreatment').scrollIntoViewIfNeeded();
        const pick=await page.locator('#critReadbackTreatment option').nth(1).getAttribute('value');if(pick)await page.locator('#critReadbackTreatment').selectOption(pick);await settle();
        // WebKit defers native-form scroll extents until a compositor paint.
        // Capture the actual rendered page before measuring; do not hide overflow.
        await page.screenshot(shots?{path:path.join(shots,`${engine}-${size.width}-readback-${large?'large':'normal'}-${daylight?'day':'dark'}.png`)}:{});
        assert.equal(await page.locator('#critReadbackPanel').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,JSON.stringify({size,large,daylight,bad:await page.locator('#critReadbackPanel').evaluate(e=>[e,...e.querySelectorAll('*')].filter(x=>x.scrollWidth>x.clientWidth+1||x.getBoundingClientRect().right>e.getBoundingClientRect().right+1).map(x=>({tag:x.tagName,id:x.id,cls:x.className,text:x.textContent.slice(0,65),sw:x.scrollWidth,cw:x.clientWidth,rect:x.getBoundingClientRect().width})).slice(0,15))}));
        if(shots&&size.width===390&&!large)await page.screenshot({path:path.join(shots,`${engine}-readback-${daylight?'day':'dark'}.png`)});
        await page.evaluate(()=>{criticalReadback.open.brady=false;renderCritGrid();});
      }
      assert.deepEqual(errors,[]);console.log(`PASS ${engine}: related/all chooser, preserved scroll, BHP read-back, age/chart distinction, resets and phone layout`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
