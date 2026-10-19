// Runs the in-browser OCR appearance checks (tests/ocr-appearance.browser.ts):
// font, size and edge softness fitted against real rendered pixels.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

test('OCR replacement text matches the original font, size and edge clarity',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/ocr-appearance.browser.html');await page.click('#run');
  await page.waitForFunction(()=>document.querySelector('#result')?.textContent!=='Ready',null,{timeout:240000});
  const result=await page.locator('#result').textContent();
  assert.match(result,/"passed": true/,result);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
