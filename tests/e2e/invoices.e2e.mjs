// End-to-end: the Documents workspace makes an e-invoice. The checks point
// at what is missing, issuing downloads a Factur-X PDF and freezes the
// invoice, it can be corrected with a credit note, and everything is still
// there after a reload. All details are invented.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

async function saved(page,click){
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),click()]);
 const file=join(await mkdtemp(join(tmpdir(),'bide-invoice-')),download.suggestedFilename());await download.saveAs(file);
 return {name:download.suggestedFilename(),bytes:await readFile(file)};
}
const card=(page,name)=>page.getByRole('region',{name});
const openDocuments=page=>page.locator('.workspace-nav').getByRole('button',{name:/Documents/}).click();

test('an e-invoice is checked, issued as Factur-X, credited and kept',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await openDocuments(page);
  await page.getByRole('button',{name:'New invoice'}).first().click();
  const year=new Date().getFullYear();
  await page.getByRole('heading',{name:`Invoice F-${year}-0001`}).waitFor();
  // A blank invoice cannot be issued; a check focuses its field.
  const issue=page.getByRole('button',{name:'Issue and download Factur-X'});assert.ok(await issue.isDisabled());
  await page.getByRole('button',{name:'Your name is missing.'}).click();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-field')),'seller.name');
  const you=card(page,'Your business'),client=card(page,'Client');
  await you.getByLabel('Name').fill('Atelier Lumière SARL');await you.getByLabel('Street').fill('14 rue des Acacias');await you.getByLabel('Postcode').fill('69003');await you.getByLabel('City').fill('Lyon');
  await you.getByLabel('SIREN').fill('000123455');await you.getByRole('button',{name:'From SIREN'}).click();
  assert.equal(await you.getByLabel('VAT number').inputValue(),'FR31000123455');
  await client.getByLabel('Name').fill('Harbour View SAS');await client.getByLabel('Street').fill('2 quai de la Fosse');await client.getByLabel('Postcode').fill('44000');await client.getByLabel('City').fill('Nantes');await client.getByLabel('SIREN').fill('000987651');
  const line=page.getByRole('group',{name:'Line 1'});
  await line.getByLabel('Description').fill('Refonte du site web');await line.getByLabel('Quantity').fill('2');await line.getByLabel('Unit price (excl. VAT)').fill('1 250,50');
  await card(page,'Payment').getByLabel('IBAN').fill('FR76 3000 6000 0112 3456 7890 189');
  await page.getByText('Ready to issue').waitFor();
  assert.equal(await page.getByLabel('Invoice total').innerText(),'3 001,20 €');
  await page.getByRole('button',{name:'Save as client'}).click();
  // Issuing downloads a Factur-X PDF (PDF/A-3 with the EN 16931 XML inside).
  const pdf=await saved(page,()=>issue.click());
  assert.equal(pdf.name,`Facture F-${year}-0001.pdf`);
  const text=pdf.bytes.toString('latin1');assert.ok(text.includes('/AFRelationship /Alternative')&&text.includes('(factur-x.xml)')&&text.includes('/GTS_PDFA1'));
  const doc=mupdf.Document.openDocument(pdf.bytes,'application/pdf');assert.match(doc.loadPage(0).toStructuredText('').asText(),/Harbour View SAS[\s\S]*3 001,20/);
  await page.getByText(/Issued .* read only/).waitFor();
  assert.ok(await you.getByLabel('Name').isDisabled(),'issued invoices are read only');
  const ubl=await saved(page,()=>page.getByRole('button',{name:'UBL XML'}).click());
  assert.match(ubl.bytes.toString('utf8'),/<cbc:PayableAmount currencyID="EUR">3001.20<\/cbc:PayableAmount>/);
  // A credit note takes the invoice's lines and points back to it.
  await page.getByRole('button',{name:'Credit note for this invoice'}).click();
  await page.getByRole('heading',{name:`Credit note AV-${year}-0001`}).waitFor();
  assert.equal(await card(page,'Invoice details').getByLabel('Corrects invoice').inputValue(),`F-${year}-0001`);
  await page.getByRole('button',{name:'All documents'}).click();
  // Kept across a reload, with the next number ready and the client saved.
  await page.waitForTimeout(800);await page.reload();await openDocuments(page);
  const issued=page.getByRole('region',{name:'Issued'});await issued.getByText(`F-${year}-0001`).waitFor();
  await page.getByRole('region',{name:'Drafts'}).getByText(`AV-${year}-0001`).waitFor();
  await page.getByRole('region',{name:'Clients'}).getByText('Harbour View SAS').waitFor();
  await page.getByRole('button',{name:'New invoice'}).first().click();
  await page.getByRole('heading',{name:`Invoice F-${year}-0002`}).waitFor();
  assert.equal(await card(page,'Your business').getByLabel('Name').inputValue(),'Atelier Lumière SARL','your details are remembered');
  await card(page,'Client').getByLabel('Saved client').selectOption({label:'Harbour View SAS'});
  assert.equal(await card(page,'Client').getByLabel('City').inputValue(),'Nantes');
  // A Factur-X someone sends is read exactly and kept read only with its original.
  await page.getByRole('button',{name:'All documents'}).click();
  const received=join(await mkdtemp(join(tmpdir(),'bide-invoice-')),'Facture fournisseur.pdf');await writeFile(received,pdf.bytes);
  await page.getByLabel('Open an invoice file').setInputFiles(received);
  await page.getByText(/Received as Factur-X from Atelier Lumière SARL/).waitFor({timeout:60000});
  assert.equal(await page.getByLabel('Invoice total').innerText(),'3\u202f001,20\u00a0€');
  await page.getByText('This invoice passes the checks').waitFor();
  const original=await saved(page,()=>page.getByRole('button',{name:'Original file'}).click());assert.ok(original.bytes.equals(pdf.bytes));
  await page.getByRole('button',{name:'All documents'}).click();
  await page.getByRole('region',{name:'Received'}).getByText('Atelier Lumière SARL').waitFor();
  // A photo of a paper invoice becomes a draft to check.
  const photo=join(await mkdtemp(join(tmpdir(),'bide-invoice-')),'scan.png');
  await writeFile(photo,Buffer.from(mupdf.Document.openDocument(pdf.bytes,'application/pdf').loadPage(0).toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false).asPNG()));
  await page.getByLabel('Open an invoice file').setInputFiles(photo);
  await page.getByText(/Read from scan.png with OCR/).waitFor({timeout:240000});
  assert.equal(await card(page,'Client').getByLabel('Name').inputValue(),'Harbour View SAS');
  assert.equal(await card(page,'Client').getByLabel('SIREN').inputValue(),'000987651');
  assert.equal(await card(page,'Payment').getByLabel('IBAN').inputValue(),'FR76 3000 6000 0112 3456 7890 189');
  assert.equal(await page.getByRole('group',{name:'Line 1'}).getByLabel('Description').inputValue(),'Refonte du site web');
  assert.equal(await page.getByLabel('Invoice total').innerText(),'3\u202f001,20\u00a0€');
  // Fits a phone screen without sideways scrolling.
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>{const m=document.querySelector('.documents-workspace');return m.scrollWidth<=m.clientWidth+1;}),'no horizontal scroll at phone width');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
