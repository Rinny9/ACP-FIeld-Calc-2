// Playwright regression: service-only atropine/drip sets and Critical entry/order.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(process.env.COMPARE_REF){
  const old=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const engine=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/^\s*atropine:.*$/m,'').replace(/\r/g,'');
  assert.equal(engine(html),engine(old),'No clinical engine change except atropine stock');
  assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],old.match(/const PEDS54\s*=([^\n]+)/)[1],'Raw source chart remains intact');
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.addInitScript(()=>localStorage.setItem('acpFieldProfileV2',JSON.stringify({name:'Test service',concentrations:{atropine:0.1,midazolam:1}})));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.deepEqual(await page.evaluate(()=>[CONC.atropine.v,CONC.midazolam.v]),[.2,1],'Old atropine override ignored; other service settings preserved');
      await page.evaluate(()=>setConcentration('atropine',{value:'.6'}));
      assert.equal(await page.evaluate(()=>CONC.atropine.v),.2,'Fixed stock cannot be edited');
      const stock=page.locator('#concList .settingsrow').filter({hasText:'atropine'});
      assert.equal(await stock.locator('input').count(),0);assert.match(await stock.innerText(),/0\.2 mg\/mL/);
      const enter=()=>page.locator('nav [data-pane="critical"]').click();
      const close=()=>page.locator('#critClose').click();
      const chooser=async()=>{
        assert.equal(await page.evaluate(()=>critScenario),null);
        assert.equal(await page.locator('#critPaths button').count(),6);
        assert.equal(await page.locator('#critPaths button[aria-pressed="true"]').count(),0);
        assert.equal(await page.locator('#critSubpaths button').count(),0);
        assert.equal(await page.locator('#critContent .row').count(),0);
        assert.equal(await page.locator('#critPaths').isVisible(),true);
      };
      await enter();await chooser();await close();
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      assert.match(await page.locator('#caseChips .casechip').filter({hasText:'ROSC'}).innerText(),/^🔄\s*ROSC$/);
      await enter();await chooser();
      await page.locator('#critPaths [onclick="selectCriticalGroup(\'rhythm\')"]').click();
      assert.equal(await page.evaluate(()=>critScenario),'brady');
      const atropine=page.locator('#critContent .row').filter({hasText:'Atropine — symptomatic bradycardia'});
      assert.match(await atropine.innerText(),/1 mg IV/);assert.match(await atropine.innerText(),/5 mL/);
      await close();await enter();assert.equal(await page.evaluate(()=>critScenario),'brady','User-selected scenario retained on return');
      for(const width of [320,390,768,1280])for(const large of [false,true]){
        await page.setViewportSize({width,height:844});
        await page.evaluate(large=>document.body.classList.toggle('large-text',large),large);
        for(const group of ['arrest','airbreath','neurometab']){
          if(await page.locator('#critPaths').evaluate(el=>el.hidden))await page.locator('#critChange').click();
          await page.locator(`#critPaths [onclick="selectCriticalGroup('${group}')"]`).click();
          await page.locator('#critChange').click();
          assert.ok(await page.evaluate(()=>{
            const main=document.getElementById('critPaths').getBoundingClientRect(),sub=document.getElementById('critSubpaths').getBoundingClientRect();
            return sub.top>=main.bottom-1;
          }),`${engine} ${width}px: subcategories below main categories`);
          assert.equal(await page.locator('.crit-sticky').evaluate(el=>getComputedStyle(el).position),'static','Expanded picker can scroll on short screens');
          assert.equal(await page.locator('#critical').evaluate(el=>el.scrollWidth>el.clientWidth),false,'No horizontal overflow');
          if(process.env.SCREENSHOT_DIR&&width===390&&!large&&group==='arrest'){
            fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,engine+'-critical-order.png')});
          }
        }
      }
      await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.body.classList.remove('large-text'));await close();
      await page.locator('#newPtTop').click();await enter();await chooser();await close();
      await page.locator('nav [data-pane="peds"]').click();
      const bands=await page.evaluate(()=>PEDS54.map(b=>b.id));
      for(const id of bands){
        const values=await page.evaluate(id=>{
          const b=PEDS54.find(b=>b.id===id),source=JSON.stringify(b),rows=pedServiceMeds(b).filter(m=>m.d==='Atropine');
          const untouched=pedServiceMeds(b).filter(m=>m.d!=='Atropine');
          PS.band=id;PS.manual=true;PS.patch=true;PS.sel={'Atropine|IV — bradycardia, toxins':true};renderPeds();
          return {rows,intact:source===JSON.stringify(b),otherIntact:JSON.stringify(untouched)===JSON.stringify(b.meds.filter(m=>m.d!=='Atropine'))};
        },id);
        assert.equal(values.rows.length,1);assert.equal(values.intact,true);assert.equal(values.otherIntact,true);
        const m=values.rows[0];assert.ok(Math.abs(parseFloat(m.v)*.2-parseFloat(m.t))<1e-9,id+' retained chart volume matches dose at 0.2 mg/mL');
        assert.equal(m.bhp,true);
        const cards=page.locator('#pane-peds .row').filter({has:page.locator('.rname', {hasText:/^Atropine/})});
        assert.equal(await cards.count(),2,'One chart row and one patch row');
        for(const card of await cards.all()){
          const text=await card.innerText();assert.match(text,/0\.2 mg\/mL/);assert.match(text,/BHP auth/i);
          assert.doesNotMatch(text,/0\.[146] mg\/mL|1 mg\/10 mL|conc [134]/);
        }
        if(id==='b30_36'){
          assert.match(await cards.last().innerText(),/Confirm intended dose with BHP/);
          assert.match(await cards.last().innerText(),/MAX/);
        }
      }
      await page.locator('nav [data-pane="tools"]').click();await page.evaluate(()=>openTool('drip'));
      assert.deepEqual(await page.locator('#dset option').evaluateAll(els=>els.map(el=>el.value)),['10','60']);
      await page.locator('#dvol').fill('100');await page.locator('#dmin').fill('10');
      for(const factor of ['10','60']){
        await page.locator('#dset').selectOption(factor);
        assert.match(await page.locator('#toolView').innerText(),new RegExp(factor==='10'?'100 gtt/min':'600 gtt/min'));
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine}: fixed atropine/legacy settings, all 13 Peds bands and patch cautions, neutral Critical entry/reset, category order, selected-path memory, ROSC and 10/60 drip sets.`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
