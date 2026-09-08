// Requires Playwright. TEST_WEBKIT=1 adds WebKit; CHROME_PATH may select Chrome.
// COMPARE_REF optionally verifies content preservation against a pre-split build.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=process.env.COMPARE_REF?execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'}):null;
if(baseline){
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  assert.equal(clinical(html),clinical(baseline),'Clinical calculation and directive data remain unchanged');
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/baseline.html'?baseline:html);});
const expected={
  airway:{rows:[]},
  bronch:{rows:['Salbutamol — bronchoconstriction','EPINEPHrine IM — severe asthma','Dexamethasone — bronchoconstriction','CPAP'],calc:['Bronchoconstriction','CPAP']},
  acpe:{rows:['CPAP','Nitroglycerin — ACPE'],calc:['Acute Cardiogenic Pulmonary Edema','CPAP']},
  psed:{rows:['Procedural sedation (post-ETT / TCP)'],calc:['Procedural Sedation']},
  allergy:{rows:['EPINEPHrine IM — anaphylaxis','DiphenhydrAMINE'],calc:['Moderate–Severe Allergic Reaction']},
  croup:{rows:[],calc:[]},
  seizure:{rows:['Midazolam — active seizure'],calc:['Seizure']},
  hypogly:{rows:['Hypoglycemia threshold','Dextrose D10W','Dextrose D50W (if not D10)','Glucagon IM (if no IV dextrose)'],calc:['Hypoglycemia']},
  opioid:{rows:['Naloxone — opioid toxicity'],calc:['Opioid Toxicity & Withdrawal']},
  adrenal:{rows:['Hydrocortisone — adrenal crisis'],calc:['Suspected Adrenal Crisis']}
};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce',colorScheme:'dark',serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.goto(url);await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      await click('nav [data-pane="critical"]');
      const group=async id=>{if(await page.locator('#critPaths').evaluate(el=>el.hidden))await click('#critChange');await click(`#critPaths [onclick="selectCriticalGroup('${id}')"]`);};
      await group('airbreath');
      assert.match(await page.locator('#critContext').innerText(),/^Airway \/ Respiratory/);
      assert.deepEqual(await page.locator('#critSubpaths button').evaluateAll(nodes=>nodes.map(el=>el.dataset.path)),['airway','bronch','acpe','psed','allergy','croup']);
      for(const id of Object.keys(expected)){
        const groupId=['seizure','hypogly','opioid','adrenal'].includes(id)?'neurometab':'airbreath';
        if(await page.evaluate(()=>critGroup)!==groupId)await group(groupId);
        await click(`#critSubpaths [data-path="${id}"]`);
        assert.deepEqual(await page.evaluate(id=>critRowsForPath(S.pt,id).rows.map(r=>r.name),id),expected[id].rows,id+' shows only the expected treatment cards');
        assert.equal(await page.locator(`#critSubpaths [data-path="${id}"]`).getAttribute('aria-pressed'),'true');
        assert.equal(await page.evaluate(()=>S.pt.weightKg),80);
        // Each directive button opens its actual directive, already expanded.
        const dirs=await page.evaluate(()=>critPath().directives.map(id=>{const d=DIR.find(d=>d.id===id);return d?{id:d.id,name:d.n}:null;}));
        assert.ok(dirs.every(Boolean),id+' has valid directive links');
        for(const directive of dirs){
          if(dirs.length>1){
            const chooser=page.locator('.directive-chooser');if(!await chooser.evaluate(el=>el.open))await chooser.locator('summary').click();
            await click(`.directive-chooser [onclick="openCriticalDirective('${directive.id}')"]`);
          }else await click('#critContent [onclick="openCriticalDirective()"]');
          assert.equal(await page.locator('#dirSearch').inputValue(),directive.name);
          assert.ok(await page.locator(`.dcard[data-id="${directive.id}"]`).evaluate(el=>el.classList.contains('open')));
          await click('nav [data-pane="critical"]');
        }
        await click('#critContent [onclick="openCriticalCalculations()"]');
        if(expected[id].calc)assert.deepEqual(await page.locator('#results .rdirective').evaluateAll(nodes=>[...new Set(nodes.map(el=>el.textContent))].sort()),[...expected[id].calc].sort(),id+' Calculator destination is focused');
        assert.equal(await page.locator('#caseChips .casechip').count(),9,'Main Calculator scenario menu stays unchanged');
        await click('nav [data-pane="critical"]');
      }
      assert.deepEqual(await page.locator('#critSubpaths button').evaluateAll(nodes=>nodes.map(el=>el.dataset.path)),['seizure','hypogly','opioid','adrenal']);
      await group('shocktrauma');assert.equal(await page.locator('#critContext').innerText(),'Trauma');
      assert.equal(await page.locator('#critSubpaths button').count(),0);
      for(const width of [320,375,390,430]){
        await page.setViewportSize({width,height:844});
        for(const large of [false,true])for(const id of ['airbreath','neurometab']){
          await page.evaluate(large=>document.body.classList.toggle('large-text',large),large);await group(id);
          assert.deepEqual(await page.locator('#critSubpaths button').evaluateAll(buttons=>{
            const bad=[];
            for(const b of buttons){
              const rect=b.getBoundingClientRect();
              if(rect.height<44||rect.left<0||rect.right>innerWidth||rect.bottom>innerHeight)bad.push(b.textContent);
              const range=document.createRange();range.selectNodeContents(b);
              if([...range.getClientRects()].some(r=>r.left<rect.left-1||r.right>rect.right+1))bad.push(b.textContent+' clipped label');
            }return bad;
          }),[],engine+' '+width+'px all subcategory buttons visible and readable');
          assert.ok(await page.locator('.crit-sticky').evaluate(el=>el.getBoundingClientRect().height<innerHeight-200),'Header leaves treatment space');
        }
      }
      if(baseline){
        const oldPage=await context.newPage();await oldPage.goto(url+'/baseline.html');
        const patients=[{ageYears:28,weightKg:80},{ageYears:5,weightKg:20},{ageYears:.5,weightKg:8},{ageYears:0,weightKg:3},{ageYears:null,weightKg:20},{ageYears:40,weightKg:null}];
        const snapshots=(pg,groups)=>pg.evaluate(({patients,groups})=>patients.map(input=>{
          const p=buildPatient(input);return Object.fromEntries(Object.entries(groups).map(([group,ids])=>{
            const values=ids.map(id=>critRowsForPath(p,id));
            const unique=key=>[...new Set(values.flatMap(v=>v[key]).map(v=>JSON.stringify(v)))].sort();
            return[group,{rows:unique('rows'),equipment:unique('equipment')}];
          }));
        }),{patients,groups});
        const previous=await snapshots(oldPage,{airway:['airway'],resp:['resp'],neuro:['neuro']});
        const updated=await snapshots(page,{airway:['airway','psed'],resp:['bronch','acpe','allergy','croup'],neuro:['seizure','hypogly','opioid','adrenal']});
        assert.deepEqual(updated,previous,'Splitting pathways preserves every existing dose, caution, condition and equipment card');await oldPage.close();
      }
      await page.setViewportSize({width:430,height:932});
      await page.evaluate(()=>document.body.classList.remove('large-text'));
      if(process.env.SCREENSHOT_DIR){
        fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
        for(const [id,selected] of [['airbreath','bronch'],['neurometab','hypogly']]){
          await group(id);await click(`#critSubpaths [data-path="${selected}"]`);await page.locator('#critical').evaluate(el=>el.scrollTo(0,0));
          await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,engine+'-'+id+'.png')});
        }
      }
      await click('#critClose');await click('#newPtTop');
      assert.equal(await page.evaluate(()=>critScenario),null);assert.equal(await page.locator('#calcSearch').inputValue(),'');
      assert.deepEqual(errors,[]);console.log('PASS '+engine+': Critical subcategories, focused cards/links, phone labels, patient preservation/reset and unchanged source cards.');
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
