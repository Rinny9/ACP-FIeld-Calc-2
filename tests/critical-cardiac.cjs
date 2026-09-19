// Requires Playwright. TEST_WEBKIT=1 adds WebKit; CHROME_PATH may select Chrome.
// Exercises Critical grouping, shared airway output, age guards and shortcut removal.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(process.env.COMPARE_REF){
  const baseline=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  assert.equal(clinical(html),clinical(baseline),'Shared medication, equipment formulas and directive data are unchanged');
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
const requiredAirway=['Oral insertion depth','Suction catheter','Laryngoscope blade'];

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      await page.goto(url);await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      await click('nav [data-pane="critical"]');
      assert.equal(await page.evaluate(()=>critScenario),null,'Entering Critical does not assign a scenario');
      const groups=await page.evaluate(()=>CRIT_GROUPS);
      assert.deepEqual(groups.find(g=>g.id==='rhythm').paths,['brady','tachy','cshock','acpe']);
      assert.equal(groups.find(g=>g.id==='rhythm').label,'Cardiac');
      assert.deepEqual(groups.find(g=>g.id==='airbreath').paths,['bronch','psed','allergy','croup']);
      assert.ok(!groups.find(g=>g.id==='airbreath').paths.includes('acpe'),'ACPE belongs to Cardiac, not two groups');
      const memberships=groups.flatMap(g=>g.paths);assert.equal(new Set(memberships).size,memberships.length,'Each pathway has one category');
      const cshockCase=await page.evaluate(()=>CASES.find(c=>c.id==='crit-cshock'));
      assert.equal(cshockCase.minAge,18);assert.equal(cshockCase.hidden,true);

      // The shared display must use exactly the existing Calculator airway values.
      const allPaths=await page.evaluate(()=>CRIT_PATHS.map(p=>p.id));
      assert.ok(!allPaths.includes('airway'),'Standalone Critical Airway pathway is removed');
      for(const input of [{ageYears:28,weightKg:80},{ageYears:5,weightKg:20},{ageYears:.5,weightKg:8},{ageYears:0,weightKg:3},{ageYears:0,weightKg:.8},{ageYears:.1,weightKg:null,suppressWeightEstimate:true},{ageYears:40,weightKg:null}]){
        const results=await page.evaluate(input=>{
          const p=buildPatient(input),reference=airway(p);
          return {reference:reference.map(r=>({name:r.k,dose:r.k==='Oral insertion depth'&&r.v==='—'?'Weight required':r.v,sub:r.sub,rep:r.rep,src:r.src,tone:r.tone,needW:r.needW})),paths:CRIT_PATHS.map(path=>({id:path.id,...critRowsForPath(p,path.id)}))};
        },input);
        assert.ok(results.reference.length>=7,'Full applicable airway set, not only the four core equipment cards');
        for(const result of results.paths){
          assert.equal(result.equipment.length,results.reference.length,`${result.id}: all and only applicable Calculator airway cards`);
          for(const ref of results.reference){
            const matches=result.equipment.filter(r=>r.name===ref.name);
            assert.equal(matches.length,1,`${result.id}: ${ref.name} appears once`);assert.equal(matches[0].dose,ref.dose,`${result.id}: Calculator airway value preserved`);
            for(const key of ['rep','src','tone'])assert.equal(matches[0][key],ref[key],`${result.id}: ${ref.name} ${key} preserved`);
            if(ref.dose!=='Weight required')for(const key of ['sub','needW'])assert.equal(matches[0][key],ref[key],`${result.id}: ${ref.name} ${key} preserved`);
          }
          const names=result.equipment.map(r=>r.name);assert.equal(new Set(names).size,names.length,result.id+': no duplicated airway cards');
          assert.ok(!names.some(n=>/cardioversion|defibrillation/i.test(n)),result.id+': electrical therapy is not an airway card');
        }
      }
      for(const weightKg of [20,null]){
        const unknown=await page.evaluate(weightKg=>{
          const p=buildPatient({ageYears:null,weightKg});return {igel:airway(p).find(r=>r.k==='i-gel size'),paths:CRIT_PATHS.map(path=>({id:path.id,...critRowsForPath(p,path.id)}))};
        },weightKg);
        for(const result of unknown.paths){
          assert.equal(result.equipment.length,5,'Unknown age: four age-required placeholders plus weight-specific i-gel');
          for(const name of requiredAirway){const row=result.equipment.find(r=>r.name===name);assert.ok(row,result.id+': '+name+' placeholder');assert.match(row.dose,/age required/i);}
          assert.ok(result.equipment.some(r=>/^ETT(?: —| size)/.test(r.name)&&/age required/i.test(r.dose)),result.id+': unknown age never assumes an adult ETT');
          const igel=result.equipment.find(r=>r.name==='i-gel size');assert.ok(igel);assert.equal(igel.dose,unknown.igel.v);assert.equal(igel.needW,unknown.igel.needW);
        }
      }
      const shock=await page.evaluate(()=>[28,18,17.99,5,null].map(ageYears=>{
        const p=buildPatient({ageYears,weightKg:80}),data=critRowsForPath(p,'cshock'),d=drugCalcs(p);
        return {ageYears,data,fluid:d.cardiac.find(r=>r.name==='Cardiogenic shock (STEMI+) — fluid'),dopamine:d.cardiac.find(r=>r.name.includes('DOPamine'))};
      }));
      for(const result of shock){
        if(result.ageYears!=null&&result.ageYears>=18){
          assert.equal(result.data.rows.length,2,'Adult shock has fluid then dopamine');
          assert.match(result.data.rows[0].name,/fluid|bolus|NaCl/i);assert.match(result.data.rows[1].name,/DOPamine/);
          for(const [row,original] of [[result.data.rows[0],result.fluid],[result.data.rows[1],result.dopamine]]){
            for(const key of ['dose','ml','rep','lines','contra'])assert.deepEqual(row[key],original[key],'Shock preserves source '+key);
            assert.match(row.when,/≥18/);assert.match(row.when,/STEMI/);assert.match(row.when,/cardiogenic shock/i);assert.match(row.when,/hypotension/i);
            assert.match(row.sub,/BHP.*bradycardic/i);
          }
        }else assert.equal(result.data.rows.length,0,'No standing shock treatment for age '+result.ageYears);
      }
      const peds=await page.evaluate(()=>critRowsForPath(buildPatient({ageYears:5,weightKg:20}),'tachy'));
      assert.equal(peds.electrical.length,2);assert.ok(peds.electrical.some(r=>/Synchronized cardioversion/.test(r.name)));
      assert.ok(peds.equipment.some(r=>/^ETT —/.test(r.name)));

      const group=async id=>{if(await page.locator('#critPaths').evaluate(el=>el.hidden))await click('#critChange');await click(`#critPaths [onclick="selectCriticalGroup('${id}')"]`);};
      await group('rhythm');await click('#critSubpaths [data-path="tachy"]');
      await group('neurometab');await group('rhythm');
      assert.equal(await page.evaluate(()=>critScenario),'tachy','Returning to Cardiac recalls its last subpath');
      await click('#critSubpaths [data-path="cshock"]');await group('airbreath');await group('rhythm');
      assert.equal(await page.evaluate(()=>critScenario),'cshock');
      assert.match(await page.locator('#critContext').innerText(),/Cardiac/);
      // Every former Airway directive is accessible from another pathway, not
      // dependent on selecting the now-removed standalone Airway subcategory.
      for(const id of ['oti','sga','suction']){
        const guidance=page.locator('#critAirwayGuidance');
        if(!await guidance.evaluate(el=>el.open))await click('#critAirwayGuidance > summary');
        const name=await page.evaluate(id=>DIR.find(d=>d.id===id).n,id);
        await click(`#critAirwayGuidance [onclick="openCriticalDirective('${id}')"]`);
        assert.equal(await page.locator('#dirSearch').inputValue(),name);
        assert.ok(await page.locator(`.dcard[data-id="${id}"]`).evaluate(el=>el.classList.contains('open')));
        await click('nav [data-pane="critical"]');assert.equal(await page.evaluate(()=>critScenario),'cshock');
      }
      if(!await page.locator('#critAirwayGuidance').evaluate(el=>el.open))await click('#critAirwayGuidance > summary');
      await click('#critAirwayGuidance [onclick="openCriticalAirwayCalculations()"]');
      assert.equal(await page.evaluate(()=>S.caseId),'crit-airway','Shared airway action opens focused Calculator equipment');
      assert.ok((await page.locator('#results .rname').allTextContents()).some(s=>/^ETT —/.test(s)));
      await click('nav [data-pane="critical"]');assert.equal(await page.evaluate(()=>critScenario),'cshock');
      await click('#critContent [onclick="openCriticalCalculations()"]');
      assert.equal(await page.evaluate(()=>S.caseId),'crit-cshock');
      assert.equal(await page.locator('#caseChips .casechip').count(),9,'Hidden Critical scenario does not enlarge Calculator menu');
      assert.ok((await page.locator('#results .rname').allTextContents()).some(s=>/DOPamine/.test(s)));
      // Verify the focused Calculator destination enforces its age guard, too.
      for(const ageVal of [5,null]){
        await page.evaluate(ageVal=>{S.ageVal=ageVal;S.wtVal=20;recompute();selectCase('crit-cshock');},ageVal);await settle();
        assert.ok(!(await page.locator('#results .rname').allTextContents()).some(s=>/DOPamine|Cardiogenic shock \(STEMI\+\) — fluid/.test(s)),'No adult shock cards in age-gated Calculator destination');
      }
      await page.evaluate(()=>{S.ageVal=28;S.wtVal=80;recompute();switchPane('critical');});await settle();

      // Removing the shortcut row must preserve section content and the category
      // tabs, including on narrow phones and with Large text enabled.
      const noShortcuts=async()=>assert.equal(await page.locator('#critJumps,.crit-jumps,#critical [onclick^="jumpCriticalSection"],#critical button[data-section^="crit-"]').count(),0,'Critical has no section-shortcut row or buttons');
      for(const width of [320,390])for(const large of [false,true]){
        await page.setViewportSize({width,height:844});await page.evaluate(large=>document.body.classList.toggle('large-text',large),large);
        for(const id of allPaths){
          await page.evaluate(id=>selectCriticalPath(id),id);await settle();
          await noShortcuts();
          assert.equal(await page.locator('#crit-airway').count(),1,id+': a distinct airway section');
          assert.equal(await page.locator('#critSubpaths [data-path="airway"]').count(),0,'Standalone Airway tab is absent');
          assert.equal(await page.locator('#critAirwayGuidance').count(),1,id+': shared guidance is present');
          assert.equal(await page.locator('#critAirwayGuidance > summary').innerText(),'Airway guidance & directives');
          const guidanceText=await page.locator('#critAirwayGuidance').textContent();
          for(const reminder of ['Optimize basic airway management first','Limit OTI and SGA insertion attempts','Reconfirm after every move'])assert.ok(guidanceText.includes(reminder),id+': original airway reminder is preserved');
          assert.match(guidanceText,/Max 2/);assert.match(guidanceText,/≤10\s*(?:sec|s)/);
          for(const directive of ['oti','sga','suction'])assert.equal(await page.locator(`#critAirwayGuidance [onclick="openCriticalDirective('${directive}')"]`).count(),1,id+': shared '+directive+' directive');
          assert.equal(await page.locator('#critAirwayGuidance [onclick="openCriticalAirwayCalculations()"]').count(),1);
          assert.equal(await page.locator('#crit-references').count(),1,id+': reference controls remain available');
          if(id==='rosc')assert.equal(await page.locator('#crit-checklist').count(),1,'ROSC checklist remains available');
          const groupPaths=await page.evaluate(()=>CRIT_GROUPS.find(g=>g.id===critGroup).paths);
          assert.equal(await page.locator('#critSubpaths button').count(),groupPaths.length>1?groupPaths.length:0,id+': subcategory tabs remain available');
          const treatment=await page.evaluate(id=>critRowsForPath(S.pt,id).rows.length,id);
          if(treatment)assert.equal(await page.locator('#crit-treatment .row').count(),treatment,id+': treatment cards remain available');
          const overflow=await page.locator('#critical').evaluate(root=>{
            const bad=[];
            if(root.scrollWidth>root.clientWidth+1)bad.push('Critical horizontal overflow');
            for(const el of root.querySelectorAll('#critSubpaths button,.crit-dosegrid .row')){
              if(!el.getClientRects().length)continue;const r=el.getBoundingClientRect();
              if(r.left<-.5||r.right>innerWidth+.5)bad.push(el.textContent.slice(0,90));
              if(el.matches('button')&&r.height<43.5)bad.push('Small touch target: '+el.textContent);
            }return bad;
          });assert.deepEqual(overflow,[],`${engine} ${width}px large=${large} ${id}`);
        }
      }
      // Pediatric electrical and airway headings/content remain distinct.
      await page.evaluate(()=>{S.ageVal=5;S.wtVal=20;recompute();selectCriticalPath('tachy');});await settle();
      assert.equal(await page.locator('#crit-electrical').count(),1);assert.equal(await page.locator('#crit-airway').count(),1);
      await noShortcuts();
      assert.match(await page.locator('#crit-electrical').innerText(),/Synchronized cardioversion/);
      assert.match(await page.locator('#critContent').innerText(),/MANDATORY BHP PATCH/);
      assert.ok(!(await page.locator('#crit-airway').innerText()).includes('Synchronized cardioversion'));

      // Out-of-chart pediatric weight still shows a clear empty-treatment state;
      // adding airway cards must not make missing patch data look available.
      await page.evaluate(()=>{S.ageVal=17;S.wtVal=60;recompute();selectCriticalPath('tachy');});await settle();
      assert.match(await page.locator('#crit-treatment').innerText(),/No treatment calculation available/);
      assert.match(await page.locator('#critContent').innerText(),/outside the published chart/);
      assert.equal(await page.locator('#crit-electrical').count(),0);
      const noWeight=await page.evaluate(()=>critRowsForPath(buildPatient({ageYears:40,weightKg:null}),'cshock'));
      assert.equal(noWeight.rows.length,2);assert.ok(noWeight.rows.every(r=>r.needW),'Unknown weight never produces shock dose/rates');
      if(process.env.SCREENSHOT_DIR){
        fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
        await page.setViewportSize({width:390,height:844});
        for(const shot of [
          {name:'cardiac-treatment',age:28,weight:80,path:'cshock',section:'crit-treatment',large:false,day:false},
          {name:'cardiac-airway-daylight-large',age:28,weight:80,path:'brady',section:'crit-airway',large:true,day:true},
          {name:'pediatric-electrical',age:5,weight:20,path:'tachy',section:'crit-electrical',large:false,day:false}
        ]){
          await page.evaluate(shot=>{S.ageVal=shot.age;S.wtVal=shot.weight;document.body.classList.toggle('large-text',shot.large);document.body.classList.toggle('daylight',shot.day);recompute();selectCriticalPath(shot.path);},shot);await settle();
          await page.evaluate(section=>{
            const container=document.getElementById('critical'),target=document.getElementById(section),sticky=document.querySelector('.crit-sticky');
            const top=container.scrollTop+target.getBoundingClientRect().top-container.getBoundingClientRect().top-sticky.getBoundingClientRect().height-8;
            container.scrollTo({top:Math.max(0,top),behavior:'instant'});
          },shot.section);await settle();
          await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${engine}-${shot.name}.png`)});
        }
      }

      await click('#critClose');await click('#newPtTop');await click('nav [data-pane="critical"]');
      assert.equal(await page.evaluate(()=>critScenario),null,'New patient clears the chosen pathway');
      await group('rhythm');assert.equal(await page.evaluate(()=>critScenario),'brady','New patient clears Cardiac last-subpath memory');
      assert.deepEqual(errors,[]);console.log('PASS '+engine+': Cardiac grouping, full shared airway cards/guidance/directive links, pediatric electrical separation, shock age guards, subpath memory/reset, phone layout and no section-shortcut row.');
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
