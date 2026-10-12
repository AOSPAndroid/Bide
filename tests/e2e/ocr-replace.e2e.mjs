// End-to-end: import a raster image, let local OCR detect its text, replace one
// region and check that an editable text layer and a background patch appear.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

function fixture(){
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const obj=doc.addPage([0,0,420,200],0,{Font:{F:ref}},'1 1 1 rg 0 0 420 200 re f 0.1 0.1 0.1 rg BT /F 22 Tf 30 140 Td (Quarterly report) Tj ET 0.1 0.3 0.7 rg BT /F 14 Tf 30 80 Td (Revenue grew strongly) Tj ET');
 doc.insertPage(-1,obj);const page=doc.loadPage(0),pix=page.toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true),png=Buffer.from(pix.asPNG());
 pix.destroy();page.destroy();obj.destroy();ref.destroy();font.destroy();doc.destroy();return png;
}

// Record every status-bar text from page load: scans can finish between polls.
const recordStatuses=page=>page.addInitScript(()=>{window.__statuses=[];new MutationObserver(()=>{const t=document.querySelector('.text-detection-bar span')?.textContent;if(t&&window.__statuses.at(-1)!==t)window.__statuses.push(t);}).observe(document,{subtree:true,childList:true,characterData:true});});
const sawStatus=(page,pattern)=>page.waitForFunction(source=>window.__statuses.some(t=>new RegExp(source).test(t)),pattern.source,{timeout:120000}).catch(async e=>{throw new Error(e.message+' statuses: '+JSON.stringify(await page.evaluate(()=>window.__statuses)));});

test('OCR text on an imported image becomes an editable layer',{timeout:240000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bide-e2e-')),image=join(dir,'scan.png');await writeFile(image,fixture());
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await recordStatuses(page);
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await sawStatus(page,/Recognizing text( \(AI\))?… \d+%/);
  const region=page.locator('button[aria-label^="Edit detected text: Quarterly"]');
  await region.waitFor({timeout:180000});
  assert.ok(await page.locator('button[aria-label^="Edit detected text: Revenue"]').count(),'second line detected');
  await page.waitForFunction(()=>/closest font: /.test(document.querySelector('.text-detection-bar')?.textContent||''),null,{timeout:60000});
  assert.equal(await page.getByLabel('OCR replacement font').inputValue(),'Liberation Sans','Helvetica scan suggests its metric twin');
  // The thorough sparse-text pass belongs to the standard (Tesseract) engine.
  await page.getByLabel('OCR engine').selectOption('tesseract');
  await page.getByLabel('OCR scan depth').selectOption('thorough');
  await sawStatus(page,/Thorough pass… \d+%/);
  await region.waitFor({timeout:120000});
  assert.equal(await page.locator('button[aria-label^="Edit detected text: Quarterly"]').count(),1,'second pass adds no duplicates');
  await page.getByLabel('Text replacement background').selectOption('sampled');
  await region.click();
  await page.getByText('OCR text is editable',{exact:false}).waitFor({timeout:30000});
  await page.locator('button[aria-label^="Edit detected text: Quarterly"]').waitFor({state:'detached'});
  const layers=await page.locator('body').innerText();
  assert.match(layers,/Text background patch/);assert.match(layers,/Quarterly report/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('enabling German re-scans with the German model',{timeout:240000},async()=>{
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font,'Latin');
 const obj=doc.addPage([0,0,460,120],0,{Font:{F:ref}},'1 1 1 rg 0 0 460 120 re f 0.1 0.1 0.1 rg BT /F 20 Tf 20 70 Td (Gr\\366\\337ere \\334bungen f\\374r Stra\\337enbahnen) Tj ET');
 doc.insertPage(-1,obj);const pix=doc.loadPage(0).toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true);
 const dir=await mkdtemp(join(tmpdir(),'bide-e2e-')),image=join(dir,'german.png');await writeFile(image,Buffer.from(pix.asPNG()));
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  // Tesseract's language models are what this test exercises (AI OCR covers Latin languages at once).
  await page.getByLabel('OCR engine').selectOption('tesseract');
  await page.waitForFunction(()=>/English \+ Français · /.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:180000});
  await page.locator('button[aria-label^="Edit detected text: Gr"]').waitFor({timeout:180000});
  assert.equal(await page.locator('button[aria-label*="Straßenbahnen"]').count(),0,'English + French misreads ß');
  await page.getByLabel('OCR languages').click();await page.getByLabel('OCR language Deutsch').check();
  await page.locator('button[aria-label*="Größere Übungen für Straßenbahnen"]').waitFor({timeout:180000});
  assert.match(await page.locator('.text-detection-bar').innerText(),/English \+ Français \+ Deutsch/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('a bold label and a regular value on one line keep their own weights',{timeout:240000},async()=>{
 const doc=new mupdf.PDFDocument(),regular=doc.addSimpleFont(new mupdf.Font('Helvetica'),'Latin'),bold=doc.addSimpleFont(new mupdf.Font('Helvetica-Bold'),'Latin');
 const obj=doc.addPage([0,0,420,80],0,{Font:{R:regular,B:bold}},'1 1 1 rg 0 0 420 80 re f 0.1 0.1 0.1 rg BT /B 18 Tf 20 35 Td (Nom du client:) Tj /R 18 Tf ( Dalil REDOUANE) Tj ET');
 doc.insertPage(-1,obj);const pix=doc.loadPage(0).toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true);
 const dir=await mkdtemp(join(tmpdir(),'bide-e2e-')),image=join(dir,'mixed.png');await writeFile(image,Buffer.from(pix.asPNG()));
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  const region=page.locator('button[aria-label^="Edit detected text: Nom du client: Dalil"]');await region.waitFor({timeout:180000});
  // The confirmation toast is brief; the saved text layer below is the real check.
  await region.click();
  // Read the saved text layer and the weight of every character.
  const read=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const o=(await restoreLocal())?.pages[0].canvas.objects.find(o=>o.recognizedKey?.startsWith('ocr:'));if(!o)return null;
   const at=i=>{const s=o.styles;if(Array.isArray(s)){for(const r of s)if(i>=r.start&&i<r.end&&r.style?.fontWeight)return r.style.fontWeight;return o.fontWeight;}return s?.[0]?.[i]?.fontWeight??o.fontWeight;};
   return {text:o.text,weights:Array.from(o.text).map((_,i)=>at(i)==='bold'?'B':'r').join('')};});
  let weights=null;for(let i=0;i<60&&!weights;i++){weights=await read();if(!weights)await page.waitForTimeout(500);}
  assert.equal(weights.text,'Nom du client: Dalil REDOUANE');
  assert.match(weights.weights,/^B{14}.r{14}$/,'label bold, value regular: '+weights.weights);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
