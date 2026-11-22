// End-to-end: a picture opened in bide downloads as the same kind of file.
// An invented PNG with transparency and a JPEG are opened, one line is
// edited with the image's own letters, and the default export gives back a
// PNG (or JPEG) of the same pixel size: outside the edited line the PNG's
// pixels are identical, transparency included, and the JPEG's are within
// re-encoding noise.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {dirname,join} from 'node:path';

// An invented two-line notice drawn on a transparent background.
function noticePng(){
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const obj=doc.addPage([0,0,300,120],0,{Font:{F:ref}},'0.1 0.1 0.12 rg BT /F 16 Tf 20 80 Td (Order 4417 ready) Tj ET BT /F 12 Tf 20 40 Td (Pick up before 18 June) Tj ET');
 doc.insertPage(-1,obj);const p=doc.loadPage(0),pix=p.toPixmap(mupdf.Matrix.scale(3,3),mupdf.ColorSpace.DeviceRGB,true,true),png=Buffer.from(pix.asPNG());
 pix.destroy();p.destroy();obj.destroy();ref.destroy();font.destroy();doc.destroy();return png;
}
// Pixels of an image file, decoded in the page.
const pixels=(page,bytes)=>page.evaluate(async b64=>{const blob=await (await fetch('data:application/octet-stream;base64,'+b64)).blob(),bmp=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
 const c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);return {width:bmp.width,height:bmp.height,data:[...g.getImageData(0,0,bmp.width,bmp.height).data]};},bytes.toString('base64'));
// Largest difference and count of differing pixels outside `box` (pixels).
function compare(a,b,box){
 let max=0,changed=0,total=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  if(x>=box.x0&&x<box.x1&&y>=box.y0&&y<box.y1)continue;total++;
  const i=(y*a.width+x)*4;let d=0;for(let k=0;k<4;k++)d=Math.max(d,Math.abs(a.data[i+k]-b.data[i+k]));if(d){changed++;max=Math.max(max,d);}
 }
 return {max,changed,total};
}

async function editAndDownload(browser,url,file,from,to){
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 const target=page.locator(`button[aria-label^="Edit detected text: ${from}"]`).first();await target.waitFor({timeout:180000});
 // The edited line's box in page pixels (the page is the picture, one unit per pixel).
 const box=await target.evaluate(b=>{const z=document.querySelector('.artboard').getBoundingClientRect().width/parseFloat(document.querySelector('.artboard-label span:last-child').textContent);return {x0:parseFloat(b.style.left)/z,y0:parseFloat(b.style.top)/z,x1:(parseFloat(b.style.left)+parseFloat(b.style.width))/z,y1:(parseFloat(b.style.top)+parseFloat(b.style.height))/z};});
 await target.click();await page.getByLabel('New text').fill(to);await page.getByRole('button',{name:'Apply'}).click();
 await page.getByText("Edited with the image's own letters",{exact:false}).waitFor({timeout:60000});
 await page.locator('.document-actions .primary').click();
 assert.equal(await page.locator('.modal select').first().inputValue(),'image','the export offers the same kind of file first');
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('.modal .dialog-actions .primary').click()]);
 const out=join(await mkdtemp(join(tmpdir(),'bide-image-')),download.suggestedFilename());await download.saveAs(out);
 const result={name:download.suggestedFilename(),bytes:await readFile(out),box,page};
 assert.deepEqual(errors,[]);return result;
}

test('a PNG or JPEG downloads as the same kind of file, unchanged outside the edit',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const url=server.resolvedUrls.local[0]+'app/',dir=await mkdtemp(join(tmpdir(),'bide-notice-')),png=join(dir,'notice.png');
  await writeFile(png,noticePng());
  // PNG: same size, identical pixels outside the edited line, transparency kept.
  const r=await editAndDownload(browser,url,png,'Order 4417','Order 4471 ready');
  assert.match(r.name,/\.png$/);assert.deepEqual([...r.bytes.subarray(1,4)].map(c=>String.fromCharCode(c)).join(''),'PNG');
  const before=await pixels(r.page,await readFile(png)),after=await pixels(r.page,r.bytes);
  assert.deepEqual([after.width,after.height],[before.width,before.height],'same pixel size');
  const grown={x0:r.box.x0-6,y0:r.box.y0-6,x1:r.box.x1+40,y1:r.box.y1+6},d=compare(before,after,grown);
  assert.equal(d.changed,0,`untouched pixels are identical (${d.changed} of ${d.total} differ, by up to ${d.max})`);
  assert.equal(after.data[3],0,'the transparent background stays transparent');
  // JPEG: made from the same notice on white, re-encoded within noise.
  const jpg=join(dir,'notice.jpg');
  await writeFile(jpg,Buffer.from(await r.page.evaluate(async b64=>{const bmp=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob()),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0);
   const blob=await c.convertToBlob({type:'image/jpeg',quality:.9});return [...new Uint8Array(await blob.arrayBuffer())];},(await readFile(png)).toString('base64'))));
  await r.page.close();
  const j=await editAndDownload(browser,url,jpg,'Order 4417','Order 4471 ready');
  assert.match(j.name,/\.jpg$/);assert.equal(j.bytes[0],0xff);assert.equal(j.bytes[1],0xd8);
  const jb=await pixels(j.page,await readFile(jpg)),ja=await pixels(j.page,j.bytes);
  assert.deepEqual([ja.width,ja.height],[jb.width,jb.height],'same pixel size');
  const jd=compare(jb,ja,{x0:j.box.x0-6,y0:j.box.y0-6,x1:j.box.x1+40,y1:j.box.y1+6});
  assert.ok(jd.max<=24,`outside the edit the JPEG only differs by re-encoding noise (max ${jd.max})`);
  await j.page.close();
 }finally{await browser.close();await server.close();}
});

test('native rasters and picture downloads keep their pixels through viewport zoom and pan',{timeout:120000},async()=>{
 const shared=dirname(await realpath('node_modules'));
 const server=await createServer({configFile:false,logLevel:'error',cacheDir:join(shared,'node_modules/.cache/native-raster-test/vite'),
  optimizeDeps:{noDiscovery:true,include:['fabric']},
  plugins:[{name:'native-raster-test',
   resolveId(id){if(id==='/native-raster-fabric.ts')return '\0native-raster-fabric';},
   load(id){if(id==='\0native-raster-fabric')return "export {StaticCanvas,FabricImage} from 'fabric';";},
   configureServer(s){s.middlewares.use('/native-raster-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Native raster test</title>');});}}],
  server:{port:0,host:'127.0.0.1',fs:{allow:[process.cwd(),shared]}}});
 await server.listen();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]+'native-raster-test');
  const result=await page.evaluate(async()=>{
   const {StaticCanvas,FabricImage}=await import('/native-raster-fabric.ts');
   const {pageRaster}=await import('/src/retouch-canvas.ts'),{sameKindImage}=await import('/src/image-export.ts');
   const width=1170,height=990,source=document.createElement('canvas');source.width=width;source.height=height;
   const g=source.getContext('2d'),pattern=g.createImageData(width,height);
   // One-pixel edges and tinted transparency expose resampling that is hard to
   // see in a thumbnail but changes font matching and the weight of letters.
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;pattern.data[i]=(x*37+y*13)%256;pattern.data[i+1]=(x*11+y*47)%256;pattern.data[i+2]=((x^y)*29)%256;
    pattern.data[i+3]=x%3===0?0:x%3===1?128:255;
   }
   g.putImageData(pattern,0,0);
   const c=new StaticCanvas(undefined,{width:850,height:700,backgroundColor:'#e4f0f7',enableRetinaScaling:false,renderOnAddRemove:false});
   const image=new FabricImage(source,{left:0,top:0,originX:'left',originY:'top',strokeWidth:0,objectCaching:true});c.add(image);
   const p={id:'native-raster',name:'Native raster',width,height,color:'#e4f0f7',index:0,canvas:{objects:[]},file:{type:'image/png',width,height}};
   const views=[[1,0,0],[.66,0,0],[.76,0,0],[.13,0,0],[2.77,0,0],[.66,17.3,-23.7],[.76,-23.7,17.3]];
   const read=canvas=>({width:canvas.width,height:canvas.height,data:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data});
   const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
   const summary=async raster=>({width:raster.width,height:raster.height,sha256:await digest(raster.data),alpha:[raster.data[3],raster.data[7],raster.data[11]]});
   const decode=async blob=>{const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'}),out=document.createElement('canvas');out.width=bitmap.width;out.height=bitmap.height;out.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return read(out);};
   const snapshot=()=>({viewport:c.viewportTransform,values:[...c.viewportTransform],boundaryRef:c.vptCoords,boundaries:JSON.stringify(c.vptCoords),background:c.backgroundColor,objects:JSON.stringify(c.toObject()),width:c.width,height:c.height,retina:c.enableRetinaScaling,skipControls:c.skipControlsDrawing});
   const unchanged=before=>c.viewportTransform===before.viewport&&JSON.stringify(c.viewportTransform)===JSON.stringify(before.values)&&c.vptCoords===before.boundaryRef&&JSON.stringify(c.vptCoords)===before.boundaries&&c.backgroundColor===before.background&&JSON.stringify(c.toObject())===before.objects&&c.width===before.width&&c.height===before.height&&c.enableRetinaScaling===before.retina&&c.skipControlsDrawing===before.skipControls;
   const rows=[];
   for(const [zoom,x,y] of views){
    c.setViewportTransform([zoom,0,0,zoom,x,y]);c.renderAll();
    let before=snapshot();const raster=await summary(read(pageRaster(c,width,height)));const rasterState=unchanged(before);
    before=snapshot();const filtered=await summary(read(pageRaster(c,width,height,[image])));const filteredState=unchanged(before);
    before=snapshot();p.file.type='image/png';const png=await sameKindImage(p,c),pngPixels=await summary(await decode(png.blob));const pngState=unchanged(before);
    before=snapshot();p.file.type='image/jpeg';const jpeg=await sameKindImage(p,c),jpegPixels=await summary(await decode(jpeg.blob));const jpegState=unchanged(before);
    rows.push({view:[zoom,x,y],raster,filtered,png:pngPixels,jpeg:jpegPixels,state:[rasterState,filteredState,pngState,jpegState],exportDimensions:[[png.width,png.height],[jpeg.width,jpeg.height]]});
   }
   // Retouching keeps its safety limit, while a normal image download remains
   // able to save pictures larger than that separate working-raster limit.
   let limited=false;try{pageRaster(c,5000,3300);}catch(e){limited=/16 megapixels/.test(String(e));}
   p.width=5000;p.height=3300;p.file={type:'image/png',width:5000,height:3300};
   const before=snapshot(),large=await sameKindImage(p,c),largeState=unchanged(before),largeBitmap=await createImageBitmap(large.blob);
   const largeDimensions=[large.width,large.height,largeBitmap.width,largeBitmap.height];largeBitmap.close();
   // Fabric's internal export temporarily changes dimensions and rendering
   // flags. Both callers must restore them even when rendering throws.
   p.width=width;p.height=height;p.file={type:'image/png',width,height};c.enableRetinaScaling=true;
   const render=c.renderCanvas;c.renderCanvas=()=>{throw new Error('forced native raster render failure');};
   const failures=[];
   try{
    let before=snapshot(),message='';try{pageRaster(c,width,height,[image]);}catch(e){message=e.message;}failures.push({message,state:unchanged(before)});
    before=snapshot();message='';try{await sameKindImage(p,c);}catch(e){message=e.message;}failures.push({message,state:unchanged(before)});
   }finally{c.renderCanvas=render;}
   await c.dispose();return {rows,limited,largeDimensions,largeState,failures};
  });
  const reference=result.rows[0];
  for(const row of result.rows){
   for(const kind of ['raster','filtered','png','jpeg'])assert.deepEqual(row[kind],reference[kind],`${kind} pixels at zoom/pan ${row.view}`);
   assert.deepEqual(row.exportDimensions,[[1170,990],[1170,990]],`native export dimensions at ${row.view}`);
   assert.deepEqual(row.state,[true,true,true,true],`canvas state restored at ${row.view}`);
  }
  assert.deepEqual(reference.png.alpha,[0,128,255],'PNG transparency and tinted alpha stay intact');
  assert.deepEqual(reference.filtered,reference.png,'filtered OCR raster uses the same native transparent pixels as PNG export');
  assert.equal(result.limited,true,'retouching still rejects a raster over 16 megapixels');
  assert.deepEqual(result.largeDimensions,[5000,3300,5000,3300],'image export keeps its original size above the retouching limit');
  assert.equal(result.largeState,true,'large image export restores the canvas state');
  assert.deepEqual(result.failures,[{message:'forced native raster render failure',state:true},{message:'forced native raster render failure',state:true}],'both native raster callers restore all canvas state when rendering throws');
 }finally{await browser.close();await server.close();}
});
