// Focused structured-patient-panel regression; no full medication-path sweep.
// TEST_WEBKIT=1 adds WebKit; CHROME_PATH selects installed Chrome.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const {migrateDrawFixture}=require('./draw-volume-fixture.cjs');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=migrateDrawFixture(execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show','86cd69d:index.html'],{cwd:root,encoding:'utf8'}),html);
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const sources=s=>s.slice(s.indexOf('const SRC_LINKS='),s.indexOf('function rowHTML(')).replace(/\r/g,'');
assert.equal(clinical(html),clinical(baseline),'Patient presentation does not change clinical data, formulas or directives');
assert.equal(sources(html),sources(baseline),'Source mappings and reference helpers remain unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],baseline.match(/const PEDS54\s*=([^\n]+)/)[1],'Pediatric chart transcription remains unchanged');
assert.match(html,/const APP_BUILD='2026\.11\.03\.1'/);
const files=new Map([['/',html],['/index.html',html],...['field-ui.css','field-shell.js','field-home.js','manifest.webmanifest','icon.svg'].map(name=>['/'+name,fs.readFileSync(path.join(root,name),'utf8')])]);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,body=files.get(name);res.writeHead(body?200:404,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});res.end(body||'Not found');});
const shots=process.env.SCREENSHOT_DIR;if(shots)fs.mkdirSync(shots,{recursive:true});
function geometry(){
  const issues=[],panel=document.getElementById('fieldPatientControls'),box=panel.getBoundingClientRect();
  if(document.documentElement.scrollWidth>innerWidth+1||panel.scrollWidth>panel.clientWidth+1)issues.push('horizontal overflow');
  if(box.left<-.5||box.right>innerWidth+.5)issues.push('patient panel outside screen');
  for(const [id,controlIds]of [['ageRow',['ageIn','ageUnit']],['wtRow',['wtIn','kgBtn','lbBtn']]]){
    const group=document.getElementById(id),rect=group.getBoundingClientRect(),controls=controlIds.map(id=>document.getElementById(id));
    if(group.getAttribute('role')!=='group'||!document.getElementById(group.getAttribute('aria-labelledby'))?.textContent.trim())issues.push(id+': missing group label');
    for(const control of controls){
      const r=control.getBoundingClientRect();
      if(!r.width||!r.height||r.height<43.5||r.width<43.5)issues.push(control.id+': missing/small control');
      if(r.left<rect.left-.5||r.right>rect.right+.5)issues.push(control.id+': escapes its age/weight group');
      if(!group.contains(control))issues.push(control.id+': detached from its unit group');
    }
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
      const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)issues.push(id+': overlapping value/unit controls');
    }
    for(const label of group.querySelectorAll('label')){
      if(!label.getClientRects().length)continue;
      if(getComputedStyle(label).clipPath!=='none'){if(!label.closest('#critical'))issues.push(id+': unit caption hidden outside compact Critical layout');continue;}
      const range=document.createRange();range.selectNodeContents(label);
      if([...range.getClientRects()].some(r=>r.left<rect.left-.5||r.right>rect.right+.5))issues.push(id+': clipped label '+label.textContent);
    }
  }
  const a=document.getElementById('ageRow').getBoundingClientRect(),b=document.getElementById('wtRow').getBoundingClientRect();
  if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)issues.push('age and weight groups overlap');
  if(document.querySelectorAll('#patientEntry').length!==1||document.querySelectorAll('#ageIn').length!==1||document.querySelectorAll('#wtIn').length!==1)issues.push('duplicate patient fields');
  const nav=document.getElementById('fieldNav').getBoundingClientRect();if(nav.bottom>innerHeight+1||nav.top<0)issues.push('navigation outside viewport');
  return [...new Set(issues)];
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const name of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];let acceptReset=true;
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>acceptReset?d.accept():d.dismiss());
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>!!window.FIELD_UI?.browseDirectives);
      assert.equal(await page.locator('#fieldPatientControls .field-patient-panel').count(),1);assert.equal(await page.locator('#patientDialog').count(),0);
      assert.equal(await page.locator('#ageRow').getAttribute('aria-labelledby'),'patientAgeLabel');assert.equal(await page.locator('#wtRow').getAttribute('aria-labelledby'),'patientWeightLabel');
      assert.equal(await page.locator('#ageUnit').getAttribute('aria-label'),'Age unit');assert.equal(await page.locator('#wtRow .unitseg').getAttribute('role'),'group');assert.equal(await page.locator('#wtRow .unitseg').getAttribute('aria-label'),'Weight unit');
      assert.equal(await page.locator('#advancedToggle').getAttribute('aria-controls'),'advancedPatient');assert.equal(await page.locator('#advancedPatient').isVisible(),false);
      const originalInput=await page.locator('#ageIn').elementHandle(),failures=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        for(const pane of ['calc','critical','dir','tools']){
          await click(`#fieldNav [data-pane="${pane}"]`);const issues=await page.evaluate(geometry);if(issues.length)failures.push({size,daylight,large,pane,issues});
          assert.equal(await originalInput.evaluate(el=>el===document.getElementById('ageIn')),true,'Input node identity survives pane moves');
        }
        if(shots&&size.width===390){await click('#fieldNav [data-pane="calc"]');await page.screenshot({path:path.join(shots,`${name}-patient-${large?'large':'normal'}-${daylight?'day':'night'}.png`)});}
      }
      assert.deepEqual(failures,[],name+': patient groups, unit controls and labels fit every display mode');
      await click('#fieldNav [data-pane="calc"]');await page.locator('#ageIn').fill('4');await page.locator('#wtIn').fill('18');await settle();
      assert.equal(await page.evaluate(()=>critScenario),null,'Entering patient data does not assign a Critical scenario');
      const originalDrugs=await page.evaluate(()=>JSON.stringify(drugCalcs(S.pt)));
      await page.locator('#ageUnit').selectOption('m');assert.equal(await page.locator('#ageIn').inputValue(),'48');assert.equal(await page.evaluate(()=>S.pt.ageYears),4);
      await page.locator('#ageUnit').selectOption('d');assert.equal(await page.locator('#ageIn').inputValue(),'1461');assert.equal(await page.evaluate(()=>S.pt.ageYears),4);
      await page.locator('#ageUnit').selectOption('y');assert.equal(await page.locator('#ageIn').inputValue(),'4');
      await click('#lbBtn');assert.equal(await page.locator('#lbBtn').getAttribute('aria-pressed'),'true');assert.ok(Math.abs(await page.evaluate(()=>S.pt.weightKg)-18)<.01);assert.match(await page.locator('#ptcard').innerText(),/Entered in lbs.*converted to kg/);
      await click('#kgBtn');assert.equal(await page.locator('#kgBtn').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#wtIn').inputValue(),'18');assert.equal(await page.evaluate(()=>JSON.stringify(drugCalcs(S.pt))),originalDrugs,'Display-unit round trip retains clinical calculation results');
      await page.locator('#wtIn').fill('');await settle();assert.equal(await page.evaluate(()=>S.pt.weightKg),await page.evaluate(()=>buildPatient({ageYears:4,weightKg:null}).weightKg));assert.equal(await page.locator('#ptcard').evaluate(el=>el.classList.contains('field-estimated')),true);assert.match(await page.locator('#ptcard').innerText(),/ESTIMATED/);assert.equal(await page.locator('#estNote').isVisible(),true);assert.match(await page.locator('#estNote').innerText(),/estimated/i);
      assert.equal(await page.locator('#estNote').evaluate(el=>!!(el.compareDocumentPosition(document.getElementById('advancedToggle'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Estimated/validation status precedes optional airway details');
      await page.locator('#wtIn').fill('18');await click('#advancedToggle');assert.equal(await page.locator('#advancedPatient').isVisible(),true);assert.equal(await page.locator('#sexIn').isVisible(),true);assert.equal(await page.locator('#htIn').isVisible(),true);await click('#advancedToggle');
      await click('#fieldNav [data-pane="critical"]');await page.evaluate(()=>selectCriticalPath('seizure'));await settle();
      await page.locator('#ageIn').fill('');await page.locator('#ageIn').pressSequentially('28',{delay:15});assert.equal(await page.locator('#ageIn').inputValue(),'28');assert.equal(await page.locator('#ageIn').evaluate(el=>el===document.activeElement),true);
      await page.locator('#wtIn').fill('');await page.locator('#wtIn').pressSequentially('80',{delay:15});assert.equal(await page.locator('#wtIn').inputValue(),'80');assert.equal(await page.locator('#wtIn').evaluate(el=>el===document.activeElement),true);assert.ok(await page.locator('#crit-treatment .row').count()>0);
      await page.locator('#wtIn').fill('2');await settle();assert.ok(await page.evaluate(()=>S.validation.length)>0);assert.equal(await page.locator('#critical .row').count(),0);assert.equal(await page.locator('#crit-treatment').getAttribute('data-patient-validation'),'blocked');assert.equal(await page.locator('#estNote').isVisible(),true);assert.equal(await page.locator('#wtIn').evaluate(el=>el===document.activeElement),true);
      await page.locator('#wtIn').fill('80');await settle();assert.equal(await page.evaluate(()=>S.validation.length),0);assert.ok(await page.locator('#crit-treatment .row').count()>0);assert.equal(await page.locator('#wtIn').evaluate(el=>el===document.activeElement),true);
      await click('#fieldNav [data-pane="calc"]');assert.match(await page.locator('#ptcard .field-summary-label').innerText(),/Weight used/i);await click('#settingsTop');const before=await page.evaluate(()=>JSON.stringify(S.pt));acceptReset=false;await click('#newPtTop');assert.equal(await page.evaluate(()=>JSON.stringify(S.pt)),before,'Cancelled reset preserves the patient');acceptReset=true;await click('#newPtTop');
      assert.equal(await page.locator('#ageIn').inputValue(),'');assert.equal(await page.locator('#wtIn').inputValue(),'');assert.equal(await page.locator('#ageUnit').inputValue(),'y');assert.equal(await page.locator('#kgBtn').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>critScenario),null);assert.equal(await page.evaluate(()=>S.validation.length),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'ageIn');assert.equal(await page.evaluate(()=>FIELD_UI.directoryState.mode),'start');
      assert.deepEqual(errors,[]);console.log(`PASS ${name}: structured patient groups/labels, 44px controls at320–844px both themes/text sizes, conversions/provenance, estimates, optional fields, Critical typing/validation and reset.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
