// Display consistency only: existing clinical calculations and age gates are
// preserved. Requires Playwright; TEST_WEBKIT=1 adds WebKit.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const baseline=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show',`${process.env.COMPARE_REF||'HEAD'}:index.html`],{cwd:root,encoding:'utf8'});
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
assert.equal(clinical(html),clinical(baseline),'Shared drug doses, equipment formulas and directive data are unchanged');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const snapshots=await page.evaluate(()=>[null,0,.25,.4999,.5,.9999,1,2,7.9999,8,17.9999,18,28].flatMap(ageYears=>[20,null].map(weightKg=>{
        const p=buildPatient({ageYears,weightKg,suppressWeightEstimate:true});
        return{ageYears,weightKg,paths:CRIT_PATHS.map(path=>({id:path.id,targets:critTargets(p,path.id),eligibility:critAgeEligibility(p,path.id),priorities:critPriorities(p,path),...critRowsForPath(p,path.id)}))};
      })));
      let checked=0;
      for(const patient of snapshots)for(const data of patient.paths){
        const title=`${data.id}: age ${patient.ageYears}, weight ${patient.weightKg}`;
        assert.ok(data.equipment.some(r=>/^ETT(?: —| size)/.test(r.name)),title+' retains shared airway');
        if(data.eligibility&&data.eligibility.eligible!==true){
          assert.equal(data.rows.length,0,title+' no standing treatment dose outside existing age condition');
          assert.ok(data.priorities.some(s=>/No standing treatment dose/i.test(s)),title+' no adult treatment directions in reminders');
        }
        if(data.id==='brady'){
          if(patient.ageYears==null||patient.ageYears<18){
            assert.ok(!data.targets.some(([name])=>/Adult HR|TCP rate/.test(name)),title+' adult Brady targets suppressed');
            assert.ok(!data.rows.some(r=>/DOPamine/.test(r.name)),title+' ROSC-eligible dopamine not leaked into pediatric Brady');
          }else assert.deepEqual(data.rows.map(r=>r.name),['Atropine — symptomatic bradycardia','Fluid bolus — if indicated','TCP','DOPamine infusion (800 mcg/mL)','Procedural sedation (post-ETT / TCP)'],title+' adult treatment order preserved');
        }
        if(data.id==='rosc'){
          const target=data.targets.find(([name])=>name==='DOPamine SBP');
          assert.equal(target[1],patient.ageYears==null?'Age required':patient.ageYears<8?'Outside ≥8 y condition':'90–<110',title+' dopamine overview follows existing ≥8 y gate');
          assert.equal(data.rows.some(r=>r.name==='DOPamine infusion (800 mcg/mL)'),patient.ageYears!=null&&patient.ageYears>=8,title+' existing ROSC card gate preserved');
        }
        if(data.id==='tachy'){
          if(patient.ageYears==null){assert.equal(data.rows.length,0,title+' unknown age does not insert adult Valsalva');assert.ok(!data.targets.some(([name])=>/Wide regular|Narrow regular/.test(name)),title+' unknown age no adult rhythm thresholds');}
          else if(patient.ageYears<18){
            assert.ok(!data.rows.some(r=>/Valsalva/.test(r.name)),title+' pediatric pathway never uses adult Valsalva');
            assert.ok(data.rows.every(r=>/pediatric patch reference/.test(r.name)&&r.tone==='patch'),title+' PDC drug rows explicitly BHP patch-only');
            assert.equal(data.targets.find(([name])=>name==='BHP patch')[1],'MANDATORY',title+' pediatric mandatory patch retained');
          }else assert.ok(data.rows.some(r=>/Valsalva/.test(r.name)),title+' adult Valsalva retained');
        }
        checked++;
      }
      // Exact one-day boundary: Medical Arrest/Opioid versus Newborn.
      const dayBoundary=await page.evaluate(()=>[.9999,1,1.0001].map(ageDays=>{
        const p=buildPatient({ageYears:ageDays/365.25,weightKg:3});
        return{ageDays,arrest:critAgeEligibility(p,'arrest'),newborn:critAgeEligibility(p,'newborn'),opioid:critAgeEligibility(p,'opioid'),rows:['arrest','newborn','opioid'].map(id=>({id,rows:critRowsForPath(p,id).rows}))};
      }));
      for(const row of dayBoundary){
        assert.equal(row.arrest.eligible,row.ageDays>=1);assert.equal(row.opioid.eligible,row.ageDays>=1);assert.equal(row.newborn.eligible,row.ageDays<1);
      }
      // Rendered notices and targets remain plainly visible; no PDC chart dose
      // is presented as an authorized patient-specific Brady treatment.
      await page.evaluate(()=>{S.ageVal=10;S.wtVal=30;recompute();switchPane('critical');selectCriticalPath('brady');});
      assert.equal(await page.locator('#crit-treatment .row').count(),0,'Pediatric Brady renders no adult drug card');
      assert.match(await page.locator('#critContent').innerText(),/Adult targets and standing treatment doses are suppressed/);
      assert.match(await page.locator('#critContent').innerText(),/BHP patch-reference data only/);
      assert.equal(await page.locator('#critContent [onclick="openCriticalPeds()"]:has-text("Open Peds patch reference")').count(),1);
      await page.evaluate(()=>{S.ageVal=7.99;recompute();selectCriticalPath('rosc');});
      assert.match(await page.locator('.crit-targets').first().innerText(),/Outside ≥8 y condition/);
      await page.evaluate(()=>{S.ageVal=null;recompute();selectCriticalPath('tachy');});
      assert.equal(await page.locator('#crit-treatment .row').count(),0,'Unknown age Tachy renders no adult treatment card');
      assert.deepEqual(errors,[],'No runtime errors');
      console.log(`${engine}: ${checked} Critical age/path/weight combinations plus exact-day boundaries and rendered notices passed`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
