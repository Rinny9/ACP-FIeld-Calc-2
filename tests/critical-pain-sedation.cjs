// Requires Playwright. TEST_WEBKIT=1 adds WebKit; CHROME_PATH may select Chrome.
// COMPARE_REF permits only three reviewed contraindication/source metadata edits.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(process.env.COMPARE_REF){
  const baseline=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  let ketorolac=0,ketamine=0;
  const approved=clinical(baseline).split('\n').map(line=>{
    if(line.includes("name: 'Ketorolac IM/IV'")){
      ketorolac++;
      assert.ok(line.includes("contra: 'Same NSAID list as ibuprofen · do not give with ibuprofen'"));
      assert.ok(line.includes("src: 'PCS p.164'"));
      return line.replace("contra: 'Same NSAID list as ibuprofen · do not give with ibuprofen'","contra: 'NSAID in last 6 h · ASA/NSAID allergy or sensitivity · anticoagulated · active bleeding · hx PUD/GI bleed · pregnancy · asthmatic without prior ASA/NSAID use · CVA/TBI in 24 h · renal impairment · suspected ischemic CP · do not give with ibuprofen'").replace("src: 'PCS p.164'","src: 'PCS p.163–164'");
    }
    if(line.includes("name: 'Ketamine IM — severe agitation'")){
      ketamine++;
      assert.ok(line.includes("contra: 'Co-administration with midazolam without BHP order'"));
      assert.ok(line.includes("src: 'PCS p.168–169 · CD p.31'"));
      return line.replace("contra: 'Co-administration with midazolam without BHP order'","contra: 'Allergy or sensitivity to ketamine · Co-administration with midazolam without BHP order'").replace("src: 'PCS p.168–169 · CD p.31'","src: 'PCS p.167–169 · CD p.31'");
    }
    return line;
  }).join('\n');
  assert.equal(ketorolac,1);assert.equal(ketamine,2,'Known-weight and missing-weight ketamine metadata are both corrected');
  assert.equal(clinical(html),approved,'Only approved contraindication/source metadata changes; all formulas, doses, other clinical data and directives unchanged');
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
const combativeNames=['Midazolam — combative','Ketamine IM — severe agitation'];
const patients=[0,1,11,12,17,18,64,65,null].flatMap(ageYears=>[
  {ageYears,weightKg:ageYears==null||ageYears>=18?80:ageYears>=12?50:ageYears>=1?20:3,suppressWeightEstimate:true},
  {ageYears,weightKg:null,suppressWeightEstimate:true}
]);

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      const checkNotices=async(selector,id)=>{
        const results=await page.locator(selector).evaluate((root,id)=>{
          const notice=root.querySelector('.pathway-notice'),first=root.querySelector('.row'),key=id==='pain'?'Opioid ↔ ketamine:':'Before sedation:';
          const caution=[...root.querySelectorAll('.crit-alert,.calcnotice')].find(el=>el.textContent.includes(key));
          return {notice:!!notice,caution:!!caution,noticeBefore:!!notice&&!!first&&!!(notice.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING),cautionBefore:!!caution&&!!first&&!!(caution.compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING),collapsed:!!notice?.closest('details:not([open])')||!!caution?.closest('details:not([open])')};
        },id);
        assert.deepEqual(results,{notice:true,caution:true,noticeBefore:true,cautionBefore:true,collapsed:false},selector+' '+id+': eligibility and cautions precede cards and are not collapsed');
      };
      await page.goto(url);await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      await click('nav [data-pane="critical"]');
      const config=await page.evaluate(()=>({groups:CRIT_GROUPS,paths:CRIT_PATHS,cases:CASES,dirs:DIR.map(d=>({id:d.id,name:d.n}))}));
      const group=config.groups.find(g=>g.id==='painsedation');assert.ok(group);
      assert.equal(group.label,'Pain / Sedation');assert.deepEqual(group.paths,['pain','combative']);
      assert.equal(config.groups.length,6,'Replacing Trauma does not add another top-level category');
      assert.ok(!config.groups.some(g=>g.id==='shocktrauma'||g.label==='Trauma'),'No obsolete Critical Trauma category');
      assert.ok(!config.paths.some(p=>p.id==='trauma'),'No obsolete Critical Trauma pathway');
      for(const [id,directive,calc] of [['pain','analgesia','crit-pain'],['combative','combative','crit-combative']]){
        const pathway=config.paths.find(p=>p.id===id);assert.ok(pathway);
        assert.deepEqual(pathway.directives,[directive]);assert.equal(pathway.calc,calc);
        const scenario=config.cases.find(c=>c.id===calc);assert.ok(scenario);assert.equal(scenario.hidden,true);
        assert.deepEqual(scenario.sections,id==='pain'?['analgesia']:['sedation']);
        assert.deepEqual(scenario.directives,id==='pain'?['Analgesia']:['Combative Patient']);
        assert.equal(scenario.minAge,id==='combative'?18:1);
      }
      assert.ok(config.cases.some(c=>c.id==='trauma'&&!c.hidden),'Trauma remains in main Calculator');
      for(const id of ['trauma','tension','txa','ivft'])assert.ok(config.dirs.some(d=>d.id===id),'Existing '+id+' directive is preserved');

      // Compare each card, including conditions, cautions, dose, draw volume,
      // repeat/max, concentration and sources, against the existing Calculator.
      const snapshots=await page.evaluate(({patients,combativeNames})=>patients.map(input=>{
        const p=buildPatient(input),d=drugCalcs(p);
        return{input,patient:p,pain:critRowsForPath(p,'pain'),combative:critRowsForPath(p,'combative'),expectedPain:d.analgesia,
          expectedCombative:d.sedation.filter(r=>combativeNames.includes(r.name)),airway:critRowsForPath(p,'arrest').equipment,
          targets:{pain:critTargets(p,'pain'),combative:critTargets(p,'combative')}};
      }),{patients,combativeNames});
      for(const sample of snapshots){
        const label=`age=${sample.input.ageYears} weight=${sample.input.weightKg}`;
        assert.deepEqual(sample.pain.rows,sample.expectedPain,label+': full applicable analgesia cards are unchanged and in order');
        assert.deepEqual(sample.combative.rows,sample.expectedCombative,label+': only original combative cards are used');
        for(const id of ['pain','combative']){
          assert.deepEqual(sample[id].equipment,sample.airway,label+': '+id+' retains all shared airway cards');
          assert.equal(sample[id].electrical.length,0,label+': no unrelated electrical treatment');
          assert.ok(!sample[id].rows.some(r=>/TXA|Tranexamic|fluid|needle|thorac|Procedural sedation/i.test(r.name)),label+': no trauma or procedural-sedation leakage');
          assert.ok(!/TXA|head|shoulder|breech|delivery|oxytocin/i.test(JSON.stringify(sample.targets[id])),label+': no trauma/childbirth target fallthrough');
        }
        if(sample.input.ageYears==null||sample.input.ageYears<18)assert.equal(sample.combative.rows.length,0,label+': no adult chemical-sedation dose');
        else{
          assert.deepEqual(sample.combative.rows.map(r=>r.name),combativeNames,label+': complete adult chemical-sedation pathway');
          assert.match(sample.combative.rows[1].contra,/midazolam.*BHP order/i,label+': coadministration patch requirement remains');
          if(sample.input.weightKg==null)assert.ok(sample.combative.rows.every(r=>r.needW&&!r.dose&&!r.ml),label+': missing weight cannot populate a dose');
          if(sample.input.ageYears>=65)assert.match(sample.combative.rows[1].sub,/3 mg\/kg/,'Older-adult ketamine restriction is preserved');
        }
        if(sample.input.ageYears>=1&&sample.input.ageYears<18){
          const ketamine=sample.pain.rows.find(r=>/Ketamine/.test(r.name));assert.ok(ketamine);
          assert.equal(ketamine.tone,'patch');assert.match(ketamine.sub,/BHP.*dosage verification/i,label+': pediatric ketamine remains patch-only');
          if(sample.input.ageYears<12)for(const opioid of sample.pain.rows.filter(r=>/FentaNYL|Morphine/.test(r.name))){
            assert.equal(opioid.tone,'patch');assert.match(opioid.sub,/BHP.*dosage verification/i,label+': under-12 opioid patch requirement remains');
          }
        }
      }

      // Exercise the actual category/subcategory buttons and destination actions.
      await click('#critPaths [onclick="selectCriticalGroup(\'painsedation\')"]');
      assert.deepEqual(await page.locator('#critSubpaths button').evaluateAll(nodes=>nodes.map(el=>el.dataset.path)),['pain','combative']);
      assert.equal(await page.evaluate(()=>critScenario),'pain');
      for(const id of ['pain','combative']){
        await click(`#critSubpaths [data-path="${id}"]`);
        assert.match(await page.locator('#critContext').innerText(),/^Pain \/ Sedation/);
        const names=await page.locator('#crit-treatment .rname').allTextContents();assert.ok(names.length>0);
        await checkNotices('#critContent',id);
        assert.ok(!names.some(n=>/TXA|Procedural sedation|thorac|fluid/i.test(n)));
        assert.equal(await page.locator('#crit-airway').count(),1);
        assert.equal(await page.locator('#critAirwayGuidance').count(),1);
        if(id==='combative'){
          const text=await page.locator('#crit-treatment').innerText();
          assert.match(text,/BHP order/);assert.match(text,/EtCO₂/);
          const caution=page.locator('#crit-treatment .row').filter({hasText:'Ketamine IM — severe agitation'}).locator('.rcontra');
          assert.equal(await caution.count(),1);assert.ok(await caution.isVisible(),'Coadministration caution is not hidden in reference details');
        }
        const directive=id==='pain'?'analgesia':'combative',directiveName=config.dirs.find(d=>d.id===directive).name;
        await click('#critContent [onclick="openCriticalDirective()"]');
        assert.equal(await page.locator('#dirSearch').inputValue(),directiveName);
        assert.ok(await page.locator(`.dcard[data-id="${directive}"]`).evaluate(el=>el.classList.contains('open')));
        await click('nav [data-pane="critical"]');assert.equal(await page.evaluate(()=>critScenario),id);
        await click('#critContent [onclick="openCriticalCalculations()"]');
        assert.equal(await page.evaluate(()=>S.caseId),'crit-'+id);
        await checkNotices('#results',id);
        const noticePosition=await page.evaluate(()=>{
          const notice=document.querySelector('#results .pathway-notice').getBoundingClientRect(),bar=document.getElementById('ptbar').getBoundingClientRect();
          return{belowPatient:notice.top>=bar.bottom-1,visible:notice.top>=0&&notice.top<innerHeight&&notice.bottom>bar.bottom};
        });
        assert.deepEqual(noticePosition,{belowPatient:true,visible:true},id+': Calculator navigation starts at the eligibility notice below patient summary');
        assert.deepEqual(await page.locator('#results .rdirective').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.textContent))]),[directiveName]);
        assert.equal(await page.locator('#caseChips .casechip').count(),9,'Main Calculator scenario count is preserved');
        await click('nav [data-pane="critical"]');
      }
      await click('#critChange');await click('#critPaths [onclick="selectCriticalGroup(\'rhythm\')"]');
      assert.equal(await page.locator('#critContent .pathway-notice').count(),0,'Pain/sedation notice does not leak into unrelated pathways');
      assert.ok(!(await page.locator('#critContent').innerText()).includes('Opioid ↔ ketamine:'));
      await click('#critChange');await click('#critPaths [onclick="selectCriticalGroup(\'painsedation\')"]');
      assert.equal(await page.evaluate(()=>critScenario),'combative','Last subcategory is remembered within this encounter');

      for(const age of [0,1,11,12,17,null]){
        await page.evaluate(age=>{S.ageVal=age;S.wtVal=20;recompute();selectCriticalPath('combative');},age);await settle();
        assert.equal(await page.locator('#crit-treatment .row').count(),0,'No chemical-sedation treatment cards for age '+age);
        assert.match(await page.locator('#crit-treatment').innerText(),/No treatment calculation available/);
        assert.match(await page.locator('#critContent').innerText(),age==null?/Age unknown|Age required/:/≥18|adult directive|adult.only/i,'Age restriction is explained');
        await click('#critContent [onclick="openCriticalCalculations()"]');
        assert.equal(await page.evaluate(()=>S.caseId),'crit-combative');
        assert.equal(await page.locator('#results .row').count(),0,'Focused Calculator destination also enforces age eligibility');
        await click('nav [data-pane="critical"]');
      }

      // Narrow screens, both themes and Large text: no clipped navigation or
      // treatment/equipment cards; the retired shortcut row remains absent.
      for(const width of [320,390])for(const large of [false,true])for(const day of [false,true])for(const id of ['pain','combative']){
        await page.setViewportSize({width,height:844});
        await page.evaluate(({large,day,id})=>{S.ageVal=28;S.wtVal=80;document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',day);recompute();selectCriticalPath(id);},{large,day,id});await settle();
        const overflow=await page.locator('#critical').evaluate(root=>{
          const bad=[];if(root.scrollWidth>root.clientWidth+1)bad.push('Critical horizontal overflow');
          for(const el of root.querySelectorAll('#critSubpaths button,.crit-dosegrid .row')){
            if(!el.getClientRects().length)continue;const box=el.getBoundingClientRect();
            if(box.left<-.5||box.right>innerWidth+.5)bad.push(el.textContent.slice(0,80));
            if(el.matches('button')){
              if(box.height<43.5)bad.push('Touch target too small');
              const range=document.createRange();range.selectNodeContents(el);
              if([...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1))bad.push('Clipped label: '+el.textContent);
            }
          }return bad;
        });assert.deepEqual(overflow,[],`${engine} ${width}px large=${large} daylight=${day} ${id}`);
        assert.equal(await page.locator('#critJumps,.crit-jumps').count(),0);
        assert.equal(await page.locator('#critSubpaths button').count(),2);
        if(process.env.SCREENSHOT_DIR&&width===390&&large===day){
          fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.locator('#critical').evaluate(el=>el.scrollTo(0,0));
          await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${engine}-${id}-${day?'day-large':'dark'}.png`)});
        }
      }
      await page.evaluate(()=>{document.body.classList.remove('large-text','daylight');});
      await click('#critClose');await click('#newPtTop');await click('nav [data-pane="critical"]');
      assert.equal(await page.evaluate(()=>critScenario),null,'New patient clears chosen scenario');
      await click('#critPaths [onclick="selectCriticalGroup(\'painsedation\')"]');
      assert.equal(await page.evaluate(()=>critScenario),'pain','New patient clears last Pain/Sedation subcategory');
      assert.deepEqual(errors,[]);
      console.log('PASS '+engine+': Pain/Sedation navigation, unchanged source cards across age/weight boundaries, adult-only combative gates, airway preservation and phone layouts.');
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
