// Requires Playwright; TEST_WEBKIT=1 includes WebKit and CHROME_PATH can select Chrome.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const engine of process.env.TEST_WEBKIT?['chromium','webkit']:['chromium']){
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const click=async selector=>{await page.locator(selector).click();await settle();};
      const tools=()=>click('nav [data-pane="tools"]');
      const open=id=>click(`#toolHome [onclick="openTool('${id}')"]`);
      const edit=async(field,value)=>{await click('#ptcard .ptedit');await page.locator(field).fill(value);await tools();};
      const assertDopamineRates=async(weight,flows)=>{
        const rows=page.locator('#toolView .kv');
        assert.deepEqual(await rows.locator('.k').allTextContents(),['5 mcg/kg/min','10 mcg/kg/min','15 mcg/kg/min','20 mcg/kg/min']);
        assert.match(await page.locator('#toolView').innerText(),new RegExp(`${weight} kg`));
        for(let i=0;i<flows.length;i++){
          const flow=flows[i],value=await rows.nth(i).locator('.v').innerText();
          assert.match(value,new RegExp(`^${flow} mL/hr`));
          assert.match(value,new RegExp(`= ${flow} gtt/min`));
        }
      };
      await page.locator('#ageIn').fill('28');await page.locator('#wtIn').fill('80');
      await tools();await open('dopa');
      await assertDopamineRates(80,[30,60,90,120]);
      await edit('#wtIn','40');
      assert.equal(await page.locator('#toolView').innerText(),'');
      assert.match(await page.locator('#toolPatientNotice').innerText(),/Patient updated.*DOPamine Drip/);
      assert.equal(await page.evaluate(()=>S.tool),null);
      await open('dopa');
      await assertDopamineRates(40,[15,30,45,60]);
      assert.equal(await page.locator('#toolPatientNotice').count(),0);
      await edit('#ageIn','10');
      assert.match(await page.locator('#toolPatientNotice').innerText(),/DOPamine Drip/);
      await open('dopa');await click('.backbtn');await open('tbsa');
      await click('#tbsaRows button:has-text("Right arm")');
      assert.match(await page.locator('#parklandOut').innerText(),/1,440 mL/);
      await edit('#wtIn','30');
      assert.equal(await page.locator('#toolView').innerText(),'');
      assert.match(await page.locator('#toolPatientNotice').innerText(),/Burn TBSA/);
      await open('tbsa');
      assert.equal(await page.locator('#tbsaTotal').innerText(),'0%');
      await click('#tbsaRows button:has-text("Right arm")');
      assert.match(await page.locator('#parklandOut').innerText(),/1,080 mL/);
      await click('#tbsaAge [data-a="child"]');await click('.backbtn');await open('tbsa');
      assert.equal(await page.locator('#tbsaAge button.on').getAttribute('data-a'),'child');
      assert.match(await page.locator('#tbsaRows button').first().innerText(),/18%/);
      await click('.backbtn');await open('drip');
      await page.locator('#dvol').fill('1000');await page.locator('#dmin').fill('60');
      const dripBefore=await page.locator('#dripOut').innerText();
      assert.match(await page.locator('#dripLbl').innerText(),/167 gtt\/min/);
      await edit('#wtIn','35');
      assert.equal(await page.evaluate(()=>S.tool),'drip','Patient-independent tool remains open');
      assert.equal(await page.locator('#dvol').inputValue(),'1000');
      assert.equal(await page.locator('#dripOut').innerText(),dripBefore);
      await page.locator('#dvol').fill('1');await page.locator('#dmin').fill('120');
      assert.equal(await page.locator('#dripOut').innerText(),'Below 1');
      assert.match(await page.locator('#dripLbl').innerText(),/below whole-drop timing/);
      await page.locator('#dvol').fill('');assert.equal(await page.locator('#dripOut').innerText(),'—');
      await click('.backbtn');await open('dopa');await edit('#wtIn','36');
      assert.equal(await page.locator('#toolPatientNotice').count(),1);
      await click('#newPtTop');await tools();
      assert.equal(await page.locator('#toolPatientNotice').count(),0,'New patient removes old notice');
      assert.equal(await page.locator('#toolView').innerText(),'');
      await open('dopa');
      assert.match(await page.locator('#toolView').innerText(),/Enter a weight on the Calculator tab/);
      assert.equal(await page.locator('#toolView .kv').count(),0,'Missing weight must not display calculated DOPamine rows');
      assert.doesNotMatch(await page.locator('#toolView').innerText(),/\b2 mcg\/kg\/min|\d+ mL\/hr/);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine}: DOPamine 5/10/15/20-only rates and weight gate, patient-dependent Tools invalidation, current-weight recalculation, retained independent inputs, TBSA mode and low-rate drip guard.`);
    }finally{await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
