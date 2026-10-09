// Real service-worker lifecycle on a temporary localhost origin. Future and
// legacy releases are served from memory; production files are never changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),currentHTML=fs.readFileSync(path.join(root,'index.html'),'utf8'),currentSW=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const currentBuild=currentHTML.match(/const APP_BUILD='([^']+)'/)[1],futureBuild='2026.10.08.2';
assert.equal(currentBuild,'2026.10.08.1');assert.match(currentSW,new RegExp(currentBuild.replace(/\./g,'\\.')));
const legacyRef=process.env.LEGACY_REF||'7e896d5';
const gitFile=file=>execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,'show',`${legacyRef}:${file}`],{cwd:root,encoding:'utf8'});
const releases={current:{html:currentHTML,sw:currentSW},future:{html:currentHTML.replaceAll(currentBuild,futureBuild),sw:currentSW.replaceAll(currentBuild,futureBuild)},legacy:{html:gitFile('index.html'),sw:gitFile('sw.js')}};
let release='current',delayFutureInstall=0;const requests=[];
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  requests.push({pathname,release});
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(releases[release].sw);return;}
  if(pathname==='/'||pathname==='/index.html'){
    res.setHeader('Content-Type','text/html; charset=utf-8');const body=releases[release].html;
    if(release==='future'&&delayFutureInstall&&req.headers['sec-fetch-mode']!=='navigate')setTimeout(()=>res.end(body),delayFutureInstall);else res.end(body);return;
  }
  if(pathname==='/manifest.webmanifest'||pathname==='/icon.svg'){
    res.setHeader('Content-Type',pathname.endsWith('.svg')?'image/svg+xml':'application/manifest+json');res.end(fs.readFileSync(path.join(root,pathname.slice(1))));return;
  }
  res.statusCode=404;res.end('Not found');
});
function encounter(){return JSON.stringify({pt:S.pt,age:S.ageVal,weight:S.wtVal,caseId:S.caseId,query:S.query,toolFields,gcsSel,apSel,tbsaAge,tbsaOn,tbsaExtra,critical:critScenario,readback:criticalReadback});}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'allow'}),page=await context.newPage(),errors=[];
    let loads=0,approveReload=false;const confirms=[];
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())loads++;});page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',async dialog=>{if(dialog.type()==='confirm'){confirms.push(dialog.message());await(approveReload?dialog.accept():dialog.dismiss());}else await dialog.accept();});
    await page.goto(url);
    await page.waitForFunction(()=>navigator.serviceWorker.controller&&offlinePackReady&&offlineRegistration?.active?.state==='activated',null,{timeout:20000});
    assert.equal(await page.evaluate(()=>APP_BUILD),currentBuild);assert.match(await page.locator('#activeBuild').innerText(),new RegExp(currentBuild.replace(/\./g,'\\.')));
    assert.match(await page.locator('#offlineStatus').innerText(),/ready/i);assert.equal(await page.locator('#updateNotice').isVisible(),false);
    await page.evaluate(async()=>{const cache=await caches.open('unrelated-user-cache');await cache.put('/unrelated-sentinel',new Response('keep this unrelated cache'));});
    await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');await page.evaluate(()=>openTool('drip',true));
    await page.locator('#dvol').fill('250');await page.locator('#dmin').fill('30');await page.evaluate(()=>closeTool());
    await page.evaluate(()=>{selectCase('brady');selectCriticalPath('brady');switchPane('critical');});
    await page.locator('#critReadbackPanel summary').click();await page.locator('#critReadbackFindings').fill('Synthetic test: observed rhythm and perfusion entered by clinician.');
    const firstTreatment=await page.locator('#critReadbackTreatment option').nth(1).getAttribute('value');await page.locator('#critReadbackTreatment').selectOption(firstTreatment);
    const before=await page.evaluate(encounter),loadsBefore=loads;
    release='future';await page.evaluate(()=>offlineRegistration.update());
    await page.waitForFunction(expected=>availableUpdateBuild===expected&&availableUpdateWorker?.state==='installed',futureBuild,{timeout:20000});
    assert.equal(loads,loadsBefore,'Installing an update never automatically reloads an open encounter');assert.equal(await page.evaluate(encounter),before,'Waiting update preserves patient, tool fields and read-back');
    assert.equal(await page.evaluate(()=>offlineRegistration.waiting?.state),'installed');assert.equal(await page.evaluate(()=>workerBuild(navigator.serviceWorker.controller)),currentBuild,'Waiting version does not replace the active controller');
    assert.equal(await page.locator('#updateNotice').isVisible(),false,'Critical hides update controls until explicitly exited');assert.equal(await page.evaluate(()=>activePane),'critical');
    await page.locator('#critClose').click();assert.equal(await page.locator('#updateNotice').isVisible(),true);assert.match(await page.locator('#updateNoticeText').innerText(),/patient and tool entries will be cleared/);
    await page.locator('#dismissUpdate').click();assert.equal(await page.locator('#updateNotice').isVisible(),false);assert.equal(await page.evaluate(encounter),before);
    await page.locator('#settingsTop').click();await page.locator('#checkUpdate').click();assert.equal(await page.locator('#updateNotice').isVisible(),true,'Check update restores a dismissed pending update');
    await page.locator('#applyUpdate').click();assert.equal(loads,loadsBefore,'Cancel apply does not reload');assert.equal(await page.evaluate(encounter),before,'Cancel preserves the complete encounter');assert.equal(await page.evaluate(()=>updateApplying),false);assert.match(confirms.at(-1),/clears the current patient, tool entries and read-back notes/);
    approveReload=true;await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:20000}),page.locator('#applyUpdate').click()]);
    await page.waitForFunction(expected=>APP_BUILD===expected&&offlinePackReady,futureBuild,{timeout:20000});
    assert.equal(loads,loadsBefore+1,'Confirmed update causes exactly one explicit reload');assert.equal(await page.evaluate(()=>APP_BUILD),futureBuild);assert.match(await page.locator('#activeBuild').innerText(),new RegExp(futureBuild.replace(/\./g,'\\.')));
    assert.equal(await page.evaluate(()=>S.pt?.ageYears),null);assert.equal(await page.evaluate(()=>S.pt?.weightKg),null);assert.equal(await page.evaluate(()=>S.ageVal),null);assert.equal(await page.evaluate(()=>S.wtVal),null);assert.equal(await page.evaluate(()=>hasToolInputs()),false);assert.equal(await page.evaluate(()=>criticalReadback.findings),'');assert.deepEqual(await page.evaluate(()=>criticalReadback.selection),{});assert.equal(await page.locator('#updateNotice').isVisible(),false);
    const cacheKeys=await page.evaluate(()=>caches.keys());assert.ok(cacheKeys.includes('unrelated-user-cache'));assert.ok(cacheKeys.some(k=>k.startsWith('acp-field-calc-'+futureBuild)));assert.ok(!cacheKeys.some(k=>k.startsWith('acp-field-calc-'+currentBuild)),'Activation removes only superseded app caches');
    assert.equal(await page.evaluate(async()=>{const cache=await caches.open('unrelated-user-cache');return(await cache.match('/unrelated-sentinel')).text();}),'keep this unrelated cache');
    await context.setOffline(true);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>offlinePackReady,null,{timeout:20000});
    assert.equal(await page.evaluate(()=>APP_BUILD),futureBuild,'Offline reload uses the active updated shell');assert.match(await page.locator('#offlineStatus').innerText(),/Offline\s*ready/i);
    await page.locator('#ageIn').fill('4');await page.locator('#wtIn').fill('18');await page.locator('#calcSearch').fill('midazolam');
    const seizure=page.locator('#results .row').filter({hasText:'Midazolam — active seizure'});assert.equal(await seizure.count(),1);assert.match(await seizure.innerText(),/mg/,'Offline cached app still calculates patient-specific medication results');
    await page.locator('#settingsTop').click();await page.locator('#checkUpdate').click();assert.match(await page.locator('#updateStatus').innerText(),/Offline.*connect to check/);assert.deepEqual(errors,[]);
    await context.close();
    // The previously published worker has no version-message protocol and used
    // automatic activation. Opening the new hosted HTML should safely align its
    // matching worker without a second automatic reload or losing new inputs.
    release='legacy';const legacyContext=await browser.newContext({serviceWorkers:'allow'}),legacyPage=await legacyContext.newPage(),legacyErrors=[];let legacyLoads=0;
    legacyPage.on('framenavigated',f=>{if(f===legacyPage.mainFrame())legacyLoads++;});legacyPage.on('pageerror',e=>legacyErrors.push(e.message));
    await legacyPage.goto(url);await legacyPage.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
    await legacyPage.evaluate(async()=>{const cache=await caches.open('unrelated-user-cache');await cache.put('/unrelated-sentinel',new Response('legacy sentinel'));});
    release='current';await legacyPage.reload({waitUntil:'load'});const explicitLegacyLoad=legacyLoads;
    await legacyPage.locator('#ageIn').fill('28');await legacyPage.locator('#wtIn').fill('70');
    await legacyPage.waitForFunction(()=>APP_BUILD==='2026.10.08.1'&&offlinePackReady,null,{timeout:20000});
    assert.equal(legacyLoads,explicitLegacyLoad,'Legacy migration does not trigger a second reload');assert.equal(await legacyPage.locator('#wtIn').inputValue(),'70','New encounter survives matching-worker alignment');assert.equal(await legacyPage.evaluate(()=>workerBuild(navigator.serviceWorker.controller)),currentBuild);assert.equal(await legacyPage.locator('#updateNotice').isVisible(),false);
    assert.ok((await legacyPage.evaluate(()=>caches.keys())).includes('unrelated-user-cache'));assert.deepEqual(legacyErrors,[]);await legacyContext.close();
    // Network-first navigation may load newer HTML before its matching worker
    // installs. The older version-aware controller must not leave a stale
    // "older build available" notice after that matching worker activates.
    release='current';const raceContext=await browser.newContext({serviceWorkers:'allow'}),racePage=await raceContext.newPage();let raceLoads=0;
    racePage.on('framenavigated',f=>{if(f===racePage.mainFrame())raceLoads++;});
    await racePage.goto(url);await racePage.waitForFunction(()=>offlinePackReady&&!!navigator.serviceWorker.controller,null,{timeout:20000});
    release='future';delayFutureInstall=600;await racePage.reload({waitUntil:'load'});const explicitRaceLoad=raceLoads;
    await racePage.locator('#ageIn').fill('28');await racePage.locator('#wtIn').fill('65');
    await racePage.waitForFunction(expected=>APP_BUILD===expected&&offlinePackReady,futureBuild,{timeout:20000});
    assert.equal(await racePage.evaluate(()=>workerBuild(navigator.serviceWorker.controller)),futureBuild);assert.equal(raceLoads,explicitRaceLoad);assert.equal(await racePage.locator('#wtIn').inputValue(),'65');
    assert.equal(await racePage.locator('#updateNotice').isVisible(),false,'Matching worker activation clears stale older-controller update notices');
    assert.equal(await racePage.evaluate(()=>availableUpdateBuild),null,'Do not advertise an older build after newer HTML aligns with its worker');
    await raceContext.close();delayFutureInstall=0;
    assert.ok(requests.some(r=>r.pathname==='/sw.js'&&r.release==='future'),'Browser fetched the real future worker');
    console.log('PASS: first SW install/current build, real waiting update, Critical protection, Later/Check update, cancel/apply confirmation, one explicit reload/encounter clearing, offline calculation, unrelated-cache preservation, legacy-worker alignment, and newer-HTML/older-controller race without reload.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
