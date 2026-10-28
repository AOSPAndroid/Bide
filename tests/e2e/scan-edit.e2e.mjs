// End-to-end on an invented scanned quote (tests/fixtures, built by
// scripts/make-scan-fixture.mjs): edits stay as sharp as the scan around them.
// - A scan carrying the scanner's invisible OCR text layer is read by bide's
//   own OCR (editing that layer used to draw new text over the old digits).
// - Letters reused on a PDF page are cut from a sharp render (they were cut at
//   72 dpi and came out blurred).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

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
  const url=server.resolvedUrls.local[0];
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
