// Source-audited Emergency Childbirth summary; no dose/formula/calc-row changes.
// TEST_WEBKIT=1 adds WebKit. All source PDFs remain unopened in this local test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const {approvedChildbirthSummary,normalizeChildbirthSummaryFixture}=require('./childbirth-summary-fixture.cjs');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show','6e1bd965aa29ad5d0de275a7c80037bbf4207732:index.html'],{cwd:root,encoding:'utf8'});
const clinical=source=>source.slice(source.indexOf('const CONC ='),source.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const sources=source=>source.slice(source.indexOf('const SRC_LINKS='),source.indexOf('function rowHTML(')).replace(/\r/g,'');
const normalized=normalizeChildbirthSummaryFixture(baseline);
assert.equal(clinical(html),clinical(normalized),'Only the two approved ob summary fields differ from the published clinical source');
assert.equal(sources(html),sources(baseline),'Source URLs, offsets, mappings and reference helpers remain exact');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],baseline.match(/const PEDS54\s*=([^\n]+)/)[1],'Published pediatric chart data unchanged');
assert.equal(normalizeChildbirthSummaryFixture(normalized),normalized,'Fixed fixture is idempotent');
assert.throws(()=>normalizeChildbirthSummaryFixture(baseline.replace("cond:['Oxytocin: after delivery of all fetuses and/or placenta, ≤4 h post-placenta'],","cond:['Unexpected unapproved condition'],")),/Only the fixed, audited cond/,'Fixture cannot allow an unapproved condition change');
const oldObStart=baseline.indexOf("{id:'ob',n:'Emergency Childbirth'");
assert.throws(()=>normalizeChildbirthSummaryFixture(baseline.slice(0,oldObStart)+baseline.slice(oldObStart).replace("contra:['See directive text'],","contra:['Unexpected unapproved contraindication'],")),/Only the fixed, audited contra/,'Fixture cannot allow an unapproved contraindication change');
assert.match(html,/const APP_BUILD='2026\.11\.17\.1'/);
const model=source=>{const context=vm.createContext({module:{exports:{}}});vm.runInContext(clinical(source)+'\nglobalThis.engine={...module.exports,DIR};',context);return context.engine;};
const current=model(html),previous=model(baseline),plain=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(current.DIR.find(d=>d.id==='ob').cond),approvedChildbirthSummary.cond);assert.deepEqual(plain(current.DIR.find(d=>d.id==='ob').contra),approvedChildbirthSummary.contra);
for(const ageYears of [13,14,28,50,51])for(const weightKg of [55,80,null]){
  const input={ageYears,weightKg},pt=current.buildPatient(input);assert.deepEqual(plain(pt),plain(previous.buildPatient(input)));assert.deepEqual(plain(current.drugCalcs(pt)),plain(previous.drugCalcs(pt)),'All calculated rows and age gates stay unchanged');
}
const sourceContext=vm.createContext({});vm.runInContext(baseline.slice(baseline.indexOf('const SRC_LINKS='),baseline.indexOf('function referenceHTML('))+'\nglobalThis.hrefs=[174,175,176,177,178].map(page=>srcHref(\'PCS\',page));',sourceContext);const expectedHrefs=plain(sourceContext.hrefs);
const assets=['field-ui.css','field-shell.js','field-home.js','manifest.webmanifest','icon.svg'];
const files=new Map([['/',html],['/index.html',html],...assets.map(name=>['/'+name,fs.readFileSync(path.join(root,name),'utf8')])]);
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,body=files.get(name);res.writeHead(body?200:404,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});res.end(body||'Not found');});
function readableSummary({selector,large}){
  const failures=[],card=document.querySelector(selector),box=card.getBoundingClientRect(),body=card.querySelector('.dbody'),visible=element=>!!element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden'&&!element.closest('[hidden],[aria-hidden="true"],details:not([open])');
  if(!visible(body))failures.push('Directive body hidden');
  if(document.documentElement.scrollWidth>innerWidth+1||card.scrollWidth>card.clientWidth+1||box.left<-.5||box.right>innerWidth+.5)failures.push('Card horizontal overflow/clipping');
  for(const section of card.querySelectorAll('.dir-conditions,.dir-contra')){
    if(!visible(section))failures.push('Safety section hidden');
    for(const item of section.querySelectorAll('li')){
      if(!visible(item))failures.push('Clinical bullet hidden');if(item.parentElement.tagName!=='UL'||getComputedStyle(item).listStyleType==='none')failures.push('Contraindication not presented as a bullet');
      if(parseFloat(getComputedStyle(item).fontSize)<(large?17:15)-.1)failures.push('Clinical text too small');
      const range=document.createRange();range.selectNodeContents(item);if([...range.getClientRects()].some(r=>r.left<box.left-.5||r.right>box.right+.5))failures.push('Clipped clinical text '+item.textContent);
    }
  }
  return failures;
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const name of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>!!window.FIELD_UI?.browseDirectives);await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');await settle();
      const before=await page.evaluate(()=>JSON.stringify({pt:S.pt,age:S.ageVal,weight:S.wtVal,drugs:drugCalcs(S.pt)}));
      const failures=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        // Check all three entry points once; the shared renderer's phone/text
        // geometry then needs only the already-open Reference summary.
        const views=size.width===390&&!daylight&&!large?['reference','calculator','critical-full']:['reference'];
        for(const view of views){
          let selector;
          if(view==='reference'){
            await page.locator('#fieldNav [data-pane="dir"]').click();await page.locator('#dirSearch').fill('Emergency Childbirth');selector='#dirList .dcard[data-id="ob"]';
          }else if(view==='calculator'){
            await page.evaluate(()=>FIELD_UI.browseDirectives());await settle();await page.locator('#homeDirectory [data-home-directive="ob"]').click();selector='#homeDirectiveDetail .dcard[data-id="ob"]';
          }else{
            await page.locator('#fieldNav [data-pane="critical"]').click();await page.evaluate(()=>selectCriticalPath('ob'));await settle();await page.getByRole('button',{name:'Full directive',exact:true}).click();assert.equal(await page.evaluate(()=>activePane),'dir');selector='#dirList .dcard[data-id="ob"]';
          }
          await settle();const card=page.locator(selector);
          assert.deepEqual(await card.locator('.dir-conditions li').allTextContents(),approvedChildbirthSummary.cond,view+': corrected condition is visible');assert.deepEqual(await card.locator('.dir-contra li').allTextContents(),approvedChildbirthSummary.contra,view+': five audited contraindications in source order');assert.doesNotMatch(await card.locator('.dir-contra').innerText(),/See directive text/i);assert.doesNotMatch(await card.locator('.dir-conditions').textContent(),/≤4/);
          for(const item of await card.locator('.dir-contra li').all())assert.equal(await item.isVisible(),true,view+': every contraindication immediately visible');
          assert.deepEqual(await card.locator('.dir-source a').evaluateAll(elements=>elements.map(element=>element.href)),expectedHrefs,view+': original source-page targets preserved');assert.match(await card.locator('.dir-source a[data-page="175"]').getAttribute('href'),/#page=187$/,view+': printed175 maps to PDF187');
          const issues=await page.evaluate(readableSummary,{selector,large});if(issues.length)failures.push({size,daylight,large,view,issues});
        }
      }
      assert.deepEqual(failures,[],name+': all five bullets remain visible/readable in every shared summary view');assert.equal(await page.evaluate(()=>JSON.stringify({pt:S.pt,age:S.ageVal,weight:S.wtVal,drugs:drugCalcs(S.pt)})),before,'Reference browsing does not change patient or calculated treatment');assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: five audited Childbirth contraindications and corrected <4h condition in Reference, Calculator and Critical full directive; original links/calculations and320–844px normal/Large day/night readability.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
