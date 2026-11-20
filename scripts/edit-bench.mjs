// Edit benchmark: does an edit made in the app look like the document
// generated with the new text? Invented documents (tests/edit-bench/docs.mjs)
// are rendered as scans, opened and read by the app's own code, edited field
// by field, downloaded, and compared with the same document rendered again
// with the new value under the same scan conditions.
//   node scripts/edit-bench.mjs                      every document, both modes
//   BENCH_CASES=workshop/clean,slip/pdf  BENCH_MODES=letters  BENCH_KINDS=own,page
//   BENCH_CROPS=all   also save original | edit | reference crops of good edits
// Per edit: letters = the default (the page's own letters, or a refusal);
// font = the explicit fallback. Writes tmp/edit-bench/results.json and crops.
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {writeFile,mkdir,rm} from 'node:fs/promises';
import * as mupdf from 'mupdf';import {PDFDocument} from 'pdf-lib';
import {templates,variants,cases} from '../tests/edit-bench/docs.mjs';
import {ocrFields,cellErrors,verdict} from '../tests/edit-bench/score.mjs';

const pick=(name)=>process.env[name]?.split(',').map(s=>s.trim()).filter(Boolean);
const onlyCases=pick('BENCH_CASES'),modes=pick('BENCH_MODES')??['letters','font'],kinds=pick('BENCH_KINDS'),out=process.env.BENCH_OUT??'tmp/edit-bench';
const chosen=cases.filter(([t,v])=>!onlyCases||onlyCases.includes(`${t}/${v}`)||onlyCases.includes(t));
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const median=a=>a.length?[...a].sort((x,y)=>x-y)[a.length>>1]:NaN,fix=(v,n=2)=>Number.isFinite(v)?+v.toFixed(n):v;
const records=[],ocr=[],cells=[];
try{
 const app=await browser.newPage({viewport:{width:1200,height:800}});app.on('pageerror',e=>console.error('page error',e.message));
 await app.goto(server.resolvedUrls.local[0]+'app/');await app.waitForTimeout(1500);
 // The document as a scanner would deliver it: a render at the scan's
 // resolution, turned and blurred, then noise and JPEG; and where its fields are.
 async function scan(tpl,v,values){
  const dpr=v.dpi/72,page=await browser.newPage({viewport:{width:tpl.width,height:tpl.height},deviceScaleFactor:dpr});
  try{
   await page.setContent(`<!doctype html><meta charset="utf-8"><style>${tpl.fonts?await tpl.fonts():''}body{margin:0;background:#fff;overflow:hidden}</style><div id="doc" style="width:${tpl.width}px;height:${tpl.height}px;${v.rotate?`transform:rotate(${v.rotate}deg);`:''}${v.blur?`filter:blur(${v.blur/dpr}px);`:''}">${tpl.html(values)}</div>`);
   await page.evaluate(()=>document.fonts.ready);
   const fields=await page.evaluate(dpr=>[...document.querySelectorAll('[data-f]')].map(e=>{
    const b=e.getBoundingClientRect(),node=e.firstChild,text=e.textContent,chars=[];
    if(node?.nodeType===3)for(let i=0;i<text.length;i++){const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);const c=r.getBoundingClientRect();chars.push({i,ch:text[i],x0:c.left*dpr,x1:c.right*dpr});}
    return {id:e.dataset.f,text,x:b.left*dpr,y:b.top*dpr,w:b.width*dpr,h:b.height*dpr,size:parseFloat(getComputedStyle(e).fontSize)*dpr,chars};
   }),dpr);
   const all=await page.evaluate(()=>document.body.innerText);
   const png=(await page.screenshot({clip:{x:0,y:0,width:tpl.width,height:tpl.height}})).toString('base64');
   // Noise and JPEG, in the app page (any canvas will do). Returns the pixels as PNG.
   const done=await app.evaluate(async([png,v])=>{
    const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
    if(v.noise){const px=g.getImageData(0,0,c.width,c.height);let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;for(let i=0;i<px.data.length;i+=4){const n=(rnd()+rnd()+rnd()-1.5)*v.noise;for(let k=0;k<3;k++)px.data[i+k]=Math.max(0,Math.min(255,px.data[i+k]+n));}g.putImageData(px,0,0);}
    let jpeg;if(v.jpeg){jpeg=c.toDataURL('image/jpeg',v.jpeg).split(',')[1];const j=new Image();j.src='data:image/jpeg;base64,'+jpeg;await j.decode();g.drawImage(j,0,0);}
    return {pixels:c.toDataURL('image/png').split(',')[1],jpeg,width:c.width,height:c.height};
   },[png,v]);
   return {fields,all,...done};
  }finally{await page.close();}
 }
 // The file the app opens.
 async function file(s,v){
  if(v.as==='png')return {bytes:s.pixels,type:'image/png',name:'scan.png'};
  if(v.as==='jpg')return {bytes:s.jpeg,type:'image/jpeg',name:'scan.jpg'};
  const pdf=await PDFDocument.create(),img=s.jpeg?await pdf.embedJpg(Buffer.from(s.jpeg,'base64')):await pdf.embedPng(Buffer.from(s.pixels,'base64')),p=pdf.addPage([s.width*72/v.dpi,s.height*72/v.dpi]);
  p.drawImage(img,{x:0,y:0,width:p.getWidth(),height:p.getHeight()});return {bytes:Buffer.from(await pdf.save()).toString('base64'),type:'application/pdf',name:'scan.pdf'};
 }
 // A downloaded PDF as pixels at the scan's resolution.
 const rasterize=(b64,s)=>{const d=mupdf.Document.openDocument(Buffer.from(b64,'base64'),'application/pdf'),p=d.loadPage(0),b=p.getBounds(),x=p.toPixmap(mupdf.Matrix.scale(s.width/(b[2]-b[0]),s.height/(b[3]-b[1])),mupdf.ColorSpace.DeviceRGB,false,true);try{return Buffer.from(x.asPNG()).toString('base64');}finally{x.destroy();p.destroy();d.destroy();}};

 for(const [t,vn] of chosen){
  const tpl=templates[t],v=variants[vn],id=`${t}/${vn}`,original=await scan(tpl,v,tpl.fields),f=await file(original,v),k=v.as==='scanpdf'?v.dpi/72:1;
  const opened=await app.evaluate(async([id,b,n,ty])=>(await import('/tests/edit-bench/bench.ts')).open(id,b,n,ty),[id,f.bytes,f.name,f.type]);
  const regions=opened.regions.map(r=>({...r,left:r.left*k,top:r.top*k,width:r.width*k,height:r.height*k,glyphs:r.glyphs?.map(g=>({...g,x0:g.x0*k,x1:g.x1*k}))}));
  const read=ocrFields(original.fields,regions);
  for(const r of read){ocr.push({doc:id,...r});if(r.status==='exact'){const e=cellErrors(original.fields.find(x=>x.id===r.id),regions.find(x=>x.id===r.region));if(e)cells.push(...e.map(err=>({doc:id,field:r.id,err})));}}
  // BENCH_DUMP=c1,e1: the letter cells read for those fields against the true character boxes.
  for(const fid of pick('BENCH_DUMP')??[]){const fd=original.fields.find(x=>x.id===fid),st=read.find(r=>r.id===fid),rg=regions.find(x=>x.id===st?.region);if(!fd)continue;
   console.log(`  ${fid} ${JSON.stringify(fd.text)} read ${JSON.stringify(rg?.text)} box ${[rg?.left,rg?.width].map(v=>v?.toFixed(1))}\n    true  ${fd.chars.map(c=>`${c.ch}[${c.x0.toFixed(1)},${c.x1.toFixed(1)}]`).join(' ')}\n    cells ${rg?.glyphs?.map(g=>`${g.ch}[${g.x0.toFixed(1)},${g.x1.toFixed(1)}]`).join(' ')}`);}
  const count=s=>read.filter(r=>r.status===s).length;
  console.log(`\n${id}: ${opened.regions.length} regions in ${opened.seconds.toFixed(1)} s, font ${opened.font} · fields ${count('exact')} exact, ${count('merged')} merged, ${read.length-count('exact')-count('merged')} other${read.filter(r=>!['exact','merged'].includes(r.status)).map(r=>` [${r.id}: ${r.status} ${JSON.stringify(r.read)}]`).join('')}`);
  await mkdir(`${out}/${t}-${vn}`,{recursive:true});await writeFile(`${out}/${t}-${vn}/scan.png`,Buffer.from(original.pixels,'base64'));
  let n=0;
  for(const [fid,to,kind] of tpl.edits){
   if(kinds&&!kinds.includes(kind))continue;n++;
   const field=original.fields.find(x=>x.id===fid),state=read.find(r=>r.id===fid),rec={doc:id,template:t,variant:vn,field:fid,from:field.text,to,kind,ocr:state.status};records.push(rec);
   // The declared kind against the page's text.
   const fresh=[...new Set(to)].filter(c=>/\S/.test(c)&&!field.text.includes(c)),truth=fresh.some(c=>!original.all.includes(c))?'new':fresh.length?'page':null;
   if(truth?truth!==kind:['page','new'].includes(kind))console.warn(`  ! ${id} ${fid} → "${to}" is declared ${kind} but is ${truth??'own'}`);
   if(!['exact','merged'].includes(state.status)){rec.unreadable=true;console.log(`  ${fid} → "${to}" (${kind}): the field was not read (${state.status})`);continue;}
   const region=opened.regions.find(r=>r.id===state.region),text=region.text.replace(field.text.replace(/ /g,' '),to);
   const reference=await scan(tpl,v,{...tpl.fields,[fid]:to}),after=reference.fields.find(x=>x.id===fid);
   const box={x:Math.min(field.x,after.x),y:Math.min(field.y,after.y),w:Math.max(field.x+field.w,after.x+after.w)-Math.min(field.x,after.x),h:Math.max(field.y+field.h,after.y+after.h)-Math.min(field.y,after.y)};
   for(const mode of modes){
    let res;try{res=await app.evaluate(async([id,r,text,mode])=>(await import('/tests/edit-bench/bench.ts')).edit(id,r,text,mode),[id,region.id,text,mode]);}catch(e){res={outcome:'error',reason:e.message.split('\n')[0]};}
    const m=rec[mode]={outcome:res.outcome,reason:res.reason,ms:Math.round(res.ms??0),info:res.info};
    if(!res.data)continue;
    const edited=res.type==='application/pdf'?rasterize(res.data,original):res.data,type=res.type==='application/pdf'?'image/png':res.type;
    const crop=`${out}/${t}-${vn}/${String(n).padStart(2,'0')}-${fid}-${mode}.png`;
    const score=await app.evaluate(async([e,type,r,o,box,dpi])=>{
     const {fieldScore,collateral}=await import('/tests/edit-bench/score.mjs');
     const load=async(b64,type)=>{const i=new Image();i.src=`data:${type};base64,${b64}`;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(i,0,0);return {canvas:c,w:c.width,h:c.height,data:g.getImageData(0,0,c.width,c.height).data};};
     const E=await load(e,type),R=await load(r,'image/png'),O=await load(o,'image/png'),s=fieldScore(E,R,box,dpi);s.outside=collateral(E,O,s.area);
     // original | edit | reference, one above the other, twice the size.
     const a=s.area,c=document.createElement('canvas');c.width=a.w*2;c.height=(a.h*3+8)*2;const g=c.getContext('2d');g.fillStyle='#f0f';g.fillRect(0,0,c.width,c.height);g.imageSmoothingEnabled=false;
     [O,E,R].forEach((img,i)=>g.drawImage(img.canvas,a.x,a.y,a.w,a.h,0,i*(a.h+4)*2,a.w*2,a.h*2));
     return {...s,crop:c.toDataURL('image/png').split(',')[1]};
    },[edited,type,reference.pixels,original.pixels,box,v.dpi]);
    Object.assign(m,{shift:score.shift,mismatch:fix(score.mismatch),mass:fix(score.mass),core:fix(score.core,0),sharp:fix(score.sharp),outside:score.outside});m.problems=verdict(m,v.dpi);
    if(m.problems.length||process.env.BENCH_CROPS==='all')await writeFile(crop,Buffer.from(score.crop,'base64'));
   }
   const show=m=>!m?'':m.outcome==='refused'?`refused (${m.reason.slice(0,60)})`:m.outcome==='error'?`ERROR ${m.reason}`:`${m.problems.length?m.problems.join('+').toUpperCase():'ok'} [shift ${m.shift} mismatch ${m.mismatch} mass ${m.mass} core ${m.core} sharp ${m.sharp}${m.outside?` outside ${m.outside}`:''}${m.info?` · ${m.info.font} ${m.info.weight} soft ${fix(m.info.soft??0)}`:''}]`;
   console.log(`  ${fid} "${field.text}" → "${to}" (${kind})${state.status==='exact'?'':` {${state.status}}`}\n     letters: ${show(rec.letters)}${rec.font?`\n     font:    ${show(rec.font)}`:''}`);
  }
  await app.evaluate(async id=>(await import('/tests/edit-bench/bench.ts')).close(id),id);
 }
}finally{await browser.close();await server.close();}

// --- Summary -------------------------------------------------------------------
const pct=(a,b)=>b?`${Math.round(100*a/b)}%`:'-';
const status=s=>ocr.filter(r=>r.status===s).length;
console.log(`\n=== Reading: ${ocr.length} fields · exact ${status('exact')} (${pct(status('exact'),ocr.length)}) · merged ${status('merged')} · split ${status('split')} · mark ${status('mark')} · misread ${status('misread')} · missed ${status('missed')}`);
const ce=cells.map(c=>c.err);
if(ce.length)console.log(`=== Letter cells: ${ce.length} boundaries · median error ${(100*median(ce)).toFixed(1)}% of the font size · over 8%: ${pct(ce.filter(e=>e>.08).length,ce.length)} · over 15%: ${pct(ce.filter(e=>e>.15).length,ce.length)}`);
const table=(title,rows,key)=>{
 console.log(`\n=== ${title}`);
 for(const name of [...new Set(rows.map(key))]){
  const g=rows.filter(r=>key(r)===name),line=[`${String(name).padEnd(16)} ${String(g.length).padStart(3)} edits`];
  if(g.some(r=>r.unreadable))line.push(`unread ${g.filter(r=>r.unreadable).length}`);
  for(const mode of modes){const m=g.map(r=>r[mode]).filter(Boolean),done=m.filter(x=>x.problems),ok=done.filter(x=>!x.problems.length).length;
   line.push(`${mode}: ok ${ok} · visible ${done.length-ok} · refused ${m.filter(x=>x.outcome==='refused').length}${m.some(x=>x.outcome==='error')?` · error ${m.filter(x=>x.outcome==='error').length}`:''}`);}
  console.log(line.join('  |  '));
 }
};
table('By kind of edit',records,r=>r.kind);table('By scan',records,r=>r.variant);table('By document',records,r=>r.template);
for(const mode of modes){
 const done=records.map(r=>r[mode]).filter(m=>m?.problems),tally={};for(const m of done)for(const p of m.problems)tally[p]=(tally[p]??0)+1;
 if(done.length)console.log(`\n=== ${mode}: ${done.length} edits made · no visible difference ${pct(done.filter(m=>!m.problems.length).length,done.length)} · median mismatch ${fix(median(done.map(m=>m.mismatch)))} · problems ${Object.entries(tally).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(', ')||'none'} · median time ${Math.round(median(done.map(m=>m.ms)))} ms`);
}
// What the default flow gives: the letters edit, or after a refusal the font.
if(modes.includes('letters')&&modes.includes('font')){
 const flow=records.filter(r=>r.letters).map(r=>r.letters.problems?{how:'letters',ok:!r.letters.problems.length}:r.font?.problems?{how:'font',ok:!r.font.problems.length}:{how:'none',ok:false});
 console.log(`\n=== Default flow over ${records.length} edits: clean with the page's letters ${flow.filter(f=>f.how==='letters'&&f.ok).length} · visible with letters ${flow.filter(f=>f.how==='letters'&&!f.ok).length} · refused then clean in a font ${flow.filter(f=>f.how==='font'&&f.ok).length} · refused then visible in a font ${flow.filter(f=>f.how==='font'&&!f.ok).length} · field not read ${records.filter(r=>r.unreadable).length}`);
}
await writeFile(`${out}/results.json`,JSON.stringify({ocr,cells,records},null,1));
console.log(`\nDetails: ${out}/results.json · crops of visible edits (original, edit, reference): ${out}/<document>/`);
