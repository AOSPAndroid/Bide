import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import * as mupdf from 'mupdf';
import { unzipSync, strFromU8 } from 'fflate';
import { importBytes, exportDocument, restore, render, selectPages } from '../tmp/browser-core.mjs';
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
 for(const [family,psName,style] of [['Lato','Lato-BoldItalic','font-weight="bold" font-style="italic"'],['Poppins','Poppins-Regular',''],['PT Serif','PTSerif-Regular',''],['Cousine','Cousine-Regular',''],['Pacifico','Pacifico-Regular','']]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="150"><text x="10" y="70" font-size="28" font-family="${family}" ${style}>Font sample café</text></svg>`;
  const {bytes}=await exportDocument({...spec,pages:[{width:500,height:150,index:0,svg}]});
  const d=mupdf.Document.openDocument(bytes,'pdf'),p=d.loadPage(0),t=p.toStructuredText('');
  assert.match(t.asText(),/Font sample café/);assert.ok(Buffer.from(bytes).toString('latin1').includes(psName),`${family} must be embedded`);
  t.destroy();p.destroy();d.destroy();
 }
});
