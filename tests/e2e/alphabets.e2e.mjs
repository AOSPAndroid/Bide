// End-to-end: AI OCR reads Cyrillic, Greek, Arabic, Korean and Chinese text,
// finding the alphabet by itself, and the high-accuracy detector works.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const samples=[
 {script:'Cyrillic',text:'Привет мир',font:'Inter'},
 {script:'Greek',text:'Καλημέρα κόσμε',font:'Inter'},
 {script:'Arabic',text:'مرحبا بالعالم',font:'FreeSerif',dir:'rtl'},
 {script:'Korean',text:'안녕하세요 세계',font:'WenQuanYi Zen Hei'},
 {script:'Chinese & Japanese',text:'你好世界',font:'WenQuanYi Zen Hei'},
];
const ocrSetting=async(page,label)=>{await page.locator('.ocr-settings').waitFor({state:'attached',timeout:120000});await page.evaluate(()=>{const d=document.querySelector('.ocr-settings');if(d)d.open=true;});return page.getByLabel(label);};

test('AI OCR finds and reads other alphabets',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  for(const [n,sample] of samples.entries()){
   const shot=await browser.newPage({viewport:{width:460,height:110}});
   await shot.setContent(`<body style="margin:0;background:#fff"><div dir="${sample.dir||'ltr'}" style="padding:30px 36px;font:34px '${sample.font}';color:#111">${sample.text}</div></body>`);
   const image=join(await mkdtemp(join(tmpdir(),'bide-abc-')),`sample-${n}.png`);await shot.screenshot({path:image});await shot.close();
   const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
   // The last sample also uses the high-accuracy (server) detector.
   if(n===samples.length-1)await (await ocrSetting(page,'High accuracy OCR')).check();
   await page.waitForFunction(s=>(document.querySelector('.text-detection-bar span')?.textContent||'').includes(`AI OCR (${s})`),sample.script,{timeout:240000})
    .catch(async e=>{throw new Error(`${sample.script}: ${await page.locator('.text-detection-bar span').first().innerText()} ${e.message}`);});
   const read=(await page.locator('.detected-text-overlay button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label').replace(/^Edit detected text: /,'')))).join(' ');
   const want=sample.text.replace(/\s+/g,''),got=read.replace(/\s+/g,'');
   let same=0;for(const ch of new Set(want))if(got.includes(ch))same++;
   assert.ok(same/new Set(want).size>=.8,`${sample.script}: read "${read}" for "${sample.text}"`);
   // Each word reads right to left, not in the recognizer's visual order.
   if(sample.dir==='rtl')for(const word of sample.text.split(' '))assert.ok(read.includes(word),`Arabic "${word}" in reading order: "${read}"`);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();await server.close();}
});
