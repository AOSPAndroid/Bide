// Invented documents only. Reading a selection must recover source detail
// without changing the document, its lettering, or the next exported pixels.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {realpath,readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import * as mupdf from 'mupdf';

const reference='Reference ZX 4827 TOTAL 1947.80 EUR';
const area={left:96,top:96,width:168,height:36};
const points=b=>[{x:b.left,y:b.top},{x:b.left+b.width,y:b.top},{x:b.left+b.width,y:b.top+b.height},{x:b.left,y:b.top+b.height}];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

async function runBrowser(body){
 const shared=dirname(await realpath('node_modules'));
 const virtual='\0selected-text-test-fabric';
 const server=await createServer({logLevel:'error',cacheDir:process.env.BIDE_ROI_TEST_CACHE||'node_modules/.cache/nov21-roi-final/vite',plugins:[{name:'selected-text-test-fabric',resolveId(id){if(id==='/selected-text-test-fabric.ts'||id===virtual)return virtual;},load(id){if(id===virtual)return "export {StaticCanvas,FabricImage,Rect,Group} from 'fabric';";}}],server:{port:0,host:'127.0.0.1',fs:{allow:[process.cwd(),shared]}}});
 await server.listen();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{return await body(browser,server.resolvedUrls.local[0]);}finally{await browser.close();await server.close();}
}
async function tinyPdf(browser){
 const page=await browser.newPage();
 try{
  const png=await page.evaluate(text=>{const k=300/72,c=document.createElement('canvas');c.width=Math.ceil(160*k);c.height=Math.ceil(30*k);const g=c.getContext('2d');g.scale(k,k);g.fillStyle='#fff';g.fillRect(0,0,160,30);g.fillStyle='#111';g.font='6px Arial';g.fillText(text,3,16);return c.toDataURL('image/png').split(',')[1];},reference);
  const pdf=await PDFDocument.create(),image=await pdf.embedPng(Buffer.from(png,'base64'));
  pdf.addPage([2400,3200]).drawImage(image,{x:100,y:3200-130,width:160,height:30});
  return Buffer.from(await pdf.save());
 }finally{await page.close();}
}
const saved=page=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=await restoreLocal();if(!p)return null;return {...p,pages:p.pages.map(({thumb,...page})=>page)};});
async function waitSaved(page,name){
 let result;const deadline=Date.now()+60000;
 while(Date.now()<deadline){result=await saved(page);if(result?.name===name&&result.pages.length)return result;await page.waitForTimeout(100);}
 throw new Error('The imported document was not persisted: '+name);
}
async function command(page,label){await page.keyboard.press('Control+k');await page.keyboard.type(label);await page.keyboard.press('Enter');}
async function importPdf(page,bytes,name='invented-tiny-detail.pdf'){
 await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name,mimeType:'application/pdf',buffer:bytes});
 await page.waitForFunction(()=>{const text=document.querySelector('.text-detection-bar > span')?.textContent||'';return /OCR regions|No text detected/.test(text);},null,{timeout:240000});
 return waitSaved(page,name.replace(/\.pdf$/,''));
}
async function drawArea(page,b,{touch=false,modifiers=[]}={}){
 await page.evaluate(b=>{const art=document.querySelector('.artboard').getBoundingClientRect(),ws=document.querySelector('.canvas-workspace'),r=ws.getBoundingClientRect(),k=art.width/2400;ws.scrollLeft+=art.left+b.left*k-r.left-35;ws.scrollTop+=art.top+b.top*k-r.top-45;},b);
 const box=await page.locator('.artboard').boundingBox(),k=box.width/2400;
 const start={x:box.x+b.left*k,y:box.y+b.top*k},end={x:box.x+(b.left+b.width)*k,y:box.y+(b.top+b.height)*k};
 for(const key of modifiers)await page.keyboard.down(key);
 if(touch){
  const cdp=await page.context().newCDPSession(page);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:0}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8,id:0}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}
 }else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();}
 for(const key of [...modifiers].reverse())await page.keyboard.up(key);
 await page.locator('.selection-outline path.ants').first().waitFor();
}
async function setZoom(page){await command(page,'Actual size (100%)');await page.waitForFunction(()=>Math.abs(document.querySelector('.artboard').getBoundingClientRect().width/2400-1)<.01);}
async function readArea(page){const button=page.getByRole('button',{name:'Read selected area',exact:true});await button.scrollIntoViewIfNeeded();await button.click();const dialog=page.getByRole('dialog',{name:'Read selected text'});await dialog.waitFor();const input=dialog.getByLabel('Detected text');await input.waitFor({timeout:240000});assert.equal(await input.inputValue(),reference);assert.equal(await input.getAttribute('readonly'),'');return dialog;}
async function exportPdf(page){
 await command(page,'Export PDF');const [file]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.getByRole('button',{name:'Export PDF',exact:true}).click()]);const bytes=await readFile(await file.path());await file.delete();return bytes;
}
function pdfPixels(bytes){const doc=mupdf.Document.openDocument(bytes,'pdf'),p=doc.loadPage(0),pix=p.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true);try{return {width:pix.getWidth(),height:pix.getHeight(),hash:digest(pix.getPixels())};}finally{pix.destroy();p.destroy();doc.destroy();}}

test('native-detail selected PDF text is recovered and copied on desktop and a phone, without editing the page',{timeout:900000},async()=>runBrowser(async(browser,url)=>{
 const fixture=await tinyPdf(browser),originalPixels=pdfPixels(fixture);
 for(const phone of [false,true]){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1450,height:950},deviceScaleFactor:phone?2:1,isMobile:phone,hasTouch:phone,permissions:['clipboard-read','clipboard-write'],acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(url+'app/');await importPdf(page,fixture);
   const fields=await page.locator('.detected-text-overlay button').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label')));
   assert.ok(!fields.some(text=>text.includes(reference)),'the small original field was actually missed by whole-page OCR');
   await command(page,'Read selected area');await page.getByText('Draw an area around the text, then choose Read text.',{exact:true}).waitFor();await setZoom(page);
   await drawArea(page,area,{touch:phone});
   await page.getByText('PDF area',{exact:true}).waitFor({state:'attached'});
   for(const name of ['Copy area','Keep inside','Copy to layer','Redact selection'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true,'a locked-PDF area cannot '+name);
   const before=await saved(page);
   await page.keyboard.press('Delete');await page.keyboard.press('Control+c');await page.keyboard.press('Control+Shift+i');assert.deepEqual(await saved(page),before,'pixel shortcuts cannot change a read-only PDF area');
   const small={left:110,top:102,width:40,height:20};await drawArea(page,small,{modifiers:['Shift','Alt']});
   const bounds=await page.locator('.selection-outline path.ants').first().getAttribute('d');
   const values=(bounds.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),xs=values.filter((_,i)=>i%2===0);assert.ok(Math.max(...xs)-Math.min(...xs)<45,'Shift/Alt replaces a locked-PDF area without a whole-page pixel mask');
   await drawArea(page,area,{touch:phone});const dialog=await readArea(page);
   await dialog.getByRole('button',{name:'Copy text',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),reference);
   await dialog.getByRole('button',{name:'Read again',exact:true}).click();await dialog.getByLabel('Detected text').waitFor({timeout:240000});assert.equal(await dialog.getByLabel('Detected text').inputValue(),reference);
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await saved(page),before,'reading and copying preserve sources, pages, fields and canvas objects');
   assert.deepEqual(pdfPixels(await exportPdf(page)),originalPixels,'the downloaded PDF retains every original pixel');
   assert.deepEqual(errors,[]);console.log(`# selected text ${phone?'phone':'desktop'}: whole-page missed; native crop exact; original/export pixels ${originalPixels.hash}`);
  }catch(error){
   const dom=await page.evaluate(()=>({dialog:document.querySelector('[role=dialog]')?.innerText,status:document.querySelector('.text-detection-bar > span')?.textContent,selection:document.querySelector('.selection-outline path.ants')?.getAttribute('d'),url:location.href})).catch(()=>null);
   const project=await Promise.race([saved(page),new Promise(resolve=>setTimeout(()=>resolve(null),3000))]).catch(()=>null);
   console.log('# selected text failure '+JSON.stringify({phone,dom,errors,project:project&&{name:project.name,pages:project.pages.map(p=>({id:p.id,source:p.source,width:p.width,height:p.height,objects:p.canvas.objects?.length,forms:p.forms?.length}))}}));throw error;
  }finally{await context.close();}
 }
}));

test('selected-area rendering preserves the visible page colour, transparent ink and overlays, and clips polygon/mask holes',{timeout:180000},async()=>runBrowser(async(browser,url)=>{
 const page=await browser.newPage();await page.route('**/selected-text-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Selected text raster checks</title>'}));await page.goto(url+'selected-text-harness');
 const blackPdf=await PDFDocument.create();blackPdf.addPage([400,300]).drawRectangle({x:0,y:0,width:400,height:300,color:rgb(0,0,0)});
 const result=await page.evaluate(async encoded=>{
  const {blankPage}=await import('/src/model.ts'),{StaticCanvas,FabricImage,Rect}=await import('/selected-text-test-fabric.ts'),{renderSelectionRaster}=await import('/src/read-selected-text.ts'),{importDocument}=await import('/src/browser/engine.ts');
  const p={...blankPage(400,300),color:'#d6c9b1'},c=new StaticCanvas(undefined,{width:400,height:300,backgroundColor:p.color,enableRetinaScaling:false}),source=document.createElement('canvas');source.width=200;source.height=160;const ink=source.getContext('2d');ink.fillStyle='#123456';ink.fillRect(20,20,100,35);ink.fillStyle='rgba(190,20,40,.5)';ink.fillRect(30,80,110,40);
  const image=new FabricImage(source,{left:40,top:30,strokeWidth:0,objectCaching:false});c.add(image);c.add(new Rect({left:100,top:70,width:40,height:55,strokeWidth:0,fill:'#1357dd',opacity:.5,objectCaching:false}));c.renderAll();
  const before=JSON.stringify(c.toObject()),b={left:50,top:40,width:180,height:130},rect=[{x:50,y:40},{x:230,y:40},{x:230,y:170},{x:50,y:170}],expected=document.createElement('canvas');expected.width=180;expected.height=130;const g=expected.getContext('2d');g.fillStyle=p.color;g.fillRect(0,0,180,130);g.drawImage(source,40-50,30-40);g.globalAlpha=.5;g.fillStyle='#1357dd';g.fillRect(100-50,70-40,40,55);g.globalAlpha=1;
  const crop=await renderSelectionRaster(c,p,{points:rect}),actual=crop.getContext('2d').getImageData(0,0,crop.width,crop.height).data,wanted=expected.getContext('2d').getImageData(0,0,180,130).data;let different=0;for(let i=0;i<wanted.length;i++)if(actual[i]!==wanted[i])different++;
  const triangle=await renderSelectionRaster(c,p,{points:[{x:50,y:40},{x:230,y:40},{x:50,y:170}]}),sample=(canvas,x,y)=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data);
  const mask={width:400,height:300,data:new Uint8ClampedArray(400*300)};for(let y=40;y<170;y++)for(let x=50;x<230;x++)if(!(x>=110&&x<140&&y>=80&&y<110))mask.data[y*400+x]=255;
  const holes=await renderSelectionRaster(c,p,{points:rect,mask});const out={size:[crop.width,crop.height],different,triangleOutside:sample(triangle,175,125),triangleInside:sample(triangle,15,15),maskHole:sample(holes,70,55),maskInside:sample(holes,15,15),expectedInside:sample(expected,15,15),unchanged:JSON.stringify(c.toObject())===before};
  c.add(new Rect({left:60,top:50,width:20,height:20,fill:'#000',strokeWidth:0,globalCompositeOperation:'destination-out',objectCaching:false}));c.renderAll();const erasedState=JSON.stringify(c.toObject()),paper=await renderSelectionRaster(c,p,{points:rect});out.paperHole=sample(paper,15,15);out.paperSceneUnchanged=JSON.stringify(c.toObject())===erasedState;await c.dispose();
  const bytes=Uint8Array.from(atob(encoded),s=>s.charCodeAt(0)),pdf=await importDocument(new File([bytes],'invented-black-underlay.pdf',{type:'application/pdf'})),pdfPage={...blankPage(400,300),source:pdf.id,index:0},overlay=new StaticCanvas(undefined,{width:400,height:300,enableRetinaScaling:false}),red=extra=>new Rect({left:0,top:0,width:400,height:300,fill:'#c04020',strokeWidth:0,objectCaching:false,...extra}),at=(canvas,x,y)=>sample(canvas,Math.round(x*canvas.width/180),Math.round(y*canvas.height/130));
  overlay.add(red({}));overlay.add(new Rect({left:60,top:50,width:20,height:20,fill:'#000',strokeWidth:0,globalCompositeOperation:'destination-out',objectCaching:false}));overlay.renderAll();let state=JSON.stringify(overlay.toObject()),composite=await renderSelectionRaster(overlay,pdfPage,{points:rect});out.pdfHole=at(composite,15,15);out.pdfIntactOverlay=at(composite,50,50);out.pdfScenesUnchanged=JSON.stringify(overlay.toObject())===state;
  for(const mode of ['multiply','source-in']){overlay.clear();overlay.add(red({globalCompositeOperation:mode}));overlay.renderAll();state=JSON.stringify(overlay.toObject());composite=await renderSelectionRaster(overlay,pdfPage,{points:rect});out[mode]=at(composite,50,50);out.pdfScenesUnchanged&&=JSON.stringify(overlay.toObject())===state;}await overlay.dispose();return out;
 },Buffer.from(await blackPdf.save()).toString('base64'));
 console.log('# selected composite colours '+JSON.stringify({paperHole:result.paperHole,pdfHole:result.pdfHole,pdfIntactOverlay:result.pdfIntactOverlay,multiply:result.multiply,sourceIn:result['source-in']}));
 assert.deepEqual(result.size,[180,130]);assert.equal(result.different,0,'the crop uses the same matte, image alpha and visible half-opacity overlay');assert.deepEqual(result.triangleOutside,[255,255,255,255]);assert.deepEqual(result.maskHole,[255,255,255,255]);assert.deepEqual(result.triangleInside,result.expectedInside);assert.deepEqual(result.maskInside,result.expectedInside);assert.equal(result.unchanged,true);
 assert.deepEqual(result.paperHole,[214,201,177,255],'an erased image overlay reveals the page colour');assert.deepEqual(result.pdfHole,[0,0,0,255],'an erased PDF overlay reveals the original PDF ink');assert.deepEqual(result.pdfIntactOverlay,[192,64,32,255]);assert.deepEqual(result.multiply,[192,64,32,255],'multiply blends against other canvas overlays, with the PDF outside that canvas');assert.deepEqual(result['source-in'],[0,0,0,255],'source-in on an otherwise empty overlay is transparent over the PDF');assert.equal(result.paperSceneUnchanged,true);assert.equal(result.pdfScenesUnchanged,true);
}));

test('selected-area OCR cancellation and page changes discard late results; editable form overlaps fail closed',{timeout:900000},async()=>runBrowser(async(browser,url)=>{
 const fixture=await tinyPdf(browser),context=await browser.newContext({viewport:{width:1450,height:950}});
 await context.addInitScript(()=>{
  const NativeWorker=window.Worker,nativeCreate=document.createElement.bind(document);window.__roiGate=false;window.__roiHeld=[];window.__roiCanvases=[];
  document.createElement=function(tag,...args){const element=nativeCreate(tag,...args);if(tag.toLowerCase()==='canvas'&&window.__roiGate)window.__roiCanvases.push(element);return element;};
  window.Worker=class extends NativeWorker{postMessage(message,...args){if(window.__roiGate&&message.type==='run'){window.__roiHeld.push({model:message.model,send:()=>super.postMessage(message,...args)});return;}return super.postMessage(message,...args);}};
  window.__roiRelease=()=>{window.__roiGate=false;for(const call of window.__roiHeld.splice(0))call.send();};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(url+'app/');await importPdf(page,fixture);await command(page,'Read selected area');await setZoom(page);await drawArea(page,area);const before=await saved(page);
  await page.evaluate(()=>{window.__roiGate=true;window.__roiCanvases=[];});await page.getByRole('button',{name:'Read selected area',exact:true}).click();
  await page.waitForFunction(()=>window.__roiHeld.length>0,null,{timeout:120000});assert.match(await page.evaluate(()=>window.__roiHeld[0].model),/ppocr/,'the actual OCR model call is pending');
  const cropEvidence=await page.evaluate(async()=>{const {selectionRasterPlan}=await import('/src/selection-ocr-geometry.ts'),path=document.querySelector('.selection-outline path.ants').getAttribute('d'),values=(path.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),points=values.filter((_,i)=>i%2===0).map((x,i)=>({x,y:values[i*2+1]})),plan=selectionRasterPlan(2400,3200,{points},300/72);window.__roiSourceCrops=window.__roiCanvases.filter(c=>c.width===plan.width&&c.height===plan.height);return {path,plan,created:window.__roiCanvases.map(c=>[c.width,c.height]),count:window.__roiSourceCrops.length};});assert.ok(cropEvidence.count>0,'the pending native crop matches its actual selection plan: '+JSON.stringify(cropEvidence));
  await page.getByRole('dialog',{name:'Read selected text'}).getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__roiSourceCrops[0].width<=1&&window.__roiSourceCrops[0].height<=1),true,'Cancel immediately releases the selected raster, even while inference is pending');
  assert.deepEqual(await saved(page),before);await page.evaluate(()=>window.__roiRelease());await page.waitForTimeout(2000);assert.equal(await page.getByRole('dialog',{name:'Read selected text'}).count(),0,'a late result cannot reopen the cancelled dialog');
  await page.evaluate(()=>{window.__roiGate=true;});await page.getByRole('button',{name:'Read selected area',exact:true}).click();await page.waitForFunction(()=>window.__roiHeld.length>0,null,{timeout:120000});
  const replacement=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,400,200);g.fillStyle='#111';g.font='25px Arial';g.fillText('A DIFFERENT DOCUMENT',20,100);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:'invented-other-document.png',mimeType:'image/png',buffer:Buffer.from(replacement,'base64')});await waitSaved(page,'invented-other-document');await page.evaluate(()=>window.__roiRelease());
  await page.waitForFunction(()=>/OCR regions|No text detected/.test(document.querySelector('.text-detection-bar > span')?.textContent||''),null,{timeout:240000});assert.equal(await page.getByRole('dialog',{name:'Read selected text'}).count(),0,'a new document cannot display an old crop result');const after=await saved(page);assert.equal(after.name,'invented-other-document');assert.equal(after.pages[0].canvas.objects.length,1,'late OCR does not add an old text or image layer');assert.deepEqual(errors,[]);
 }finally{await context.close();}
 const made=await PDFDocument.create(),pg=made.addPage([420,300]),font=await made.embedFont(StandardFonts.Helvetica);pg.drawText('READABLE HEADER',{x:40,y:260,size:14,font,color:rgb(0,0,0)});const form=made.getForm(),field=form.createTextField('Native value');field.setText('OLD VALUE');field.addToPage(pg,{x:40,y:180,width:180,height:25});
 const harness=await browser.newPage();await harness.route('**/selected-form-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Selected form guard</title>'}));await harness.goto(url+'selected-form-harness');
 const guard=await harness.evaluate(async encoded=>{
  const {blankPage}=await import('/src/model.ts'),{StaticCanvas}=await import('/selected-text-test-fabric.ts'),{importDocument}=await import('/src/browser/engine.ts'),{renderSelectionRaster}=await import('/src/read-selected-text.ts'),data=Uint8Array.from(atob(encoded),s=>s.charCodeAt(0)),source=await importDocument(new File([data],'invented-form.pdf',{type:'application/pdf'})),p={...blankPage(420,300),source:source.id,index:0},c=new StaticCanvas(undefined,{width:420,height:300}),rect=(left,top,width,height)=>({points:[{x:left,y:top},{x:left+width,y:top},{x:left+width,y:top+height},{x:left,y:top+height}]});
  const refused=async(selection,page=p)=>{try{await renderSelectionRaster(c,page,selection);return '';}catch(error){return error.message;}};
  const native=await refused(rect(35,90,200,40)),own=await refused(rect(250,180,100,30),{...p,forms:[{id:'edited',type:'text',name:'Current value',left:250,top:180,width:100,height:30,value:'CURRENT VALUE'}]}),header=await renderSelectionRaster(c,p,rect(35,20,200,35)),out={native,own,headerSize:[header.width,header.height],objects:c.getObjects().length};await c.dispose();return out;
 },Buffer.from(await made.save()).toString('base64'));
 assert.match(guard.native,/editable form/i);assert.match(guard.own,/editable form/i);assert.ok(guard.headerSize[0]>800&&guard.headerSize[1]>140,'an unrelated native-detail header is still readable');assert.equal(guard.objects,0);
}));

test('scaled and grouped pictures retain their native image pixels when an area is read',{timeout:180000},async()=>runBrowser(async(browser,url)=>{
 const page=await browser.newPage();await page.route('**/selected-image-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Selected native image detail</title>'}));await page.goto(url+'selected-image-harness');
 const results=await page.evaluate(async()=>{
  const {blankPage}=await import('/src/model.ts'),{StaticCanvas,FabricImage,Group}=await import('/selected-text-test-fabric.ts'),{renderSelectionRaster}=await import('/src/read-selected-text.ts'),source=document.createElement('canvas');source.width=200;source.height=120;const g=source.getContext('2d'),pixels=g.createImageData(200,120);
  for(let y=0;y<120;y++)for(let x=0;x<200;x++){const i=(y*200+x)*4;pixels.data[i]=(x*29+y*7)%256;pixels.data[i+1]=(x*3+y*17)%256;pixels.data[i+2]=(x*11+y*13)%256;pixels.data[i+3]=255;}g.putImageData(pixels,0,0);const results=[];
  for(const viewZoom of [.13,1,2.77])for(const [scale,grouped]of [[.5,false],[.24,false],[.5,true]]){
   const p=blankPage(300,200),c=new StaticCanvas(undefined,{width:300,height:200,enableRetinaScaling:false}),image=new FabricImage(source,{left:0,top:0,strokeWidth:0,objectCaching:false}),object=grouped?new Group([image],{left:0,top:0,scaleX:scale,scaleY:scale,objectCaching:false}):image; if(!grouped)object.set({scaleX:scale,scaleY:scale});c.add(object);c.setViewportTransform([viewZoom,0,0,viewZoom,17,-23]);c.renderAll();const before=JSON.stringify(c.toObject()),viewport=[...c.viewportTransform],w=200*scale,h=120*scale,crop=await renderSelectionRaster(c,p,{points:[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}]}),actual=crop.getContext('2d').getImageData(0,0,crop.width,crop.height).data;let different=actual.length===pixels.data.length?0:-1;if(different===0)for(let i=0;i<actual.length;i++)if(actual[i]!==pixels.data[i])different++;results.push({scale,grouped,viewZoom,viewportBefore:viewport,viewportAfter:[...c.viewportTransform],zoomAfter:c.getZoom(),size:[crop.width,crop.height],different,unchanged:JSON.stringify(c.toObject())===before});await c.dispose();
  }
  return results;
 });
 assert.equal(results.length,9);for(const result of results){assert.deepEqual(result.size,[200,120],JSON.stringify(result));assert.equal(result.different,0,'native pixel detail survives '+JSON.stringify(result));assert.equal(result.unchanged,true);assert.equal(result.zoomAfter,result.viewZoom,'reading preserves the viewport zoom');assert.deepEqual(result.viewportAfter,result.viewportBefore,'reading preserves the viewport translation and transform');}
}));
