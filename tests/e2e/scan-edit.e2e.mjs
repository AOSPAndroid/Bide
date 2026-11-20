// End-to-end on an invented scanned quote (tests/fixtures, built by
// scripts/make-scan-fixture.mjs): edits stay as sharp as the scan around them.
// - A scan carrying the scanner's invisible OCR text layer is read by bide's
//   own OCR (editing that layer used to draw new text over the old digits).
// - Letters reused on a PDF page are cut from a sharp render (they were cut at
//   72 dpi and came out blurred).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {PDFDocument} from 'pdf-lib';import * as mupdf from 'mupdf';import {readFile} from 'node:fs/promises';

// Edge width (px of ink-to-paper transition) of a line on screen at 300%.
async function edgeAt(page,b){
 const at=await page.evaluate(([b])=>{const a=document.querySelector('.artboard'),r=a.getBoundingClientRect(),z=r.width/595,ws=document.querySelector('.canvas-workspace'),w=ws.getBoundingClientRect();
  ws.scrollTop+=r.top+b.top*z-w.top-200;ws.scrollLeft+=r.left+b.left*z-w.left-100;const r2=a.getBoundingClientRect();
  return {x:r2.left+b.left*z-6,y:r2.top+b.top*z-6,width:b.width*z+12,height:b.height*z+12};},[b]);
 await page.waitForTimeout(800);
 const png=await page.screenshot({clip:{x:Math.max(0,at.x),y:Math.max(0,at.y),width:Math.min(1300,at.width),height:at.height}});
 return page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
  const {edgeWidth}=await import('/src/ocr-image.ts'),d=g.getImageData(0,0,c.width,c.height);return edgeWidth({data:d.data,width:c.width,height:c.height},{x0:0,y0:0,x1:c.width,y1:c.height},[250,250,250]);},png.toString('base64'));
}
// A detected line's box in page units.
const lineBox=(page,text)=>page.evaluate(([text])=>{const b=[...document.querySelectorAll('button[aria-label^="Edit detected text"]')].find(x=>x.getAttribute('aria-label').includes(text));if(!b)return null;
 const z=document.querySelector('.artboard').getBoundingClientRect().width/595;return {left:parseFloat(b.style.left)/z,top:parseFloat(b.style.top)/z,width:parseFloat(b.style.width)/z,height:parseFloat(b.style.height)/z,title:b.title};},[text]);

async function editAmount(browser,url,file,from,to){
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(`tests/fixtures/${file}`);
 await page.locator(`button[aria-label*="${from}"]`).first().waitFor({timeout:240000});
 const edited=await lineBox(page,from),reference=await lineBox(page,'3 612,50');
 await page.locator(`button[aria-label*="${from}"]`).first().click();
 await page.getByLabel('New text').fill(to);await page.getByRole('button',{name:'Apply'}).click();
 await page.getByText("Edited with the image's own letters",{exact:false}).waitFor({timeout:60000});
 await page.keyboard.press('Escape');await page.waitForTimeout(1500);
 const layer=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.find(o=>/^Edited text/.test(o.name??''));});
 const zoom=page.getByLabel('Zoom percentage');await zoom.fill('300');await zoom.press('Enter');await page.waitForTimeout(2500);
 const result={title:edited.title,layer,edited:await edgeAt(page,edited),reference:await edgeAt(page,reference)};
 assert.deepEqual(errors,[]);await page.close();return result;
}

test('edits on a scanned quote are as sharp as the scan, with or without its OCR text layer',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const url=server.resolvedUrls.local[0]+'app/';
  for(const file of ['scanned-quote-ocr-layer.pdf','scanned-quote.pdf']){
   const r=await editAmount(browser,url,file,'1 947,80','1 974,80 €');
   assert.match(r.title,/OCR/,`${file}: the line is read by OCR, not taken from the invisible layer (${r.title})`);
   assert.ok(r.layer&&r.layer.scaleX<1,`${file}: letters are cut from a render finer than the page units (scale ${r.layer?.scaleX})`);
   assert.ok(r.edited<=r.reference*1.3,`${file}: the edited line is not blurrier than the scan (edge ${r.edited} vs ${r.reference})`);
   // The bold total, larger type.
   const t=await editAmount(browser,url,file,'18 330,00','18 330,80 €');
   assert.ok(t.edited<=t.reference*1.3+.3,`${file}: the edited total is not blurrier (edge ${t.edited} vs ${t.reference})`);
  }
 }finally{await browser.close();await server.close();}
});

// Independent 300 dpi source pixels, with an identical untouched line. Large
// letters used to be cut at only 72/144 dpi despite the crisp scan around them.
async function largeScan(browser,size){
 const shot=await browser.newPage();
 try{
  const source=await shot.evaluate(size=>{const k=300/72,c=document.createElement('canvas');c.width=Math.ceil(595*k);c.height=Math.ceil(400*k);const g=c.getContext('2d');g.scale(k,k);g.fillStyle='#fff';g.fillRect(0,0,595,400);g.fillStyle='#000';g.font=`${size}px Arial`;const text='18 404,49 €';g.fillText(text,40,100);g.fillText(text,40,200);const m=g.measureText(text);return {png:c.toDataURL('image/png').split(',')[1],box:{left:40-m.actualBoundingBoxLeft,top:100-m.actualBoundingBoxAscent,width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent}};},size);
  const pdf=await PDFDocument.create(),image=await pdf.embedPng(Buffer.from(source.png,'base64'));pdf.addPage([595,400]).drawImage(image,{x:0,y:0,width:595,height:400});return {pdf:Buffer.from(await pdf.save()),box:source.box};
 }finally{await shot.close();}
}
// The fraction of transition pixels per ink-outline pixel, without using the
// application's image/letter renderer to measure its own output.
function transitionWidth(data,width,height,channels,b){
 const x0=Math.max(1,Math.floor(b.left)),y0=Math.max(1,Math.floor(b.top)),x1=Math.min(width-1,Math.ceil(b.left+b.width)),y1=Math.min(height-1,Math.ceil(b.top+b.height));let partial=0,outline=0;
 const coverage=(x,y)=>{const i=(y*width+x)*channels;return (255-Math.min(data[i],data[i+1],data[i+2]))/255;};
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const v=coverage(x,y);if(v>=.2&&v<=.8)partial++;if(v>=.5&&Math.min(coverage(x-1,y),coverage(x+1,y),coverage(x,y-1),coverage(x,y+1))<.5)outline++;}
 assert.ok(outline>100,'the independent measurement contains the amount’s ink');return partial/outline;
}
function pdfRaster(bytes){const doc=mupdf.Document.openDocument(bytes,'pdf'),page=doc.loadPage(0),pix=page.toPixmap(mupdf.Matrix.scale(300/72,300/72),mupdf.ColorSpace.DeviceRGB,false,true);try{return {width:pix.getWidth(),height:pix.getHeight(),channels:pix.getNumberOfComponents(),data:new Uint8Array(pix.getPixels())};}finally{pix.destroy();page.destroy();doc.destroy();}}
const pdfEdge=(r,b)=>{const k=300/72;return transitionWidth(r.data,r.width,r.height,r.channels,{left:b.left*k-4,top:b.top*k-4,width:b.width*k+8,height:b.height*k+8});};
async function largeScreenEdge(page,b){
 await page.evaluate(b=>{const a=document.querySelector('.artboard').getBoundingClientRect(),z=a.width/595,w=document.querySelector('.canvas-workspace'),r=w.getBoundingClientRect();w.scrollTop+=a.top+b.top*z-r.top-150;w.scrollLeft+=a.left+b.left*z-r.left-50;document.querySelector('.detected-text-overlay').style.visibility='hidden';},b);
 try{
  const clip=await page.evaluate(b=>{const a=document.querySelector('.artboard').getBoundingClientRect(),z=a.width/595;return {x:a.left+b.left*z-4,y:a.top+b.top*z-4,width:b.width*z+8,height:b.height*z+8};},b);
  const png=await page.screenshot({clip});
  return page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const {data,width,height}=g.getImageData(0,0,c.width,c.height);let partial=0,outline=0;const coverage=(x,y)=>{const i=(y*width+x)*4;return (255-Math.min(data[i],data[i+1],data[i+2]))/255;};for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const v=coverage(x,y);if(v>=.2&&v<=.8)partial++;if(v>=.5&&Math.min(coverage(x-1,y),coverage(x+1,y),coverage(x,y-1),coverage(x,y+1))<.5)outline++;}if(!outline)throw new Error('No amount in the screen crop');return partial/outline;},png.toString('base64'));
 }finally{await page.evaluate(()=>document.querySelector('.detected-text-overlay').style.visibility='');}
}
async function rawPatchEdge(page,patch){
 return page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const g=c.getContext('2d');g.drawImage(image,0,0);const {data,width,height}=g.getImageData(0,0,c.width,c.height);let partial=0,outline=0;const coverage=(x,y)=>{const i=(y*width+x)*4;return (255-Math.min(data[i],data[i+1],data[i+2]))/255;};for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const v=coverage(x,y);if(v>=.2&&v<=.8)partial++;if(v>=.5&&Math.min(coverage(x-1,y),coverage(x+1,y),coverage(x,y-1),coverage(x,y+1))<.5)outline++;}if(outline<100)throw new Error('No amount in the raw letter patch');return partial/outline;},patch.src);
}

test('large scanned PDF amounts keep their source sharpness on screen and in a 300 dpi download',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  for(const size of [24,32]){
   const fixture=await largeScan(browser,size),context=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:`invented-large-${size}.pdf`,mimeType:'application/pdf',buffer:fixture.pdf});
    const field=page.getByRole('button',{name:'Edit detected text: 18 404,49 €',exact:true});await field.first().waitFor({timeout:180000});assert.equal(await field.count(),2,'both independently drawn amounts are recognized');assert.match(await field.first().getAttribute('title'),/OCR/);
    await page.waitForFunction(()=>document.querySelector('.text-detection-bar > span')?.textContent.includes('AI OCR'),null,{timeout:120000});
    await field.first().click();assert.equal(await page.getByLabel('New text').inputValue(),'18 404,49 €');await page.getByLabel('New text').fill('18 440,49 €');await page.getByRole('button',{name:'Apply',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:120000});
    let saved,patch;const deadline=Date.now()+60000;
    while(Date.now()<deadline){saved=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return restoreLocal();});patch=saved?.pages[0].canvas.objects.find(o=>o.editedText==='18 440,49 €');if(patch)break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(patch,'the actual edited letter patch is persisted');assert.equal(saved.pages[0].canvas.objects.filter(o=>/textbox/i.test(o.type)).length,0,'the edit never substitutes a font');
    assert.ok(1/patch.scaleX>=300/72-.001&&1/patch.scaleY>=300/72-.001,'the patch retains the source 300 dpi pixel density');const raw=await rawPatchEdge(page,patch);
    const zoom=page.getByLabel('Zoom percentage');await zoom.fill('300');await zoom.press('Enter');await page.waitForFunction(()=>{const a=document.querySelector('.artboard'),p=document.querySelector('.pdf-background');return Math.abs(a.getBoundingClientRect().width/595-3)<.01&&p?.complete&&p.naturalWidth>=1785;},null,{timeout:30000});
    const editedScreen=await largeScreenEdge(page,fixture.box),referenceScreen=await largeScreenEdge(page,{...fixture.box,top:fixture.box.top+100});assert.ok(editedScreen<=referenceScreen*1.3,`${size} pt: screen edge ${editedScreen} vs untouched ${referenceScreen}`);
    await page.locator('.document-actions .primary').click();assert.equal(await page.locator('.modal select').first().inputValue(),'pdf');const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('.modal .dialog-actions .primary').click()]);const original=pdfRaster(fixture.pdf),exported=pdfRaster(await readFile(await download.path()));await download.delete();
    assert.deepEqual([exported.width,exported.height,exported.channels],[original.width,original.height,original.channels]);const before=pdfEdge(original,fixture.box),after=pdfEdge(exported,fixture.box),reference=pdfEdge(exported,{...fixture.box,top:fixture.box.top+100});assert.ok(raw<=before*1.3,`${size} pt: raw patch edge ${raw} vs original ${before}`);
    // Equivalent PDF image matrices can land either side of a device-pixel
    // boundary after float rounding. Bound that subpixel transition in output
    // pixels, rather than a ratio of a razor-thin (<1 px) source edge. The old
    // 72/144 dpi patches added 0.60/1.52 px and fail this independent bound.
    assert.ok(after<=before+.3,`${size} pt: downloaded edge ${after} vs original ${before}`);assert.ok(after<=reference+.3,`${size} pt: downloaded edge ${after} vs untouched ${reference}`);
    const k=300/72,b=fixture.box;let inside=0,outside=0;
    for(let y=0;y<original.height;y++)for(let x=0;x<original.width;x++){const at=(y*original.width+x)*original.channels;if([0,1,2].some(c=>original.data[at+c]!==exported.data[at+c])){if(x>=(b.left-4)*k&&x<(b.left+b.width+4)*k&&y>=(b.top-4)*k&&y<(b.top+b.height+4)*k)inside++;else outside++;}}
    assert.ok(inside>0,'the requested amount changed');assert.equal(outside,0,'every pixel outside the edited field is preserved');assert.deepEqual(errors,[]);console.log(`# ${size} pt source/raw/edit/reference edges: ${before}/${raw}/${after}/${reference}; screen ${editedScreen}/${referenceScreen}; changed ${inside} inside, ${outside} outside`);
   }finally{await context.close();}
  }
 }finally{await browser.close();await server.close();}
});
