// End-to-end: tilted and turned page images are offered a one-click
// straighten before OCR, and a photographed page can be flattened with AI.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const text=`<div id="doc" style="display:inline-block;width:520px;padding:28px;font:17px Georgia;line-height:1.6;color:#222;background:#fff">Quarterly report<br>Revenue grew strongly across all regions while costs remained stable through the year.<br>Invoice total 1284 EUR</div>`;
async function picture(browser,transform,{size={width:700,height:700},background='#fff',name}){
 const shot=await browser.newPage({viewport:size});
 await shot.setContent(`<body style="margin:0;background:${background};display:flex;align-items:center;justify-content:center;height:${size.height}px">${text.replace('id="doc" style="','id="doc" style="transform:'+transform+';')}</body>`);
 const file=join(await mkdtemp(join(tmpdir(),'bide-straight-')),name);await shot.screenshot({path:file});await shot.close();return file;
}
const saved=page=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=(await restoreLocal()).pages[0];return {width:p.width,height:p.height,objects:p.canvas.objects.map(o=>({type:o.type,angle:o.angle,src:(o.src||'').slice(-40)}))};});
async function open(browser,file){
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 await page.getByText(/page added/).waitFor({timeout:60000});return {page,errors};
}
let server;

test('tilted, turned and photographed pages are straightened',{timeout:900000},async()=>{
 server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  // A scan tilted 4° clockwise: one click turns it back, and OCR reads it.
  {const {page,errors}=await open(browser,await picture(browser,'rotate(4deg)',{name:'tilted.png'}));
   const hint=page.locator('.straighten-hint');await hint.waitFor({timeout:120000});
   assert.match(await hint.innerText(),/tilted 4\.\d°|tilted 3\.9°/);
   await hint.click();await page.getByText(/straightened \d\.\d°/).waitFor({timeout:30000});
   await page.waitForTimeout(1500);const state=await saved(page),image=state.objects.find(o=>o.type.toLowerCase().includes('image'));
   assert.ok(Math.abs(((image.angle+180)%360)-180+4)<.15,`image turned back by ${image.angle}`);
   await page.locator('button[aria-label^="Edit detected text: Quarterly report"]').waitFor({timeout:180000});
   await page.waitForTimeout(1500);assert.equal(await page.locator('.straighten-hint').count(),0,'no hint once straight');
   assert.deepEqual(errors,[]);await page.close();}

  // A page turned a quarter right: rotated upright, with width and height swapped.
  {const {page,errors}=await open(browser,await picture(browser,'rotate(90deg)',{size:{width:420,height:700},name:'turned.png'}));
   const hint=page.locator('.straighten-hint');await hint.waitFor({timeout:120000});
   assert.match(await hint.innerText(),/turned right/);
   const before=await saved(page);await hint.click();await page.getByText(/rotated left/).waitFor({timeout:30000});
   await page.waitForTimeout(1500);const after=await saved(page);
   assert.deepEqual([after.width,after.height],[before.height,before.width]);
   await page.locator('button[aria-label^="Edit detected text: Quarterly report"]').waitFor({timeout:180000});
   assert.deepEqual(errors,[]);await page.close();}

  // A photo of a page taken at an angle: AI flattening makes it readable.
  {const {page,errors}=await open(browser,await picture(browser,'perspective(900px) rotateX(18deg) rotateY(-16deg) rotateZ(3deg)',{size:{width:640,height:330},background:'#5a5f66',name:'photo.png'}));
   await page.waitForTimeout(3000);const before=await saved(page);
   await page.keyboard.press('Control+k');await page.keyboard.type('Flatten photographed page');await page.keyboard.press('Enter');
   await page.getByText(/Page flattened with AI/).waitFor({timeout:180000});
   await page.waitForTimeout(1500);const after=await saved(page);
   assert.notEqual(after.objects[0].src,before.objects[0].src,'image layer replaced');
   // Read as "Ivoice total 14 EUR" before flattening.
   await page.locator('button[aria-label="Edit detected text: Invoice total 1284 EUR"]').waitFor({timeout:180000});
   assert.deepEqual(errors,[]);await page.close();}
 }finally{await browser.close();await server.close();}
});
