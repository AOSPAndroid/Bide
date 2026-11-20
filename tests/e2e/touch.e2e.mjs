// End-to-end on a phone-sized touch screen: two fingers pinch-zoom the page
// (not the whole interface) and pan it, without drawing or moving anything;
// one finger still draws with the brush and pans with the hand tool.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {pickTool} from './rail.mjs';
import * as mupdf from 'mupdf';

const objects=page=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=(await restoreLocal())?.pages[0];return p?p.canvas.objects.map(o=>({type:o.type,left:Math.round(o.left),top:Math.round(o.top)})):[];});
const zoomOf=page=>page.evaluate(()=>{const b=document.querySelector('.artboard').getBoundingClientRect();return b.width;});
async function touches(cdp,steps){
 for(const [type,points] of steps){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});await new Promise(r=>setTimeout(r,20));}
}
const pinch=(cx,cy,from,to,n=8)=>[['touchStart',[[cx-from,cy],[cx+from,cy]]],...Array.from({length:n},(_,i)=>{const d=from+(to-from)*(i+1)/n;return ['touchMove',[[cx-d,cy],[cx+d,cy]]];}),['touchEnd',[]]];

test('pinch zooms the page on a phone; one finger keeps drawing and panning',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('.workspace-nav').getByRole('button',{name:'Photo editor',exact:true}).click();await page.locator('.artboard').waitFor({timeout:60000});await page.waitForTimeout(1500);
  const before=await objects(page),width0=await zoomOf(page),box=await page.locator('.canvas-workspace').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  // Pinch out over the page: the page grows, the interface does not, nothing is added or moved.
  await touches(cdp,pinch(cx,cy,40,120));await page.waitForTimeout(600);
  const width1=await zoomOf(page);
  assert.ok(width1>width0*2.2,`pinch zoomed the page (${width0} → ${width1})`);
  assert.equal(await page.evaluate(()=>visualViewport?.scale??1),1,'the browser did not zoom the interface');
  assert.deepEqual(await objects(page),before,'a pinch does not draw or move layers');
  // A pinch on the toolbars, the tool rail or the zoom footer zooms nothing.
  for(const selector of ['.topbar','.tool-rail','.canvas-footer','.options-bar']){
   const b=await page.locator(selector).first().boundingBox();if(!b)continue;
   const vertical=b.width<b.height,x=b.x+b.width/2,y=b.y+b.height/2;
   await touches(cdp,vertical?[['touchStart',[[x,y-20],[x,y+20]]],...Array.from({length:8},(_,i)=>['touchMove',[[x,y-20-(i+1)*12],[x,y+20+(i+1)*12]]]),['touchEnd',[]]]:pinch(x,y,20,110));
   await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>visualViewport?.scale??1),1,`a pinch on ${selector} does not zoom the interface`);
  }
  assert.ok(Math.abs(await zoomOf(page)-width1)<width1*.05,'a pinch on the toolbars leaves the document zoom alone');
  // Two-finger pan keeps the zoom and scrolls.
  const scroll0=await page.evaluate(()=>{const w=document.querySelector('.canvas-workspace');return [w.scrollLeft,w.scrollTop];});
  await touches(cdp,[['touchStart',[[cx-50,cy],[cx+50,cy]]],...Array.from({length:6},(_,i)=>['touchMove',[[cx-50-(i+1)*15,cy-(i+1)*15],[cx+50-(i+1)*15,cy-(i+1)*15]]]),['touchEnd',[]]]);await page.waitForTimeout(400);
  const scroll1=await page.evaluate(()=>{const w=document.querySelector('.canvas-workspace');return [w.scrollLeft,w.scrollTop];});
  assert.ok(scroll1[0]>scroll0[0]+40&&scroll1[1]>scroll0[1]+40,`two fingers panned (${scroll0} → ${scroll1})`);
  assert.ok(Math.abs(await zoomOf(page)-width1)<width1*.05,'panning keeps the zoom');
  // Pinch back in.
  await touches(cdp,pinch(cx,cy,120,40));await page.waitForTimeout(600);
  assert.ok(await zoomOf(page)<width1*.6,'pinch in zooms out');
  // One finger with the brush draws a stroke.
  await pickTool(page,'Brush');
  await touches(cdp,[['touchStart',[[cx-40,cy]]],...Array.from({length:8},(_,i)=>['touchMove',[[cx-40+(i+1)*10,cy+(i%2?6:-6)]]]),['touchEnd',[]]]);await page.waitForTimeout(1200);
  const drawn=await objects(page);assert.equal(drawn.length,before.length+1,'one finger drew one stroke');
  // …and a pinch with the brush still draws nothing.
  await touches(cdp,pinch(cx,cy,40,90));await page.waitForTimeout(1200);
  assert.equal((await objects(page)).length,drawn.length,'a pinch with the brush draws nothing');
  // The hand tool pans with one finger.
  await pickTool(page,'Pan');const s0=await page.evaluate(()=>document.querySelector('.canvas-workspace').scrollTop);
  await touches(cdp,[['touchStart',[[cx,cy+60]]],...Array.from({length:6},(_,i)=>['touchMove',[[cx,cy+60-(i+1)*15]]]),['touchEnd',[]]]);await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>document.querySelector('.canvas-workspace').scrollTop)>s0+40,'the hand tool pans with one finger');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('small neighbouring PDF fields open their own line from a source-centre tap or keyboard activation',{timeout:300000},async()=>{
 // MuPDF's source quads are independent of the editor's enlarged tap boxes.
 // At phone fit zoom, these 16 pt rows have overlapping 10 px targets. A
 // real tap on TWO used to open THREE through Chromium's touch adjustment.
 const labels=['ADDRESS LINE ONE','ADDRESS LINE TWO','ADDRESS LINE THREE'],doc=new mupdf.PDFDocument(),font=doc.addSimpleFont(new mupdf.Font('Courier'),'Latin');
 const created=doc.addPage([0,0,595,842],0,{Font:{F:font}},labels.map((text,i)=>`BT /F 12 Tf 70 ${672-i*16} Td (${text}) Tj ET`).join('\n'));
 doc.insertPage(-1,created);const pdf=Buffer.from(doc.saveToBuffer('').asUint8Array()),source=doc.loadPage(0);
 const boxes=labels.map(label=>{const hits=source.search(label).flat();assert.equal(hits.length,1);const q=hits[0];return {label,left:Math.min(q[0],q[2],q[4],q[6]),right:Math.max(q[0],q[2],q[4],q[6]),top:Math.min(q[1],q[3],q[5],q[7]),bottom:Math.max(q[1],q[3],q[5],q[7])};});
 const text=source.toStructuredText('preserve-whitespace');try{for(const label of labels)assert.ok(text.asText().includes(label),'all three original lines exist');}finally{text.destroy();source.destroy();doc.destroy();}
 for(const [i,b] of boxes.entries()){assert.ok(b.left>=0&&b.right<=595&&b.top>=0&&b.bottom<=842,'source quad is inside the page');if(i)assert.ok(Math.abs(b.top-boxes[i-1].top-16)<.01,'source lines are 16 pt apart');}
 const server=await createServer({logLevel:'error',cacheDir:'tmp/vite-touch-regions',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('.workspace-nav').getByRole('button',{name:'Photo editor',exact:true}).tap();
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:'invented-neighbouring-address.pdf',mimeType:'application/pdf',buffer:pdf});
  const field=label=>page.getByRole('button',{name:'Edit detected text: '+label,exact:true});await field(labels[0]).waitFor({timeout:120000});
  const state=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=await restoreLocal();return p?.pages[0].source?{source:p.pages[0].source,sources:p.sources,canvas:p.pages[0].canvas}:undefined;});
  let before;for(let i=0;i<100&&!before;i++){before=await state();if(!before)await page.waitForTimeout(100);}assert.ok(before,'the imported PDF is actually saved');
  for(let n=0;n<8;n++){const z=await zoomOf(page)/595;if(z<=.39)break;await page.getByRole('button',{name:'Zoom out',exact:true}).tap();}
  const lowZoom=await zoomOf(page)/595;assert.ok(lowZoom>=.28&&lowZoom<=.39,'zoom is low enough for overlapping minimum targets');
  for(const mode of ['low','normal']){
   if(mode==='normal'){await page.locator('button[title="Reset to 100%"]').tap();assert.ok(Math.abs(await zoomOf(page)/595-1)<.01,'normal zoom is 100%');}
   for(const b of boxes){
    await field(b.label).scrollIntoViewIfNeeded();
    const at=await field(b.label).evaluate((e,b)=>{const art=document.querySelector('.artboard').getBoundingClientRect(),r=e.getBoundingClientRect(),z=art.width/595;return {x:art.left+(b.left+b.right)/2*z,y:art.top+(b.top+b.bottom)/2*z,cx:r.left+r.width/2,cy:r.top+r.height/2,height:r.height};},b);
    assert.ok(Math.abs(at.cx-at.x)<.5&&Math.abs(at.cy-at.y)<.5,`${mode}: target stays centred on ${b.label}`);if(mode==='low')assert.ok(Math.abs(at.height-10)<.1,'minimum 10 px targets are retained');
    await page.touchscreen.tap(at.x,at.y);const dialog=page.getByRole('dialog',{name:'Edit PDF text'});await dialog.waitFor();
    assert.equal(await page.getByLabel('New text').inputValue(),b.label,`${mode}: a real tap on the original line opens that line`);await dialog.getByRole('button',{name:'Cancel',exact:true}).tap();
    await field(b.label).focus();assert.equal(await field(b.label).evaluate(e=>document.activeElement===e),true,'the intended field has keyboard focus');await page.keyboard.press('Enter');await dialog.waitFor();
    assert.equal(await page.getByLabel('New text').inputValue(),b.label,`${mode}: keyboard activation keeps the focused field`);await dialog.getByRole('button',{name:'Cancel',exact:true}).tap();
   }
  }
  assert.deepEqual(await state(),before,'opening and cancelling every field leaves the original PDF and canvas unchanged');assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
