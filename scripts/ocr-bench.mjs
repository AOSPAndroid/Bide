// OCR benchmark: realistic pages with known text, read by each engine in the
// real app code (headless Chromium), scored per page and per engine.
//   node scripts/ocr-bench.mjs [engine ...]        engines: tesseract, ai, ai-accurate
//   BENCH_PAGES=invoice,receipt node scripts/ocr-bench.mjs
// Scores: line CER (each true line against its best-matching stretch of an OCR
// line, so merged columns are not penalised), word recall and word precision
// (multisets), and seconds per page. Writes tmp/ocr-bench.json.
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {writeFile,mkdir} from 'node:fs/promises';
import {pages} from '../tests/ocr-bench/pages.mjs';
import {lineErrors,wordScores,joinRows} from '../tests/ocr-bench/score.mjs';

const engines=(process.argv.slice(2).length?process.argv.slice(2):['tesseract','ai','ai-accurate']);
const only=process.env.BENCH_PAGES?.split(',');
const chosen=pages.filter(p=>!only||only.includes(p.id));
await mkdir('tmp/ocr-bench',{recursive:true});
const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const results=[];
try{
 // Render each page and apply its degradation (scan, photo, low resolution) in the browser.
 const shots={};
 for(const p of chosen){
  const shot=await browser.newPage({viewport:{width:p.width??900,height:p.height??1100},deviceScaleFactor:p.dpr??1});
  await shot.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${p.html}</body>`);await shot.evaluate(()=>document.fonts.ready);
  const truth=await shot.evaluate(()=>[...document.querySelectorAll('.l')].map(e=>e.innerText.replace(/\s+/g,' ').trim()).filter(Boolean));
  const png=await shot.screenshot({fullPage:true});await shot.close();
  shots[p.id]={truth,png:png.toString('base64')};
 }
 const page=await browser.newPage();page.on('pageerror',e=>console.error('page error',e.message));
 await page.goto(server.resolvedUrls.local[0]);await page.waitForTimeout(1500);
 for(const p of chosen){
  const {truth,png}=shots[p.id];
  const degraded=await page.evaluate(async([png,d])=>{
   const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
   let c=document.createElement('canvas');c.width=img.width;c.height=img.height;let g=c.getContext('2d');
   if(d.scale){c.width=Math.round(img.width*d.scale);c.height=Math.round(img.height*d.scale);g=c.getContext('2d');g.imageSmoothingQuality='high';}
   g.fillStyle=d.paper??'#fff';g.fillRect(0,0,c.width,c.height);
   g.save();if(d.rotate){g.translate(c.width/2,c.height/2);g.rotate(d.rotate*Math.PI/180);g.translate(-c.width/2,-c.height/2);}
   if(d.blur)g.filter=`blur(${d.blur}px)`;if(d.paper)g.globalCompositeOperation='multiply';
   g.drawImage(img,0,0,c.width,c.height);g.restore();g.globalCompositeOperation='source-over';
   if(d.shade){const s=g.createLinearGradient(0,0,c.width,c.height);s.addColorStop(0,'rgba(0,0,0,0)');s.addColorStop(1,`rgba(40,30,20,${d.shade})`);g.fillStyle=s;g.fillRect(0,0,c.width,c.height);}
   if(d.noise){const px=g.getImageData(0,0,c.width,c.height);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let i=0;i<px.data.length;i+=4){const n=(rnd()+rnd()+rnd()-1.5)*d.noise;for(let k=0;k<3;k++)px.data[i+k]=Math.max(0,Math.min(255,px.data[i+k]+n));}g.putImageData(px,0,0);}
   if(d.jpeg){const url=c.toDataURL('image/jpeg',d.jpeg),j=new Image();j.src=url;await j.decode();g.drawImage(j,0,0);}
   return c.toDataURL('image/png').split(',')[1];
  },[png,p.degrade??{}]);
  await writeFile(`tmp/ocr-bench/${p.id}.png`,Buffer.from(degraded,'base64'));
  for(const engine of engines){
   const t0=Date.now();
   const lines=await page.evaluate(async([png,engine])=>{
    const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);
    const {recognizeImage}=await import('/src/browser/ocr.ts');
    const regions=await recognizeImage(c,{grouping:'lines',languages:['eng','fra'],engine:engine==='tesseract'?'tesseract':'paddle',accurate:engine==='ai-accurate'});
    return regions.map(r=>({text:r.text,left:r.left,top:r.top,width:r.width,height:r.height}));
   },[degraded,engine]).catch(e=>{console.error(p.id,engine,e.message);return [];});
   const seconds=(Date.now()-t0)/1000,rows=joinRows(lines),cer=lineErrors(truth,[...lines.map(r=>r.text),...rows]),words=wordScores(truth,lines.map(r=>r.text));
   results.push({page:p.id,category:p.category,engine,cer:cer.rate,recall:words.recall,precision:words.precision,seconds,misses:cer.worst,read:lines.map(r=>r.text)});
   console.log(`${p.id.padEnd(16)} ${engine.padEnd(12)} CER ${(cer.rate*100).toFixed(1).padStart(5)}%  words ${(words.recall*100).toFixed(1).padStart(5)}% found, ${(words.precision*100).toFixed(1).padStart(5)}% right  ${seconds.toFixed(1).padStart(5)} s`);
  }
 }
}finally{await browser.close();await server.close();}
console.log('\nengine        CER    found  right  s/page');
for(const engine of engines){const r=results.filter(x=>x.engine===engine),avg=k=>r.reduce((s,x)=>s+x[k],0)/r.length;
 console.log(`${engine.padEnd(12)} ${(avg('cer')*100).toFixed(1).padStart(5)}%  ${(avg('recall')*100).toFixed(1).padStart(5)}%  ${(avg('precision')*100).toFixed(1).padStart(5)}%  ${avg('seconds').toFixed(1).padStart(5)}`);}
await writeFile('tmp/ocr-bench.json',JSON.stringify(results,null,1));
