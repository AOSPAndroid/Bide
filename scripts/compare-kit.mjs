// A fair comparison with other editors, by hand (their terms forbid automated
// use, and some need an account). Uses the edit benchmark's invented documents
// (tests/edit-bench/docs.mjs: nothing real) and its scoring (score.mjs).
//
//   node scripts/compare-kit.mjs export <dir>
//     writes the documents to edit (01-invoice-scan.pdf...), TASKS.md listing
//     each edit to make, and the references the edits are scored against.
//   Make each edit in the other editor, starting each time from the file as
//   exported, and save its download in <dir>/<editor>/ named after the task:
//     <dir>/<editor>/03.pdf   (or .png / .jpg, as the editor gives it)
//   A task the editor cannot do (no way to change scanned text): leave it out.
//   node scripts/compare-kit.mjs score <dir> [bench results.json]
//     scores every editor's downloads, and Bide's own edits when the results
//     of an edit benchmark run (npm run bench:edit) are given.
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {writeFile,readFile,mkdir,readdir} from 'node:fs/promises';
import * as mupdf from 'mupdf';import {PDFDocument} from 'pdf-lib';
import {templates,variants} from '../tests/edit-bench/docs.mjs';
import {bideComparisonResult} from './compare-kit-result.mjs';

// The documents and edits of the kit: a scanned invoice (PDF and phone JPEG),
// a letter scanned at 300 dpi, a business card, a booking screenshot and a
// low-resolution scan. Each: edits a line's own letters can make, edits that
// need a letter from another line, and edits that need a letter found nowhere.
const KIT=[
 {name:'invoice-scan',t:'workshop',v:'pdf',edits:[['a1','46,00 €'],['total','148,30 €'],['date','12 mars 2027']]},
 {name:'invoice-photo',t:'workshop',v:'soft',edits:[['a3','9,60 €'],['l3','Câble de frein avant'],['ref','Facture 2026-0481']]},
 {name:'letter-scan',t:'letter',v:'fine',edits:[['s3','Le règlement de 295 euros a bien été reçu.'],['date','Le 4 février 2028'],['to','Madame Hélène Garnier-Roux']]},
 {name:'business-card',t:'ad',v:'clean',edits:[['tel','07 33 61 26 84'],['mail','atelier.lambert@gmail.com'],['name','ATELIER MARTIN']]},
 {name:'booking-screenshot',t:'screen',v:'shot',edits:[['v2','sam. 25 juil. 2027'],['v4','742,80 €'],['place','Gîte du Vieux Lavoir']]},
 {name:'invoice-lowres',t:'workshop',v:'viewpdf',edits:[['a2','18,70 €'],['total','143,90 €'],['l3','Câble de frein avant']]},
];
const [command,dir,benchResults]=process.argv.slice(2);
if(!['export','score'].includes(command)||!dir){console.log('node scripts/compare-kit.mjs export <dir> | score <dir> [results.json]');process.exit(1);}

const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
try{
 const app=await browser.newPage();await app.goto(server.resolvedUrls.local[0]);await app.waitForTimeout(800);
 // As scripts/edit-bench.mjs renders them: the scan's resolution, blur, noise, JPEG.
 async function scan(tpl,v,values){
  const dpr=v.dpi/72,page=await browser.newPage({viewport:{width:tpl.width,height:tpl.height},deviceScaleFactor:dpr});
  try{
   await page.setContent(`<!doctype html><meta charset="utf-8"><style>${tpl.fonts?await tpl.fonts():''}body{margin:0;background:#fff;overflow:hidden}</style><div id="doc" style="width:${tpl.width}px;height:${tpl.height}px;${v.rotate?`transform:rotate(${v.rotate}deg);`:''}${v.blur?`filter:blur(${v.blur/dpr}px);`:''}">${tpl.html(values)}</div>`);
   await page.evaluate(()=>document.fonts.ready);
   const fields=await page.evaluate(dpr=>[...document.querySelectorAll('[data-f]')].map(e=>{const b=e.getBoundingClientRect();return {id:e.dataset.f,text:e.textContent,x:b.left*dpr,y:b.top*dpr,w:b.width*dpr,h:b.height*dpr};}),dpr);
   const png=(await page.screenshot({clip:{x:0,y:0,width:tpl.width,height:tpl.height}})).toString('base64');
   const done=await app.evaluate(async([png,v])=>{
    const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
    if(v.noise){const px=g.getImageData(0,0,c.width,c.height);let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;for(let i=0;i<px.data.length;i+=4){const n=(rnd()+rnd()+rnd()-1.5)*v.noise;for(let k=0;k<3;k++)px.data[i+k]=Math.max(0,Math.min(255,px.data[i+k]+n));}g.putImageData(px,0,0);}
    let jpeg;if(v.jpeg){jpeg=c.toDataURL('image/jpeg',v.jpeg).split(',')[1];const j=new Image();j.src='data:image/jpeg;base64,'+jpeg;await j.decode();g.drawImage(j,0,0);}
    return {pixels:c.toDataURL('image/png').split(',')[1],jpeg,width:c.width,height:c.height};
   },[png,v]);
   return {fields,...done};
  }finally{await page.close();}
 }
 async function file(s,v){
  if(v.as==='png')return {bytes:Buffer.from(s.pixels,'base64'),ext:'png'};
  if(v.as==='jpg')return {bytes:Buffer.from(s.jpeg,'base64'),ext:'jpg'};
  const pdf=await PDFDocument.create(),img=s.jpeg?await pdf.embedJpg(Buffer.from(s.jpeg,'base64')):await pdf.embedPng(Buffer.from(s.pixels,'base64')),p=pdf.addPage([s.width*72/v.dpi,s.height*72/v.dpi]);
  p.drawImage(img,{x:0,y:0,width:p.getWidth(),height:p.getHeight()});return {bytes:Buffer.from(await pdf.save()),ext:'pdf'};
 }
 const rasterize=(bytes,w,h)=>{const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(0),b=p.getBounds(),x=p.toPixmap(mupdf.Matrix.scale(w/(b[2]-b[0]),h/(b[3]-b[1])),mupdf.ColorSpace.DeviceRGB,false,true);try{return Buffer.from(x.asPNG()).toString('base64');}finally{x.destroy();p.destroy();d.destroy();}};

 const tasks=[];let n=0;
 for(const [i,doc] of KIT.entries())for(const [fid,to] of doc.edits)tasks.push({n:++n,doc,i,fid,to});
 if(command==='export'){
  await mkdir(`${dir}/references`,{recursive:true});
  const lines=['# Edits to make','','Open each document, change the text shown, and download the result as',"`<editor>/<task>.<pdf|png|jpg>` in this folder (for example `sejda/03.pdf`).",'Start every task from the document as exported (not from an earlier edit).','Match the original look as well as the editor allows; skip a task it cannot do.','`references/<task>.png` shows each result as it should look.','','| Task | Document | Change | To |','|---|---|---|---|'];
  for(const [i,doc] of KIT.entries()){
   const tpl=templates[doc.t],v=variants[doc.v],original=await scan(tpl,v,tpl.fields),f=await file(original,v),fname=`${String(i+1).padStart(2,'0')}-${doc.name}.${f.ext}`;
   await writeFile(`${dir}/${fname}`,f.bytes);doc.file=fname;
   for(const [fid,to] of doc.edits){const task=tasks.find(x=>x.doc===doc&&x.fid===fid&&x.to===to);const target=await scan(tpl,v,{...tpl.fields,[fid]:to});await writeFile(`${dir}/references/${String(task.n).padStart(2,'0')}.png`,Buffer.from(target.pixels,'base64'));lines.push(`| ${String(task.n).padStart(2,'0')} | ${fname} | ${tpl.fields[fid]} | ${to} |`);}
  }
  await writeFile(`${dir}/TASKS.md`,lines.join('\n')+'\n');
  console.log(`${tasks.length} tasks in ${dir}/TASKS.md`);
 }else{
  const editors=(await readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()&&e.name!=='references').map(e=>e.name);
  const bench=benchResults?JSON.parse(await readFile(benchResults,'utf8')).records:undefined;
  const rows=[];
  for(const task of tasks){
   const tpl=templates[task.doc.t],v=variants[task.doc.v],original=task.doc.original??=await scan(tpl,v,tpl.fields),reference=await scan(tpl,v,{...tpl.fields,[task.fid]:task.to});
   const before=original.fields.find(x=>x.id===task.fid),after=reference.fields.find(x=>x.id===task.fid);
   const box={x:Math.min(before.x,after.x),y:Math.min(before.y,after.y),w:Math.max(before.x+before.w,after.x+after.w)-Math.min(before.x,after.x),h:Math.max(before.y+before.h,after.y+after.h)-Math.min(before.y,after.y)};
   const row={task:task.n,doc:task.doc.name,to:task.to};
   for(const editor of editors){
    const names=await readdir(`${dir}/${editor}`),hit=names.find(x=>x.replace(/\.[^.]+$/,'')===String(task.n).padStart(2,'0'));
    if(!hit){row[editor]='not done';continue;}
    const bytes=await readFile(`${dir}/${editor}/${hit}`),pdf=hit.toLowerCase().endsWith('.pdf');
    const edited=pdf?rasterize(bytes,original.width,original.height):bytes.toString('base64');
    const s=await app.evaluate(async([e,type,r,o,box,dpi,w,h])=>{
     const {fieldScore,collateral,verdict}=await import('/tests/edit-bench/score.mjs');
     // At the document's own size, whatever size the editor saved it at.
     const load=async(b64,type)=>{const i=new Image();i.src=`data:${type};base64,${b64}`;await i.decode();const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(i,0,0,w,h);return {w,h,data:g.getImageData(0,0,w,h).data};};
     const E=await load(e,type),R=await load(r,'image/png'),O=await load(o,'image/png'),m=fieldScore(E,R,box,dpi);m.outside=collateral(E,O,m.area);
     // The text must have changed to the one asked for: the field closer to
     // the reference than to the original (a digit swapped barely changes
     // the look, and an unchanged file would otherwise pass).
     const kept=fieldScore(E,O,box,dpi);if(kept.mismatch<=m.mismatch)return ['wrong text'];
     return verdict(m,dpi);
    },[edited,pdf?'image/png':hit.toLowerCase().endsWith('.png')?'image/png':'image/jpeg',reference.pixels,original.pixels,box,v.dpi,original.width,original.height]);
    row[editor]=s.length?s.join('+'):'ok';
   }
   if(bench){const r=bench.find(x=>x.doc===`${task.doc.t}/${task.doc.v}`&&x.field===task.fid&&x.to===task.to);row.bide=bideComparisonResult(r);}
   rows.push(row);
  }
  const cols=[...(bench?['bide']:[]),...editors];
  console.log(['task'.padEnd(5),'document'.padEnd(19),...cols.map(c=>c.padEnd(14))].join(' '));
  for(const r of rows)console.log([String(r.task).padEnd(5),r.doc.padEnd(19),...cols.map(c=>String(r[c]).slice(0,14).padEnd(14))].join(' '));
  console.log('\nno visible difference: '+cols.map(c=>`${c} ${rows.filter(r=>r[c]==='ok').length}/${rows.length}`).join(' · '));
 }
}finally{await browser.close();await server.close();}
