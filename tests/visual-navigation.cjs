// Phone navigation and accessibility checks for the compact field layout.
// TEST_WEBKIT=1 adds WebKit; CHROME_PATH selects installed Chrome.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=execFileSync('git',['-c','safe.directory='+root.replace(/\\/g,'/'),'show',(process.env.COMPARE_REF||'fc58afb')+':index.html'],{cwd:root,encoding:'utf8'});
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const pediatric=s=>JSON.parse(s.match(/const PEDS54 = (\[[^\n]+\]);/)[1]);
assert.equal(clinical(html),clinical(baseline),'Visual changes preserve all clinical formulas, doses, directive data and sources');
assert.deepEqual(pediatric(html),pediatric(baseline),'Published pediatric chart data remain unchanged');
const screenshots=process.env.SCREENSHOT_DIR;
if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.url==='/baseline.html'?baseline:html);});
function readable(rootSelector){
  const root=document.querySelector(rootSelector),bad=[];
  if(root.scrollWidth>root.clientWidth+1)bad.push('Horizontal overflow');
  for(const cell of root.querySelectorAll('.dose-amount')){
    if(!cell.getClientRects().length)continue;
    const range=document.createRange();range.selectNodeContents(cell);
    const rects=[...range.getClientRects()].filter(r=>r.width>.1),box=cell.closest('.row').getBoundingClientRect();
    if(new Set(rects.map(r=>Math.round(r.top))).size>1)bad.push('Split measurement '+cell.textContent);
    if(rects.some(r=>r.left<box.left-1||r.right>box.right+1))bad.push('Clipped measurement '+cell.textContent);
  }
  return bad;
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port,measurements=[];
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.goto(url);await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      for(const age of [28,5]){
        await page.evaluate(age=>{S.ageVal=age;S.wtVal=age===28?80:20;recompute();selectCase('trauma');},age);
        assert.equal(await page.locator('#scenarioLabel').innerText(),'Pain / Sedation','Calculator scenario matches Critical wording');
        const directives=await page.locator('#results .rdirective').allTextContents();
        assert.ok(directives.length>0);assert.ok(directives.every(t=>['Analgesia','Combative Patient','Procedural Sedation'].includes(t)),'Focused pain/sedation shows only its relevant directives');
        if(age<18)assert.ok(directives.every(t=>t==='Analgesia'),'Pediatric patient never receives adult combative/procedural-sedation cards');
      }
      await page.evaluate(()=>{S.ageVal=28;S.wtVal=80;recompute();selectCase('all');});
      const alphabetical=await page.locator('#results .sec:not([data-sec="summary"]):not([data-sec="airway"]) .sechead h2').allTextContents();
      assert.deepEqual(alphabetical,[...alphabetical].sort((a,b)=>a.localeCompare(b)),'All calculations retain alphabetical directive order');
      await page.evaluate(()=>{S.entryCollapsed=true;renderEntryState();switchPane('critical');});
      assert.equal(await page.evaluate(()=>critScenario),null,'Critical remains neutral on entry');
      assert.equal(await page.locator('.crit-sticky #critPaths,.crit-sticky #critSubpaths').count(),0,'Category and subcategory menus scroll outside the pinned header');
      for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}])for(const large of [false,true]){
        await page.setViewportSize(size);await page.evaluate(large=>document.body.classList.toggle('large-text',large),large);
        for(const id of ['arrest','psed','combative','tachy']){
          await page.evaluate(id=>{selectCriticalPath(id);document.getElementById('critical').scrollTop=500;},id);await settle();
          const result=await page.evaluate(()=>{
            const sticky=document.querySelector('.crit-sticky'),rect=sticky.getBoundingClientRect(),sub=document.getElementById('critSubpaths').getBoundingClientRect();
            return {height:rect.height,top:rect.top,subBottom:sub.bottom,scroll:document.getElementById('critical').scrollTop};
          });
          assert.ok(result.height<(size.width===320?180:160),`${engine} ${size.width}px large=${large} ${id}: compact pinned header (${result.height}px)`);
          assert.ok(result.height<size.height*.48,'Landscape keeps more than half the viewport available for content');
          assert.ok(Math.abs(result.top)<1,'Patient and selected pathway remain pinned');
          assert.ok(result.subBottom<result.height,'Subcategory menu scrolls out of the content viewport');
          assert.deepEqual(await page.evaluate(readable,'#critical'),[],`${engine} ${size.width}px large=${large} ${id}: intact equipment and dose text`);
          measurements.push({engine,...size,large,id,...result});
        }
      }
      await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.body.classList.remove('large-text','daylight');selectCriticalPath('arrest');document.getElementById('critical').scrollTop=0;});await settle();
      const panel=await page.locator('#crit-airway .crit-air-panel').innerText();
      for(const name of ['ETT — cuffed','Oral insertion depth','Suction catheter','Laryngoscope blade'])assert.ok(panel.includes(name),'Compact airway retains '+name);
      assert.match(panel,/Equipment sizing references/);assert.match(panel,/Airway guidance & directives/);
      assert.equal(await page.locator('#crit-airway .row.air-tile').count(),await page.evaluate(()=>critRowsForPath(S.pt,'arrest').equipment.length));
      assert.ok(await page.evaluate(()=>document.getElementById('crit-airway').compareDocumentPosition(document.getElementById('crit-treatment'))&Node.DOCUMENT_POSITION_FOLLOWING),'Arrest keeps airway before treatment');
      // Repeat/max safety text is carried into both Calculator and Critical.
      await page.evaluate(()=>{switchPane('calc');selectCase('crit-airway');});
      for(const name of ['ETT/trach suction pressure','Topical lidocaine ceiling']){
        const reference=await page.evaluate(name=>airway(S.pt).find(r=>r.k===name),name);
        if(reference.rep)assert.ok((await page.locator('#results .row').filter({hasText:name}).innerText()).includes(reference.rep),'Calculator displays airway repeat/max: '+name);
      }
      await page.evaluate(()=>switchPane('critical'));await page.evaluate(()=>selectCriticalPath('psed'));await settle();
      await page.locator('#critical').evaluate(el=>el.scrollTo(0,400));await settle();
      await page.locator('#critDisplayMenu > summary').click();
      const position=await page.locator('#critical').evaluate(el=>el.scrollTop);
      await page.locator('#critDisplayMenu [data-display="daylight"]').click();await settle();
      assert.equal(await page.evaluate(()=>critScenario),'psed');assert.equal(await page.locator('#critical').evaluate(el=>el.scrollTop),position,'Daylight keeps the reading position');
      await page.locator('#critDisplayMenu [data-display="large"]').click();await settle();
      assert.equal(await page.evaluate(()=>critScenario),'psed');assert.equal(await page.evaluate(()=>document.body.classList.contains('large-text')),true);
      assert.equal(await page.locator('#critDisplayMenu [data-display="large"]').getAttribute('aria-pressed'),'true');
      assert.ok(await page.locator('#critical').evaluate(el=>el.scrollTop)>0,'Large text keeps the current pathway reading position');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#critDisplayMenu').evaluate(el=>el.open),false,'Escape closes the display menu');
      assert.equal(await page.evaluate(()=>activePane),'critical','Closing display options keeps Critical open');
      // Native button roles and focus survive pathway/checklist reconstruction.
      await page.evaluate(()=>{selectCriticalPath('arrest');document.getElementById('critical').scrollTop=0;});
      await page.locator('#critSubpaths [data-path="rosc"]').focus();await page.keyboard.press('Enter');await settle();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.path),'rosc','Path switch retains keyboard focus');
      const check=page.locator('.crit-check').first(),checkId=await check.getAttribute('data-check');
      await check.focus();await page.keyboard.press('Space');await settle();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.check),checkId,'Checklist toggle retains keyboard focus');
      assert.equal(await page.locator(`[data-check="${checkId}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator(`[data-check="${checkId}"]`).getAttribute('role'),null,'ROSC check retains native button semantics');
      await page.locator('#critClose').click();await settle();
      assert.equal(await page.evaluate(()=>activePane),'calc','Pinned Back returns to Calculator');
      await page.locator('#calcDisplayMenu > summary').click();
      assert.equal(await page.locator('#calcDisplayMenu [data-display="daylight"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#calcDisplayMenu [data-display="large"]').getAttribute('aria-pressed'),'true');
      await page.locator('#calcDisplayMenu > summary').click();
      // Directive search opens matching content and does not rewrite browsing state.
      await page.evaluate(()=>{Object.assign(directiveOpen,{analgesia:true,combative:false});switchPane('dir');renderDirectives('');});
      const openBefore=await page.evaluate(()=>({...directiveOpen}));
      await page.locator('#dirSearch').fill('ketamine');
      assert.ok(await page.locator('#dirList .dcard').count()>0);
      assert.equal(await page.locator('#dirList .dcard:not(.open)').count(),0,'Search reveals all matching directive bodies');
      await page.evaluate(()=>window.scrollTo(0,900));await settle();
      assert.equal(await page.locator('#dirSearch').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===el;}),true,'Sticky directive search remains tappable below the patient bar');
      await page.locator('#dirSearch').fill('');assert.deepEqual(await page.evaluate(()=>({...directiveOpen})),openBefore,'Clearing search restores prior directive open state');
      // Peds results are visible immediately; focused Patch cards stay visible during search.
      await page.evaluate(()=>{S.ageVal=4;S.wtVal=18;recompute();switchPane('peds');});await settle();
      const originalBand=await page.evaluate(()=>PS.band);
      await page.locator('#pedFind').fill('midazolam');
      const names=await page.locator('#pedBody .row .rname').allTextContents();assert.ok(names.length>0);assert.ok(names.every(n=>/midazolam/i.test(n)));
      assert.equal(await page.locator('#pedBody .sec:not(.open) .row').count(),0);
      await page.locator('#pedClearFind').click();assert.equal(await page.evaluate(()=>PS.band),originalBand);assert.equal(await page.evaluate(()=>document.activeElement.id),'pedFind');
      const chartCount=await page.locator('#pedBody .row').count();
      await page.locator('#pedMode').click();assert.equal(await page.locator('#pedBody .row').count(),0,'Unselected Patch does not append the full chart');
      await page.locator('#pedFind').fill('atropine');
      const atropine=page.locator('.ped-patch-select [data-ped-key]').filter({hasText:'Atropine'});assert.equal(await atropine.count(),1);
      const key=await atropine.getAttribute('data-ped-key');await atropine.focus();await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.pedKey),key);
      assert.equal(await page.locator('.ped-patch-results .row').count(),1);
      const selected=await page.locator('.ped-patch-results').innerText();for(const label of ['Chart dose','Draw volume (chart)','0.2 mg/mL','BHP auth'])assert.ok(selected.includes(label),'Peds retains '+label);
      await page.locator('#pedFind').fill('ketamine');assert.equal(await page.locator('.ped-patch-results .row').count(),1);
      await page.locator('#pedClearFind').click();await page.locator('#pedMode').click();assert.equal(await page.locator('#pedBody .row').count(),chartCount);
      assert.deepEqual(await page.evaluate(readable,'#pane-peds'),[],'Peds labels and dose values fit');
      if(screenshots){
        await page.locator('#pedFind').fill('dexamethasone');await page.evaluate(()=>window.scrollTo(0,0));await settle();await page.screenshot({path:path.join(screenshots,engine+'-peds-find.png')});
        for(const shot of [{name:'critical-arrest',id:'arrest',age:28,weight:80,large:false,day:false,top:true},{name:'critical-sedation',id:'psed',age:28,weight:80,large:false,day:false},{name:'critical-croup-large-day',id:'croup',age:2,weight:14,large:true,day:true}]){
          await page.evaluate(shot=>{S.ageVal=shot.age;S.wtVal=shot.weight;document.body.classList.toggle('large-text',shot.large);document.body.classList.toggle('daylight',shot.day);recompute();switchPane('critical');selectCriticalPath(shot.id);const el=document.getElementById('critical'),section=document.getElementById('crit-treatment');el.scrollTop=shot.top?0:el.scrollTop+section.getBoundingClientRect().top-document.querySelector('.crit-sticky').getBoundingClientRect().bottom-8;},shot);await settle();
          await page.screenshot({path:path.join(screenshots,engine+'-'+shot.name+'.png')});
        }
      }
      await page.evaluate(()=>switchPane('calc'));await page.locator('#newPtTop').click();await settle();
      assert.equal(await page.evaluate(()=>critScenario),null);assert.deepEqual(await page.evaluate(()=>roscChecklistState),{});assert.equal(await page.evaluate(()=>PS.query),'');assert.deepEqual(await page.evaluate(()=>PS.sel),{});assert.equal(await page.evaluate(()=>PS.patch),false);
      assert.equal(await page.evaluate(()=>document.body.classList.contains('large-text')),true,'New patient preserves display preference');
      assert.equal(await page.evaluate(()=>document.body.classList.contains('daylight')),true);
      assert.deepEqual(errors,[],engine+' runtime errors');
      console.log('PASS '+engine+': compact phone/landscape header, airway text, display and encounter state, focus, directive search and Peds focused navigation.');
    }finally{await browser.close();}
  }
  if(screenshots)fs.writeFileSync(path.join(screenshots,'header-measurements.json'),JSON.stringify(measurements,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
