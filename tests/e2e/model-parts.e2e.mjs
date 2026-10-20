// End-to-end: a model split into parts (hosts that limit file size) is joined
// again by the AI worker and runs.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {readFile} from 'node:fs/promises';

test('an AI model served in parts loads and runs',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const bytes=await readFile('public/ai/models/realesr-general-x4v3.onnx'),size=Math.ceil(bytes.length/3),parts=[0,1,2].map(i=>bytes.subarray(i*size,(i+1)*size));
  const page=await browser.newPage(),served=[];
  await page.route('**/ai/models/realesr-general-x4v3.onnx*',route=>{const url=route.request().url(),m=/\.part(\d)$/.exec(url);served.push(url.split('/').pop());
   if(url.endsWith('.parts.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({size:bytes.length,parts:3})});
   if(m)return route.fulfill({contentType:'application/octet-stream',body:Buffer.from(parts[+m[1]])});
   return route.fulfill({status:404,body:'not here'});});
  await page.goto(server.resolvedUrls.local[0]);await page.waitForTimeout(1500);
  const size2=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.fillStyle='#c44c28';g.fillRect(0,0,32,32);
   const {upscaleCanvas}=await import('/src/browser/ai-tools.ts');const out=await upscaleCanvas(c,2);return [out.width,out.height];});
  assert.deepEqual(size2,[64,64],'the joined model upscales');
  assert.deepEqual(served,['realesr-general-x4v3.onnx','realesr-general-x4v3.onnx.parts.json','realesr-general-x4v3.onnx.part0','realesr-general-x4v3.onnx.part1','realesr-general-x4v3.onnx.part2']);
 }finally{await browser.close();await server.close();}
});
