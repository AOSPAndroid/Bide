// End-to-end, the core flow on an invented scanned quote (tests/fixtures):
// open, wait for the automatic scan, edit one amount, and keep going. The
// other fields stay tappable at once (no rescan after each edit), the edited
// field shows its new value, editing it again starts from the original
// letters, Undo brings the first reading back, and an explicit Rescan reads
// the edit rather than the old digits under it.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

const fields=page=>page.locator('button[aria-label^="Edit detected text"]').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label').slice('Edit detected text: '.length)));
async function editField(page,from,to){
 await page.locator(`button[aria-label^="Edit detected text: ${from}"]`).first().click();
 await page.getByLabel('New text').fill(to);await page.getByRole('button',{name:'Apply'}).click();
 await page.getByText("Edited with the image's own letters",{exact:false}).last().waitFor({timeout:60000});
 return Date.now();
}
// How long until a field can be tapped again.
async function tappable(page,text,since){
 await page.locator(`button[aria-label^="Edit detected text: ${text}"]`).first().waitFor({timeout:120000});
 return Date.now()-since;
}

test('fields stay live across edits, Undo and Rescan on a scanned quote',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles('tests/fixtures/scanned-quote.pdf');
  await page.locator('button[aria-label^="Edit detected text: 1 947,80"]').first().waitFor({timeout:240000});
  const first=await fields(page);assert.ok(first.length>=12,`the quote was read (${first.length} fields)`);
  // One edit: the next field is tappable straight away, and nothing was rescanned.
  let done=await editField(page,'1 947,80','1 974,80 €');
  const wait=await tappable(page,'3 612,50',done);
  assert.ok(wait<1500,`the next field was tappable ${wait} ms after the edit (a rescan took 4 to 8 s)`);
  const after=await fields(page);
  assert.equal(after.length,first.length,'every field is still there');
  assert.ok(after.some(t=>t.startsWith('1 974,80 €')),`the edited field shows its new text (${after.join(' | ')})`);
  assert.ok(!after.some(t=>t.startsWith('1 947,80')),'the old value is gone from the fields');
  // The same field again: it starts from the page's original letters, and replaces the first edit.
  done=await editField(page,'1 974,80 €','1 999,80 €');await tappable(page,'3 612,50',done);
  const layers=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');await new Promise(r=>setTimeout(r,1500));return (await restoreLocal()).pages[0].canvas.objects.filter(o=>/^Edited text/.test(o.name??'')).map(o=>o.name);});
  assert.deepEqual(layers,['Edited text: 1 999,80 €'],'one edit layer for the field, holding the latest text');
  assert.ok((await fields(page)).some(t=>t.startsWith('1 999,80 €')));
  // Undo shows the previous text at once, twice back to the first reading.
  await page.keyboard.press('Escape');await page.mouse.click(5,450);
  await page.getByRole('button',{name:'Undo (Ctrl Z)'}).click();
  done=Date.now();await tappable(page,'1 974,80 €',done);
  await page.getByRole('button',{name:'Undo (Ctrl Z)'}).click();
  const back=await tappable(page,'1 947,80',Date.now());assert.ok(back<1500,`Undo restored the first reading in ${back} ms`);
  // Redo, then an explicit Rescan: the page's OCR reads the edit, not the digits under it.
  await page.getByRole('button',{name:'Redo (Ctrl Shift Z)'}).click();await tappable(page,'1 974,80 €',Date.now());
  await page.evaluate(()=>document.querySelector('.ocr-settings')?.removeAttribute('open'));
  await page.locator('.text-detection-bar').getByRole('button',{name:'Rescan'}).click();
  await page.waitForFunction(()=>![...document.querySelectorAll('button[aria-label^="Edit detected text"]')].length,null,{timeout:10000}).catch(()=>{});
  await page.locator('button[aria-label^="Edit detected text: 3 612,50"]').first().waitFor({timeout:240000});
  const rescanned=await fields(page);
  assert.ok(rescanned.some(t=>/1 ?974,80/.test(t)),`the rescan reads the edited amount (${rescanned.join(' | ')})`);
  assert.ok(!rescanned.some(t=>/1 ?947,80/.test(t)),'and not the old digits under it');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('a digital PDF line in Helvetica is edited in its metric-compatible face',{timeout:300000},async()=>{
 const {PDFDocument,StandardFonts}=await import('pdf-lib'),{mkdtemp,writeFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 // An invented statement line set in the standard (not embedded) Helvetica.
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),p=pdf.addPage([420,200]);
 p.drawText('Closing balance 3 412,85 EUR',{x:30,y:120,size:14,font});
 const file=join(await mkdtemp(join(tmpdir(),'bide-digital-')),'statement.pdf');await writeFile(file,await pdf.save());
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
  const field=page.locator('button[aria-label^="Edit detected text: Closing balance"]').first();await field.waitFor({timeout:60000});
  await field.click();
  // The line opens as a text layer being edited, its text selected: typing replaces it.
  await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA',null,{timeout:60000});
  await page.keyboard.type('Closing balance 3 421,85 EUR');await page.keyboard.press('Escape');await page.waitForTimeout(1500);
  const layer=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.find(o=>o.type?.toLowerCase()==='textbox');});
  assert.ok(layer,'the line became a text layer');
  assert.equal(layer.text,'Closing balance 3 421,85 EUR');
  assert.equal(layer.fontFamily,'Liberation Sans','Helvetica is replaced by the metric-compatible Liberation Sans, not Lato');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
