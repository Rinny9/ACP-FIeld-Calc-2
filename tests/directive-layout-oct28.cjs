// Directives presentation regression. No clinical data or source-page changes.
// TEST_WEBKIT=1 adds WebKit; CHROME_PATH selects an installed Chromium browser.
// SCREENSHOT_DIR optionally saves representative phone/landscape views.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const before=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show',`${process.env.COMPARE_REF||'HEAD'}:index.html`],{cwd:root,encoding:'utf8'});
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const sources=s=>s.slice(s.indexOf('const SRC_LINKS='),s.indexOf('function rowHTML(')).replace(/\r/g,'');
assert.equal(clinical(html),clinical(before),'All directive strings, clinical formulas, doses and conditions remain unchanged');
assert.equal(sources(html),sources(before),'Source URLs, offsets, mappings and reference helpers remain unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],before.match(/const PEDS54\s*=([^\n]+)/)[1],'Printed pediatric chart transcription remains unchanged');
const shots=process.env.SCREENSHOT_DIR;if(shots)fs.mkdirSync(shots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});

function inspectContents(){
  const failures=[],norm=value=>String(value??'').replace(/\s+/g,' ').trim();
  const referenced=value=>{const box=document.createElement('div');box.innerHTML=referenceHTML(value);return norm(box.textContent);};
  const plain=(card,selector)=>norm(card.querySelector(selector)?.textContent);
  const visible=el=>!!el?.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('details:not([open]),[hidden],[aria-hidden="true"]');
  for(const d of DIR){
    const card=document.querySelector(`.dcard[data-id="${d.id}"]`),body=card?.querySelector('.dbody');
    const fail=message=>failures.push(d.id+': '+message);
    if(!card||!body){fail('missing card/body');continue;}
    if(plain(card,'.dhead h3')!==norm(d.n))fail('directive name changed');
    if(plain(card,'.dir-indication p')!==norm(d.ind))fail('indication changed');
    for(const [key,selector]of [['cond','.dir-conditions li'],['contra','.dir-contra li'],['tx','.dir-treatment-list>li']]){
      const actual=[...card.querySelectorAll(selector)].map(el=>{
        const fragments=key==='tx'?[...el.querySelectorAll('.dir-tx-source[data-tx-source]')]:[];
        return norm(fragments.length?fragments.map(fragment=>fragment.textContent).join(''):el.textContent);
      }),expected=(d[key]||[]).map(referenced);
      if(JSON.stringify(actual)!==JSON.stringify(expected))fail(key+' text/order changed: '+JSON.stringify({actual,expected}));
    }
    if(d.patch&&plain(card,'.patchbox').replace(/^☎\s*/,'')!==norm(d.patch))fail('patch requirement changed');
    if(!d.patch&&card.querySelector('.patchbox'))fail('unexpected patch requirement');
    if(d.cc&&plain(card,'.dir-notes p')!==referenced(d.cc))fail('Companion caution changed');
    for(const el of card.querySelectorAll('.dir-indication,.dir-conditions,.dir-contra,.dir-treatment,.patchbox,.dir-notes,.dir-review .warnbanner'))if(!visible(el))fail('essential content hidden: '+el.className);
    if(body.querySelector('details,button[aria-expanded]'))fail('essential content requires a second disclosure');
    const warning=card.querySelector('.dir-review .warnbanner'),review=REFERENCE_REVIEW[d.id];
    if(review){
      if(!warning||norm(warning.textContent)!==referenced(review)||!visible(warning))fail('existing source-review warning missing/changed/hidden');
      const notes=card.querySelector('.dir-notes p');
      if(warning&&notes&&!(warning.compareDocumentPosition(notes)&Node.DOCUMENT_POSITION_FOLLOWING))fail('source-review warning must precede its affected summary');
    }else if(warning)fail('unexpected source-review warning');
    const first=body.firstElementChild,source=card.querySelector('.dir-source');
    if(!first?.matches('.dir-indication'))fail('source/navigation content displaces the indication');
    if(!source||source!==body.lastElementChild)fail('source footer not last');
    const expectedLinks=document.createElement('div');expectedLinks.innerHTML=srcLink('PCS '+d.pg);
    const actualHrefs=[...card.querySelectorAll('.dir-source a')].map(a=>a.href),expectedHrefs=[...expectedLinks.querySelectorAll('a')].map(a=>a.href);
    if(JSON.stringify(actualHrefs)!==JSON.stringify(expectedHrefs))fail('directive source page targets changed');
    for(const a of body.querySelectorAll('a')){
      const key=a.dataset.source,page=Number(a.dataset.page);
      if(!key||!Number.isInteger(page)||a.href!==srcHref(key,page))fail('invalid source link: '+a.outerHTML);
      if(a.target!=='_blank'||!a.rel.includes('noopener'))fail('source link browsing safety changed');
    }
  }
  return failures;
}

function inspectLayout(large){
  const failures=[],pane=document.getElementById('pane-dir');
  if(pane.scrollWidth>pane.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1)failures.push('page horizontal overflow');
  for(const card of pane.querySelectorAll('.dcard')){
    const label=card.dataset.id,box=card.getBoundingClientRect(),head=card.querySelector('.dhead').getBoundingClientRect();
    if(head.height<44||head.width<44)failures.push(label+': undersized disclosure');
    if(box.left<-.5||box.right>innerWidth+.5)failures.push(label+': clipped card');
    for(const el of card.querySelectorAll('.dhead h3,.dhead-meta,.dsec h4,.dsec p,.dsec li,.patchbox,.dir-review .warnbanner,.dir-source a')){
      if(!el.getClientRects().length)continue;
      const range=document.createRange();range.selectNodeContents(el);
      if([...range.getClientRects()].some(r=>r.left<box.left-.5||r.right>box.right+.5))failures.push(label+': clipped text '+el.textContent.slice(0,70));
    }
    const conditions=card.querySelector('.dir-conditions').getBoundingClientRect(),contra=card.querySelector('.dir-contra').getBoundingClientRect();
    if(Math.min(conditions.right,contra.right)-Math.max(conditions.left,contra.left)>1&&Math.min(conditions.bottom,contra.bottom)-Math.max(conditions.top,contra.top)>1)failures.push(label+': overlapping safety blocks');
    if((large||innerWidth<680)&&contra.top<conditions.bottom-.5)failures.push(label+': phone/Large safety blocks not stacked');
    const treatment=[...card.querySelectorAll('.dir-treatment-list>li')];
    for(let i=1;i<treatment.length;i++)if(treatment[i].getBoundingClientRect().top<treatment[i-1].getBoundingClientRect().bottom+3)failures.push(label+': treatment options not visibly separated');
    for(const el of card.querySelectorAll('.dir-source a'))if(el.getBoundingClientRect().height<44)failures.push(label+': source-page touch target too short');
    for(const el of card.querySelectorAll('.dsec p,.dsec li'))if(parseFloat(getComputedStyle(el).fontSize)<(large?17:15)-.1)failures.push(label+': small clinical text');
  }
  return [...new Set(failures)];
}

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      await page.locator('nav [data-pane="dir"]').click();await settle();
      const ids=await page.evaluate(()=>DIR.map(d=>d.id));assert.ok(ids.length>20);
      assert.equal(await page.locator('#dirList .dcard').count(),ids.length);
      // Every directive opens/closes with native keyboard controls; one action
      // reveals its full clinical contents, not another nested accordion.
      for(const id of ids){
        const card=page.locator(`.dcard[data-id="${id}"]`),button=card.locator('.dhead');
        assert.equal(await button.getAttribute('type'),'button');assert.equal(await button.getAttribute('aria-expanded'),'false');
        assert.equal(await button.getAttribute('aria-controls'),'directive-'+id);
        await button.focus();await page.keyboard.press('Enter');
        assert.equal(await button.getAttribute('aria-expanded'),'true');assert.equal(await card.locator('.dbody').isVisible(),true);
        assert.equal(await button.evaluate(el=>el===document.activeElement),true,'Opening keeps keyboard focus');
        await page.keyboard.press('Space');assert.equal(await button.getAttribute('aria-expanded'),'false');assert.equal(await card.locator('.dbody').isVisible(),false);
      }
      await page.evaluate(()=>{for(const d of DIR)directiveOpen[d.id]=true;renderDirectives('');});
      assert.deepEqual(await page.evaluate(inspectContents),[],engine+': all original clinical content visible and unchanged');
      // Searching reveals matches without overwriting the remembered browse state.
      await page.evaluate(()=>{for(const d of DIR)directiveOpen[d.id]=d.id==='oti'||d.id==='analgesia';renderDirectives('');});
      const browseState=await page.evaluate(()=>({...directiveOpen}));
      for(const query of ['ketamine','steroid','BHP','zz-no-directive-zz']){
        await page.locator('#dirSearch').fill(query);
        const expected=await page.evaluate(query=>DIR.filter(d=>[d.n,d.ind,...(d.cond||[]),...(d.contra||[]),...(d.tx||[]),d.cc||'',d.patch||''].join(' ').toLowerCase().includes(query.toLowerCase())).map(d=>d.id).sort(),query);
        assert.deepEqual(await page.locator('#dirList .dcard').evaluateAll(es=>es.map(e=>e.dataset.id).sort()),expected);
        assert.equal(await page.locator('#dirList .dcard:not(.open)').count(),0,'Search opens matching cards immediately');
        assert.deepEqual(await page.evaluate(()=>({...directiveOpen})),browseState,'Search does not mutate browse state');
      }
      await page.locator('#dirSearch').fill('');
      assert.deepEqual(await page.locator('#dirList .dcard.open').evaluateAll(es=>es.map(e=>e.dataset.id).sort()),['analgesia','oti']);
      assert.deepEqual(await page.evaluate(()=>({...directiveOpen})),browseState);
      // No content disappears, overlaps or clips at phone/landscape widths,
      // including all directives in both color themes and clinical text sizes.
      await page.evaluate(()=>{for(const d of DIR)directiveOpen[d.id]=true;renderDirectives('');});
      const layoutFailures=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const large of [false,true])for(const daylight of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({large,daylight})=>{document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',daylight);},{large,daylight});await settle();
        const failures=await page.evaluate(inspectLayout,large);if(failures.length)layoutFailures.push({width:size.width,large,daylight,failures});
        assert.deepEqual(await page.evaluate(inspectContents),[],`${engine} ${size.width}px: clinical content remains visible`);
      }
      assert.deepEqual(layoutFailures,[],engine+': all phone/landscape layouts are readable');
      if(shots)for(const display of [{width:390,height:844,large:false,daylight:false},{width:320,height:568,large:true,daylight:true}]){
        await page.setViewportSize({width:display.width,height:display.height});
        await page.evaluate(({large,daylight})=>{document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',daylight);},display);
        for(const id of ['brady','analgesia']){
          await page.evaluate(id=>{for(const d of DIR)directiveOpen[d.id]=d.id===id;renderDirectives('');},id);
          for(const region of ['top','treatment']){
            await page.evaluate(({id,region})=>{
              const card=document.querySelector(`.dcard[data-id="${id}"]`),target=region==='top'?card:card.querySelector('.dir-treatment');
              const offset=document.getElementById('ptbar').getBoundingClientRect().height+document.querySelector('#pane-dir .search').getBoundingClientRect().height+12;
              window.scrollTo(0,Math.max(0,scrollY+target.getBoundingClientRect().top-offset));
            },{id,region});await settle();
            await page.screenshot({path:path.join(shots,`${engine}-${id}-${display.width}-${display.large?'large':'normal'}-${display.daylight?'day':'dark'}-${region}.png`)});
          }
        }
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine}: ${ids.length} directives preserve every clinical string and source target; visible conditions/contraindications/patch/cautions, keyboard disclosure, search state, 44px controls and 320–844px normal/Large dark/day layout.`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
