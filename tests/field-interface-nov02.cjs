// Full interface migration: existing clinical engine/data, new field shell.
// TEST_WEBKIT=1 adds WebKit; CHROME_PATH selects an installed Chrome browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show',`${process.env.COMPARE_REF||'ca05ef4'}:index.html`],{cwd:root,encoding:'utf8'});
const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
const sources=s=>s.slice(s.indexOf('const SRC_LINKS='),s.indexOf('function rowHTML(')).replace(/\r/g,'');
assert.equal(clinical(html),clinical(baseline),'Clinical formulas, concentrations and all 34 directive strings unchanged');
assert.equal(sources(html),sources(baseline),'Existing source URLs, page mappings and reference helpers unchanged');
assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],baseline.match(/const PEDS54\s*=([^\n]+)/)[1],'Published pediatric chart data unchanged');
const build='2026.11.02.1',assets=['field-ui.css','field-shell.js','field-home.js'];
for(const name of assets)assert.ok(html.includes(name+'?v='+build),'Versioned asset linked: '+name);
const files=new Map([['/index.html',html],['/',html],['/baseline.html',baseline],...assets.map(name=>['/'+name,fs.readFileSync(path.join(root,name),'utf8')]),...['manifest.webmanifest','icon.svg'].map(name=>['/'+name,fs.readFileSync(path.join(root,name),'utf8')])]);
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,body=files.get(pathname);res.writeHead(body?200:404,{'Content-Type':pathname.endsWith('.css')?'text/css; charset=utf-8':pathname.endsWith('.js')?'text/javascript; charset=utf-8':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8'});res.end(body||'Not found');});
const patients=[{ageYears:0,weightKg:.8},{ageYears:.5,weightKg:8.5},{ageYears:2,weightKg:14},{ageYears:5,weightKg:20},{ageYears:10,weightKg:30},{ageYears:17,weightKg:50},{ageYears:28,weightKg:80},{ageYears:65,weightKg:90},{ageYears:null,weightKg:20},{ageYears:40,weightKg:null}];
const snapshot=page=>page.evaluate(inputs=>({DIR,PEDS54,CONC,SRC_LINKS,patients:inputs.map(input=>{const pt=buildPatient(input);return{pt,airway:airway(pt),drugs:drugCalcs(pt),critical:Object.fromEntries(CRIT_PATHS.map(path=>[path.id,critRowsForPath(pt,path.id)])),dopamine:pt.weightKg==null?null:dopamineLines(pt.weightKg)};})}),patients);
const renderedRows=page=>page.evaluate(inputs=>{
  const selectors=['.rname','.rdirective','.rneed','.rmain','.rlines','.rseq','.rrep','.rcond','.rcontra','.rsub','.card-details'];
  const norm=value=>String(value??'').replace(/[✓✗]/g,'').replace(/\s+/g,' ').trim();
  return inputs.flatMap(input=>{
    const pt=buildPatient(input),rows=[...Object.values(drugCalcs(pt)).flat(),...airway(pt).map(row=>({name:row.k,dose:row.v,ml:null,sub:row.sub,rep:row.rep,src:row.src,tone:row.tone,needW:row.needW}))];
    return rows.map((row,index)=>{
      const element=document.createElement('div');element.innerHTML=rowHTML(row);element.querySelectorAll('.field-stock,.field-dose-label').forEach(el=>el.remove());
      return{input,index,name:row.name,components:Object.fromEntries(selectors.map(selector=>[selector,[...element.querySelectorAll(selector)].map(el=>norm(el.textContent))])),sources:[...element.querySelectorAll('a[href]')].map(el=>el.href)};
    });
  });
},patients);

function inspectDoseLayout(selector){
  const root=document.querySelector(selector),failures=[];if(!root)return['missing region '+selector];
  if(root.scrollWidth>root.clientWidth+1)failures.push('horizontal region overflow');
  for(const row of root.querySelectorAll('.row')){
    if(!row.getClientRects().length)continue;const box=row.getBoundingClientRect(),label=row.querySelector('.rname')?.textContent||'';
    for(const cell of row.querySelectorAll('.rlD,.rlM,.rdose,.rml,.rsv>.num')){
      if(!cell.getClientRects().length)continue;
      const range=document.createRange();range.selectNodeContents(cell);
      if([...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1))failures.push(label+': clipped dosage/administration text');
    }
    for(const value of row.querySelectorAll('.dose-amount')){
      if(!value.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(value);
      if(new Set([...range.getClientRects()].filter(r=>r.width>.1).map(r=>Math.round(r.top))).size>1)failures.push(label+': vertically split measurement '+value.textContent);
    }
    for(const line of row.querySelectorAll('.rline')){
      const cells=[...line.children].filter(el=>el.textContent.trim()&&el.getClientRects().length).map(el=>el.getBoundingClientRect());
      for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
        const a=cells[i],b=cells[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)failures.push(label+': route/dose/draw overlap');
      }
    }
  }
  return [...new Set(failures)];
}
function inspectShell(){
  const issues=[],nav=document.getElementById('fieldNav'),rect=nav.getBoundingClientRect();
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('horizontal page overflow');
  if(rect.bottom>innerHeight+1||rect.top<0)issues.push('persistent navigation offscreen');
  for(const button of document.querySelectorAll('#fieldNav button,#fieldEditPatient,#critClose,#critChange,#homeDirectory [data-home-directive],#referenceTabs button,#pedsReferenceTabs button')){
    if(!button.getClientRects().length)continue;const r=button.getBoundingClientRect();if(r.height<43.5||r.width<43.5)issues.push('small touch target '+(button.id||button.textContent.trim().slice(0,55)));
  }
  return issues;
}
function inspectPedsLayout(){
  const pane=document.getElementById('pane-peds'),failures=[];
  if(pane.scrollWidth>pane.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1)failures.push('Peds horizontal overflow');
  for(const row of pane.querySelectorAll('.row.pdc,.pedeq .cell')){
    const box=row.getBoundingClientRect(),name=row.querySelector('.rname,.cl')?.textContent||'';
    for(const el of row.querySelectorAll('.rname,.rdose,.rml,.rsub,.pedflag,.rsrc,.cvv')){
      if(!el.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(el);
      if([...range.getClientRects()].some(r=>r.left<box.left-.5||r.right>box.right+.5))failures.push(name+': clipped '+el.className+' '+el.textContent.slice(0,55));
    }
    for(const el of row.querySelectorAll('.rdose,.rml,.cvv')){
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
      while(node=walker.nextNode())for(const match of node.textContent.matchAll(/\d[\d.,]*\s*(?:mcg|mg|mL|g|J|Fr)\b/g)){
        const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
        if(new Set([...range.getClientRects()].filter(r=>r.width>.1).map(r=>Math.round(r.top))).size>1)failures.push(name+': split quantity '+match[0]);
      }
    }
  }
  return [...new Set(failures)];
}
function inspectToolsLayout(){
  const pane=document.getElementById('pane-tools'),failures=[];
  if(pane.scrollWidth>pane.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1)failures.push('Tools horizontal overflow');
  for(const panel of pane.querySelectorAll('.toolpanel')){
    const box=panel.getBoundingClientRect();
    for(const el of panel.querySelectorAll('h3,.tsrc,.p,.kv,.result .big,.result .lbl,.optgrid button,.field label')){
      if(!el.getClientRects().length)continue;const range=document.createRange();range.selectNodeContents(el);
      if([...range.getClientRects()].some(r=>r.left<box.left-.5||r.right>box.right+.5))failures.push('Clipped tool text: '+el.textContent.slice(0,65));
    }
  }
  return [...new Set(failures)];
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  for(const name of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[],focusFailures=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(10000);
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      const nav=async pane=>{await click(`#fieldNav [data-pane="${pane}"]`);assert.equal(await page.evaluate(()=>activePane),pane);};
      const patient=async(age,weight)=>{if(!await page.locator('#patientDialog').evaluate(el=>el.open)){await click('#fieldEditPatient');if(!await page.locator('#ageIn').isVisible()){focusFailures.push('First Edit patient click was lost in '+await page.evaluate(()=>activePane));await click('#fieldEditPatient');}}assert.equal(await page.locator('#ageIn').isVisible(),true,JSON.stringify(await page.evaluate(()=>({modal:document.getElementById('patientDialog').open,collapsed:S.entryCollapsed,entryClass:document.getElementById('patientEntry').className,activePane,active:document.activeElement.id}))));await page.locator('#ageIn').fill(String(age));await page.locator('#wtIn').fill(String(weight));await click('#patientContinue');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false);};
      await page.goto(url);await page.waitForFunction(()=>typeof FIELD_UI!=='undefined'&&typeof FIELD_UI.goHome==='function'&&document.querySelectorAll('#homeDirectory [data-home-directive]').length===DIR.length);
      assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false,'Patient sheet is not forced open on launch');
      assert.deepEqual(await page.locator('#fieldNav button[data-pane]').evaluateAll(es=>es.map(e=>e.dataset.pane)),['calc','critical','dir','tools']);
      const old=await context.newPage();await old.goto(url+'/baseline.html');assert.deepEqual(await snapshot(page),await snapshot(old),'All clinical engine results and references match the published baseline');
      const currentRows=await renderedRows(page),oldRows=await renderedRows(old);assert.equal(currentRows.length,oldRows.length);
      for(let i=0;i<oldRows.length;i++)assert.deepEqual(currentRows[i],oldRows[i],`Clinical row DOM preserved: patient${JSON.stringify(oldRows[i].input)} ${oldRows[i].name} #${oldRows[i].index}`);
      await old.close();
      const expected=await page.evaluate(()=>[...DIR].sort((a,b)=>a.n.localeCompare(b.n)).map(d=>({id:d.id,name:d.n})));
      assert.equal(expected.length,34);assert.deepEqual(await page.locator('#homeDirectory [data-home-directive]').evaluateAll(es=>es.map(e=>e.dataset.homeDirective)),expected.map(d=>d.id),'Home is strictly A–Z across core and auxiliary directives');
      await click('#fieldEditPatient');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.matches(':modal')),true);
      if(!await page.locator('#patientContinue').isDisabled())await click('#patientContinue');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),true,'Missing patient cannot close via Continue');
      await page.keyboard.press('Escape');await settle();assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false);if(!await page.locator('#fieldEditPatient').evaluate(el=>el===document.activeElement))focusFailures.push('Escape did not restore patient button focus');
      await patient(28,80);assert.equal(await page.evaluate(()=>critScenario),null,'Patient entry never assigns a Critical condition');
      await page.locator('#homeSearch').fill('Symptomatic Bradycardia');assert.equal(await page.locator('#homeDirectory [data-home-directive="brady"]').isVisible(),true);await page.locator('#homeSearch').fill('');
      // Every directory item opens its own original reference, including skills
      // without medication calculations. Source page mappings remain unchanged.
      for(const directive of expected){
        await page.evaluate(()=>FIELD_UI.goHome());await click(`#homeDirectory [data-home-directive="${directive.id}"]`);
        assert.equal(await page.locator(`#pane-calc .dcard[data-id="${directive.id}"]`).count(),1,directive.name+' retains the complete source directive');
        const links=await page.locator(`#pane-calc .dcard[data-id="${directive.id}"] .dir-source a`).evaluateAll(es=>es.map(e=>e.href));assert.ok(links.length,directive.name+' has its source pages');
      }
      await page.evaluate(()=>FIELD_UI.goHome());await click('#homeDirectory [data-home-directive="seizure"]');
      const seizure=page.locator('#pane-calc .row').filter({hasText:'Midazolam — active seizure'});assert.equal(await seizure.count(),1);assert.match(await seizure.innerText(),/5 mg/);assert.match(await seizure.innerText(),/10 mg/);assert.match(await seizure.innerText(),/Draw volume/i);
      await nav('critical');assert.equal(await page.evaluate(()=>critScenario),null);assert.notEqual(await page.locator('#critical').getAttribute('aria-modal'),'true');assert.notEqual(await page.locator('#critical').getAttribute('role'),'dialog');
      await click('#critPaths [onclick="selectCriticalGroup(\'rhythm\')"]');assert.equal(await page.evaluate(()=>critScenario),'brady');assert.match(await page.locator('#critContext').innerText(),/Cardiac/);
      const atropine=page.locator('#crit-treatment .row').filter({hasText:'Atropine — symptomatic bradycardia'});assert.match(await atropine.innerText(),/1 mg IV/);assert.match(await atropine.innerText(),/5 mL/);
      assert.equal(await page.locator('#fieldNav').evaluate(el=>!!el.closest('[inert]')),false,'Critical does not inert the persistent navigation');
      const last=page.locator('#critical button,#critical a[href],#critical summary');await last.evaluateAll(es=>es.filter(el=>el.getClientRects().length&&!el.disabled).at(-1).focus());await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#critical')),false,'Critical is a region, not a keyboard focus trap');
      await nav('tools');await page.evaluate(()=>openTool('drip'));await page.locator('#dvol').fill('100');await page.locator('#dmin').fill('10');assert.match(await page.locator('#toolView').innerText(),/100 gtt\/min/);assert.deepEqual(await page.locator('#dset option').evaluateAll(es=>es.map(e=>e.value)),['10','60']);
      await nav('critical');assert.equal(await page.evaluate(()=>critScenario),'brady','Tab navigation preserves selected Critical condition');await nav('tools');assert.equal(await page.locator('#dvol').inputValue(),'100','Tool entry survives navigation');
      await page.evaluate(()=>closeTool());await patient(2,14);await nav('calc');await click('#homeDirectory [data-home-directive="croup"]');
      const dex=page.locator('#pane-calc .row').filter({hasText:'Dexamethasone PO — croup'});assert.equal(await dex.count(),1);assert.match(await dex.innerText(),/7 mg/);assert.match(await dex.innerText(),/0.7 mL/);
      await nav('critical');await page.evaluate(()=>selectCriticalPath('tachy'));await settle();assert.ok(await page.locator('#crit-treatment .row').count()>0);assert.equal(await page.locator('#crit-treatment .row .field-stock').count(),0,'PDC pediatric Tachy rows must not present chart draw amounts as service-stock concentration');
      await page.evaluate(()=>FIELD_UI.openDirective('tachy'));await settle();assert.ok(await page.locator('#homeDirectiveDetail .home-dose-list .row').count()>0);assert.equal(await page.locator('#homeDirectiveDetail .home-dose-list .row .field-stock').count(),0,'Home PDC patch references also omit the service-stock strip');
      await nav('dir');assert.equal(await page.locator('#referenceTabs').isVisible(),true);await click('#referenceTabs [data-reference-pane="peds"]');assert.equal(await page.evaluate(()=>activePane),'peds');assert.equal(await page.locator('#pedsReferenceTabs').isVisible(),true);assert.ok(await page.locator('#pedBody .row').count()>0);assert.match(await page.locator('#pedBody').innerText(),/PDC reference band/i);await click('#pedsReferenceTabs [data-reference-pane="dir"]');assert.equal(await page.evaluate(()=>activePane),'dir');
      await page.locator('#dirSearch').fill('midazolam');assert.ok(await page.locator('#dirList .dcard').count()>0);assert.equal(await page.locator('#dirList .dcard:not(.open)').count(),0);await page.locator('#dirSearch').fill('');
      await click('#settingsTop');const stock=page.locator('#concList .settingsrow').filter({hasText:'atropine'});assert.equal(await stock.locator('input').count(),0);assert.match(await stock.innerText(),/0\.2 mg\/mL/);
      const originalStock=await page.evaluate(()=>CONC.midazolam.v),editable=page.locator('#concList .settingsrow').filter({hasText:'midazolam'}).locator('input');assert.equal(await editable.count(),1);
      await editable.fill(String(originalStock*2));await editable.dispatchEvent('change');assert.equal(await page.evaluate(()=>CONC.midazolam.v),originalStock*2);
      await patient(28,80);await page.evaluate(()=>FIELD_UI.openDirective('seizure'));await settle();assert.match(await page.locator('#homeDirectiveDetail .home-dose-list .row .rlM').first().innerText(),/0\.5 mL/,'Editable stock immediately refreshes Home draw volume');
      await click('#settingsTop');await editable.fill(String(originalStock));await editable.dispatchEvent('change');await nav('calc');await click('#homeDirectory [data-home-directive="seizure"]');assert.equal(await page.evaluate(()=>CONC.midazolam.v),originalStock);assert.match(await page.locator('#homeDirectiveDetail .home-dose-list .row .rlM').first().innerText(),/1 mL/,'Restoring stock restores the original Home draw amount');
      await patient(2,14);
      const geometry=[];
      for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize(size);await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        await nav('calc');await click('#homeDirectory [data-home-directive="seizure"]');let issues=await page.evaluate(inspectDoseLayout,'#pane-calc');if(issues.length)geometry.push({size,daylight,large,view:'home-detail',issues});
        await nav('critical');await page.evaluate(()=>selectCriticalPath('seizure'));await settle();issues=await page.evaluate(inspectDoseLayout,'#critical');if(issues.length)geometry.push({size,daylight,large,view:'critical',issues});
        issues=await page.evaluate(inspectShell);if(issues.length)geometry.push({size,daylight,large,view:'shell',issues});
        await click('#critical .crit-edit');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.matches(':modal')),true);const modal=await page.locator('#patientDialog').evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,rect:el.getBoundingClientRect().toJSON(),small:[...el.querySelectorAll('button,input,select')].filter(b=>b.getClientRects().length).filter(b=>{const r=b.getBoundingClientRect();return r.height<43.5||r.width<43.5;}).map(b=>b.id||b.textContent.trim())}));if(modal.overflow||modal.rect.left<0||modal.rect.right>size.width+1)geometry.push({size,daylight,large,view:'patient',issues:['Patient sheet clipped']});if(modal.small.length)geometry.push({size,daylight,large,view:'patient',issues:modal.small.map(id=>'Small patient control '+id)});await page.keyboard.press('Escape');
      }
      assert.deepEqual(geometry,[],name+': field shell and doses readable in every display size');
      const highAcuity=[];
      for(const data of [{age:28,weight:80},{age:2,weight:14}]){
        await nav('calc');await patient(data.age,data.weight);
        for(const width of [320,430])for(const daylight of [false,true])for(const large of [false,true]){
          await page.setViewportSize({width,height:844});await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
          await nav('critical');
          for(const id of await page.evaluate(()=>CRIT_PATHS.map(path=>path.id))){
            await page.evaluate(id=>selectCriticalPath(id),id);await settle();const issues=await page.evaluate(inspectDoseLayout,'#critical');if(issues.length)highAcuity.push({patient:data,width,daylight,large,id,issues});
          }
          for(const id of ['rosc','brady','psed']){
            await page.evaluate(id=>FIELD_UI.openDirective(id),id);await settle();const issues=await page.evaluate(inspectDoseLayout,'#homeDirectiveDetail');if(issues.length)highAcuity.push({patient:data,width,daylight,large,home:id,issues});
          }
          await page.evaluate(()=>{FIELD_UI.showAllCalculations();for(const sec of document.querySelectorAll('#results .sec'))calcOpenState()[sec.dataset.sec]=true;renderResults();});await settle();
          const all=await page.evaluate(inspectDoseLayout,'#results');if(all.length)highAcuity.push({patient:data,width,daylight,large,home:'all-calculations',issues:all});
        }
      }
      assert.deepEqual(highAcuity,[],name+': all Critical paths and long infusion/sedation/All-calculation cards stay readable');
      const supporting=[];await nav('dir');await click('#referenceTabs [data-reference-pane="peds"]');
      const bands=await page.evaluate(()=>PEDS54.map(b=>({id:b.id,pg:b.pg,count:pedServiceMeds(b).length})));
      for(const width of [320,430])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize({width,height:844});await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        for(const band of bands){
          await page.evaluate(id=>{PS.manual=true;PS.band=id;PS.query='';PS.patch=false;PS.pickerOpen=false;renderPeds();document.querySelector('#pedBody .ped-equipment').open=true;},band.id);await settle();
          assert.equal(await page.locator('#pedBody .row.pdc').count(),band.count,'Every service chart row remains available for '+band.id);
          const issues=await page.evaluate(inspectPedsLayout);if(issues.length)supporting.push({width,daylight,large,band:band.id,issues});
          const links=await page.locator('#pedBody a[href*="Pediatric_Dosing_Charts"]').evaluateAll(es=>es.map(a=>({href:a.href,printed:Number(a.dataset.page||a.textContent.match(/\bp\.?\s*(\d+)/i)?.[1])})));
          assert.ok(links.some(a=>new URL(a.href).hash==='#page='+(band.pg-55)),'Chart source opens its correct PDF page');
          for(const link of links)assert.equal(new URL(link.href).hash,'#page='+(link.printed-55),'Every PDC link retains its printed-page mapping');
        }
      }
      await nav('tools');const toolIds=await page.evaluate(()=>[...new Set([...TOOLS.map(tool=>tool.id),'shock','cows'])]);
      for(const width of [320,430])for(const daylight of [false,true])for(const large of [false,true]){
        await page.setViewportSize({width,height:844});await page.evaluate(({daylight,large})=>{document.body.classList.toggle('daylight',daylight);document.body.classList.toggle('large-text',large);},{daylight,large});
        for(const id of toolIds){
          await page.evaluate(id=>openTool(id),id);await settle();assert.ok(await page.locator('#toolView .toolpanel h3').count()>0,id+' tool contents remain available');
          const issues=await page.evaluate(inspectToolsLayout);if(issues.length)supporting.push({width,daylight,large,tool:id,issues});
          if(id==='gcs'){await page.locator('#gcsRows button').first().click();await click('#toolReset');assert.equal(await page.evaluate(()=>gcsSel.every(v=>v==null)),true);}
          if(id==='apgar'){await page.locator('#apRows button').first().click();await click('#toolReset');assert.equal(await page.evaluate(()=>apSel.every(v=>v==null)&&apElapsedMs===0),true);}
          if(id==='tbsa'){await page.locator('#tbsaRows button').first().click();await click('#toolReset');assert.equal(await page.evaluate(()=>!Object.values(tbsaOn).some(Boolean)&&Number(tbsaExtra)===0),true);}
          if(id==='drip'){await page.locator('#dvol').fill('100');await page.locator('#dmin').fill('10');await click('#toolReset');assert.equal(await page.locator('#dvol').inputValue(),'');assert.equal(await page.locator('#dmin').inputValue(),'');}
          if(id==='shock'){await page.locator('#siHR').fill('100');await page.locator('#siBP').fill('90');await click('#toolReset');assert.equal(await page.locator('#siHR').inputValue(),'');assert.equal(await page.locator('#siBP').inputValue(),'');}
          await page.evaluate(()=>closeTool());
        }
      }
      assert.deepEqual(supporting,[],name+': every Peds band and tool readable in both phone sizes/themes/text settings');
      await nav('tools');await page.evaluate(()=>openTool('gcs'));await page.locator('#gcsRows button').first().click();await click('#fieldEditPatient');await click('#newPtTop');await settle();
      assert.equal(await page.evaluate(()=>S.ageVal),null);assert.equal(await page.evaluate(()=>S.wtVal),null);assert.equal(await page.evaluate(()=>critScenario),null);assert.equal(await page.evaluate(()=>hasToolInputs()),false);assert.equal(await page.evaluate(()=>PS.query),'');
      assert.deepEqual(await page.evaluate(()=>PS.sel),{});assert.deepEqual(await page.evaluate(()=>roscChecklistState),{});assert.equal(await page.evaluate(()=>S.query),'');assert.equal(await page.evaluate(()=>S.tool),null);
      assert.equal(await page.evaluate(()=>FIELD_UI.directoryState.mode),'directory');assert.equal(await page.evaluate(()=>FIELD_UI.directoryState.selectedId),null);assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false);
      assert.equal(await page.evaluate(()=>document.body.classList.contains('large-text')),true,'New patient preserves accessibility settings');assert.equal(await page.evaluate(()=>document.body.classList.contains('daylight')),true);
      const exactKey='Midazolam — seizure|IV/IO';
      const chooseExact=async(mode='age')=>{
        await nav('dir');await click('#referenceTabs [data-reference-pane="peds"]');
        await page.evaluate(({key,mode})=>{S.mode=mode;if(mode==='wt')document.getElementById('ageRow').classList.add('hide');PS.manual=true;PS.band=PEDS54.find(b=>b.wMin===12).id;renderPeds();useExactCalc(key);},{key:exactKey,mode});await settle();
        assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),true,'Peds Exact handoff opens the patient sheet when entry is missing/invalid');assert.deepEqual(await page.evaluate(()=>pedsExactKeys),[exactKey]);
      };
      const resetPatient=async()=>{if(!await page.locator('#patientDialog').evaluate(el=>el.open))await click('#fieldEditPatient');await click('#newPtTop');await settle();};
      await chooseExact();await page.locator('#ageIn').fill('4');await page.locator('#wtIn').fill('18');await click('#patientContinue');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false);assert.deepEqual(await page.evaluate(()=>pedsExactKeys),[exactKey]);assert.equal(await page.locator('#results .row').filter({hasText:'Midazolam — active seizure'}).count(),1,'Done retains the selected exact medication');
      await resetPatient();await chooseExact('wt');assert.equal(await page.evaluate(()=>document.activeElement.id),'wtIn','Weight-only handoff focuses visible weight input, not hidden age');await page.locator('#wtIn').fill('20');await click('#patientContinue');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false);assert.deepEqual(await page.evaluate(()=>pedsExactKeys),[exactKey]);
      await resetPatient();await click('#fieldEditPatient');await page.locator('#ageIn').fill('130');await page.locator('#wtIn').fill('20');await click('#patientContinue');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),true,'Invalid patient cannot be accepted');await click('#closePatientDialog');await chooseExact();assert.ok(await page.evaluate(()=>S.validation.length)>0);
      await click('#closePatientDialog');assert.equal(await page.locator('#results .row').count(),0,'Closing invalid Exact entry does not expose calculated medication cards');assert.equal(await page.locator('#results').getAttribute('data-patient-validation'),'blocked');assert.equal(await page.locator('#results .warnbanner.red[role="alert"]').isVisible(),true);assert.deepEqual(await page.evaluate(()=>pedsExactKeys),[exactKey]);
      await click('#homeInvalidPatientEdit');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),true);await page.locator('#ageIn').fill('5');await click('#patientContinue');assert.equal(await page.locator('#patientDialog').evaluate(el=>el.open),false);assert.deepEqual(await page.evaluate(()=>pedsExactKeys),[exactKey],'Correcting invalid data preserves exact selection');assert.equal(await page.locator('#results').getAttribute('data-patient-validation'),null);assert.equal(await page.locator('#results .row').filter({hasText:'Midazolam — active seizure'}).count(),1,'Valid correction restores selected exact calculation');
      assert.deepEqual(focusFailures,[],name+': native patient-sheet keyboard focus');assert.deepEqual(errors,[]);console.log(`PASS ${name}: exact clinical baseline, all34 A–Z Home directives, real patient sheet, Critical nonmodal navigation, Reference/Peds/tools/stock, resets and 320–844px normal/Large themes without dosage columns.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
