// End-to-end on invented pages photographed or scanned at a slight angle
// (tests/ocr-bench/pages.mjs, tilted with a canvas rotation as the benchmark
// does): an amount edited through the letters dialog is rebuilt from the
// page's own letters, following the line's angle. The edit is one line, the
// downloaded picture changes only inside the line's own (turned) box, and
// the new letters are no blurrier than an untouched line.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {pages} from '../ocr-bench/pages.mjs';

// A bench page rendered, then tilted and degraded like scripts/ocr-bench.mjs
// does; returns the PNG and the text boxes (before tilting) of the given lines.
async function tiltedPage(browser,id,degrade,lines){
 const p=pages.find(x=>x.id===id),shot=await browser.newPage({viewport:{width:p.width??900,height:p.height??1100}});
 await shot.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${p.html}</body>`);await shot.evaluate(()=>document.fonts.ready);
 const boxes=await shot.evaluate(lines=>lines.map(t=>{const el=[...document.querySelectorAll('.l')].find(e=>e.innerText.includes(t)),r=document.createRange();r.selectNodeContents(el);const b=r.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height,size:parseFloat(getComputedStyle(el).fontSize)};}),lines);
 const png=(await shot.screenshot({fullPage:true})).toString('base64');
 const out=await shot.evaluate(async([png,d])=>{
  const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');
  g.fillStyle=d.paper??'#fff';g.fillRect(0,0,c.width,c.height);
  g.save();g.translate(c.width/2,c.height/2);g.rotate(d.rotate*Math.PI/180);g.translate(-c.width/2,-c.height/2);
  if(d.blur)g.filter=`blur(${d.blur}px)`;if(d.paper)g.globalCompositeOperation='multiply';
  g.drawImage(img,0,0);g.restore();g.globalCompositeOperation='source-over';
  if(d.shade){const s=g.createLinearGradient(0,0,c.width,c.height);s.addColorStop(0,'rgba(0,0,0,0)');s.addColorStop(1,`rgba(40,30,20,${d.shade})`);g.fillStyle=s;g.fillRect(0,0,c.width,c.height);}
  const px=g.getImageData(0,0,c.width,c.height);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<px.data.length;i+=4){const n=(rnd()+rnd()+rnd()-1.5)*d.noise;for(let k=0;k<3;k++)px.data[i+k]=Math.max(0,Math.min(255,px.data[i+k]+n));}g.putImageData(px,0,0);
  const j=new Image();j.src=c.toDataURL('image/jpeg',d.jpeg);await j.decode();g.drawImage(j,0,0);
  return {png:c.toDataURL('image/png').split(',')[1],width:c.width,height:c.height};
 },[png,degrade]);
 await shot.close();
 return {png:Buffer.from(out.png,'base64'),width:out.width,height:out.height,angle:degrade.rotate,boxes};
}
// Is image pixel (x, y) inside a text box (before tilting) grown by `pad`, once tilted?
const insideTurned=(page,b,x,y,pad)=>{const a=-page.angle*Math.PI/180,cx=page.width/2,cy=page.height/2,dx=x+.5-cx,dy=y+.5-cy,u=cx+dx*Math.cos(a)-dy*Math.sin(a),v=cy+dx*Math.sin(a)+dy*Math.cos(a);return u>=b.x-pad&&u<=b.x+b.w+pad&&v>=b.y-pad&&v<=b.y+b.h+pad;};
const pixels=(page,bytes)=>page.evaluate(async b64=>{const bmp=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'}),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);return {width:bmp.width,height:bmp.height,data:[...g.getImageData(0,0,bmp.width,bmp.height).data]};},bytes.toString('base64'));
const button=(page,text)=>page.locator(`button[aria-label^="Edit detected text"][aria-label*="${text}"]`).first();
// Edge width (ink-to-paper transition, edgeWidth from src/ocr-image.ts) of a field on screen, as tests/e2e/scan-edit.e2e.mjs measures it.
async function edgeOf(page,text){
 await button(page,text).evaluate(b=>{const ws=document.querySelector('.canvas-workspace'),w=ws.getBoundingClientRect(),r=b.getBoundingClientRect();ws.scrollTop+=r.top-w.top-200;ws.scrollLeft+=r.left-w.left-100;});
 await page.waitForTimeout(800);
 const r=await button(page,text).evaluate(b=>{const r=b.getBoundingClientRect();document.querySelector('.detected-text-overlay').style.visibility='hidden';return {x:r.left,y:r.top,width:r.width,height:r.height};});
 await page.waitForTimeout(300);
 const png=await page.screenshot({clip:{x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),width:Math.min(1300,r.width+12),height:r.height+12}});
 await page.evaluate(()=>{document.querySelector('.detected-text-overlay').style.visibility='';});
 return page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
  const {edgeWidth}=await import('/src/ocr-image.ts'),d=g.getImageData(0,0,c.width,c.height),border=[];
  // The paper: the median of the crop's outer rows.
  for(const y of [0,1,c.height-2,c.height-1])for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;border.push([d.data[i],d.data[i+1],d.data[i+2]]);}
  const bg=[0,1,2].map(k=>border.map(p=>p[k]).sort((a,b)=>a-b)[border.length>>1]);
  return edgeWidth({data:d.data,width:c.width,height:c.height},{x0:0,y0:0,x1:c.width,y1:c.height},bg);},png.toString('base64'));
}

async function editTilted(browser,url,photo,{from,to,line,reference}){
 const dir=await mkdtemp(join(tmpdir(),'bide-tilted-')),file=join(dir,'photo.png');await writeFile(file,photo.png);
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 await button(page,from).waitFor({timeout:240000});await button(page,reference).waitFor({timeout:10000});
 // The tap target follows the line's angle.
 const turn=await button(page,from).evaluate(b=>b.style.transform);
 const angle=Number(turn.match(/rotate\((-?[\d.]+)deg\)/)?.[1]);
 assert.ok(Math.abs(angle-photo.angle)<.5,`the field is drawn turned with its line (${turn}, page tilted ${photo.angle}°)`);
 const text=(await button(page,from).getAttribute('aria-label')).slice('Edit detected text: '.length);
 await button(page,from).click();
 // The letters dialog (a field without letter cells went straight to the font fallback).
 await page.getByLabel('New text').fill(text.replace(from,to),{timeout:10000});await page.getByRole('button',{name:'Apply'}).click();
 await page.getByText("Edited with the image's own letters",{exact:false}).waitFor({timeout:60000});
 await page.keyboard.press('Escape');await page.waitForTimeout(1500);
 const objects=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.map(o=>({type:o.type,name:o.name,angle:o.angle,height:o.height*o.scaleY}));});
 const edits=objects.filter(o=>/^Edited text/.test(o.name??''));
 const zoom=page.getByLabel('Zoom percentage');await zoom.fill('300');await zoom.press('Enter');await page.waitForTimeout(2500);
 const edges={edited:await edgeOf(page,to),reference:await edgeOf(page,reference)};
 await zoom.fill('100');await zoom.press('Enter');await page.waitForTimeout(1000);
 await page.locator('.document-actions .primary').click();
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('.modal .dialog-actions .primary').click()]);
 const out=join(dir,download.suggestedFilename());await download.saveAs(out);
 const before=await pixels(page,photo.png),after=await pixels(page,await readFile(out));
 assert.deepEqual(errors,[]);await page.close();
 // Pixels changed by more than JPEG-like noise, outside the line's turned box grown by 3 px.
 let outside=0,inside=0;const box=photo.boxes[line];
 for(let y=0;y<before.height;y++)for(let x=0;x<before.width;x++){const i=(y*before.width+x)*4;let d=0;for(let k=0;k<3;k++)d=Math.max(d,Math.abs(before.data[i+k]-after.data[i+k]));if(d>24){if(insideTurned(photo,box,x,y,3))inside++;else outside++;}}
 return {objects,edits,edges,outside,inside,size:[after.width,after.height],box};
}

test('an amount on a tilted photo or scan is edited with its own letters, along the line',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const url=server.resolvedUrls.local[0]+'app/';
  // A phone photo of an invoice (as tmp/ocr-bench/invoice-photo.png) and a scanned letter (letter-scan.png).
  const cases=[
   {id:'invoice',degrade:{rotate:-2.5,shade:.35,noise:14,blur:.8,jpeg:.6},from:'2,203.20',to:'2,302.20',lines:['Total due GBP 2,203.20','Subtotal 1,836.00'],reference:'1,836.00'},
   {id:'letter',degrade:{rotate:1.2,paper:'#efece4',noise:22,blur:.5,jpeg:.5},from:'1 284,50',to:'1 482,50',lines:['Le montant total de 1 284,50','Votre chambre double'],reference:'Votre chambre'},
  ];
  for(const c of cases){
   const photo=await tiltedPage(browser,c.id,c.degrade,c.lines),r=await editTilted(browser,url,photo,{...c,line:0});
   const label=`${c.id} (${c.degrade.rotate}°)`;
   assert.deepEqual(r.size,[photo.width,photo.height],`${label}: same pixel size`);
   assert.equal(r.edits.length,1,`${label}: one edit layer (${JSON.stringify(r.objects)})`);
   assert.ok(!r.objects.some(o=>/text/i.test(o.type)),`${label}: no font text was needed`);
   assert.ok(Math.abs(r.edits[0].angle-c.degrade.rotate)<.5,`${label}: the new letters follow the line's angle (${r.edits[0].angle}°)`);
   assert.ok(r.edits[0].height<=r.box.size*1.6,`${label}: the result is a single line (${r.edits[0].height.toFixed(1)} px for ${r.box.size} px type)`);
   assert.ok(r.inside>20,`${label}: the line changed (${r.inside} pixels)`);
   assert.equal(r.outside,0,`${label}: nothing changes outside the line's turned box (${r.outside} pixels)`);
   assert.ok(r.edges.edited<=r.edges.reference*1.3,`${label}: the edit is no blurrier than an untouched line (edge ${r.edges.edited?.toFixed(2)} vs ${r.edges.reference?.toFixed(2)})`);
   console.log(`${label}: changed ${r.inside} px inside, ${r.outside} outside; edge ${r.edges.edited?.toFixed(2)} vs ${r.edges.reference?.toFixed(2)}`);
  }
 }finally{await browser.close();await server.close();}
});
