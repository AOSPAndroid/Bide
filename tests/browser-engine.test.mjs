import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import * as mupdf from 'mupdf';
import { unzipSync, strFromU8 } from 'fflate';
import { importBytes, exportDocument, restore, render, scanScale, renderArea, selectionRasterPlan, selectPages, detectPdfText, removePdfText, fontSupportsText, findPdfText, redactPdf, sanitizePdf, pdfFormFields, fillPdfField } from '../tmp/browser-core.mjs';
import {letterRasterScale} from '../tmp/render-budget.mjs';
await mkdir('tmp/pdfs',{recursive:true});
const original=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),fontRef=original.addSimpleFont(font);
for(const label of ['Original first page','Original second page']){const p=original.addPage([0,0,595,842],0,{Font:{helv:fontRef}},`BT /helv 22 Tf 50 772 Td (${label}) Tj ET 0.2 0.7 0.5 rg 50 642 200 100 re f`);original.insertPage(-1,p);p.destroy();}
const first=original.loadPage(0);first.createLink([50,50,280,80],'https://example.com').destroy();first.destroy();
const originalBuffer=original.saveToBuffer(''),originalBytes=originalBuffer.asUint8Array().slice();originalBuffer.destroy();fontRef.destroy();font.destroy();original.destroy();
const source=await importBytes(originalBytes,'source.pdf');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842"><text x="50" y="300" font-size="24">Browser overlay café</text><rect x="50" y="400" width="100" height="40" fill="red"/></svg>';
const spec={pages:[{width:595,height:842,source:source.id,index:0,svg}],title:'Browser test',format:'pdf',compression:'lossless',range:'',dpi:72};
test('source metadata and actual raster preview',()=>{assert.equal(source.pages.length,2);assert.equal(Buffer.from(render(source.id,0,.25)).subarray(1,4).toString(),'PNG');});
test('export retains searchable source + overlay text and external link',async()=>{
 const {bytes}=await exportDocument(spec);await writeFile('tmp/pdfs/browser-roundtrip.pdf',bytes);
 const d=mupdf.Document.openDocument(bytes,'pdf'),p=d.loadPage(0),t=p.toStructuredText('');
 assert.match(t.asText(),/Original first page/);assert.match(t.asText(),/Browser overlay café/);
 assert.equal(p.getLinks()[0].getURI(),'https://example.com');assert.equal(d.countPages(),1);
 t.destroy();p.destroy();d.destroy();
});
test('reorder, repeated pages, page range and rotation',async()=>{
 const {bytes}=await exportDocument({...spec,pages:[{...spec.pages[0],index:1},spec.pages[0],spec.pages[0]],range:'1,3',rotation:90});
 const d=mupdf.Document.openDocument(bytes,'pdf');assert.equal(d.countPages(),2);
 const p=d.loadPage(0),t=p.toStructuredText('');assert.match(t.asText(),/Original second page/);assert.equal(p.getBounds()[2],842);t.destroy();p.destroy();
 const linked=d.loadPage(1),link=linked.getLinks()[0];assert.deepEqual(link.getBounds(),[762,50,792,280]);link.destroy();linked.destroy();d.destroy();
});
for(const format of ['split','png','jpg','svg','docx','txt'])test(`export ${format}`,async()=>{
 const {bytes}=await exportDocument({...spec,format});assert.ok(bytes.length>20);
 if(format==='txt')assert.match(strFromU8(bytes),/Original first page/);
 else {const files=unzipSync(bytes);if(format==='docx')assert.match(strFromU8(files['word/document.xml']),/Original first page/);else{assert.equal(Object.keys(files).length,1);if(format==='svg')assert.match(strFromU8(Object.values(files)[0]),/<svg/);}}
});
test('project source integrity and invalid range',async()=>{
 await restore({[source.id]:source.data});await assert.rejects(restore({bad:source.data}),/corrupted/);
 // Failed restoration must not remove the known good source.
 assert.ok(render(source.id,0,.25).length>100);
 assert.throws(()=>selectPages('3-1',2));assert.throws(()=>selectPages('0',2));assert.deepEqual(selectPages('2,1',2),[1,0]);
});
test('plain text conversion and blocked remote SVG resources',async()=>{
 const txt=await importBytes(new TextEncoder().encode('Text document\nSecond line'),'sample.txt');assert.equal(txt.pages.length,1);
 await assert.rejects(exportDocument({...spec,pages:[{...spec.pages[0],svg:'<svg><image href="https://example.com/image.png"/></svg>'}]}),/external/);
});
test('AES-256 export rejects wrong passwords and imports with the supplied password', async()=>{
 const password='bide, "quoted" café \\ test';
 const {bytes}=await exportDocument({...spec,password});
 await writeFile('tmp/pdfs/protected-bide.pdf',bytes);
 const locked=mupdf.Document.openDocument(bytes,'pdf');
 assert.equal(locked.needsPassword(),true); assert.equal(locked.authenticatePassword('incorrect'),0);
 assert.ok(locked.authenticatePassword(password)); const p=locked.loadPage(0), t=p.toStructuredText(''); assert.match(t.asText(),/Browser overlay café/);t.destroy();p.destroy();locked.destroy();
 await assert.rejects(importBytes(bytes,'locked.pdf'),/PASSWORD_REQUIRED/);
 await assert.rejects(importBytes(bytes,'locked.pdf','wrong'),/PASSWORD_INCORRECT/);
 const unlocked=await importBytes(bytes,'locked.pdf',password);
 const restored=mupdf.Document.openDocument(Buffer.from(unlocked.data,'base64'),'pdf');assert.equal(restored.needsPassword(),false);restored.destroy();
 await assert.rejects(exportDocument({...spec,password:'x'.repeat(128)}),/127/);
});
test('crop changes visible dimensions, retains searchable content and survives reimport',async()=>{
 const {bytes}=await exportDocument({...spec,crop:{left:20,top:30,right:40,bottom:50}});
 const d=mupdf.Document.openDocument(bytes,'pdf'),p=d.loadPage(0),b=p.getBounds(),t=p.toStructuredText('');
 assert.equal(b[2]-b[0],535);assert.equal(b[3]-b[1],762);assert.match(t.asText(),/Original first page/);
 t.destroy();p.destroy();d.destroy();
 const cropped=await importBytes(bytes,'cropped.pdf');assert.equal(cropped.pages[0].width,535);assert.equal(cropped.pages[0].height,762);
 const out=await exportDocument({...spec,pages:[{width:535,height:762,source:cropped.id,index:0,svg:''}]});
 const reopened=mupdf.Document.openDocument(out.bytes,'pdf'),rp=reopened.loadPage(0);assert.deepEqual(rp.getBounds(),[0,0,535,762]);rp.destroy();reopened.destroy();
 await assert.rejects(exportDocument({...spec,crop:{left:600,top:0,right:0,bottom:0}}),/visible area/);
});


test('bundled text fonts embed in PDFs instead of substituting Liberation Sans',async()=>{
 for(const [family,psName,style] of [['Lato','Lato-BoldItalic','font-weight="bold" font-style="italic"'],['Poppins','Poppins-Regular',''],['PT Serif','PTSerif-Regular',''],['Cousine','Cousine-Regular',''],['Courier Prime','CourierPrime-Regular',''],['Cutive Mono','CutiveMono-Regular',''],['Pacifico','Pacifico-Regular',''],['Inter','bide-inter-Regular',''],['Montserrat','bide-montserrat-BoldItalic','font-weight="bold" font-style="italic"'],['Dancing Script','bide-dancingscript-Regular',''],['Carlito','Carlito-BoldItalic','font-weight="bold" font-style="italic"'],['Caladea','Caladea-Regular',''],['Liberation Serif','LiberationSerif',''],['Liberation Mono','LiberationMono',''],['Liberation Sans','LiberationSans','']]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="150"><text x="10" y="70" font-size="28" font-family="${family}" ${style}>Font sample café</text></svg>`;
  const {bytes}=await exportDocument({...spec,pages:[{width:500,height:150,index:0,svg}]});
  const d=mupdf.Document.openDocument(bytes,'pdf'),p=d.loadPage(0),t=p.toStructuredText('');
  assert.match(t.asText(),/Font sample café/);assert.ok(Buffer.from(bytes).toString('latin1').includes(psName),`${family} must be embedded`);
  t.destroy();p.destroy();d.destroy();
 }
});


test('PDF text detection preserves geometry, font and source until a region is edited',async()=>{
 const result=detectPdfText(source.id,0);assert.ok(result.regions.length);const region=result.regions.find(r=>r.text.includes('Original first page'));assert.ok(region);assert.match(region.fontName,/Helvetica/);assert.equal(region.size,22);assert.ok(region.left>=49&&region.left<51);assert.ok(region.width>100);
 const edited=await removePdfText(source.id,0,region.id);assert.notEqual(edited.id,source.id);assert.ok(detectPdfText(source.id,0).regions.some(r=>r.text.includes('Original first page')));assert.equal(detectPdfText(edited.id,0).regions.some(r=>r.text.includes('Original first page')),false);assert.ok(detectPdfText(edited.id,1).regions.some(r=>r.text.includes('Original second page')));
 const doc=mupdf.Document.openDocument(Buffer.from(edited.data,'base64'),'pdf'),page=doc.loadPage(0),pix=page.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true);assert.equal(page.getLinks().length,1);const pixels=pix.getPixels(),offset=(150*pix.getWidth()+100)*3;assert.ok(pixels[offset+1]>150&&pixels[offset]<100,'green vector background remains');pix.destroy();page.destroy();doc.destroy();
});

test('an invisible OCR layer is searchable but is not native editable PDF text',async()=>{
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const p=doc.addPage([0,0,400,200],0,{Font:{F:ref}},'BT /F 20 Tf 3 Tr 30 100 Td (Wrong old OCR 999x) Tj ET');doc.insertPage(-1,p);
 const bytes=doc.saveToBuffer('');
 try{
  const imported=await importBytes(bytes.asUint8Array().slice(),'searchable-scan.pdf');
  const page=doc.loadPage(0),text=page.toStructuredText('');try{assert.match(text.asText(),/Wrong old OCR/);}finally{text.destroy();page.destroy();}
  assert.deepEqual(detectPdfText(imported.id,0).regions,[],'the visible page must go through image OCR');
 }finally{bytes.destroy();p.destroy();ref.destroy();font.destroy();doc.destroy();}
});

test('mixed pages expose painted text, ignoring invisible, transparent and clipping-only text',async()=>{
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const p=doc.addPage([0,0,400,300],0,{Font:{F:ref},ExtGState:{Transparent:{Type:'ExtGState',ca:0,CA:0}}},
  'BT /F 18 Tf 30 250 Td (Visible amount 123,45) Tj ET '+
  'BT /F 18 Tf 3 Tr 30 200 Td (Hidden amount 999,99) Tj ET '+
  'q /Transparent gs BT /F 18 Tf 0 Tr 30 150 Td (Transparent amount) Tj ET Q '+
  'q BT /F 18 Tf 7 Tr 30 100 Td (Clip-only amount) Tj ET Q '+
  'BT /F 18 Tf 1 Tr 30 50 Td (Stroked amount) Tj ET');doc.insertPage(-1,p);
 const bytes=doc.saveToBuffer('');
 try{
  const imported=await importBytes(bytes.asUint8Array().slice(),'mixed-pdf.pdf'),regions=detectPdfText(imported.id,0).regions;
  assert.deepEqual(regions.map(r=>r.text.trim()),['Visible amount 123,45','Stroked amount']);
  assert.ok(Math.abs(regions[0].left-30)<1);assert.ok(Math.abs(regions[0].baseline-50)<1);
  const changed=await removePdfText(imported.id,0,regions[0].id);
  assert.deepEqual(detectPdfText(changed.id,0).regions.map(r=>r.text.trim()),['Stroked amount']);
 }finally{bytes.destroy();p.destroy();ref.destroy();font.destroy();doc.destroy();}
});
test('embedded TrueType font is reusable and missing glyphs are identified',async()=>{
 const bytes=new Uint8Array(await readFile('src/browser/fonts/LiberationSans-Regular.ttf'));const doc=new mupdf.PDFDocument(),font=new mupdf.Font('LiberationSans',bytes),ref=doc.addSimpleFont(font);const p=doc.addPage([0,0,400,300],0,{Font:{F1:ref}},'BT /F1 24 Tf 40 200 Td (Editable embedded font) Tj ET');doc.insertPage(-1,p);const buffer=doc.saveToBuffer('');const imported=await importBytes(buffer.asUint8Array().slice(),'embedded.pdf');await writeFile('tmp/pdfs/editable-embedded.pdf',buffer.asUint8Array());buffer.destroy();p.destroy();ref.destroy();font.destroy();doc.destroy();
 const region=detectPdfText(imported.id,0).regions[0];assert.ok(region.fontData);assert.ok(region.fontId);assert.equal(fontSupportsText(region.fontData,'Edited font 123'),true);assert.equal(fontSupportsText(region.fontData,'\u{1f9d1}'),false);
 const edited=await removePdfText(imported.id,0,region.id);const output=await exportDocument({pages:[{width:400,height:300,source:edited.id,index:0,svg:`<svg xmlns="http://www.w3.org/2000/svg"><text x="40" y="100" font-family="${region.fontId}" font-size="24">Edited font 123</text></svg>`,fonts:{[region.fontId]:region.fontData}}],title:'Font edit',format:'pdf',compression:'lossless',range:'',dpi:72});const reopened=mupdf.Document.openDocument(output.bytes,'pdf'),page=reopened.loadPage(0),text=page.toStructuredText('');assert.match(text.asText(),/Edited font 123/);assert.doesNotMatch(text.asText(),/Editable embedded/);text.destroy();page.destroy();reopened.destroy();
});

test('PDF rasterization supplies actual 300 DPI pixels for text editing',()=>{
 const png=Buffer.from(render(source.id,0,300/72));
 assert.equal(png.readUInt32BE(16),Math.ceil(595*300/72));
 assert.equal(png.readUInt32BE(20),Math.ceil(842*300/72));
});


test('native PDF detection retains separate regular and bold faces',async()=>{
 const doc=new mupdf.PDFDocument(),normal=new mupdf.Font('Helvetica'),bold=new mupdf.Font('Helvetica-Bold'),n=doc.addSimpleFont(normal),b=doc.addSimpleFont(bold);
 const page=doc.addPage([0,0,500,220],0,{Font:{N:n,B:b}},'BT /N 24 Tf 30 160 Td (Regular replacement) Tj ET BT /B 24 Tf 30 110 Td (Bold replacement) Tj ET');doc.insertPage(-1,page);
 const buffer=doc.saveToBuffer(''),source=await importBytes(buffer.asUint8Array().slice(),'weights.pdf');
 await writeFile('tmp/pdfs/weights.pdf',buffer.asUint8Array());
 const regions=detectPdfText(source.id,0).regions;
 assert.equal(regions.find(r=>r.text.includes('Regular')).bold,false);assert.equal(regions.find(r=>r.text.includes('Bold')).bold,true);
 buffer.destroy();page.destroy();n.destroy();b.destroy();normal.destroy();bold.destroy();doc.destroy();
});

test('OCR lines become an invisible, searchable text layer at their page positions',async()=>{
 const blank='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eeeeee"/></svg>';
 const ocr=[{text:'Invoice total 284,50 €',left:40,top:60,width:220,height:20},{text:'Naïve café (été)',left:40,top:120,width:160,height:16}];
 const {bytes}=await exportDocument({pages:[{width:400,height:300,index:0,svg:blank,ocr}],title:'Scan',format:'pdf',compression:'lossless',range:'',dpi:144});
 const doc=mupdf.Document.openDocument(bytes,'application/pdf'),page=doc.loadPage(0),text=page.toStructuredText('preserve-whitespace');
 try{
  const plain=text.asText();
  assert.match(plain,/Invoice total 284,50 €/);assert.match(plain,/Naïve café \(été\)/);
  // Stretched to the measured width: the first line spans x 40..260 near y 60..80.
  const json=JSON.parse(text.asJSON()),line=json.blocks.flatMap(b=>b.lines||[]).find(l=>/Invoice/.test(l.text));
  assert.ok(Math.abs(line.bbox.x-40)<2&&Math.abs(line.bbox.x+line.bbox.w-260)<4,`line box ${JSON.stringify(line.bbox)}`);
  assert.ok(line.bbox.y>50&&line.bbox.y<75,`line top ${line.bbox.y}`);
  // Invisible: the page renders exactly as without the layer.
  const plainPdf=await exportDocument({pages:[{width:400,height:300,index:0,svg:blank}],title:'Scan',format:'pdf',compression:'lossless',range:'',dpi:144});
  const pix=a=>{const d=mupdf.Document.openDocument(a,'application/pdf'),p=d.loadPage(0),m=p.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true),s=m.getPixels().slice();m.destroy();p.destroy();d.destroy();return s;};
  assert.deepEqual(pix(bytes),pix(plainPdf.bytes));
 }finally{text.destroy();page.destroy();doc.destroy();}
});

test('OCR text in other alphabets is searchable too, with a small subset font',async()=>{
 const blank='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eeeeee"/></svg>';
 const ocr=[{text:'Привет мир',left:40,top:40,width:150,height:20},{text:'Καλημέρα',left:40,top:80,width:120,height:20},{text:'你好世界 안녕',left:40,top:120,width:140,height:20},{text:'مرحبا بالعالم',left:40,top:160,width:150,height:20},{text:'Total 12 €',left:40,top:200,width:100,height:20}];
 const {bytes}=await exportDocument({pages:[{width:400,height:300,index:0,svg:blank,ocr}],title:'Scan',format:'pdf',compression:'lossless',range:'',dpi:144});
 assert.ok(bytes.length<200000,`subset font keeps the file small (${bytes.length} bytes)`);
 const doc=mupdf.Document.openDocument(bytes,'application/pdf'),page=doc.loadPage(0);
 try{
  const plain=page.toStructuredText('').asText();
  for(const t of ['Привет мир','Καλημέρα','你好世界 안녕','مرحبا بالعالم','Total 12 €'])assert.ok(plain.includes(t),`"${t}" in ${JSON.stringify(plain)}`);
  assert.equal(page.search('بالعالم').length,1);assert.equal(page.search('世界').length,1);
 }finally{page.destroy();doc.destroy();}
});

test('redaction removes the text, image pixels and links under the boxes, not beside them',async()=>{
 const doc=new mupdf.PDFDocument(),font=doc.addSimpleFont(new mupdf.Font('Helvetica'),'Latin');
 // A red 40×40 image at (300,40)-(340,80) (top-left page units), and two text lines.
 const pix=new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB,[0,0,40,40],false);pix.clear(0);const px=pix.getPixels();for(let i=0;i<px.length;i+=3)px[i]=255;
 const img=doc.addImage(new mupdf.Image(pix));
 const page=doc.addPage([0,0,400,200],0,{Font:{F:font},XObject:{I:img}},'BT /F 14 Tf 30 150 Td (Email: alex@example.com) Tj ET BT /F 14 Tf 30 110 Td (Keep this line) Tj ET q 40 0 0 40 300 120 cm /I Do Q');doc.insertPage(-1,page);
 const p0=doc.loadPage(0);p0.createLink([30,40,200,60],'mailto:alex@example.com').destroy();p0.destroy();
 const source=await importBytes(doc.saveToBuffer('').asUint8Array().slice(),'private.pdf');
 const [hits]=findPdfText(source.id,0,['alex@example.com']);assert.equal(hits.length,1);
 assert.ok(hits[0].left>60&&hits[0].top>30&&hits[0].top<55,`match box ${JSON.stringify(hits[0])}`);
 const redacted=await redactPdf(source.id,0,[...hits,{left:310,top:50,width:20,height:20}]);
 const out=mupdf.Document.openDocument(Uint8Array.from(atob(redacted.data),c=>c.charCodeAt(0)),'application/pdf'),q=out.loadPage(0);
 try{
  const text=q.toStructuredText('').asText();
  assert.ok(!text.includes('alex'),`email removed: ${JSON.stringify(text)}`);assert.match(text,/Email:/);assert.match(text,/Keep this line/);
  assert.equal(q.getLinks().length,0,'the mailto link went with the text');
  // The image keeps its pixels outside the box; inside, they are gone (black box drawn over a cleared area).
  const m=q.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true),w=m.getWidth(),at=(x,y)=>Array.from(m.getPixels().slice((y*w+x)*3,(y*w+x)*3+3));
  assert.deepEqual(at(304,44),[255,0,0],'image outside the box');assert.deepEqual(at(320,60),[0,0,0],'black box');
  m.destroy();
  // No copy of the original picture remains in the file.
  const raw=new TextDecoder('latin1').decode(Uint8Array.from(atob(redacted.data),c=>c.charCodeAt(0)));assert.ok(!raw.includes('alex@example.com'));
 }finally{q.destroy();out.destroy();}
});

test('PDF forms: fields are listed, filled, and exported fillable or flattened',async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const made=await PDFDocument.create(),pg=made.addPage([400,300]),form=made.getForm();
 const name=form.createTextField('Full name');name.addToPage(pg,{x:40,y:220,width:200,height:22});
 const agree=form.createCheckBox('Agree');agree.addToPage(pg,{x:40,y:180,width:14,height:14});
 const city=form.createDropdown('City');city.addOptions(['Lyon','Paris']);city.addToPage(pg,{x:40,y:140,width:120,height:22});
 const size=form.createRadioGroup('Size');size.addOptionToPage('S',pg,{x:40,y:100,width:14,height:14});size.addOptionToPage('L',pg,{x:70,y:100,width:14,height:14});
 const source=await importBytes(await made.save(),'form.pdf');
 const fields=pdfFormFields(source.id,0);
 assert.deepEqual(fields.map(f=>[f.type,f.name]),[['text','Full name'],['checkbox','Agree'],['dropdown','City'],['radio','Size'],['radio','Size']]);
 const top=fields[0];assert.ok(Math.abs(top.left-40)<1&&Math.abs(top.top-(300-220-22))<1,`top-left geometry ${JSON.stringify(top)}`);
 assert.deepEqual(fields[2].options,['Lyon','Paris']);assert.deepEqual(fields.slice(3).map(f=>f.option),['S','L']);
 let id=source.id;
 for(const [widget,value] of [[0,'Alex Martin'],[1,'Yes'],[2,'Paris'],[4,'Yes']])id=(await fillPdfField(id,0,widget,value)).id;
 const filled=pdfFormFields(id,0);assert.deepEqual(filled.map(f=>f.value),['Alex Martin','Yes','Paris','Off','Yes']);
 const blank='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>';
 const extra={id:'new',type:'text',name:'Signature date',left:200,top:250,width:120,height:20,value:'19/10/2026'};
 // Fillable: every field (and the new one) is a real field with its value.
 const keep=await exportDocument({pages:[{width:400,height:300,index:0,source:id,svg:blank,forms:[extra]}],title:'Form',format:'pdf',compression:'lossless',range:'',dpi:144,keepForms:true});
 const kept=(await PDFDocument.load(keep.bytes)).getForm();
 assert.deepEqual(kept.getFields().map(f=>f.getName()).sort(),['Agree','City','Full name','Signature date','Size']);
 assert.equal(kept.getTextField('Full name').getText(),'Alex Martin');assert.equal(kept.getCheckBox('Agree').isChecked(),true);
 assert.deepEqual(kept.getDropdown('City').getSelected(),['Paris']);assert.equal(kept.getRadioGroup('Size').getSelected(),'L');
 assert.equal(kept.getTextField('Signature date').getText(),'19/10/2026');
 // Flattened (default): no fields left, the values are part of the page.
 const flat=await exportDocument({pages:[{width:400,height:300,index:0,source:id,svg:blank,forms:[extra]}],title:'Form',format:'pdf',compression:'lossless',range:'',dpi:144});
 assert.equal((await PDFDocument.load(flat.bytes)).getForm().getFields().length,0);
 const d=mupdf.Document.openDocument(flat.bytes,'application/pdf'),text=d.loadPage(0).toStructuredText('').asText();
 assert.match(text,/Alex Martin/);assert.match(text,/19\/10\/2026/);
 // Password and fields together.
 const locked=await exportDocument({pages:[{width:400,height:300,index:0,source:id,svg:blank}],title:'Form',format:'pdf',compression:'lossless',range:'',dpi:144,keepForms:true,password:'s3cret'});
 const ld=mupdf.Document.openDocument(locked.bytes,'application/pdf');assert.ok(ld.needsPassword());
});

test('redacting a form field removes all its widgets and stored values from sources and exports',async()=>{
 const {PDFDocument,PDFName,PDFString}=await import('pdf-lib');
 const made=await PDFDocument.create(),first=made.addPage([400,300]),second=made.addPage([400,300]),form=made.getForm();
 const secret=form.createTextField('Private.contact');secret.setText('SECRET widget');
 secret.acroField.dict.set(PDFName.of('DV'),PDFString.of('SECRET default'));
 secret.addToPage(first,{x:30,y:220,width:200,height:22});secret.addToPage(second,{x:30,y:220,width:200,height:22});
 const publicField=form.createTextField('Public');publicField.setText('Keep me');publicField.addToPage(first,{x:30,y:100,width:200,height:22});
 const source=await importBytes(await made.save(),'private-form.pdf'),area=pdfFormFields(source.id,0).find(f=>f.name==='Private.contact');
 const redacted=await redactPdf(source.id,0,[area]);
 assert.deepEqual(pdfFormFields(redacted.id,0).map(f=>[f.name,f.value]),[['Public','Keep me']]);
 assert.deepEqual(pdfFormFields(redacted.id,1),[],'other widgets of the same secret field are removed too');
 const inspect=async bytes=>{
  const f=(await PDFDocument.load(bytes)).getForm();assert.ok(!f.getFields().some(f=>f.getName()==='Private.contact'));
  const d=mupdf.Document.openDocument(bytes,'application/pdf');
  try{
   for(let i=0;i<d.countPages();i++){const p=d.loadPage(i),t=p.toStructuredText('');try{assert.ok(!t.asText().includes('SECRET'));}finally{t.destroy();p.destroy();}}
   // Inspect every surviving object's dictionary and decoded stream, including
   // objects that a viewer would not render. Original appearances must be gone.
   for(let i=1;i<d.countObjects();i++){
    const o=d.newIndirect(i),resolved=o.resolve();let value=resolved.toString();
    try{if(o.isStream()){const b=o.readStream();try{value+='\n'+b.asString();}finally{b.destroy();}}
     assert.ok(!/SECRET|534543524554|005300450043005200450054/.test(value),`secret object ${i}: ${value.slice(0,200)}`);
    }finally{resolved.destroy();o.destroy();}
   }
  }finally{d.destroy();}
 };
 await inspect(Uint8Array.from(atob(redacted.data),c=>c.charCodeAt(0)));
 for(const keepForms of [false,true]){
  const {bytes}=await exportDocument({pages:[{width:400,height:300,index:0,source:redacted.id,svg:''},{width:400,height:300,index:1,source:redacted.id,svg:''}],title:'Redacted',format:'pdf',compression:'lossless',range:'',dpi:144,keepForms});
  await inspect(bytes);
  if(keepForms)assert.equal((await PDFDocument.load(bytes)).getForm().getTextField('Public').getText(),'Keep me');
 }
});

test('redaction removes intersecting vector paths rather than hiding them behind a box',async()=>{
 const doc=new mupdf.PDFDocument(),page=doc.addPage([0,0,400,200],0,{},'0 0 0 RG 3 w 20 150 m 200 150 l S 20 100 m 200 100 l S');doc.insertPage(-1,page);
 const source=await importBytes(doc.saveToBuffer('').asUint8Array().slice(),'outlines.pdf');
 const redacted=await redactPdf(source.id,0,[{left:50,top:40,width:40,height:20}]);
 const out=mupdf.Document.openDocument(Uint8Array.from(atob(redacted.data),c=>c.charCodeAt(0)),'application/pdf'),p=out.loadPage(0),contents=p.getObject().get('Contents'),chunks=[];
 try{
  const read=o=>{const b=o.readStream();try{chunks.push(b.asString());}finally{b.destroy();}};if(contents.isArray())contents.forEach(read);else read(contents);
  const commands=chunks.join('\n');assert.doesNotMatch(commands,/20 150 m/,'the original crossing path is gone');assert.match(commands,/20 100 m/,'unrelated vector art remains');
 }finally{contents.destroy();p.destroy();out.destroy();}
});

test('PDF radio buttons switch between existing choices and preserve the chosen export value',async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const made=await PDFDocument.create(),pg=made.addPage([400,300]),radio=made.getForm().createRadioGroup('Size');
 radio.addOptionToPage('S',pg,{x:30,y:200,width:14,height:14});radio.addOptionToPage('L',pg,{x:60,y:200,width:14,height:14});radio.select('S');
 const source=await importBytes(await made.save(),'radio.pdf');let id=source.id;
 for(const widget of [1,0,1]){
  id=(await fillPdfField(id,0,widget,'Yes')).id;
  assert.deepEqual(pdfFormFields(id,0).map(f=>f.value),widget===0?['Yes','Off']:['Off','Yes']);
 }
 const {bytes}=await exportDocument({pages:[{width:400,height:300,index:0,source:id,svg:''}],title:'Radio',format:'pdf',compression:'lossless',range:'',dpi:144,keepForms:true});
 assert.equal((await PDFDocument.load(bytes)).getForm().getRadioGroup('Size').getSelected(),'L');
});

test('Unicode form values use a bundled font and remain editable or flatten correctly',async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const value='Мария · Καλημέρα · François à Lyon',fields=[{id:'name',type:'text',name:'Name',left:20,top:20,width:340,height:24,value},
  {id:'city',type:'dropdown',name:'City',left:20,top:70,width:180,height:24,value:'Αθήνα',options:['Αθήνα','Paris']}];
 const spec={pages:[{width:400,height:300,index:0,svg:'',forms:fields}],title:'Unicode form',format:'pdf',compression:'lossless',range:'',dpi:144};
 const kept=await exportDocument({...spec,keepForms:true}),pdf=await PDFDocument.load(kept.bytes),form=pdf.getForm();
 assert.equal(form.getTextField('Name').getText(),value);assert.deepEqual(form.getDropdown('City').getSelected(),['Αθήνα']);
 // A full embedded font, rather than a subset containing only the first value,
 // lets recipients enter different letters using the same appearance resource.
 const field=form.getTextField('Name'),resources=field.acroField.getWidgets()[0].dict.lookup((await import('pdf-lib')).PDFName.of('AP'));
 assert.ok(resources,'editable widget appearance is present');
 const flat=await exportDocument(spec),d=mupdf.Document.openDocument(flat.bytes,'application/pdf'),p=d.loadPage(0),text=p.toStructuredText('');
 try{assert.ok(text.asText().includes(value));assert.match(text.asText(),/Αθήνα/);assert.equal((await PDFDocument.load(flat.bytes)).getForm().getFields().length,0);}finally{text.destroy();p.destroy();d.destroy();}
 await assert.rejects(()=>exportDocument({...spec,pages:[{...spec.pages[0],forms:[{...fields[0],value:'你好'}]}]}),/bundled PDF form font does not support/);
});

test('sanitized project sources omit discarded pages, old form values and unused page resources',async()=>{
 const {PDFDocument}=await import('pdf-lib');
 const made=await PDFDocument.create(),discarded=made.addPage([400,300]),kept=made.addPage([400,300]),form=made.getForm();
 discarded.drawText('SECRET discarded page',{x:20,y:200,size:14});kept.drawText('Keep this page',{x:20,y:200,size:14});
 const secret=form.createTextField('Discarded');secret.setText('SECRET field');secret.addToPage(discarded,{x:20,y:100,width:150,height:22});
 const field=form.createTextField('Kept');field.setText('Public value');field.addToPage(kept,{x:20,y:100,width:150,height:22});
 const doc=mupdf.Document.openDocument(await made.save(),'application/pdf'),extra=doc.addStream('SECRET unused resource',{Type:'XObject',Subtype:'Form',BBox:[0,0,10,10],Resources:{}}),p=doc.loadPage(1),resources=p.getObject().get('Resources');
 resources.put('XObject',{UnusedSecret:extra});
 const source=await importBytes(doc.saveToBuffer('').asUint8Array().slice(),'old-source.pdf');
 const safe=await sanitizePdf(source.id,[1]);assert.equal(safe.pages.length,1);assert.equal(safe.pages[0].index,0);
 assert.deepEqual(pdfFormFields(safe.id,0).map(f=>[f.name,f.value]),[['Kept','Public value']]);
 const bytes=Uint8Array.from(atob(safe.data),c=>c.charCodeAt(0)),out=mupdf.Document.openDocument(bytes,'application/pdf');
 try{
  assert.equal(out.countPages(),1);const page=out.loadPage(0),text=page.toStructuredText('');try{assert.match(text.asText(),/Keep this page/);assert.doesNotMatch(text.asText(),/SECRET/);}finally{text.destroy();page.destroy();}
  for(let i=1;i<out.countObjects();i++){
   const o=out.newIndirect(i),resolved=o.resolve();let raw=resolved.toString();
   try{if(o.isStream()){const b=o.readStream();try{raw+='\n'+b.asString();}finally{b.destroy();}}assert.doesNotMatch(raw,/SECRET|534543524554|005300450043005200450054/);}finally{resolved.destroy();o.destroy();}
  }
 }finally{out.destroy();resources.destroy();p.destroy();extra.destroy();doc.destroy();}
 assert.equal((await PDFDocument.load(bytes)).getForm().getTextField('Kept').getText(),'Public value');
 await assert.rejects(()=>sanitizePdf(source.id,[2]),/valid PDF pages/);
});

test('scanner text replacement removes the whole old field, including an unchanged prefix',async()=>{
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),face=doc.addSimpleFont(font);
 const object=doc.addPage([0,0,420,180],0,{Font:{F:face}},'1 1 1 rg 0 0 420 180 re f 0.2 0.4 0.6 rg 250 40 100 80 re f BT /F 18 Tf 3 Tr 30 100 Td (1 947,80 EUR) Tj ET BT /F 14 Tf 3 Tr 30 45 Td (Reference 88) Tj ET');
 doc.insertPage(-1,object);const buffer=doc.saveToBuffer(''),data=buffer.asUint8Array().slice();buffer.destroy();object.destroy();face.destroy();font.destroy();doc.destroy();
 const input=await importBytes(data,'invented-scanner-layer.pdf');
 // The visible original-letter patch covers only the suffix that changed.
 // Its OCR repair must use the separately recorded full original field.
 const original={left:30,top:62,width:130,height:25};
 for(const replacement of ['1 974,80 EUR','']){
 const result=await exportDocument({pages:[{width:420,height:180,source:input.id,index:0,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180"></svg>',edits:[{left:55,top:62,width:79,height:25,text:replacement,original}]}],title:'Scanner replacement',format:'pdf',compression:'lossless',range:'',dpi:72});
 const output=mupdf.Document.openDocument(result.bytes,'pdf'),page=output.loadPage(0),structured=page.toStructuredText('');
 try{
  const lines=structured.asText().split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
  assert.deepEqual(lines.sort(),[...(replacement?[replacement]:[]),'Reference 88'].sort(),'replacement or deletion leaves no old amount prefix behind');
  const before=mupdf.Document.openDocument(data,'pdf'),beforePage=before.loadPage(0),a=beforePage.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true),b=page.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true);
  try{assert.deepEqual(a.getPixels(),b.getPixels(),'repairing invisible text never changes the scan or its drawings');}finally{a.destroy();b.destroy();beforePage.destroy();before.destroy();}
 }finally{structured.destroy();page.destroy();output.destroy();}
 }
});

// Invented, valid grayscale images: metadata is inspected without decoding a
// whole-page raster, and no real scan is used or written into the repository.
async function scanFixture({width=432,height=432,images=[['Scan',1200,1200]],commands,states={},forms=[]}={}){
 const doc=new mupdf.PDFDocument(),refs={},owned=[];
 try{
  for(const [name,w,h] of images){const ref=doc.addStream(new Uint8Array(w*h),{Type:'XObject',Subtype:'Image',Width:w,Height:h,ColorSpace:'DeviceGray',BitsPerComponent:8});refs[name]=ref;owned.push(ref);}
  for(const form of forms){const ref=doc.addStream(form.commands,{Type:'XObject',Subtype:'Form',FormType:1,BBox:form.bounds??[0,0,1,1],Resources:{XObject:{...refs}},Group:form.group});refs[form.name]=ref;owned.push(ref);}
  const page=doc.addPage([0,0,width,height],0,{XObject:refs,ExtGState:typeof states==='function'?states(refs):states},commands??`q ${width} 0 0 ${height} 0 0 cm /Scan Do Q`);owned.push(page);doc.insertPage(-1,page);
  const buffer=doc.saveToBuffer('compress');try{return await importBytes(buffer.asUint8Array().slice(),'invented-scan-metadata.pdf');}finally{buffer.destroy();}
 }finally{for(const ref of owned)ref.destroy();doc.destroy();}
}
// The existing glyph caller accepts native density only within this budget.
const boundedScanScale=source=>{const page=source.pages[0],native=scanScale(source.id,0),budget=letterRasterScale(page.width,page.height,true);return native!==undefined&&native<=budget?native:budget;};

test('a single upright scan keeps native density within existing PDF raster limits',async()=>{
 for(const dpi of [200,300,500]){
  const source=await scanFixture({images:[['Scan',6*dpi,6*dpi]]}),native=scanScale(source.id,0),k=boundedScanScale(source);
  assert.ok(Math.abs(native-dpi/72)<1e-5,`${dpi} dpi image metadata is retained`);
  assert.ok(Math.abs(k-Math.min(dpi,300)/72)<1e-5,`${dpi} dpi stays within the 300 dpi render cap`);
 }
 for(const options of [{width:2000,height:2000,images:[['Scan',6000,6000]]},{width:100,height:14000,images:[['Scan',200,28000]]}]){
  const source=await scanFixture(options),k=boundedScanScale(source),p=source.pages[0];
  assert.equal(scanScale(source.id,0),options.images[0][1]/options.width,'native metadata does not expand the caller budget');
  assert.ok(p.width*p.height*k*k<=16000001,'the 16-million-pixel limit remains');assert.ok(Math.max(p.width,p.height)*k<=8192.001,'the 8192-pixel side limit remains');
 }
 // Pixel-rounded A4 dimensions still reproduce the scan through MuPDF. A
 // float-roundoff-only isotropy test wrongly discarded this verified grid.
 const rounded=await scanFixture({width:595,height:842,images:[['Scan',1653,2339]]});
 assert.equal(scanScale(rounded.id,0),Math.min(1653/595,2339/842));
});

test('invisible and off-page images cannot override the visible scan density',async()=>{
 const images=[['Scan',1200,1200],['Decoy',2400,2400]],scan='q 432 0 0 432 0 0 cm /Scan Do Q';
 const cases=[
  ['off-page image',{commands:`q 864 0 0 864 900 0 cm /Decoy Do Q ${scan}`}],
  ['zero-alpha image',{states:{Ghost:{Type:'ExtGState',ca:0,CA:0}},commands:`q /Ghost gs 432 0 0 432 0 0 cm /Decoy Do Q ${scan}`}],
  ['zero-alpha transparency group',{states:{Ghost:{Type:'ExtGState',ca:0,CA:0}},forms:[{name:'Hidden',commands:'/Decoy Do',group:{S:'Transparency',I:true,K:false}}],commands:`q /Ghost gs 432 0 0 432 0 0 cm /Hidden Do Q ${scan}`}]
 ];
 for(const [name,options] of cases){const source=await scanFixture({images,...options});assert.equal(scanScale(source.id,0),200/72,name);}
 const outside=await scanFixture({commands:'q 432 0 0 432 900 0 cm /Scan Do Q'});assert.equal(scanScale(outside.id,0),undefined,'a large image wholly outside the page establishes no density');
});

test('uncertain scan geometry falls back instead of selecting an unverified pixel grid',async()=>{
 const group={S:'Transparency',I:true,K:false};
 const cases=[
  ['two page images',{images:[['Scan',1200,1200],['Other',1800,1800]],commands:'q 432 0 0 432 0 0 cm /Scan Do Q q 432 0 0 432 0 0 cm /Other Do Q'}],
  ['small secondary image',{images:[['Scan',1200,1200],['Small',300,300]],commands:'q 432 0 0 432 0 0 cm /Scan Do Q q 40 0 0 40 200 200 cm /Small Do Q'}],
  ['partly off-page secondary image',{images:[['Scan',1200,1200],['Other',1800,1800]],commands:'q 432 0 0 432 0 0 cm /Scan Do Q q 432 0 0 432 420 0 cm /Other Do Q'}],
  ['clipped scan',{commands:'q 0 0 100 432 re W n 432 0 0 432 0 0 cm /Scan Do Q'}],
  ['soft-masked scan',{forms:[{name:'Mask',bounds:[0,0,432,432],commands:'1 g 0 0 432 432 re f',group}],states:refs=>({Masked:{Type:'ExtGState',SMask:{S:'Luminosity',G:refs.Mask}}}),commands:'q /Masked gs 432 0 0 432 0 0 cm /Scan Do Q'}],
  ['knockout group',{forms:[{name:'ScanGroup',commands:'/Scan Do',group:{...group,K:true}}],commands:'q 432 0 0 432 0 0 cm /ScanGroup Do Q'}],
  ['non-Normal blend group',{forms:[{name:'ScanGroup',commands:'/Scan Do',group}],states:{Blend:{Type:'ExtGState',BM:'Multiply'}},commands:'q /Blend gs 432 0 0 432 0 0 cm /ScanGroup Do Q'}],
  ['nonuniformly stretched scan',{images:[['Scan',1200,800]]}],
  ['turned scan',{commands:'q 0 432 -432 0 432 0 cm /Scan Do Q'}],
  ['reflected scan',{commands:'q -432 0 0 432 432 0 cm /Scan Do Q'}]
 ];
 for(const [name,options] of cases){const source=await scanFixture(options);assert.equal(scanScale(source.id,0),undefined,name);assert.equal(boundedScanScale(source),300/72,'uncertain pages keep the full bounded render fallback');}
});

const readingArea=(left,top,width,height)=>({points:[{x:left,y:top},{x:left+width,y:top},{x:left+width,y:top+height},{x:left,y:top+height}]});
const readingPixels=png=>{const image=new mupdf.Image(png),pix=image.toPixmap();try{return {width:pix.getWidth(),height:pix.getHeight(),channels:pix.getNumberOfComponents(),pixels:pix.getPixels().slice()};}finally{pix.destroy();image.destroy();}};

test('selected-area raster budgets depend on the crop, retaining tiny text on a large sheet',()=>{
 const plan=selectionRasterPlan(2400,3200,readingArea(10,20,160,30));
 assert.equal(plan.scale,300/72);assert.equal(plan.width,668);assert.equal(plan.height,126);
 assert.equal(plan.left,plan.pixelBounds[0]/plan.scale);assert.equal(plan.top,plan.pixelBounds[1]/plan.scale);
 for(const area of [readingArea(0,0,14400,14400),readingArea(.12,.56,14000,.8),readingArea(.12,.56,.8,14000)]){
  const p=selectionRasterPlan(14400,14400,area,20);assert.ok(p.width<=8192&&p.height<=8192&&p.width*p.height<=16000000);assert.ok(p.scale<=300/72);
 }
 const mask={width:400,height:300,data:new Uint8ClampedArray(400*300)};mask.data[50*400+20]=255;mask.data[59*400+29]=255;
 const p=selectionRasterPlan(400,300,{points:[],mask},1);assert.deepEqual([p.left,p.top,p.width,p.height],[20,50,10,10]);
 assert.throws(()=>selectionRasterPlan(400,300,{points:[],mask:{...mask,data:new Uint8ClampedArray(2)}}),/mask/);
 assert.throws(()=>selectionRasterPlan(400,300,{points:[]}),/Draw an area/);
 assert.throws(()=>selectionRasterPlan(400,300,readingArea(500,500,30,30)),/inside the page/);
 assert.throws(()=>selectionRasterPlan(400,300,readingArea(10,20,0,30)),/inside the page/);
 assert.throws(()=>selectionRasterPlan(400,300,readingArea(NaN,20,30,30)),/Draw an area/);
 assert.throws(()=>selectionRasterPlan(Infinity,300,readingArea(10,20,30,30)),/invalid/);
});

async function readingPdf({box=[0,0,600,400],rotation=0}={}){
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font),page=doc.addPage(box,rotation,{Font:{F:ref}},'1 1 1 rg -1000 -1000 4000 4000 re f 0.2 0.4 0.6 rg 50 80 190 150 re f 0 0 0 rg BT /F 6 Tf 70 180 Td (Reference ZX 4827 TOTAL 1947.80 EUR) Tj ET 0.8 0.1 0.4 rg 120 120 20 25 re f');
 doc.insertPage(-1,page);const buffer=doc.saveToBuffer(''),bytes=buffer.asUint8Array().slice();buffer.destroy();page.destroy();ref.destroy();font.destroy();doc.destroy();return {bytes,source:await importBytes(bytes,'invented-reading.pdf')};
}

test('selected PDF crops reproduce native render pixels through page rotation, nonzero boxes and resizing',async()=>{
 for(const fixture of [{},{rotation:90},{box:[20,30,620,430]},{box:[20,30,620,430],rotation:270}]){
  const made=await readingPdf(fixture),doc=mupdf.Document.openDocument(made.bytes,'pdf'),page=doc.loadPage(0),bounds=page.getBounds(),native={width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]};
  try{
   for(const size of [undefined,{width:native.width*.6,height:native.height*.8}]){
    const frame=size??native,area=readingArea(15.3,25.7,Math.min(220,frame.width-20),Math.min(180,frame.height-30)),crop=renderArea(made.source.id,0,area,2.5,size),actual=readingPixels(crop.png),sx=crop.scale*frame.width/native.width,sy=crop.scale*frame.height/native.height;
    const full=page.toPixmap([sx,0,0,sy,-bounds[0]*sx,-bounds[1]*sy],mupdf.ColorSpace.DeviceRGB,true,true);
    try{
     assert.deepEqual([actual.width,actual.height,actual.channels],[crop.width,crop.height,4]);
     const expected=new Uint8ClampedArray(crop.width*crop.height*4),x0=Math.round(crop.left*crop.scale)-full.getX(),y0=Math.round(crop.top*crop.scale)-full.getY(),pixels=full.getPixels();
     for(let y=0;y<crop.height;y++)expected.set(pixels.subarray(((y+y0)*full.getWidth()+x0)*4,((y+y0)*full.getWidth()+x0+crop.width)*4),y*crop.width*4);
     assert.deepEqual(actual.pixels,expected,`rotation ${fixture.rotation??0}, nonzero ${!!fixture.box}, resized ${!!size}`);
    }finally{full.destroy();}
   }
  }finally{page.destroy();doc.destroy();}
 }
});

test('native-detail PDF reading allocates only a small crop on a large page and preserves the source',async()=>{
 const made=await readingPdf({box:[0,0,2400,3200]}),area=readingArea(60,3000,160,30),before=detectPdfText(made.source.id,0);
 const crop=renderArea(made.source.id,0,area),pixels=readingPixels(crop.png);assert.equal(crop.scale,300/72);assert.ok(crop.width<=669&&crop.height<=126);assert.ok(pixels.pixels.some((v,i)=>i%4!==3&&v<80),'the native crop contains the small printed reference');
 assert.deepEqual(detectPdfText(made.source.id,0),before,'reading never changes the original page');
 assert.throws(()=>renderArea(made.source.id,0,area,4,{width:NaN,height:400}),/visible page/);
 assert.throws(()=>renderArea('missing',0,area),/Reopen/);
});

test('PDF reading refuses current form appearances in the visible resized coordinate frame',async()=>{
 const {PDFDocument}=await import('pdf-lib'),pdf=await PDFDocument.create(),page=pdf.addPage([400,300]),field=pdf.getForm().createTextField('Amount');field.setText('Old underlying value');field.addToPage(page,{x:40,y:150,width:160,height:30});
 page.drawText('Unrelated header',{x:40,y:260,size:12});const imported=await importBytes(await pdf.save(),'invented-reading-form.pdf'),before=pdfFormFields(imported.id,0);
 assert.throws(()=>renderArea(imported.id,0,readingArea(35,110,175,50)),/editable form field/);
 assert.throws(()=>renderArea(imported.id,0,readingArea(70,220,350,100),4,{width:800,height:600}),/editable form field/);
 assert.ok(renderArea(imported.id,0,readingArea(30,20,200,35)).png.length>100,'an unrelated header is still readable');
 assert.deepEqual(pdfFormFields(imported.id,0),before,'refusal and reading do not change live fields');
});

test('selected PDF crops retain transparent unpainted pixels for the visible page compositor',async()=>{
 const doc=new mupdf.PDFDocument(),obj=doc.addPage([0,0,400,300],0,{},'0.2 0.4 0.6 rg 40 210 20 20 re f');doc.insertPage(-1,obj);const buffer=doc.saveToBuffer(''),imported=await importBytes(buffer.asUint8Array().slice(),'invented-transparent-reading.pdf');buffer.destroy();obj.destroy();doc.destroy();
 const crop=renderArea(imported.id,0,readingArea(20,50,60,60),1),pixels=readingPixels(crop.png);assert.equal(pixels.channels,4);assert.deepEqual([...pixels.pixels.subarray(0,4)],[0,0,0,0]);
 const ink=((70-50)*pixels.width+(40-20))*4;assert.deepEqual([...pixels.pixels.subarray(ink,ink+4)],[51,102,153,255]);
});
