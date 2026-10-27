// End-to-end: text converted on a scanned PDF page gets the softness of the
// scan, not the softness the letters have at the page's 72 dpi units (a crisp
// 300 dpi scan used to get a visible blur). The scan text is invented.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {PDFDocument} from 'pdf-lib';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

async function scannedPdf(browser,blur){
 const shot=await browser.newPage({viewport:{width:595,height:842},deviceScaleFactor:300/72});
 await shot.setContent(`<body style="margin:0;background:#fff;filter:blur(${blur}px)"><div style="padding:60px;font:7pt Arial;color:#222"><p style="font:bold 12pt Arial">Atelier Lumière — relevé trimestriel</p><p>Montant relatif à la maintenance des installations pour le trimestre en cours.</p><p>Total des prestations de conseil et de suivi de chantier.</p></div></body>`);
 const png=await shot.screenshot();await shot.close();
 const pdf=await PDFDocument.create(),image=await pdf.embedPng(png);pdf.addPage([595,842]).drawImage(image,{x:0,y:0,width:595,height:842});
 const file=join(await mkdtemp(join(tmpdir(),'bide-scan-')),`scan-${blur}.pdf`);await writeFile(file,await pdf.save());return file;
}
async function convertedSoftness(browser,url,file){
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 const region=page.locator('button[aria-label^="Edit detected text: Montant"]');await region.waitFor({timeout:240000});
 await page.evaluate(()=>{const d=document.querySelector('.ocr-settings');if(d)d.open=true;});await page.getByLabel('Edit image text with').selectOption('font');
 await region.click();await page.getByText('OCR text is editable',{exact:false}).waitFor({timeout:120000});await page.waitForTimeout(1200);
 const text=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.find(o=>o.text?.startsWith('Montant'));});
 assert.deepEqual(errors,[]);await page.close();return text.textSoftness??0;
}

test('converted text on a scanned PDF keeps the scan\'s sharpness',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const url=server.resolvedUrls.local[0]+'app/';
  const crisp=await convertedSoftness(browser,url,await scannedPdf(browser,0));
  assert.ok(crisp<=.2,`a crisp scan gets almost no blur (was ${crisp} pt, 0.4 before the fix)`);
  // 0.35 CSS px of blur on the scan is 0.35 pt on the page.
  const soft=await convertedSoftness(browser,url,await scannedPdf(browser,.35));
  assert.ok(soft>=.25&&soft<=.5,`a soft scan keeps its softness (${soft} pt)`);
  const blurred=await convertedSoftness(browser,url,await scannedPdf(browser,.8));
  assert.ok(blurred>=.65&&blurred<=1,`stronger scan blur is not clipped (${blurred} pt)`);
 }finally{await browser.close();await server.close();}
});
