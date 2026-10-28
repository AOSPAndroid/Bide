// End-to-end: an image of text exported as a searchable PDF (invisible OCR
// text layer) and as plain text.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const scan=`<body style="margin:0;background:#fbfaf6;font-family:Arial"><div style="padding:50px 60px;font-size:26px;line-height:1.8;color:#222">Quarterly report<br>Revenue grew strongly<br>Invoice total 1284 EUR</div></body>`;

async function exportWith(page,format){
 await page.keyboard.press('Control+k');await page.keyboard.type('Make PDF searchable');await page.keyboard.press('Enter');
 await page.locator('select').filter({has:page.locator('option[value="docx"]')}).selectOption(format);
 assert.equal(await page.getByLabel('Make text searchable').isChecked(),true);
 const label=format==='pdf'?'Export PDF':'Export TXT',button=page.getByRole('button',{name:label});
 await page.waitForFunction(l=>![...document.querySelectorAll('button')].find(b=>b.textContent===l)?.disabled,label,{timeout:120000});
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:300000}),button.click()]);
 const file=join(await mkdtemp(join(tmpdir(),'bide-search-')),download.suggestedFilename());await download.saveAs(file);return readFile(file);
}

test('image pages export as searchable PDF and as text',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:640,height:300}});await shot.setContent(scan);
  const image=join(await mkdtemp(join(tmpdir(),'bide-search-')),'scan.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.getByText(/page added/).waitFor({timeout:60000});

  const pdf=await exportWith(page,'pdf');
  const doc=mupdf.Document.openDocument(pdf,'application/pdf'),p=doc.loadPage(0),text=p.toStructuredText('').asText();p.destroy();doc.destroy();
  assert.match(text,/Quarterly report/);assert.match(text,/Revenue grew strongly/);assert.match(text,/Invoice total 1284 EUR/);
  // The words can be found where they are on the page (search hit near the top-left).
  const doc2=mupdf.Document.openDocument(pdf,'application/pdf'),p2=doc2.loadPage(0),hits=p2.search('Quarterly');
  assert.ok(hits.length===1,'one search hit');const quad=hits[0][0];assert.ok(quad[0]>20&&quad[0]<120&&quad[1]>20&&quad[1]<120,`hit at ${quad}`);
  p2.destroy();doc2.destroy();

  const txt=(await exportWith(page,'txt')).toString('utf8');
  assert.match(txt,/Revenue grew strongly/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('a searchable scan uses fresh image OCR and covers the scanned text when edited',{timeout:300000},async()=>{
 const ink=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),face=ink.addSimpleFont(font);
 const original=ink.addPage([0,0,420,180],0,{Font:{F:face}},'1 1 1 rg 0 0 420 180 re f 0 0 0 rg BT /F 24 Tf 30 125 Td (Total 1 234,56 EUR) Tj ET BT /F 18 Tf 30 65 Td (Contribution 7,80 EUR) Tj ET');ink.insertPage(-1,original);
 const imagePage=ink.loadPage(0),pixels=imagePage.toPixmap(mupdf.Matrix.scale(3,3),mupdf.ColorSpace.DeviceRGB,false,true),image=new mupdf.Image(pixels);
 const scan=new mupdf.PDFDocument(),picture=scan.addImage(image),hidden=scan.addSimpleFont(font);
 const obj=scan.addPage([0,0,420,180],0,{XObject:{Scan:picture},Font:{H:hidden}},'q 420 0 0 180 0 0 cm /Scan Do Q BT /H 18 Tf 3 Tr 30 125 Td (BAD LEGACY OCR 999x) Tj ET');scan.insertPage(-1,obj);
 const output=scan.saveToBuffer(''),bytes=Buffer.from(output.asUint8Array());
 output.destroy();obj.destroy();hidden.destroy();picture.destroy();scan.destroy();image.destroy();pixels.destroy();imagePage.destroy();original.destroy();face.destroy();font.destroy();ink.destroy();
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:'searchable-scan.pdf',mimeType:'application/pdf',buffer:bytes});
  const region=page.locator('.detected-text-overlay button[aria-label*="7,80"]');await region.waitFor({timeout:180000});
  assert.match(await page.locator('.text-detection-bar > span').innerText(),/OCR regions/);
  assert.equal(await page.locator('.detected-text-overlay button[aria-label*="BAD LEGACY"]').count(),0);
  await page.evaluate(()=>{document.querySelector('.ocr-settings').open=true;});
  await page.getByLabel('Text replacement background').selectOption('sampled');
  await page.getByLabel('Edit image text with').selectOption('font');
  await region.click();
  let objects=[];
  for(let n=0;n<240;n++){
   objects=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal())?.pages[0].canvas.objects??[];});
   if(objects.some(o=>o.recognizedKey?.startsWith('ocr:'))&&objects.some(o=>o.name==='Text background patch'))break;
   await page.waitForTimeout(500);
  }
  assert.ok(objects.some(o=>o.name==='Text background patch'),'the scanned letters are covered');
  assert.ok(objects.some(o=>o.recognizedKey?.startsWith('ocr:')&&o.text?.includes('7,80')),JSON.stringify(objects.filter(o=>o.recognizedKey)));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
