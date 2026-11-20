// End-to-end on an invented price card: AI OCR reads typographic marks the
// recognizer alone gets wrong (’ read as ', − as -, an en dash it lacks
// dropped) and keeps a symbol it cannot read (★) as a cell of its own, so a
// letter edit of that line redraws the star from its own pixels.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const lines=['Profitez de l’offre du 10–12 novembre','Avoir client −12,50 € <span id="star">★</span> 4,8'];
const pixels=(page,bytes)=>page.evaluate(async b64=>{const bmp=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob()),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);return {width:bmp.width,height:bmp.height,data:[...g.getImageData(0,0,bmp.width,bmp.height).data]};},bytes.toString('base64'));
const button=(page,text)=>page.locator(`button[aria-label^="Edit detected text"][aria-label*="${text}"]`).first();

test('AI OCR reads ’, −, – and keeps an unreadable ★ through a letter edit',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:620,height:150}});
  await shot.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:36px 44px;font:24px Arial;color:#1d1d1f;background:#fff">${lines.map(l=>`<div style="margin-bottom:22px;white-space:nowrap">${l}</div>`).join('')}</body>`);
  const star=await shot.evaluate(()=>{const b=document.getElementById('star').getBoundingClientRect();return {x0:Math.floor(b.left)-2,x1:Math.ceil(b.right)+2,y0:Math.floor(b.top),y1:Math.ceil(b.bottom)};});
  const dir=await mkdtemp(join(tmpdir(),'bide-typo-')),file=join(dir,'card.png');await writeFile(file,await shot.screenshot());await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
  await button(page,'4,8').waitFor({timeout:240000});
  const fields=await page.locator('.detected-text-overlay button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label').replace(/^Edit detected text: /,'')));
  // The star has no character: the field holds only what was read.
  assert.deepEqual(fields,['Profitez de l’offre du 10–12 novembre','Avoir client −12,50 € 4,8'],`read ${JSON.stringify(fields)}`);
  // A letter edit of the amount that also drops the € the star's ink was read with.
  await button(page,'4,8').click();
  await page.getByLabel('New text').fill('Avoir client −15,20 4,8',{timeout:10000});await page.getByRole('button',{name:'Apply'}).click();
  await page.getByText("Edited with the image's own letters",{exact:false}).waitFor({timeout:60000});
  await page.keyboard.press('Escape');await page.waitForTimeout(1000);
  await page.locator('.document-actions .primary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('.modal .dialog-actions .primary').click()]);
  const out=join(dir,'edited-'+download.suggestedFilename());await download.saveAs(out);
  const before=await pixels(page,await readFile(file)),after=await pixels(page,await readFile(out));
  assert.deepEqual(errors,[]);await page.close();
  assert.deepEqual([after.width,after.height],[before.width,before.height]);
  // The star's pixels, moved left with the rest of the line by the € and its space.
  const at=(img,x,y)=>{const i=(y*img.width+x)*4;return img.data.slice(i,i+3);};
  const diff=(x0,x1,dx)=>{let d=0;for(let y=star.y0;y<star.y1;y++)for(let x=x0;x<x1;x++){const a=at(before,x,y),b=at(after,x+dx,y);d+=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);}return d/(3*(x1-x0)*(star.y1-star.y0));};
  let ink=0;for(let y=star.y0;y<star.y1;y++)for(let x=star.x0;x<star.x1;x++)if(at(before,x,y)[0]<128)ink++;
  assert.ok(ink>40,`the star is drawn (${ink} dark pixels)`);
  let best=Infinity,shift=0;for(let dx=-40;dx<=4;dx++){const d=diff(star.x0,star.x1,dx);if(d<best){best=d;shift=dx;}}
  assert.ok(best<3&&shift<-10,`the edited line keeps the star's pixels (mean difference ${best.toFixed(2)} at ${shift} px)`);
  assert.ok(diff(star.x1,star.x1+60,shift)<3,'the rating after it moved with it');
  let changed=0;for(let y=star.y0;y<star.y1;y++)for(let x=star.x0-150;x<star.x0-40;x++){const a=at(before,x,y),b=at(after,x,y);if(Math.abs(a[0]-b[0])>60)changed++;}
  assert.ok(changed>20,`the amount changed (${changed} pixels)`);
  console.log(`star kept at ${shift} px (mean difference ${best.toFixed(2)}); amount changed ${changed} px`);
 }finally{await browser.close();await server.close();}
});

test('original-letter patches keep unread symbols when adjacent characters change',{timeout:120000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'app/');
  const reports=await page.evaluate(async()=>{
   const {StaticCanvas,FabricImage}=await import('/tests/e2e/glyph-patch-fabric.mjs'),{glyphEditPatch}=await import('/src/detected-text.ts'),{UNREAD}=await import('/src/glyph-edit.ts');
   const cases=[{text:'4 58',read:UNREAD+'4 58',next:'5 58'},{text:'58 4',read:'58 4'+UNREAD,next:'58 5'},{text:'AB CD',read:'A'+UNREAD+'B CD',next:'CD CD'}],out=[];
   for(const item of cases){
    const source=document.createElement('canvas');source.width=120;source.height=50;const g=source.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,120,50);
    const glyphs=[];let x=20,mark;
    for(const ch of item.read){
     if(ch!==' '){glyphs.push({ch,x0:x,x1:x+10});g.fillStyle='#202020';
      // Distinct source-ink patterns, including an unread symbol, with exact
      // native pixels so any lost mark or replacement drawing is observable.
      for(let y=15;y<30;y++)for(let u=1;u<9;u++)if(ch===UNREAD?Math.abs(u-4)+Math.abs(y-22)*.55<5:(u+y+ch.charCodeAt(0))%5<3)g.fillRect(x+u,y,1,1);
      if(ch===UNREAD)mark={x0:x,x1:x+10};
     }x+=10;
    }
    const c=new StaticCanvas(undefined,{width:120,height:50,enableRetinaScaling:false,renderOnAddRemove:false});
    try{
     c.add(new FabricImage(source,{left:0,top:0,objectCaching:false}));c.renderAll();
     const p={id:'symbol-test',name:'Invented symbol',width:120,height:50,color:'#fff',index:0,canvas:{objects:[]}},r={id:'r',text:item.text,left:20,top:12,width:x-20,height:20,size:18,baseline:30,fontName:'Image text (font unknown)',bold:false,italic:false,color:'#202020',background:'#ffffff',kind:'ocr',glyphs};
     const raster=()=>c.toCanvasElement(1).getContext('2d').getImageData(0,0,120,50).data;
     const before=raster(),patch=await glyphEditPatch(c,p,r,item.next);if(!patch)throw Error('the invented edit should reuse its own cells');c.add(patch);c.renderAll();const after=raster();
     let symbolChanged=0,outsideChanged=0,insideChanged=0,symbolInk=0;
     for(let y=0;y<50;y++)for(let u=0;u<120;u++){
      const i=(y*120+u)*4,changed=before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2];
      if(u>=mark.x0&&u<mark.x1){if(changed)symbolChanged++;if(before[i]<128)symbolInk++;}
      if(changed){if(u<20||u>=x||y<12||y>=32)outsideChanged++;else insideChanged++;}
     }
     c.remove(patch);c.renderAll();const refused=await glyphEditPatch(c,p,r,'Z'),afterRefusal=raster(),refusalUnchanged=!refused&&before.every((v,i)=>v===afterRefusal[i]);
     const erased=await glyphEditPatch(c,p,r,'');if(!erased)throw Error('whole-field deletion should be supported');c.add(erased);c.renderAll();const empty=raster();let remainingInk=0;for(let y=12;y<32;y++)for(let u=20;u<x;u++)if(empty[(y*120+u)*4]<128)remainingInk++;
     out.push({text:item.text,symbolChanged,outsideChanged,insideChanged,symbolInk,refusalUnchanged,remainingInk});
    }finally{await c.dispose();}
   }return out;
  });
  for(const r of reports){assert.equal(r.symbolChanged,0,JSON.stringify(r));assert.equal(r.outsideChanged,0,JSON.stringify(r));assert.ok(r.insideChanged>0&&r.symbolInk>40,JSON.stringify(r));assert.equal(r.refusalUnchanged,true,JSON.stringify(r));assert.equal(r.remainingInk,0,JSON.stringify(r));}
  assert.deepEqual(errors,[]);console.log('# unread symbol patches '+JSON.stringify(reports));
 }finally{await browser.close();await server.close();}
});

test('level small-number edits reuse a digit without copying its neighbouring comma',{timeout:240000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'app/');
  const reports=await page.evaluate(async()=>{
   const {StaticCanvas,FabricImage}=await import('/tests/e2e/glyph-patch-fabric.mjs'),{recognizeImage}=await import('/src/browser/ocr.ts'),{glyphEditPatch}=await import('/src/detected-text.ts');
   const out=[];
   for(const size of [11,12,14,16]){
    const source=document.createElement('canvas');source.width=320;source.height=110;const g=source.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,320,110);g.fillStyle='#111';g.font=size+'px Arial';g.textBaseline='alphabetic';g.fillText('4,8 5,9',30,50);
    const commaX=30+g.measureText('4').width,commaEnd=30+g.measureText('4,').width,regions=await recognizeImage(source,{engine:'paddle',grouping:'lines',deskew:false,flatten:false,languages:['eng']}),region=regions.find(r=>r.text==='4,8 5,9');
    if(!region)throw Error('the invented level table line was not read at '+size+'px: '+regions.map(r=>r.text).join(' | '));
    const c=new StaticCanvas(undefined,{width:320,height:110,enableRetinaScaling:false,renderOnAddRemove:false});
    try{
     c.add(new FabricImage(source,{left:0,top:0,objectCaching:false}));c.renderAll();const p={id:'comma-test',name:'Invented table',width:320,height:110,color:'#fff',index:0,canvas:{objects:[]}},before=g.getImageData(0,0,320,110),patch=await glyphEditPatch(c,p,region,'5,8 5,9');
     if(!patch)throw Error('the table edit should reuse its own 5 at '+size+'px');c.add(patch);c.renderAll();const after=c.toCanvasElement(1).getContext('2d').getImageData(0,0,320,110);
     const points=img=>{const result=[];for(let y=50;y<50+Math.ceil(size*.4)+2;y++)for(let x=Math.floor(commaX)-4;x<=Math.ceil(commaEnd)+4;x++){const i=(y*320+x)*4;if(img.data[i]<180)result.push([x,y,img.data[i],img.data[i+1],img.data[i+2]]);}return result;};
     let changed=0;for(let y=region.top;y<50;y++)for(let x=region.left;x<Math.ceil(commaX);x++)if(before.data[(y*320+x)*4]!==after.data[(y*320+x)*4])changed++;
     out.push({size,before:points(before),after:points(after),changed});
    }finally{await c.dispose();}
   }return out;
  });
  for(const r of reports){
   assert.ok(r.changed>5&&r.before.length>0,JSON.stringify(r));assert.equal(r.after.length,r.before.length,'no missing or duplicated comma pixels: '+JSON.stringify(r));
   const min=points=>Math.min(...points.map(p=>p[0])),normal=points=>points.map(([x,...rest])=>[x-min(points),...rest]);
   assert.deepEqual(normal(r.after),normal(r.before),'the comma keeps its original ink without blur: '+JSON.stringify(r));
   // A source cell's integer advance may move the suffix by one pixel. At
   // 12px the old contaminated digit duplicated the comma; it now stays exact.
   assert.ok(Math.abs(min(r.after)-min(r.before))<=1,JSON.stringify(r));if(r.size===12)assert.deepEqual(r.after,r.before);
  }
  assert.deepEqual(errors,[]);console.log('# level numeric comma patches '+JSON.stringify(reports));
 }finally{await browser.close();await server.close();}
});
