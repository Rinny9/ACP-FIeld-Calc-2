// Requires Playwright in the test environment. Run: node tests/dose-layout.cjs
// TEST_WEBKIT=1 adds WebKit. CHROME_PATH optionally selects an installed Chrome.
// COMPARE_REF optionally verifies a previous Git revision reproduces the defect.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const current=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=process.env.COMPARE_REF?execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'}):null;
if(baseline){
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  assert.equal(clinical(current),clinical(baseline),'Layout fix must not change clinical data or calculations');
}
const server=http.createServer((req,res)=>{
  const contents=req.url==='/baseline.html'?baseline:req.url==='/'?current:null;
  res.writeHead(contents?200:404,{'Content-Type':'text/html; charset=utf-8'});res.end(contents||'Not found');
});

// Page-width checks alone miss an internally collapsed grid column. Check actual
// text rectangles: a complete measurement must occupy one line, stay inside its
// card, and never overlap its route or administration text.
function inspectDoses(selector){
  const failures=[];
  for(const row of document.querySelectorAll(selector+' .rline')){
    const cells=[...row.children].filter(el=>el.textContent.trim());
    const context=row.closest('.row').querySelector('.rname').textContent;
    for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
      const a=cells[i].getBoundingClientRect(),b=cells[j].getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)failures.push(context+': overlapping cells');
    }
  }
  for(const cell of document.querySelectorAll(selector+' .rlD,'+selector+' .rlM,'+selector+' .rdose,'+selector+' .rml,'+selector+' .rsv > .num')){
    if(!cell.getClientRects().length)continue;
    const box=cell.closest('.rlines,.rsv,.row').getBoundingClientRect(),walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
    let node;
    while(node=walker.nextNode()){
      const text=node.textContent;
      for(const match of text.matchAll(/\d[\d.,]*(?:[–−-]\d[\d.,]*)?(?:\s*(?:mcg|mg|g|mL|units?|J|mmol|mEq)(?:\/(?:kg|min|mL|hr))*)?/g)){
        const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
        const rects=[...range.getClientRects()].filter(r=>r.width>.1);
        if(new Set(rects.map(r=>Math.round(r.top))).size>1)failures.push(cell.closest('.row').querySelector('.rname').textContent+': split measurement '+match[0]);
        if(rects.some(r=>r.left<box.left-1||r.right>box.right+1))failures.push(cell.closest('.row').querySelector('.rname').textContent+': clipped measurement '+match[0]+' (cell '+Math.round(box.left)+'–'+Math.round(box.right)+', text '+rects.map(r=>Math.round(r.left)+'–'+Math.round(r.right)).join(', ')+')');
      }
    }
  }
  return [...new Set(failures)];
}

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  for(const name of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const context=await browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true,reducedMotion:'reduce',colorScheme:'dark',serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const populate=()=>page.evaluate(()=>{
        S.ageVal=28;S.wtVal=80;S.entryCollapsed=true;recompute();
        document.querySelectorAll('#results .sec').forEach(el=>el.classList.add('open'));
      });
      if(baseline){
        await page.goto(url+'/baseline.html');await populate();
        const defects=await page.evaluate(inspectDoses,'#results');
        assert.ok(defects.some(x=>/Ketamine|Salbutamol|Procedural sedation|Midazolam/.test(x)),name+': previous build reproduces screenshots');
        console.log(name+': reproduced '+defects.length+' previous-build dose layout defects');
      }
      await page.goto(url);await populate();
      assert.deepEqual(await page.evaluate(()=>{
        const failures=[],box=document.createElement('div');
        for(const input of [{ageYears:28,weightKg:80},{ageYears:5,weightKg:20},{ageYears:0,weightKg:3},{ageYears:null,weightKg:20},{ageYears:40,weightKg:null}]){
          const patient=buildPatient(input),rows=[...Object.values(drugCalcs(patient)).flat(),...CRIT_PATHS.flatMap(path=>{const data=critRowsForPath(patient,path.id);return [...data.rows,...data.equipment];})];
          for(const row of rows)for(const value of [row.dose,row.d2,row.ml,row.ml2,...(row.lines||[]).flatMap(line=>[line.d,line.m])]){
            if(value==null)continue;box.innerHTML=doseTextHTML(value);if(box.textContent!==String(value))failures.push(value);
          }
        }
        return failures;
      }),[],name+': dosage formatting preserves every original text value');
      for(const width of [320,375,390,430,768,1280]){
        await page.setViewportSize({width,height:932});
        for(const large of [false,true])for(const day of [false,true]){
          await page.evaluate(({large,day})=>{document.body.classList.toggle('large-text',large);document.body.classList.toggle('daylight',day);},{large,day});
          for(const patient of [{age:28,weight:80},{age:5,weight:20}]){
            await page.evaluate(({age,weight})=>{
              switchPane('calc');S.ageVal=age;S.wtVal=weight;recompute();
              document.querySelectorAll('#results .sec').forEach(el=>el.classList.add('open'));
            },patient);
            const label=`${name} ${width}px ${large?'large':'normal'} ${day?'day':'dark'} age ${patient.age}`;
            assert.deepEqual(await page.evaluate(inspectDoses,'#results'),[],label+' Calculator');
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' Calculator width');
            await page.evaluate(()=>switchPane('critical'));
            const ids=await page.evaluate(()=>CRIT_PATHS.map(p=>p.id));
            for(const id of ids){
              await page.evaluate(id=>selectCriticalPath(id),id);
              const defects=await page.evaluate(inspectDoses,'#critContent');
              if(defects.length&&process.env.SCREENSHOT_DIR){
                fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
                await page.locator('#critContent .row').filter({hasText:defects[0].split(':')[0].replace(/ PCS$| Patch$| EXT$/,'')}).first().screenshot({path:path.join(process.env.SCREENSHOT_DIR,name+'-failure.png')});
              }
              assert.deepEqual(defects,[],label+' Critical '+id);
              assert.equal(await page.locator('#critical').evaluate(el=>el.scrollWidth>el.clientWidth),false,label+' Critical width '+id);
            }
          }
        }
      }
      await page.setViewportSize({width:430,height:932});
      await page.evaluate(()=>{
        switchPane('calc');document.body.classList.remove('large-text','daylight');
        S.ageVal=28;S.wtVal=80;recompute();document.querySelectorAll('#results .sec').forEach(el=>el.classList.add('open'));
      });
      if(process.env.SCREENSHOT_DIR){
        fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
        await page.evaluate(()=>document.querySelectorAll('#ptbar,.crit-sticky,nav').forEach(el=>el.style.visibility='hidden'));
        for(const [key,title] of [['ketamine','Ketamine — analgesia'],['salbutamol','Salbutamol — bronchoconstriction'],['sedation','Procedural sedation (post-ETT / TCP)'],['seizure','Midazolam — active seizure'],['dimenhydrinate','DimenhyDRINATE']]){
          const card=page.locator('#results .row').filter({has:page.locator('.rname',{hasText:title})}).first();
          await card.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${name}-${key}.png`)});
        }
        await page.evaluate(()=>document.querySelectorAll('#ptbar,.crit-sticky,nav').forEach(el=>el.style.visibility=''));
      }
      // Simulate the inset supplied by an iPhone running the home-screen app.
      await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','47px');scrollTo(0,500);});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
      assert.ok(await page.locator('#ptcard').evaluate(el=>el.getBoundingClientRect().top>=47),'Patient card stays below the simulated status bar');
      assert.deepEqual(errors,[],name+' runtime errors');
      console.log('PASS '+name+': intact measurements, no dose/text overlap or clipping; all pathways at 320–1280px, both text sizes/themes, adult/pediatric.');
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
