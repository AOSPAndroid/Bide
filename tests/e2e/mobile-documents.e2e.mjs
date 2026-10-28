// End-to-end on phones and tablets: the invoice editor keeps its total, checks
// and Issue in view, fields and buttons are sized for fingers (and for iOS,
// which zooms into small text fields), long values wrap, deleting can be
// undone, system Back returns to the list, and the toast and the reading
// status stay readable. All details are invented.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

let server,browser;
before(async()=>{server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});});
after(async()=>{await browser?.close();await server?.close();});
const iphone={width:390,height:844},android={width:360,height:740},tablet={width:820,height:1180},landscape={width:844,height:390};
const long='Conception et suivi de chantier pour la rénovation complète de la cuisine et de la salle de bain';

async function device(viewport){
 const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 return {context,page,errors,cdp:await context.newCDPSession(page)};
}
const app=page=>page.goto(server.resolvedUrls.local[0]+'app/');
async function documents(page){await page.locator('.workspace-nav').getByRole('button',{name:/Documents/}).tap();await page.getByRole('heading',{name:'Invoices and forms'}).waitFor();}
async function newInvoice(page){await app(page);await documents(page);await page.getByRole('button',{name:'New invoice'}).first().tap();await page.getByRole('region',{name:'Invoice details'}).waitFor();}
const rect=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
const onScreen=(r,{height})=>r.top>=0&&r.bottom<=height+.5;
// Rows of an invoice line's grid (implicit rows included).
const rows=line=>line.evaluate(l=>getComputedStyle(l).gridTemplateRows.split(' ').length);
// One finger dragging up the screen, as a real swipe.
async function swipe(cdp,x,from,to){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
 for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/10}]});await new Promise(r=>setTimeout(r,16));}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await new Promise(r=>setTimeout(r,400));
}
// Everything needed for a valid French invoice.
async function fillValid(page){
 const you=page.getByRole('region',{name:'Your business'}),client=page.getByRole('region',{name:'Client'});
 for(const [label,value] of [['Name','Atelier Lumière SARL'],['Street','14 rue des Acacias'],['Postcode','69003'],['City','Lyon'],['SIREN','000123455']])await you.getByLabel(label,{exact:true}).fill(value);
 await you.getByRole('button',{name:'From SIREN'}).tap();
 for(const [label,value] of [['Name','Harbour View SAS'],['Street','2 quai de la Fosse'],['Postcode','44000'],['City','Nantes'],['SIREN','000987651']])await client.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('group',{name:'Line 1'}).getByLabel('Description').fill('Refonte du site web');
 await page.getByRole('region',{name:'Payment'}).getByLabel('IBAN').fill('FR76 3000 6000 0112 3456 7890 189');
}

test('phones: the total, the checks and Issue stay on screen while editing',{timeout:300000},async()=>{
 const {context,page,errors}=await device(iphone);
 try{
  await newInvoice(page);
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Add line'}).tap();
  const price=page.getByRole('group',{name:'Line 1'}).getByLabel('Unit price (excl. VAT)');await price.tap();await price.fill('125');
  const bar=page.getByRole('region',{name:'Invoice summary'}),b=await rect(bar);
  assert.ok(onScreen(await rect(price),iphone)&&onScreen(b,iphone),'the price being typed and the summary bar are both on screen');
  assert.ok(Math.abs(b.bottom-iphone.height)<=1,`the bar sits on the bottom edge (${b.bottom})`);
  assert.match(await bar.innerText(),/150,00\s€/,'the bar shows the invoice total');
  assert.ok(b.height>=44&&b.height<=90,`the bar is compact (${b.height} px)`);
  // "N to fix" goes straight to the first problem, and the bar stays.
  const fix=bar.getByRole('button',{name:/to fix/});assert.match(await fix.innerText(),/^\d+ to fix$/);
  assert.ok(await bar.getByRole('button',{name:'Issue'}).isDisabled(),'Issue waits for the checks');
  await fix.tap();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-field')),'seller.name');
  assert.ok(onScreen(await rect(bar),iphone),'the bar is still on screen after jumping to a field');
  for(let i=5;i>1;i--)await page.getByRole('button',{name:`Remove line ${i}`}).tap();
  await fillValid(page);
  await bar.getByText('Ready').waitFor();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),bar.getByRole('button',{name:'Issue'}).tap()]);
  assert.match(download.suggestedFilename(),/^Facture F-\d{4}-0001\.pdf$/);
  await page.getByText(/Issued .* read only/).waitFor();
  await bar.getByRole('button',{name:'Download PDF'}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('phones: fields have 16px text and 44px targets, labels are readable, the checkbox sits by its label',{timeout:300000},async()=>{
 const {context,page,errors}=await device(iphone);
 try{
  await newInvoice(page);
  const client=page.getByRole('region',{name:'Client'});
  await client.getByLabel('Name',{exact:true}).fill('Harbour View SAS');await client.getByLabel('Country').fill('FR');await client.getByLabel('SIREN').fill('552100554');
  await page.getByRole('button',{name:'Add discount'}).tap();await page.getByRole('button',{name:'Add charge'}).tap();
  const m=await page.evaluate(()=>{
   const ed=document.querySelector('.invoice-editor'),shown=e=>e.getBoundingClientRect().width>0,size=e=>parseFloat(getComputedStyle(e).fontSize),name=e=>e.getAttribute('data-field')??e.getAttribute('aria-label')??e.textContent.trim().slice(0,30);
   const fields=[...ed.querySelectorAll('input:not([type=checkbox]),select,textarea')].filter(shown).map(e=>({name:name(e),size:size(e),height:Math.round(e.getBoundingClientRect().height)}));
   const buttons=[...ed.querySelectorAll('button')].filter(shown).map(e=>({name:name(e),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}));
   const text=[...ed.querySelectorAll('.invoice-field>span,.invoice-number>i,.invoice-totals>div,.invoice-checks li button,.invoice-actions .fine-print,.invoice-status,.invoice-line-total')].filter(shown).map(e=>({name:name(e),size:size(e)}));
   const box=ed.querySelector('.invoice-field.check input').getBoundingClientRect(),label=ed.querySelector('.invoice-field.check>span').getBoundingClientRect(),row=ed.querySelector('.invoice-field.check').getBoundingClientRect();
   return {fields,buttons,text,check:{width:box.width,gap:label.left-box.right,height:row.height}};
  });
  assert.ok(m.fields.length>40,`fields measured (${m.fields.length})`);
  assert.deepEqual(m.fields.filter(f=>f.size<16),[],'every field has 16px text, so iOS does not zoom in on it');
  assert.deepEqual(m.fields.filter(f=>f.height<44),[],'every field is at least 44px tall');
  assert.ok(m.buttons.some(b=>b.name==='From SIREN')&&m.buttons.some(b=>b.name==='Remove discount 1')&&m.buttons.some(b=>b.name==='All documents'),'the small buttons were measured');
  assert.deepEqual(m.buttons.filter(b=>b.width<44||b.height<44),[],'every button is at least 44×44');
  assert.deepEqual(m.text.filter(t=>t.size<13),[],'labels, totals and checks are at least 13px');
  assert.ok(m.check.width<=24&&m.check.gap<=12&&m.check.height>=44,`the checkbox is a box next to its label (${JSON.stringify(m.check)})`);
  assert.ok(await page.evaluate(()=>document.scrollingElement.scrollWidth<=innerWidth&&document.querySelector('.documents-workspace').scrollWidth<=innerWidth),'no sideways scrolling');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('phones: deleting a draft or a client can be undone; the toast fits and lets taps through',{timeout:300000},async()=>{
 const {context,page,errors}=await device(iphone);
 try{
  await newInvoice(page);
  await page.getByRole('region',{name:'Client'}).getByLabel('Name',{exact:true}).fill('Harbour View SAS');
  await page.getByRole('button',{name:'Save as client'}).tap();
  const toast=page.locator('.toast');await toast.getByText('Harbour View SAS saved as a client.').waitFor();
  const t=await rect(toast);
  assert.ok(t.height<50,`a short message stays on one line (${t.width}×${t.height})`);
  assert.ok(t.bottom>iphone.height-100,`the toast sits low (bottom ${t.bottom})`);
  assert.ok(await page.evaluate(([x,y])=>!document.elementFromPoint(x,y)?.closest('.toast'),[t.left+t.width/2,t.top+t.height/2]),'taps go through the toast');
  // Delete is kept apart from Duplicate.
  const duplicate=await rect(page.getByRole('button',{name:'Duplicate as new draft'})),del=await rect(page.getByRole('button',{name:'Delete draft'}));
  assert.ok(del.top-duplicate.bottom>=20,`Delete draft is ${del.top-duplicate.bottom} px below Duplicate`);
  const number=await page.getByRole('region',{name:'Invoice details'}).getByLabel('Number').inputValue();
  await page.getByRole('button',{name:'Delete draft'}).tap();
  await page.getByRole('heading',{name:'Invoices and forms'}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Drafts'}).count(),0,'the draft is gone');
  await toast.getByText(`Draft ${number} deleted.`).waitFor();
  const undo=toast.getByRole('button',{name:'Undo'}),u=await rect(undo);assert.ok(u.height>=40&&u.width>=44,'Undo is a real target');
  await undo.tap();
  await page.getByRole('region',{name:'Drafts'}).getByText(number).waitFor();
  await page.waitForTimeout(800);await page.reload();await documents(page);
  await page.getByRole('region',{name:'Drafts'}).getByText(number).waitFor();
  // Forgetting a client too.
  const forget=page.getByRole('button',{name:'Forget Harbour View SAS'}),f=await rect(forget);assert.ok(f.width>=44&&f.height>=44,'Forget is 44×44');
  await forget.tap();
  assert.equal(await page.getByRole('region',{name:'Clients'}).count(),0,'the client is gone');
  await toast.getByText('Harbour View SAS forgotten.').waitFor();await toast.getByRole('button',{name:'Undo'}).tap();
  await page.getByRole('region',{name:'Clients'}).getByText('Harbour View SAS').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('Android: system Back closes the invoice and returns to the list; typing is saved when the page is hidden',{timeout:300000},async()=>{
 const {context,page,errors}=await device(android);
 try{
  // Use a real prior HTTP document: managed browsers may forbid data: page
  // navigation. The history sequence and previous-page assertions stay real.
  const previous=new URL('previous-test-page.html',server.resolvedUrls.local[0]).href;
  await page.route(previous,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>previous</title>previous site'}));
  await page.goto(previous);await app(page);await documents(page);
  await page.getByRole('button',{name:'New invoice'}).first().tap();
  const number=page.getByRole('region',{name:'Invoice details'}).getByLabel('Number');await number.fill('ZZTEST');
  await page.goBack();
  assert.notEqual(await page.title(),'previous','Back stayed in bide');
  await page.getByRole('heading',{name:'Invoices and forms'}).waitFor();
  await page.getByRole('region',{name:'Drafts'}).getByText('ZZTEST').waitFor();
  await page.goForward();await page.getByRole('heading',{name:'Invoice ZZTEST'}).waitFor();
  // All documents takes the same step back, so a second Back leaves as usual.
  await page.getByRole('button',{name:'All documents'}).tap();await page.getByRole('heading',{name:'Invoices and forms'}).waitFor();
  await page.goBack();await page.waitForFunction(()=>document.title==='previous');
  // Hiding the page (another app, a locked phone) saves at once, not 400 ms later.
  await app(page);await documents(page);await page.getByRole('button',{name:'New invoice'}).first().tap();await number.fill('QUICK1');
  const stored=await page.evaluate(async()=>{
   Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;
   const {loadDocuments}=await import('/src/invoice-store.ts');return (await loadDocuments()).invoices.map(s=>s.invoice.number);
  });
  assert.ok(stored.includes('QUICK1'),`saved when the page was hidden (${stored})`);
  // Leaving the workspace with the invoice open drops its entry too: Back then leaves bide, not a press that does nothing.
  await page.locator('.workspace-nav').getByRole('button',{name:/Photo/}).tap();
  await page.goBack();await page.waitForFunction(()=>document.title==='previous');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('phones: reading an invoice shows wherever the list is scrolled, one file at a time; read-only values wrap',{timeout:300000},async()=>{
 const {context,page,errors,cdp}=await device(iphone);
 try{
  await app(page);await documents(page);
  // A received UBL invoice with a long line description (invented sample).
  const xml=await page.evaluate(async long=>{const {samples}=await import('/tests/einvoice/samples.mjs'),{invoiceFile}=await import('/src/browser/invoice-files.ts'),s=samples['services-vat'];
   return (await invoiceFile({...s,lines:[{...s.lines[0],name:long},...s.lines.slice(1)]},'ubl')).blob.text();},long);
  // Reading is held back a moment, as OCR would take.
  let release;const held=new Promise(r=>release=r);
  await page.route(/invoice-import\.ts/,async route=>{await held;await route.continue();});
  const card=page.locator('.pdf-tool-card',{hasText:'Open an invoice'}),ws=page.locator('.documents-workspace');
  for(let i=0;i<4&&!onScreen(await rect(card),iphone);i++)await swipe(cdp,200,700,300);
  assert.ok(await ws.evaluate(e=>e.scrollTop)>100&&onScreen(await rect(card),iphone),'the card was scrolled into view with a swipe');
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),card.tap()]);
  await chooser.setFiles({name:'Facture fournisseur.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  const status=page.locator('.invoice-reading');await status.waitFor();
  const s=await rect(status),top=(await rect(ws)).top;
  assert.ok(s.top>=top&&s.bottom<=iphone.height,`the reading status is on screen (${s.top}–${s.bottom})`);
  assert.ok(await page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.invoice-reading'),[s.left+s.width/2,s.top+s.height/2]),'nothing covers it');
  assert.ok(await card.isDisabled()&&await page.getByRole('button',{name:'Open an invoice'}).first().isDisabled(),'a second file cannot be started');
  await page.getByLabel('Open an invoice file').setInputFiles({name:'again.xml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  release();
  await page.getByText('Received · read only').waitFor();
  const description=page.getByRole('group',{name:'Line 1'}).getByLabel('Description'),indemnity=page.getByLabel('Recovery indemnity');
  for(const field of [description,indemnity]){
   const f=await field.evaluate(e=>({value:e.value,disabled:e.disabled,fits:e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1}));
   assert.ok(f.disabled&&f.fits,`a read-only value shows in full: ${JSON.stringify(f)}`);
  }
  assert.equal(await description.inputValue(),long);
  await page.getByRole('button',{name:'All documents'}).tap();
  assert.equal(await page.getByRole('region',{name:'Received'}).locator('tbody tr').count(),1,'one file, one received invoice');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('Android: narrow fields get the whole row, lines are compact, long values wrap, keyboards fit the field',{timeout:300000},async()=>{
 const {context,page,errors}=await device(android);
 try{
  await newInvoice(page);
  const you=page.getByRole('region',{name:'Your business'}),client=page.getByRole('region',{name:'Client'});
  await client.getByLabel('Country').fill('FR');await client.getByLabel('SIREN').fill('552100554');
  const vat=await rect(client.getByLabel('VAT number')),siren=await rect(client.getByRole('button',{name:'From SIREN'}));
  assert.ok(vat.width>=150&&siren.height>=44,`VAT number ${vat.width} px wide beside a ${siren.width}×${siren.height} From SIREN`);
  for(const field of [client.getByLabel('E-invoicing address'),page.getByRole('region',{name:'Payment'}).getByLabel('Method')])assert.ok((await rect(field)).width>=250,'e-invoicing address and payment method take the row');
  // Lines: the remove button sits beside the description, not alone on a row; the total is on the right.
  const line=page.getByRole('group',{name:'Line 1'}),l=await rect(line),desc=await rect(line.getByLabel('Description')),remove=await rect(line.getByRole('button',{name:'Remove line 1'}));
  assert.ok(remove.top<desc.bottom&&remove.bottom>desc.top&&remove.right>=l.right-1,'Remove is at the right of the description');
  assert.equal(await rows(line),4,'a line takes four rows');
  assert.ok((await rect(line.locator('.invoice-line-total'))).right>=l.right-1,'the line total is on the right');
  assert.ok(Math.max(...await line.locator('.invoice-field>span:first-child').evaluateAll(s=>s.map(e=>e.getBoundingClientRect().height)))<=20,'no label wraps');
  // Long values wrap instead of being cut, and stay on one logical line.
  const description=line.getByLabel('Description');await description.fill(long);await description.press('End');await description.press('Enter');
  for(const field of [description,page.getByLabel('Recovery indemnity'),page.getByLabel('Late-payment penalties')]){
   const f=await field.evaluate(e=>({value:e.value,fits:e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1}));
   assert.ok(f.fits,`shown in full: ${f.value}`);
  }
  assert.equal(await description.inputValue(),long,'Enter adds no line break');
  // Phone keyboards and autofill.
  const attrs=async (loc,...names)=>loc.evaluate((e,names)=>Object.fromEntries(names.map(n=>[n,e.getAttribute(n)])),names);
  assert.deepEqual(await attrs(client.getByLabel('SIREN'),'inputmode'),{inputmode:'numeric'});
  assert.deepEqual(await attrs(client.getByLabel('Postcode'),'inputmode','autocomplete'),{inputmode:'numeric',autocomplete:'off'});
  for(const field of [page.getByLabel('IBAN'),page.getByLabel('BIC'),client.getByLabel('VAT number')])assert.deepEqual(await attrs(field,'autocapitalize','autocorrect','spellcheck'),{autocapitalize:'characters',autocorrect:'off',spellcheck:'false'});
  assert.equal((await attrs(you.getByLabel('Name',{exact:true}),'autocomplete')).autocomplete,'organization');
  assert.equal((await attrs(you.getByLabel('Email'),'autocomplete')).autocomplete,'email');
  assert.equal((await attrs(client.getByLabel('Name',{exact:true}),'autocomplete')).autocomplete,'off','your details are not offered for the client');
  assert.equal((await attrs(you.getByLabel('Country'),'maxlength')).maxlength,'2','a 2-character Country gets the code from autofill, not a name cut to 2 letters');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

// Safari before 26 has no CSS field-sizing: the one-line fields are sized by script instead.
test('Android without CSS field-sizing: one-line fields fit their text, also once the invoice is issued',{timeout:300000},async()=>{
 const {context,page,errors}=await device(android);
 try{
  await page.addInitScript(()=>{const supports=CSS.supports.bind(CSS);CSS.supports=(...a)=>/field-sizing/.test(a.join(' '))?false:supports(...a);
   addEventListener('DOMContentLoaded',()=>document.head.append(Object.assign(document.createElement('style'),{textContent:'textarea{field-sizing:fixed!important}'})));});
  await newInvoice(page);await fillValid(page);
  const description=page.getByRole('group',{name:'Line 1'}).getByLabel('Description');
  await description.fill(long);await page.getByRole('group',{name:'Line 1'}).getByLabel('Unit price (excl. VAT)').fill('100');
  // Spare height: the field's height less what its text needs (at least the 44px minimum).
  const spare=()=>description.evaluate(e=>{const h=e.offsetHeight,old=e.style.height;e.style.height='auto';const need=Math.max(e.scrollHeight+e.offsetHeight-e.clientHeight,parseFloat(getComputedStyle(e).minHeight));e.style.height=old;return h-need;});
  assert.equal(await spare(),0,'the draft description is as tall as its text');
  await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('region',{name:'Invoice summary'}).getByRole('button',{name:'Issue'}).tap()]);
  await page.getByText(/Issued .* read only/).waitFor();
  assert.equal(await spare(),0,'issued, the description takes the whole row and shrinks to its text');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('tablet and phone landscape: the summary bar is on screen; discount totals sit on the right',{timeout:300000},async()=>{
 for(const viewport of [tablet,landscape]){
  const {context,page,errors}=await device(viewport);
  try{
   await newInvoice(page);
   const bar=await rect(page.getByRole('region',{name:'Invoice summary'}));
   assert.ok(onScreen(bar,viewport)&&Math.abs(bar.bottom-viewport.height)<=1,`${viewport.width}×${viewport.height}: the bar is on the bottom edge (${bar.top}–${bar.bottom})`);
   if(viewport===tablet){
    await page.getByRole('button',{name:'Add discount'}).tap();
    const row=page.getByRole('group',{name:'Discount 1'}),r=await rect(row),total=await rect(row.locator('.invoice-line-total'));
    assert.ok(total.right>=r.right-60,`the discount total is on the right (${total.right} of ${r.right})`);
    assert.equal(await rows(page.getByRole('group',{name:'Line 1'})),3,'a line takes three rows, with Remove beside the description');
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
});
