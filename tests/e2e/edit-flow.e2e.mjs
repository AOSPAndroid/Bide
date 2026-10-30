// End-to-end, the core flow on an invented scanned quote (tests/fixtures):
// open, wait for the automatic scan, edit one amount, and keep going. The
// other fields stay tappable at once (no rescan after each edit), the edited
// field shows its new value, editing it again starts from the original
// letters, Undo brings the first reading back, and an explicit Rescan reads
// the edit rather than the old digits under it.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';

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

test('native PDF text edits in place by default; unavailable new glyphs require an explicit replacement font',{timeout:300000},async()=>{
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
  const state=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');await new Promise(r=>setTimeout(r,1000));const p=await restoreLocal();return {source:p.pages[0].source,sources:p.sources,canvas:p.pages[0].canvas};});
  const before=await state();await field.click();
  assert.equal(await page.getByLabel('New text').inputValue(),'Closing balance 3 412,85 EUR');
  await page.getByLabel('New text').fill('Closing balance 3 421,85 EUR');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByText("Edited in the PDF's own font.",{exact:false}).last().waitFor({timeout:60000});
  await page.locator('button[aria-label^="Edit detected text: Closing balance 3 421,85 EUR"]').first().waitFor({timeout:60000});
  const inPlace=await state();assert.notEqual(inPlace.source,before.source,'the native PDF source was rewritten');
  assert.deepEqual(inPlace.canvas.objects,before.canvas.objects,'an in-place edit adds no text box or image patch');
  // Helvetica can draw the new digits itself, but cannot draw this character.
  // Refusal leaves the source intact and keeps exactly what was typed.
  await field.click();const typed='Closing balance 3 421,85 EUR Ω';await page.getByLabel('New text').fill(typed);
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.locator('.lettering-refusal').getByText(/Ω/).waitFor();assert.equal(await page.getByRole('dialog',{name:'Something needs your attention'}).count(),0,'said in the edit dialog, not a separate box');
  assert.deepEqual(await state(),inPlace,'the unsupported in-place edit leaves the native PDF and layers untouched');
  assert.equal(await page.getByLabel('New text').inputValue(),typed);
  await page.getByRole('dialog',{name:'Edit PDF text'}).getByRole('button',{name:'Cancel',exact:true}).click();
  // Native-only pages expose the same explicit New font choice as scans.
  await page.locator('.ocr-settings').evaluate(e=>e.setAttribute('open',''));
  await page.getByLabel('Edit image text with').selectOption('font');
  await page.locator('.ocr-settings').evaluate(e=>e.removeAttribute('open'));
  await field.click();await page.getByLabel('New text').fill(typed);
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.activeElement.value),typed,'explicit New font fallback passes along the current dialog value');
  await page.keyboard.press('Escape');
  // Autosave runs 0.9 s after the last change; under load it can take longer than a fixed wait.
  let layer;for(let i=0;i<30&&layer?.text!==typed;i++){await page.waitForTimeout(500);layer=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal())?.pages[0].canvas.objects.find(o=>o.type?.toLowerCase()==='textbox');});}
  assert.ok(layer,'the explicitly permitted line became a text layer');
  assert.equal(layer.text,typed);
  assert.equal(layer.fontFamily,'Liberation Sans','explicit Helvetica replacement uses the metric-compatible Liberation Sans');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});


test('unsupported embedded PDF glyphs keep the typed text and font, and block export even inside groups',{timeout:300000},async()=>{
 const mupdf=await import('mupdf'),{mkdtemp,readFile,writeFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const bytes=new Uint8Array(await readFile('src/browser/fonts/LiberationSans-Regular.ttf')),pdf=new mupdf.PDFDocument(),font=new mupdf.Font('LiberationSans',bytes),ref=pdf.addSimpleFont(font);
 const p=pdf.addPage([0,0,420,200],0,{Font:{F1:ref}},'BT /F1 18 Tf 30 100 Td (Embedded sample) Tj ET');pdf.insertPage(-1,p);const buffer=pdf.saveToBuffer('');
 const file=join(await mkdtemp(join(tmpdir(),'bide-embedded-')),'embedded.pdf');await writeFile(file,buffer.asUint8Array());buffer.destroy();p.destroy();ref.destroy();font.destroy();pdf.destroy();
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[],downloads=[];page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
  const layer=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');await new Promise(r=>setTimeout(r,1000));return (await restoreLocal()).pages[0].canvas.objects.find(o=>o.type?.toLowerCase()==='textbox');});
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
  await page.locator('button[aria-label^="Edit detected text: Embedded sample"]').first().click({timeout:60000});
  assert.equal(await page.getByLabel('New text').inputValue(),'Embedded sample');
  await page.getByRole('button',{name:'New font text box',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA',null,{timeout:60000});
  const original=await layer();assert.match(original.fontFamily,/^PDFfont-/,'the initial edit uses the embedded PDF font');
  // Global New font may allow a later edit to start with a replacement; it must
  // never silently change the already selected embedded face after typing.
  await page.keyboard.type('Embedded sample 🧑');await page.keyboard.press('Escape');
  await page.getByRole('dialog',{name:'Something needs your attention'}).getByText(/embedded PDF font does not contain/).waitFor();
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  const typed=await layer();assert.equal(typed.text,'Embedded sample 🧑');assert.equal(typed.fontFamily,original.fontFamily);assert.equal(typed.pdfFontData,original.pdfFontData);
  await page.locator('.ocr-settings').evaluate(e=>e.setAttribute('open',''));await page.getByLabel('Edit image text with').selectOption('font');await page.locator('.ocr-settings').evaluate(e=>e.removeAttribute('open'));
  // The actual download action refuses instead of silently substituting a font.
  await page.locator('.document-actions .primary').click();await page.locator('.modal .dialog-actions .primary').click();
  await page.getByRole('dialog',{name:'Something needs your attention'}).getByText(/choose Font family explicitly before exporting/).waitFor();
  assert.equal(downloads.length,0);assert.deepEqual(await layer(),typed,'failed export leaves the typed text and font untouched');await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.getByRole('dialog',{name:'Export document'}).getByRole('button',{name:'Close dialog',exact:true}).click();
  // Groups go through the same export guard, including nested groups.
  const grouped=await page.evaluate(async()=>{
   const {restoreLocal}=await import('/src/model.ts'),{exportPayload}=await import('/src/project-io.ts');const current=await restoreLocal(),copy=structuredClone(current);
   const group=objects=>({type:'Group',left:0,top:0,width:420,height:200,objects});copy.pages[0].canvas={objects:[group([group(copy.pages[0].canvas.objects)])]};const before=JSON.stringify(copy);let message='';try{await exportPayload(copy);}catch(e){message=e.message;}return {message,unchanged:JSON.stringify(copy)===before};
  });assert.match(grouped.message,/choose Font family explicitly before exporting/);assert.equal(grouped.unchanged,true);
  // Removing the unsupported character repairs export without changing the face.
  await page.getByLabel('Text content').fill('Embedded sample updated');await page.waitForTimeout(1200);assert.equal((await layer()).fontFamily,original.fontFamily);
  await page.locator('.document-actions .primary').click();const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('.modal .dialog-actions .primary').click()]);assert.match(download.suggestedFilename(),/\.pdf$/);
  assert.equal((await layer()).fontFamily,original.fontFamily);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test("a scanned PDF's own invisible text follows the edit in the download",{timeout:600000},async()=>{
 const mupdf=await import('mupdf'),{mkdtemp,readFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const textOf=bytes=>{const doc=mupdf.Document.openDocument(bytes,'application/pdf'),page=doc.loadPage(0),t=page.toStructuredText().asText();page.destroy();doc.destroy();return t.replace(/\s+/g,' ');};
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const original=textOf(await readFile('tests/fixtures/scanned-quote-ocr-layer.pdf'));
  assert.match(original,/1 947,80/,'the fixture carries a scanner text layer');
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles('tests/fixtures/scanned-quote-ocr-layer.pdf');
  await page.locator('button[aria-label^="Edit detected text: 1 947,80"]').first().waitFor({timeout:240000});
  await editField(page,'1 947,80','1 974,80 €');await page.waitForTimeout(800);
  await page.locator('.document-actions .primary').click();
  assert.equal(await page.locator('.modal select').first().inputValue(),'pdf');
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('.modal .dialog-actions .primary').click()]);
  const file=join(await mkdtemp(join(tmpdir(),'bide-layer-')),download.suggestedFilename());await download.saveAs(file);
  const text=textOf(await readFile(file));
  assert.match(text,/1 974,80/,'search and copy find the new amount');
  assert.doesNotMatch(text,/1 947,80/,'and no longer the old one');
  const words=s=>s.trim().split(/\s+/).sort();
  assert.deepEqual(words(text),words(original.replace('1 947,80','1 974,80')),'the download contains exactly the original scanner words with the one edited amount replaced: no leftover or doubled prefix');
  for(const word of ['3 612,50','12 480,00','289,70','RÉCAPITULATIF','Électricité'])assert.ok(text.includes(word),`the rest of the scanner's text is kept (${word})`);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('an edit needing a letter the line lacks says which, and a font can then be chosen for that line',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles('tests/fixtures/scanned-quote.pdf');
  const field=page.locator('button[aria-label^="Edit detected text: 289,70"]').first();await field.waitFor({timeout:240000});
  const mode=page.getByLabel('Edit image text with');assert.equal(await mode.inputValue(),'letters','original letters is the default');
  const canvasState=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas;});
  await field.click();const input=page.getByLabel('New text');
  // "289,70 €" has no 5: its own letters cannot write "289,75 €".
  await input.fill('289,75 €');await page.getByRole('button',{name:'Apply',exact:true}).click();
  const refusal=page.locator('.lettering-refusal');await refusal.waitFor({timeout:60000});
  assert.match(await refusal.innerText(),/“5” does not appear in this line/);
  assert.equal(await input.inputValue(),'289,75 €','the typed text is kept');
  assert.equal(await page.getByRole('dialog',{name:'Something needs your attention'}).count(),0,'no separate error box');
  // The explicit choice uses the current input, including changes after the refusal.
  const latest='289,57 €';await input.fill(latest);
  await page.getByRole('button',{name:'Use a font for this edit'}).click();
  await page.getByText('This line is now text in the OCR font',{exact:false}).waitFor({timeout:60000});
  // Read the resolved autosave state: waitForFunction treats an async predicate's
  // Promise as truthy before the IndexedDB read has returned its condition.
  const savedBy=Date.now()+30000;let persisted=false;
  while(!persisted&&Date.now()<savedBy){
   persisted=(await canvasState()).objects.some(o=>o.type?.toLowerCase()==='textbox'&&o.text===latest);
   if(!persisted)await page.waitForTimeout(200);
  }
  assert.ok(persisted,'autosave contains the current explicitly permitted text');
  const layers=(await canvasState()).objects.filter(o=>o.type?.toLowerCase()==='textbox').map(o=>o.text);
  assert.deepEqual(layers,[latest]);
  assert.equal(await mode.inputValue(),'letters','font consent applies only to this line and does not change the global mode');
  // Another field still refuses a missing letter instead of inheriting that font consent.
  const beforeLater=await canvasState(),next='1 947,85 €';
  await page.locator('button[aria-label^="Edit detected text: 1 947,80"]').first().click({timeout:60000});
  await page.getByLabel('New text').fill(next);await page.getByRole('button',{name:'Apply',exact:true}).click();
  await refusal.waitFor({timeout:60000});assert.match(await refusal.innerText(),/“5” does not appear in this line/);
  assert.equal(await page.getByLabel('New text').inputValue(),next,'the next refused edit also retains current input');
  assert.deepEqual(await canvasState(),beforeLater,'a per-line font choice cannot silently replace another field or alter the earlier edit');
  assert.equal(await mode.inputValue(),'letters');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});


test('a line set in a font takes the grey of the original ink, not a lighter one',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  // An invented page in grey ink, rendered at 200 dpi as a scanner would.
  const shot=await browser.newPage({viewport:{width:420,height:260},deviceScaleFactor:200/72});
  await shot.setContent(`<body style="margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#4d4d4d"><div style="padding:30px 40px;font-size:10px;line-height:2.4">
   <div style="display:flex;justify-content:space-between"><span>Annual charge before tax</span><span>17 950,24 €</span></div>
   <div style="display:flex;justify-content:space-between"><span>Service fee</span><span>447,75 €</span></div>
   <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;color:#222"><span>Total</span><span>18 404,49 €</span></div></div>`);
  const dir=await mkdtemp(join(tmpdir(),'grey-ink-')),file=join(dir,'grey-page.png');await writeFile(file,await shot.screenshot());await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
  const field=page.locator('button[aria-label^="Edit detected text: 17 950,24"]').first();await field.waitFor({timeout:240000});
  // The line has no 6, so the edit needs a font, chosen explicitly.
  await field.click();await page.getByLabel('New text').fill('17 654,24 €');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Use a font for this edit'}).click();
  await page.getByText('This line is now text in the OCR font',{exact:false}).waitFor({timeout:60000});
  // Autosave may be delayed under the full suite: await the resolved saved
  // layer rather than assuming a fixed delay has elapsed.
  const savedBy=Date.now()+30000;let fills=[];
  while(!fills.length&&Date.now()<savedBy){
   fills=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal())?.pages[0].canvas.objects.filter(o=>o.type?.toLowerCase()==='textbox').map(o=>o.fill)??[];});
   if(!fills.length)await page.waitForTimeout(200);
  }
  assert.equal(fills.length,1);
  const level=parseInt(fills[0].slice(1,3),16);
  assert.ok(Math.abs(level-0x4d)<=2,`the font text is #4d4d4d like the original ink (got ${fills[0]})`);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('a PDF bundled replacement refuses missing glyphs before changing the source; later styled and grouped text cannot lose glyphs on export',{timeout:600000},async()=>{
 const {default:PDFKit}=await import('pdfkit');
 const bytes=await new Promise(resolve=>{const doc=new PDFKit({size:'A4'}),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.registerFont('L','src/browser/fonts/weights/Roboto-Light.ttf');doc.font('L').fontSize(26).text('Lumina Air',60,128,{lineBreak:false});doc.end();});
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[],downloads=[];page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
  const project=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return restoreLocal();});
  const saved=async predicate=>{const until=Date.now()+30000;let p;while(Date.now()<until){p=await project();if(p&&predicate(p))return p;await page.waitForTimeout(200);}assert.fail('the expected project state was not saved');};
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:'invented-light-receipt.pdf',mimeType:'application/pdf',buffer:bytes});
  const field=page.locator('button[aria-label="Edit detected text: Lumina Air"]');await field.waitFor({timeout:120000});
  const original=await saved(p=>!!p.pages[0].source),before={source:original.pages[0].source,sources:original.sources,canvas:original.pages[0].canvas};
  const state=async()=>{const p=await project();return {source:p.pages[0].source,sources:p.sources,canvas:p.pages[0].canvas};};
  await field.click();await page.getByLabel('New text').fill('Omega Ω');await page.getByRole('button',{name:'Apply',exact:true}).click();await page.locator('.lettering-refusal').waitFor();
  assert.deepEqual(await state(),before,'default refusal leaves the PDF and layers intact');
  await page.getByRole('button',{name:'New font text box',exact:true}).click();
  await page.locator('.lettering-refusal').getByText(/selected Roboto Light font cannot draw/).waitFor({timeout:60000});
  assert.equal(await page.getByLabel('New text').inputValue(),'Omega Ω');assert.deepEqual(await state(),before,'even explicit replacement keeps the original intact when its selected face lacks a glyph');
  assert.equal(await page.getByLabel('Edit image text with').inputValue(),'letters');
  await page.getByLabel('New text').fill('Borealis Air');await page.getByRole('button',{name:'New font text box',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA',null,{timeout:60000});await page.keyboard.press('Escape');
  const valid=await saved(p=>p.pages[0].canvas.objects.some(o=>o.type?.toLowerCase()==='textbox'&&o.text==='Borealis Air')),validLayer=valid.pages[0].canvas.objects.find(o=>o.type?.toLowerCase()==='textbox');
  assert.equal(validLayer.fontFamily,'Roboto Light');assert.equal(validLayer.fontWeight,'normal');
  // Later edits keep exactly the typed text and the chosen weight; no fallback.
  await page.getByLabel('Text content',{exact:true}).fill('Borealis Ω Air');
  await page.getByRole('dialog',{name:'Something needs your attention'}).getByText(/selected Roboto Light font cannot draw/).waitFor();await page.getByRole('button',{name:'Got it',exact:true}).click();
  const changed=await saved(p=>p.pages[0].canvas.objects.some(o=>o.text==='Borealis Ω Air')),changedLayer=changed.pages[0].canvas.objects.find(o=>o.type?.toLowerCase()==='textbox');
  assert.equal(changedLayer.fontFamily,'Roboto Light');assert.equal(changed.pages[0].source,valid.pages[0].source);
  await page.locator('.document-actions .primary').click();await page.locator('.modal .dialog-actions .primary').click();
  await page.getByRole('dialog',{name:'Something needs your attention'}).getByText(/selected Roboto Light font cannot draw/).waitFor();
  assert.equal(downloads.length,0);assert.deepEqual(await project(),changed,'blocked export keeps text, chosen font and document unchanged');
  await page.getByRole('button',{name:'Got it',exact:true}).click();await page.getByRole('dialog',{name:'Export document'}).getByRole('button',{name:'Close dialog',exact:true}).click();
  // Logical style indices follow graphemes and explicit newlines even when a
  // narrow text box wraps. Test both a capable styled glyph and the converse.
  const styled=await page.evaluate(async()=>{
   const {restoreLocal}=await import('/src/model.ts'),{exportPayload}=await import('/src/project-io.ts');const current=await restoreLocal(),template=current.pages[0].canvas.objects.find(o=>o.type?.toLowerCase()==='textbox');
   const check=async({base,styled,pdfOnGroup})=>{
    const p=structuredClone(current),layer=structuredClone(template);layer.text='e\u0301Ω\nAΩ';layer.width=10;layer.fontFamily=base;layer.styles={0:{1:{fontFamily:styled,fontWeight:600,fontStyle:'italic'}},1:{1:{fontFamily:styled}}};
    const outer={type:'Group',objects:[{type:'Group',objects:[layer]}]};if(pdfOnGroup){outer.pdfOriginalFont=layer.pdfOriginalFont;outer.recognizedKey=layer.recognizedKey;delete layer.pdfOriginalFont;delete layer.recognizedKey;}
    p.pages[0].canvas.objects=[outer];const before=JSON.stringify(p);try{await exportPayload(p);return {blocked:false,unchanged:JSON.stringify(p)===before};}catch(e){return {blocked:true,message:e.message,unchanged:JSON.stringify(p)===before};}
   };
   return {capable:await check({base:'Roboto Light',styled:'Liberation Sans'}),missing:await check({base:'Liberation Sans',styled:'Roboto Light'}),groupOrigin:await check({base:'Liberation Sans',styled:'Roboto Light',pdfOnGroup:true})};
  });
  assert.equal(styled.capable.blocked,false,'a capable font explicitly styled on the Greek glyph is allowed');
  for(const key of ['missing','groupOrigin']){assert.equal(styled[key].blocked,true,key);assert.match(styled[key].message,/Roboto Light font cannot draw/);assert.equal(styled[key].unchanged,true);}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
