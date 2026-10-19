// End-to-end: Find & redact removes personal data from a PDF (export and
// saved project) and burns it out of an image layer.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

async function redactAll(page,expect){
 await page.keyboard.press('Control+k');await page.keyboard.type('Find & redact');await page.keyboard.press('Enter');
 await page.getByRole('checkbox',{name:`Redact ${expect}`}).waitFor({timeout:30000});
 await page.getByRole('button',{name:/^Redact \d+$/}).click();
 await page.getByText(/redacted/).first().waitFor({timeout:60000});
}

test('Find & redact removes personal data from PDFs and images',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 const dir=await mkdtemp(join(tmpdir(),'bide-redact-'));
 try{
  // A PDF with real text.
  {const doc=new mupdf.PDFDocument(),font=doc.addSimpleFont(new mupdf.Font('Helvetica'),'Latin');
   const p=doc.addPage([0,0,420,200],0,{Font:{F:font}},'BT /F 14 Tf 30 150 Td (Email: alex@example.com) Tj ET BT /F 14 Tf 30 110 Td (Keep this line) Tj ET');doc.insertPage(-1,p);
   const file=join(dir,'letter.pdf');await writeFile(file,doc.saveToBuffer('').asUint8Array());
   const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
   await page.waitForFunction(()=>/editable text regions/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:120000});
   await redactAll(page,'alex@example.com');
   await page.waitForTimeout(1500);
   const saved=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=await restoreLocal();return {sources:Object.keys(p.sources).length,data:Object.values(p.sources).join('')};});
   assert.equal(saved.sources,1,'only the redacted PDF is kept in the project');
   const pdf=Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0)),d=mupdf.Document.openDocument(pdf,'application/pdf'),text=d.loadPage(0).toStructuredText('').asText();
   assert.ok(!text.includes('alex'),`email removed: ${JSON.stringify(text)}`);assert.match(text,/Keep this line/);assert.match(text,/Email:/);
   assert.deepEqual(errors,[]);await page.close();}

  // An image: OCR finds the address, redaction burns it out, a rescan no longer reads it.
  {const shot=await browser.newPage({viewport:{width:520,height:140}});
   await shot.setContent('<body style="margin:0;background:#fff"><div style="padding:30px;font:22px Arial;line-height:1.6;color:#111">Contact: alex@example.com<br>Thank you for your order</div></body>');
   const file=join(dir,'mail.png');await shot.screenshot({path:file});await shot.close();
   const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
   await page.locator('button[aria-label*="alex@example.com"]').waitFor({timeout:240000});
   await redactAll(page,'alex@example.com');
   await page.locator('.layer-name',{hasText:/\(redacted\)/}).waitFor({timeout:30000});
   await page.locator('button[aria-label*="Thank you"]').waitFor({timeout:240000});
   assert.equal(await page.locator('button[aria-label*="alex"]').count(),0,'the address cannot be read any more');
   assert.ok(await page.locator('button[aria-label*="Contact"]').count(),'the label beside it stays');
   assert.deepEqual(errors,[]);await page.close();}
 }finally{await browser.close();await server.close();}
});
