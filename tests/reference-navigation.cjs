// Reference navigation regression. TEST_WEBKIT=1 adds WebKit; CHROME_PATH selects Chrome.
// COMPARE_REF enables a semantic clinical-data comparison (e.g. cabcdf9).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseline=process.env.COMPARE_REF?execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'}):null;
const patients=[
  {ageYears:0,weightKg:.8},{ageYears:0,weightKg:2.5},{ageYears:.2,weightKg:4},
  {ageYears:.5,weightKg:8.5},{ageYears:1,weightKg:10},{ageYears:2,weightKg:12},
  {ageYears:5,weightKg:20},{ageYears:7,weightKg:27},{ageYears:12,weightKg:40},
  {ageYears:13,weightKg:45},{ageYears:17,weightKg:50},{ageYears:18,weightKg:60},
  {ageYears:28,weightKg:80},{ageYears:65,weightKg:90},{ageYears:null,weightKg:20},
  {ageYears:5,weightKg:null},{ageYears:28,weightKg:null}
];
const citation=/\b(?:PCS|CD|Companion(?: Document)?|PDC(?:\s+v?5\.4)?)\s+p{1,2}\.?\s*\d+(?:\s*[–−-]\s*\d+)?(?:\s*,\s*(?:p\.?\s*)?\d+(?:\s*[–−-]\s*\d+)?)*|\bp\.\s*\d+(?:\s*[–−-]\s*\d+)?/gi;
function withoutReferences(value){
  if(Array.isArray(value))return value.map(withoutReferences);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['src','pg'].includes(key)).map(([key,v])=>[key,withoutReferences(v)]));
  if(typeof value!=='string')return value;
  return value
    .replace('; reference mismatch — see warning','')
    .replace(/legacy (?:summary|preparation example) — not confirmed in current reference; see warning/g,'[reference]')
    .replace(/Current hypoglycemia discussion: CD p\.40–41\. /g,'')
    .replace(citation,'[reference]');
}
const snapshot=(page)=>page.evaluate(patients=>({
  concentrations:CONC,sourceCharts:PEDS54,directives:DIR,
  patients:patients.map(input=>{
    const patient=buildPatient(input);
    return{patient,airway:airway(patient),drugs:drugCalcs(patient),critical:Object.fromEntries(CRIT_PATHS.map(p=>[p.id,critRowsForPath(patient,p.id)]))};
  })
}),patients);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/baseline.html'?baseline:html);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);
      assert.deepEqual(await page.evaluate(()=>['CD|58','PCS|81','PDC|57'].map(pair=>{const[k,pg]=pair.split('|');return new URL(srcHref(k,+pg)).hash;})),['#page=58','#page=93','#page=2'],'Printed-to-PDF page conversion');
      const linksFor=src=>page.evaluate(src=>{
        const el=document.createElement('div');el.innerHTML=srcLink(src);
        return [...el.querySelectorAll('a')].map(a=>({href:a.href,text:a.textContent,title:a.title,aria:a.getAttribute('aria-label')||''}));
      },src);
      const hasLink=(links,source,pg)=>links.some(link=>new URL(link.href).hash===`#page=${pg}`&&new URL(link.href).href.includes(source));
      const multiple=await linksFor('PCS p.122 · CD p.27');
      assert.ok(hasLink(multiple,'ontario.ca',134),'PCS part has its own link');
      assert.ok(hasLink(multiple,'ontariobasehospitalgroup.ca',27),'CD part has its own link');
      for(const label of ['CD p.46, 61','CD p.46, p.61']){
        const links=await linksFor(label);for(const pg of [46,61])assert.ok(hasLink(links,'ontariobasehospitalgroup.ca',pg),label+' independently opens '+pg);
      }
      const range=await linksFor('CD p.46–47');
      for(const pg of [46,47]){
        assert.ok(hasLink(range,'ontariobasehospitalgroup.ca',pg),'Range endpoint '+pg+' is independently navigable');
        const link=range.find(link=>new URL(link.href).hash===`#page=${pg}`),description=[link.text,link.title,link.aria].join(' ');
        assert.match(description,/CD|Companion/i,'Reference names its source');
        assert.match(description,new RegExp(`\\b${pg}\\b`),'Reference identifies target page');
      }
      assert.ok(hasLink(await linksFor('PDC p.56'),'rppeo.ca',1),'Unversioned PDC reference opens guidance page');
      const ett=await page.evaluate(()=>{
        const row=airway(buildPatient({ageYears:5,weightKg:20})).find(r=>r.k==='ETT — cuffed');
        const el=document.createElement('div');el.innerHTML=rowHTML({name:row.k,dose:row.v,sub:row.sub,src:row.src,tone:row.tone});
        return{value:row.v,source:row.src,links:[...el.querySelectorAll('a')].map(a=>a.href)};
      });
      assert.equal(ett.value,'5.0 mm');assert.match(ett.source,/CD p\.58/);
      assert.ok(ett.links.some(link=>new URL(link).hash==='#page=58'),'ETT card opens current intubation Companion page');
      await page.locator('#ageIn').fill('5');await page.locator('#wtIn').fill('20');
      await page.locator('#calcSearch').fill('ETT — cuffed');
      assert.ok(await page.locator('#results .row a[href$="#page=58"]').count(),'Calculator exposes the same corrected ETT link');
      await page.locator('nav [data-pane="dir"]').click();
      await page.evaluate(()=>{directiveOpen.oti=true;renderDirectives('Orotracheal Intubation');});
      assert.ok(await page.locator('.dcard[data-id="oti"] .dbody a[href$="#page=58"]').count(),'Directive Companion notes are directly linked');
      const bands=await page.evaluate(()=>PEDS54.map(b=>({id:b.id,pg:b.pg})));
      assert.deepEqual(bands.map(b=>b.pg),Array.from({length:13},(_,i)=>i+57));
      await page.locator('nav [data-pane="peds"]').click();
      for(const band of bands){
        await page.evaluate(id=>{PS.band=id;PS.manual=true;renderPeds();},band.id);
        const hrefs=await page.locator('#pedBody a[href*="Pediatric_Dosing_Charts"]').evaluateAll(links=>links.map(link=>link.href));
        assert.ok(hrefs.some(href=>new URL(href).hash===`#page=${band.pg-55}`),band.id+' links its correct source-chart page');
        assert.ok(hrefs.every(href=>Number(new URL(href).hash.replace('#page=',''))>=1&&Number(new URL(href).hash.replace('#page=',''))<=14),'PDC targets are within 14-page source PDF');
      }
      // Ensure newly linked reference text remains readable at phone widths, including Large text.
      for(const width of [320,390])for(const large of [false,true]){
        await page.setViewportSize({width,height:844});await page.evaluate(large=>document.body.classList.toggle('large-text',large),large);
        for(const pane of ['calc','dir','peds']){
          await page.locator(`nav [data-pane="${pane}"]`).click();
          await page.evaluate(()=>document.querySelectorAll('.card-details').forEach(detail=>detail.open=true));
          const clipped=await page.evaluate(pane=>{
            const el=document.getElementById('pane-'+pane),bad=[];
            if(el.scrollWidth>el.clientWidth+1)bad.push('pane overflow');
            for(const a of el.querySelectorAll('a.rlink')){
              if(!a.getClientRects().length)continue;
              const range=document.createRange();range.selectNodeContents(a);
              if([...range.getClientRects()].some(rect=>rect.left<-.5||rect.right>innerWidth+.5))bad.push(a.textContent);
            }return bad;
          },pane);
          assert.deepEqual(clipped,[],`${engine} ${width}px ${large?'large':'normal'} ${pane}: reference text fits phone`);
        }
      }
      if(baseline){
        const oldPage=await context.newPage();await oldPage.goto(url+'/baseline.html');
        assert.deepEqual(withoutReferences(await snapshot(page)),withoutReferences(await snapshot(oldPage)),'Medication/equipment outputs and directive clinical content unchanged apart from reference fields and citation numbers');
        await oldPage.close();
      }
      assert.deepEqual(errors,[],'No unexpected runtime errors');
      console.log(`PASS ${engine}: CD/PCS/PDC page conversion, separate multi-source/range links, ETT and directive inline references, 13 Peds bands, mobile/Large text${baseline?', unchanged clinical data':''}.`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
