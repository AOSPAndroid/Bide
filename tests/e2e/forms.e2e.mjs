// End-to-end: fill a PDF's own form, add a field of bide's own, and export
// the form fillable or flattened.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';import {PDFDocument} from 'pdf-lib';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

async function exportPdf(page,fillable){
 await page.keyboard.press('Control+k');await page.keyboard.type('Export PDF');await page.keyboard.press('Enter');
 const keep=page.getByLabel('Keep form fields fillable');if(fillable)await keep.check();else await keep.uncheck();
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.getByRole('button',{name:'Export PDF'}).click()]);
 const file=join(await mkdtemp(join(tmpdir(),'bide-form-')),'out.pdf');await download.saveAs(file);return readFile(file);
}

test('PDF forms are filled, extended and exported fillable or flattened',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const made=await PDFDocument.create(),pg=made.addPage([420,300]),form=made.getForm();
  form.createTextField('Full name').addToPage(pg,{x:40,y:220,width:200,height:22});form.createCheckBox('Agree').addToPage(pg,{x:40,y:180,width:14,height:14});
  const file=join(await mkdtemp(join(tmpdir(),'bide-form-')),'application.pdf');await writeFile(file,await made.save());
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
  // The PDF's own fields are listed and filled.
  const name=page.getByLabel('Form field Full name');await name.waitFor({timeout:60000});
  await name.fill('Alex Martin');await name.press('Enter');await page.getByLabel('Form field Agree').check();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Form field Agree"]')?.checked===true,null,{timeout:30000});await page.waitForTimeout(1500);
  // A field of bide's own, dragged into place and filled.
  await page.keyboard.press('Control+k');await page.keyboard.type('Add form field: Text');await page.keyboard.press('Enter');
  const box=page.locator('[aria-label="Form field box Text field"]');await box.waitFor();
  const b=await box.boundingBox();await page.mouse.move(b.x+20,b.y+8);await page.mouse.down();await page.mouse.move(b.x+20,b.y+90,{steps:6});await page.mouse.up();
  const moved=await box.boundingBox();assert.ok(moved.y>b.y+60,'dragged down');
  const own=page.getByLabel('Form field Text field');await own.fill('Lyon');await own.press('Enter');await page.waitForTimeout(800);
  // Fillable export keeps every field and value.
  const kept=(await PDFDocument.load(await exportPdf(page,true))).getForm();
  assert.deepEqual(kept.getFields().map(f=>f.getName()).sort(),['Agree','Full name','Text field']);
  assert.equal(kept.getTextField('Full name').getText(),'Alex Martin');assert.equal(kept.getCheckBox('Agree').isChecked(),true);assert.equal(kept.getTextField('Text field').getText(),'Lyon');
  // Flattened export draws the values into the page.
  const flat=await exportPdf(page,false);assert.equal((await PDFDocument.load(flat)).getForm().getFields().length,0);
  const text=mupdf.Document.openDocument(flat,'application/pdf').loadPage(0).toStructuredText('').asText();
  assert.match(text,/Alex Martin/);assert.match(text,/Lyon/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
