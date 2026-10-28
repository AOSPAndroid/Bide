// End-to-end: a picture opened in bide downloads as the same kind of file.
// An invented PNG with transparency and a JPEG are opened, one line is
// edited with the image's own letters, and the default export gives back a
// PNG (or JPEG) of the same pixel size: outside the edited line the PNG's
// pixels are identical, transparency included, and the JPEG's are within
// re-encoding noise.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// An invented two-line notice drawn on a transparent background.
function noticePng(){
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const obj=doc.addPage([0,0,300,120],0,{Font:{F:ref}},'0.1 0.1 0.12 rg BT /F 16 Tf 20 80 Td (Order 4417 ready) Tj ET BT /F 12 Tf 20 40 Td (Pick up before 18 June) Tj ET');
 doc.insertPage(-1,obj);const p=doc.loadPage(0),pix=p.toPixmap(mupdf.Matrix.scale(3,3),mupdf.ColorSpace.DeviceRGB,true,true),png=Buffer.from(pix.asPNG());
 pix.destroy();p.destroy();obj.destroy();ref.destroy();font.destroy();doc.destroy();return png;
}
// Pixels of an image file, decoded in the page.
const pixels=(page,bytes)=>page.evaluate(async b64=>{const blob=await (await fetch('data:application/octet-stream;base64,'+b64)).blob(),bmp=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
 const c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);return {width:bmp.width,height:bmp.height,data:[...g.getImageData(0,0,bmp.width,bmp.height).data]};},bytes.toString('base64'));
// Largest difference and count of differing pixels outside `box` (pixels).
function compare(a,b,box){
 let max=0,changed=0,total=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  if(x>=box.x0&&x<box.x1&&y>=box.y0&&y<box.y1)continue;total++;
  const i=(y*a.width+x)*4;let d=0;for(let k=0;k<4;k++)d=Math.max(d,Math.abs(a.data[i+k]-b.data[i+k]));if(d){changed++;max=Math.max(max,d);}
 }
 return {max,changed,total};
}

async function editAndDownload(browser,url,file,from,to){
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 const target=page.locator(`button[aria-label^="Edit detected text: ${from}"]`).first();await target.waitFor({timeout:180000});
 // The edited line's box in page pixels (the page is the picture, one unit per pixel).
 const box=await target.evaluate(b=>{const z=document.querySelector('.artboard').getBoundingClientRect().width/parseFloat(document.querySelector('.artboard-label span:last-child').textContent);return {x0:parseFloat(b.style.left)/z,y0:parseFloat(b.style.top)/z,x1:(parseFloat(b.style.left)+parseFloat(b.style.width))/z,y1:(parseFloat(b.style.top)+parseFloat(b.style.height))/z};});
 await target.click();await page.getByLabel('New text').fill(to);await page.getByRole('button',{name:'Apply'}).click();
 await page.getByText("Edited with the image's own letters",{exact:false}).waitFor({timeout:60000});
 await page.locator('.document-actions .primary').click();
 assert.equal(await page.locator('.modal select').first().inputValue(),'image','the export offers the same kind of file first');
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('.modal .dialog-actions .primary').click()]);
 const out=join(await mkdtemp(join(tmpdir(),'bide-image-')),download.suggestedFilename());await download.saveAs(out);
 const result={name:download.suggestedFilename(),bytes:await readFile(out),box,page};
 assert.deepEqual(errors,[]);return result;
}

test('a PNG or JPEG downloads as the same kind of file, unchanged outside the edit',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const url=server.resolvedUrls.local[0]+'app/',dir=await mkdtemp(join(tmpdir(),'bide-notice-')),png=join(dir,'notice.png');
  await writeFile(png,noticePng());
  // PNG: same size, identical pixels outside the edited line, transparency kept.
  const r=await editAndDownload(browser,url,png,'Order 4417','Order 4471 ready');
  assert.match(r.name,/\.png$/);assert.deepEqual([...r.bytes.subarray(1,4)].map(c=>String.fromCharCode(c)).join(''),'PNG');
  const before=await pixels(r.page,await readFile(png)),after=await pixels(r.page,r.bytes);
  assert.deepEqual([after.width,after.height],[before.width,before.height],'same pixel size');
  const grown={x0:r.box.x0-6,y0:r.box.y0-6,x1:r.box.x1+40,y1:r.box.y1+6},d=compare(before,after,grown);
  assert.equal(d.changed,0,`untouched pixels are identical (${d.changed} of ${d.total} differ, by up to ${d.max})`);
  assert.equal(after.data[3],0,'the transparent background stays transparent');
  // JPEG: made from the same notice on white, re-encoded within noise.
  const jpg=join(dir,'notice.jpg');
  await writeFile(jpg,Buffer.from(await r.page.evaluate(async b64=>{const bmp=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob()),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0);
   const blob=await c.convertToBlob({type:'image/jpeg',quality:.9});return [...new Uint8Array(await blob.arrayBuffer())];},(await readFile(png)).toString('base64'))));
  await r.page.close();
  const j=await editAndDownload(browser,url,jpg,'Order 4417','Order 4471 ready');
  assert.match(j.name,/\.jpg$/);assert.equal(j.bytes[0],0xff);assert.equal(j.bytes[1],0xd8);
  const jb=await pixels(j.page,await readFile(jpg)),ja=await pixels(j.page,j.bytes);
  assert.deepEqual([ja.width,ja.height],[jb.width,jb.height],'same pixel size');
  const jd=compare(jb,ja,{x0:j.box.x0-6,y0:j.box.y0-6,x1:j.box.x1+40,y1:j.box.y1+6});
  assert.ok(jd.max<=24,`outside the edit the JPEG only differs by re-encoding noise (max ${jd.max})`);
  await j.page.close();
 }finally{await browser.close();await server.close();}
});
