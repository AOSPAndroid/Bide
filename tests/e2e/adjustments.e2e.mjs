// End-to-end: an adjustment layer changes the layers below it live, is saved
// with the project, and is flattened into PDF export.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// Colour at page coordinates (x, y) of the 200-unit-wide page, read from the editor canvas.
const pixel=(page,x,y)=>page.evaluate(([x,y])=>{const c=document.querySelector('.artboard canvas.lower-canvas'),r=c.getBoundingClientRect(),k=c.width/r.width,zoom=r.width/200;
 return [...c.getContext('2d').getImageData(Math.round(x*zoom*k),Math.round(y*zoom*k),1,1).data].slice(0,3);},[x,y]);

test('adjustment layers recolour the layers below, persist and export',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:200,height:120}});await shot.setContent('<body style="margin:0;background:#fff"><div style="width:200px;height:120px;background:#e02020"></div></body>');
  const file=join(await mkdtemp(join(tmpdir(),'bide-adjust-')),'red.png');await shot.screenshot({path:file});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);await page.getByText(/page added/).waitFor({timeout:60000});
  await page.waitForTimeout(1500);const before=await pixel(page,100,60);assert.ok(before[0]>200&&before[1]<60,`red to start with: ${before}`);
  await page.keyboard.press('Control+k');await page.keyboard.type('New adjustment layer: Hue/Saturation');await page.keyboard.press('Enter');
  await page.getByLabel('Saturation',{exact:true}).fill('-100');await page.waitForTimeout(800);
  const grey=await pixel(page,100,60);assert.ok(Math.abs(grey[0]-grey[1])<4&&Math.abs(grey[1]-grey[2])<4,`desaturated live: ${grey}`);
  // PDF export bakes it in.
  await page.keyboard.press('Control+k');await page.keyboard.type('Export PDF');await page.keyboard.press('Enter');
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.getByRole('button',{name:'Export PDF'}).click()]);
  const out=join(await mkdtemp(join(tmpdir(),'bide-adjust-')),'out.pdf');await download.saveAs(out);
  const doc=mupdf.Document.openDocument(await readFile(out),'application/pdf'),pix=doc.loadPage(0).toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true);
  const w=pix.getWidth(),h=pix.getHeight(),i=(Math.floor(h/2)*w+Math.floor(w/2))*3,rgb=Array.from(pix.getPixels().slice(i,i+3));
  assert.ok(Math.abs(rgb[0]-rgb[1])<6&&Math.abs(rgb[1]-rgb[2])<6,`grey in the PDF: ${rgb}`);
  // Saved with the project and restored after a reload.
  await page.waitForTimeout(1500);await page.reload();await page.waitForTimeout(3000);
  const saved=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.map(o=>({type:o.type,adjustment:o.adjustment}));});
  const layer=saved.find(o=>o.type==='AdjustmentLayer');assert.equal(layer?.adjustment?.saturation,-100,JSON.stringify(saved));
  const restored=await pixel(page,100,60);assert.ok(Math.abs(restored[0]-restored[1])<4,`still grey after reload: ${restored}`);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
