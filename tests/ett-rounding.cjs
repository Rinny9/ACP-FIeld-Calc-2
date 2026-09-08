// Run with Playwright. TEST_WEBKIT=1 also checks WebKit.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(process.env.COMPARE_REF){
  const baseline=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const unchanged=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/function airway\(p\) \{[\s\S]*?(?=function bladeFor)/,'').replace(/\r/g,'');
  assert.equal(unchanged(html),unchanged(baseline),'Only the airway calculation changes; drug calculations and directive data are preserved');
  const printed=s=>s.match(/const PEDS54\s*=([^\n]+)/)[1];
  assert.equal(printed(html),printed(baseline),'Printed pediatric reference data are preserved');
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const checks=await page.evaluate(()=>{
        const failures=[];let cases=0;
        const check=(ok,label)=>{if(!ok)failures.push(label);};
        const inputs=[];
        for(let months=12;months<=144;months++)inputs.push({ageYears:months/12,weightKg:20});
        for(const w of [.8,1,2.24,2.25,2.26,3.74,3.75,3.76,6.1,8.9])for(const a of [0,.1,.5,.99])inputs.push({ageYears:a,weightKg:w});
        for(const sex of [null,'f','m'])inputs.push({ageYears:28,weightKg:80,sex});
        inputs.push({ageYears:.1,weightKg:null,suppressWeightEstimate:true},{ageYears:null,weightKg:20},{ageYears:null,weightKg:null});
        for(const input of inputs){
          cases++;
          const p=buildPatient(input),rows=airway(p),size=rows.find(r=>/^ETT —/.test(r.k)),depth=rows.find(r=>r.k==='Oral insertion depth');
          const label=JSON.stringify(input),a=p.ageYears;
          if(a==null){check(!size&&!depth,'Unknown age: '+label);continue;}
          for(const r of [size,depth])for(const n of (r.v.match(/\d+(?:\.\d+)?/g)||[]).map(Number))check(Number.isInteger(n*2),'Half-step: '+label+' '+r.v);
          if(a>=1&&a<=12)check(size.v===(Math.round((3.5+a/4)*2)/2).toFixed(1)+' mm','Size formula: '+label);
          if(a<1&&p.weightKg==null)check(depth.v==='—','Missing infant weight: '+label);
          else{
            const tube=a>12?(p.sex==='f'?7:p.sex==='m'?8:7.5):parseFloat(size.v);
            const expected=Math.round((a<1?p.weightKg+6:tube*3)*2)/2;
            check(depth.v===expected.toFixed(1)+' cm at lip','Depth formula: '+label);
          }
          for(const id of ['arrest','airway','trauma','newborn']){
            const equipment=critRowsForPath(p,id).equipment;
            for(const r of [size,depth])check(equipment.find(e=>e.name===r.k)?.dose===r.v,'Critical '+id+' matches Calculator: '+label);
          }
        }
        const example=airway(buildPatient({ageYears:5,weightKg:20}));
        check(example.find(r=>r.k==='ETT — cuffed').v==='5.0 mm','Halfway size rounds up');
        check(example.find(r=>r.k==='Oral insertion depth').v==='15.0 cm at lip','Depth uses selected 5.0 mm tube');
        for(const band of PEDS54)for(const n of (band.eq.ett.match(/\d+(?:\.\d+)?/g)||[]).map(Number))check(Number.isInteger(n*2),'Printed ETT sizes already use half steps: '+band.id);
        return {failures,cases};
      });
      assert.deepEqual(checks.failures,[]);
      await page.locator('#ageIn').fill('5');await page.locator('#wtIn').fill('20');
      await page.locator('nav [data-pane="critical"]').click();
      await page.locator('#critPaths [onclick="selectCriticalGroup(\'arrest\')"]').click();
      assert.match(await page.locator('#critContent').innerText(),/5\.0 mm/);
      assert.match(await page.locator('#critContent').innerText(),/15\.0 cm at lip/);
      assert.match(await page.locator('#critContent').innerText(),/Depth rounded to nearest 0\.5 cm/);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine}: ${checks.cases} patient cases, half-step/tie rounding, missing data, all ETT Critical pathways, printed chart sizes and mobile rendering.`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
