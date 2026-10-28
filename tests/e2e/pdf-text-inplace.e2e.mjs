// End-to-end: editing a digital PDF's own text in place, in its own font. On
// invented documents from three producers (pdf-lib with the standard
// Helvetica, pdfkit with an embedded subset, Chromium's print to PDF), one
// field is edited in the app and downloaded; the download is rendered at 144
// dpi and compared with the same document generated with the new value.
// A character the subset lacks falls back to the text-box path and says why;
// a right-aligned amount keeps its right edge; everything else is unchanged.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {readFile} from 'node:fs/promises';
import * as mupdf from 'mupdf';import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';import PDFKit from 'pdfkit';

let server,browser;
before(async()=>{server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});});
after(async()=>{await browser?.close();await server?.close();});

// --- Invented documents -------------------------------------------------
// A bank statement: standard Helvetica (not embedded), amounts right-aligned in their columns.
async function statement({balance='3 412,85',credit='2 845,00'}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const p=pdf.addPage([595,842]),t=(s,x,y,size=9,f=font)=>p.drawText(s,{x,y:842-y,size,font:f,color:rgb(.1,.1,.12)});
 t('Banque Coopérative du Rhône',50,60,15,bold);t('Closing balance '+balance+' EUR',50,100,14);
 ['Date','Libellé','Débit','Crédit'].forEach((h,i)=>t(h,[56,120,400,480][i],170,9,bold));
 const rows=[['02/10','Virement salaire SARL Ondine','',credit],['04/10','Prélèvement loyer octobre','920,00',''],['07/10','Carte Boulangerie du Parc','12,40',''],['15/10','Virement reçu M. Petit','','150,00']];
 rows.forEach((r,j)=>{const y=196+j*18;t(r[0],56,y);t(r[1],120,y);if(r[2])t(r[2],440-font.widthOfTextAtSize(r[2],9),y);if(r[3])t(r[3],520-font.widthOfTextAtSize(r[3],9),y);});
 return Buffer.from(await pdf.save());
}
// An invoice from pdfkit: bundled Liberation Sans, subset-embedded (fontkit
// keeps no cmap in it), a logo, totals right-aligned, terms on a second page.
const logo=(()=>{const pix=new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB,[0,0,96,48],false),px=pix.getPixels();for(let y=0;y<48;y++)for(let x=0;x<96;x++){const i=(y*96+x)*3;px[i]=30+x*2;px[i+1]=60+y*3;px[i+2]=(x^y)&16?200:90;}return Buffer.from(pix.asPNG());})();
function invoice({total='EUR 4,920.65'}={}){
 return new Promise(resolve=>{
  const doc=new PDFKit({size:'A4',margin:50,info:{Title:'Invoice (invented)',CreationDate:new Date(Date.UTC(2026,9,14))}}),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.registerFont('R','src/browser/fonts/LiberationSans-Regular.ttf');doc.registerFont('B','src/browser/fonts/LiberationSans-Bold.ttf');
  doc.image(logo,50,45,{width:96});doc.font('B').fontSize(18).fillColor('#1f3b73').text('Nordlicht Design GmbH',170,52);
  doc.font('R').fontSize(10).fillColor('#222');
  [['Invoice number','F-2026-0932'],['Invoice date','14 October 2026'],['Customer no.','K-10457']].forEach(([k,v],i)=>{doc.text(k,50,150+i*16);doc.text(v,170,150+i*16);});
  [['Brand identity workshop','1,200.00'],['Website design, 6 templates','2,100.00'],['Illustrations for brochure','740.00']].forEach(([k,v],i)=>{doc.text(k,50,240+i*20);doc.text(v,450,240+i*20,{width:95,align:'right'});});
  [['Net amount','EUR 4,135.00'],['VAT 19%','EUR 785.65'],['Total due',total]].forEach(([k,v],i)=>{doc.text(k,330,330+i*18,{width:110,align:'right'});doc.text(v,450,330+i*18,{width:95,align:'right'});});
  doc.addPage();doc.font('R').fontSize(9).fillColor('#555').text('Terms: payment within 30 days to IBAN DE89 3704 0044 0532 0130 00.',50,60).text('Thank you for your business.',50,76);
  doc.end();
 });
}
// An invoice printed by Chromium, its fonts (the bundled Liberation Serif) subset by Skia.
const face=async(name,file)=>`@font-face{font-family:${name};src:url(data:font/ttf;base64,${(await readFile('src/browser/fonts/'+file)).toString('base64')})}`;
async function printed({total='1 284,50'}={}){
 const page=await browser.newPage();
 try{
  await page.setContent(`<html><head><style>${await face('Inv','LiberationSerif-Regular.ttf')}${await face('InvB','LiberationSerif-Bold.ttf')}body{font-family:Inv;font-size:12pt;padding:40px}b,h1{font-family:InvB;font-weight:normal}td{padding:2px 12px}td+td{text-align:right}</style></head><body>
   <h1>Facture F-2026-0417</h1><p>Client : Atelier Bérard &amp; Fils, 12 rue des Lilas, 44000 Nantes</p>
   <table><tr><td>Restauration du buffet</td><td>860,00 €</td></tr><tr><td>Vernis et finitions</td><td>424,50 €</td></tr></table>
   <p><b>Total dû : ${total} €</b></p></body></html>`);
  await page.evaluate(()=>document.fonts.ready);return Buffer.from(await page.pdf({format:'A4'}));
 }finally{await page.close();}
}

// --- Rendering and comparison --------------------------------------------
const render=(bytes,i=0)=>{const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(i),x=p.toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true);try{return {w:x.getWidth(),h:x.getHeight(),px:x.getPixels().slice()};}finally{x.destroy();p.destroy();d.destroy();}};
const find=(bytes,needle,i=0)=>{const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(i);try{return p.search(needle).flat().map(q=>({left:Math.min(q[0],q[4]),right:Math.max(q[2],q[6]),top:Math.min(q[1],q[3]),bottom:Math.max(q[5],q[7])}));}finally{p.destroy();d.destroy();}};
// Differing pixels between two renders, over the page and inside the edited field (mean difference there too).
function compare(edited,reference,field){
 const a=render(edited),b=render(reference);assert.deepEqual([a.w,a.h],[b.w,b.h],'same page size');
 let pixels=0,inside=0,sum=0,area=0;
 for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const i=(y*a.w+x)*3,d=Math.max(Math.abs(a.px[i]-b.px[i]),Math.abs(a.px[i+1]-b.px[i+1]),Math.abs(a.px[i+2]-b.px[i+2]));
  const inField=x>=(field.left-3)*2&&x<=(field.right+3)*2&&y>=(field.top-3)*2&&y<=(field.bottom+3)*2;if(d)pixels++;if(inField){area++;sum+=d;if(d)inside++;}}
 return {pixels,inside,mean:+(sum/Math.max(1,area)).toFixed(2)};
}
const union=boxes=>({left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))});
const lines=(bytes,i=0)=>{const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(i),t=p.toStructuredText('');try{return t.asText().split('\n').map(l=>l.trim()).filter(Boolean);}finally{t.destroy();p.destroy();d.destroy();}};
// Every image drawn on a page: where, and its pixels.
function images(bytes,i=0){
 const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(i),out=[];
 const device=new mupdf.Device({fillImage(image,ctm){const pix=image.toPixmap();out.push({ctm:ctm.map(v=>+v.toFixed(3)),w:pix.getWidth(),h:pix.getHeight(),sum:pix.getPixels().reduce((a,v)=>(a*31+v)>>>0,7)});pix.destroy();}});
 try{p.run(device,mupdf.Matrix.identity);device.close();return out;}finally{device.destroy();p.destroy();d.destroy();}
}

// --- The app -----------------------------------------------------------------
async function open(name,bytes){
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name,mimeType:'application/pdf',buffer:bytes});
 return {page,errors};
}
const field=(page,text)=>page.locator(`button[aria-label^="Edit detected text"][aria-label*="${text}"]`).first();
// Tap the field, replace `from` with `to`: in the New text dialog, or (the
// code before this feature) in the text box the tap opened.
async function edit(page,from,to){
 await field(page,from).waitFor({timeout:120000});await field(page,from).click();
 const how=await Promise.race([page.getByLabel('New text').waitFor({timeout:60000}).then(()=>'dialog'),page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA',null,{timeout:60000}).then(()=>'text box')]);
 if(how==='dialog'){const input=page.getByLabel('New text');await input.fill((await input.inputValue()).replace(from,to));await page.getByRole('button',{name:'Apply',exact:true}).click();
  const toast=page.locator('.toast').filter({hasText:/own font|text box/});await toast.waitFor({timeout:60000});return {how,toast:await toast.innerText()};}
 const value=await page.evaluate(()=>document.activeElement.value);await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText(value.replace(from,to));await page.keyboard.press('Escape');await page.waitForTimeout(1500);
 return {how,toast:''};
}
async function download(page){
 await page.waitForTimeout(800);await page.locator('.document-actions .primary').click();
 assert.equal(await page.locator('.modal select').first().inputValue(),'pdf');
 const [file]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('.modal .dialog-actions .primary').click()]);
 return readFile(await file.path());
}
const report=(name,r)=>console.log(`# ${name}: ${r.pixels} differing pixels at 144 dpi, ${r.inside} in the field (mean difference there ${r.mean})`);

test('a) a standard-Helvetica line is rewritten in place: identical to the regenerated statement',{timeout:300000},async()=>{
 const original=await statement(),reference=await statement({balance:'3 421,85'});
 const {page,errors}=await open('statement.pdf',original);
 try{
  const {how}=await edit(page,'3 412,85','3 421,85');
  const edited=await download(page),r=compare(edited,reference,union([...find(original,'3 412,85'),...find(reference,'3 421,85')]));report('a',r);
  assert.equal(how,'dialog','a native PDF field opens the New text dialog');
  assert.equal(r.pixels,0,`the download is the regenerated statement (${JSON.stringify(r)})`);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('b, f) an amount in a pdfkit subset is rewritten in its own glyphs; text, image and page 2 are unchanged; Undo restores it',{timeout:300000},async()=>{
 const original=await invoice(),reference=await invoice({total:'EUR 4,290.65'});
 const {page,errors}=await open('invoice.pdf',original);
 try{
  const {how,toast}=await edit(page,'4,920.65','4,290.65');
  const edited=await download(page),r=compare(edited,reference,union([...find(original,'4,920.65'),...find(reference,'4,290.65')]));report('b',r);
  assert.equal(how,'dialog');assert.match(toast,/own font/,'written in place');
  assert.ok(r.pixels<=4,`the download matches the regenerated invoice (${JSON.stringify(r)})`);
  // The page is read again from its new source: the field shows the new value; Undo and Redo switch sources.
  await field(page,'4,290.65').waitFor({timeout:60000});
  await page.getByRole('button',{name:'Undo (Ctrl Z)'}).click();await field(page,'4,920.65').waitFor({timeout:60000});
  await page.getByRole('button',{name:'Redo (Ctrl Shift Z)'}).click();await field(page,'4,290.65').waitFor({timeout:60000});
  // f) Search finds the new amount, not the old; every other line, the logo and page 2 are as they were.
  const text=lines(edited),before=lines(original);
  assert.ok(text.some(l=>l.includes('EUR 4,290.65')),text.join(' | '));assert.ok(!text.some(l=>l.includes('4,920.65')),'the old amount is gone from the text');
  assert.deepEqual(text,before.map(l=>l.replace('4,920.65','4,290.65')),'all other text is unchanged');
  assert.equal(mupdf.Document.openDocument(edited,'application/pdf').countPages(),2);
  assert.deepEqual(lines(edited,1),lines(original,1));
  const p2=[render(edited,1),render(original,1)];assert.ok(p2[0].px.every((v,i)=>v===p2[1].px[i]),'page 2 renders identically');
  const [shown,kept]=[images(edited),images(original)];assert.equal(shown.length,1);assert.deepEqual(shown,kept,'the logo is the same image in the same place');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('c) an amount in a Chromium-printed invoice is rewritten in its own subset',{timeout:300000},async()=>{
 const original=await printed(),reference=await printed({total:'1 248,50'});
 const {page,errors}=await open('facture.pdf',original);
 try{
  await edit(page,'1 284,50','1 248,50');
  const edited=await download(page),r=compare(edited,reference,union([...find(original,'1 284,50'),...find(reference,'1 248,50')]));report('c',r);
  assert.ok(r.pixels<=4,`the download matches the regenerated invoice (${JSON.stringify(r)})`);
  assert.ok(lines(edited).some(l=>l.includes('1 248,50')));
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('d) a character the subset lacks falls back to a text box, saying why',{timeout:300000},async()=>{
 const {page,errors}=await open('invoice.pdf',await invoice());
 try{
  const {how,toast}=await edit(page,'EUR 785.65','EUR 785.65 Ω');
  assert.equal(how,'dialog');
  assert.match(toast,/Ω/,`the toast names the missing character (${toast})`);assert.match(toast,/text box/);
  await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.activeElement.value),'EUR 785.65 Ω','the text box holds the typed text');
  assert.equal(await page.locator('.error-message').count(),0,'no error');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('e) a right-aligned amount that gets wider keeps its right edge',{timeout:300000},async()=>{
 const original=await statement(),reference=await statement({credit:'12 845,00'});
 const {page,errors}=await open('statement.pdf',original);
 try{
  await edit(page,'2 845,00','12 845,00');
  const edited=await download(page),r=compare(edited,reference,union([...find(original,'2 845,00'),...find(reference,'12 845,00')]));report('e',r);
  const [was]=find(original,'2 845,00'),[now]=find(edited,'12 845,00');
  assert.ok(now&&Math.abs(now.right-was.right)<.05,`right edge ${now?.right} (was ${was.right})`);
  assert.ok(now.left<was.left-4,'the start moved left by the new digit');
  assert.equal(r.pixels,0,`the download is the regenerated statement (${JSON.stringify(r)})`);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
