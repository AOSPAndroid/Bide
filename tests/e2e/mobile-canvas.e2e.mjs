// End-to-end on phones and tablets: editing text by tapping it, high zoom that
// keeps rendering, one-finger scrolling, slow pinches that leave nothing behind,
// text editing above the keyboard, small objects that move, long-press menus,
// finger-sized zoom and tool controls, and a page that fills the phone.
// The desktop editor is checked to look exactly as before.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const phone={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
const devices={phone,retina:{...phone,deviceScaleFactor:3},android:{viewport:{width:360,height:740},deviceScaleFactor:3,isMobile:true,hasTouch:true},
 landscape:{viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true},tablet:{viewport:{width:820,height:1180},deviceScaleFactor:2,isMobile:true,hasTouch:true},
 desktop:{viewport:{width:1400,height:900}}};
let server,browser;
before(async()=>{server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});});
after(async()=>{await browser?.close();await server?.close();});
async function boot(device='phone'){
 const context=await browser.newContext({...devices[device],acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('.workspace-nav').getByRole('button',{name:'Photo editor',exact:true}).click();await page.locator('.artboard').waitFor({timeout:60000});await page.waitForTimeout(1500);
 return {context,page,errors,cdp:devices[device].hasTouch?await context.newCDPSession(page):null};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Real touch sequences: [type, [[x,y],…], pause after].
async function touches(cdp,steps){for(const [type,points,pause=20] of steps){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});await wait(pause);}}
const drag=(x,y,dx,dy,n=6)=>[['touchStart',[[x,y]]],...Array.from({length:n},(_,i)=>['touchMove',[[x+dx*(i+1)/n,y+dy*(i+1)/n]]]),['touchEnd',[]]];
const saved=async page=>{await page.waitForTimeout(1300);return page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects;});};
const pageWidth=page=>page.evaluate(()=>Number(document.querySelector('.artboard-label span:last-child').textContent.split('×')[0]));
const zoomOf=async page=>(await page.locator('.artboard').boundingBox()).width/await pageWidth(page);
// Client position of a page point.
async function at(page,x,y){const b=await page.locator('.artboard').boundingBox(),z=await zoomOf(page);return [b.x+x*z,b.y+y*z];}
const editing=page=>page.evaluate(()=>{const t=document.activeElement;return t?.tagName==='TEXTAREA'?{value:t.value,start:t.selectionStart,end:t.selectionEnd}:null;});
const undoable=page=>page.locator('button[aria-label="Undo (Ctrl Z)"]').isEnabled();
const scrollOf=page=>page.evaluate(()=>{const w=document.querySelector('.canvas-workspace');return [w.scrollLeft,w.scrollTop];});

test('a tap on a selected small text box edits it where tapped; a drag moves it; a new text box is ready to type over',{timeout:300000},async()=>{
 for(const f of [.5,.03,.96]){
  const {context,page}=await boot();
  // FIELDNOTES: 12 pt, one line, 280 wide at (44,36); about 5 px tall on screen at fit.
  const p=await at(page,44+280*f,42);
  await page.touchscreen.tap(...p);await page.waitForTimeout(450);
  assert.equal(await editing(page),null,'the first tap only selects');
  await page.touchscreen.tap(...p);await page.waitForTimeout(450);
  const e=await editing(page);
  assert.equal(e?.value,'FIELDNOTES',`the second tap at ${f} of the width edits the text`);
  if(f<.1)assert.ok(e.start<=2,`the cursor lands where tapped (${e.start})`);
  await context.close();
 }
 // A drag from the middle of the selected one-line box moves it; it is not stretched.
 {const {context,page,cdp}=await boot();
  const p=await at(page,44+140,42);await page.touchscreen.tap(...p);await page.waitForTimeout(450);
  await touches(cdp,drag(...p,24,40));
  const o=(await saved(page)).find(o=>o.name==='Studio wordmark');
  assert.equal(o.scaleY,1,'not stretched');assert.ok(o.top>36+40&&o.left>44+20,`moved to ${o.left},${o.top}`);
  await context.close();}
 // The Text tool's new box starts in editing with its placeholder selected.
 {const {context,page}=await boot();
  await page.locator('.tool-rail button[aria-label="Text box"]').click();
  await page.touchscreen.tap(...await at(page,300,560));await page.waitForTimeout(700);
  assert.deepEqual(await editing(page),{value:'Your text',start:0,end:9},'editing with the text selected');
  await page.keyboard.type('Hello');await page.waitForTimeout(1000);
  assert.ok((await saved(page)).some(o=>o.text==='Hello'),'typing replaced the placeholder');
  await context.close();}
});

test('high zoom keeps the page visible on a 3x phone; hit-testing and exports are unchanged',{timeout:300000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bide-mobile-canvas-')),photo=join(dir,'photo.png');
 // An invented 12 MP "photo": a gradient with discs (no text, so no OCR overlay over it).
 const maker=await browser.newPage();
 await writeDataUrl(maker,photo,()=>{const c=document.createElement('canvas');c.width=3024;c.height=4032;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,3024,4032);gr.addColorStop(0,'#3a6ea5');gr.addColorStop(1,'#e0c068');g.fillStyle=gr;g.fillRect(0,0,3024,4032);g.fillStyle='#2d4a3e';for(let y=400;y<4000;y+=800)for(let x=400;x<3000;x+=900){g.beginPath();g.arc(x,y,180,0,7);g.fill();}return c.toDataURL('image/png');});
 await maker.close();
 const {context,page,errors}=await boot('retina');
 await page.locator('input[type=file][accept*=".psd"]').setInputFiles(photo);await page.getByText(/1 page added/).waitFor({timeout:60000});await page.waitForTimeout(2500);
 const exportPng=async()=>{const download=page.waitForEvent('download',{timeout:120000});await page.keyboard.press('Control+k');await page.keyboard.type('Export page as transparent PNG');await page.keyboard.press('Enter');return readFile(await (await download).path());};
 const fitted=await exportPng();
 // 100%, then three steps in: about 173%, which once asked for a 327M-pixel canvas.
 await page.locator('.zoom-controls button[title="Reset to 100%"]').click();await page.waitForTimeout(1500);
 for(let i=0;i<3;i++){await page.locator('.zoom-controls button[aria-label="Zoom in"]').click();await page.waitForTimeout(1500);}
 assert.ok(await zoomOf(page)>1.7,'zoomed in');
 const canvas=await page.evaluate(()=>{const c=document.querySelector('canvas.lower-canvas'),w=document.querySelector('.canvas-workspace').getBoundingClientRect(),r=c.getBoundingClientRect(),k=c.width/r.width;
  return {pixels:c.width*c.height,css:r.width,centre:Array.from(c.getContext('2d').getImageData(Math.round((w.left+w.width/2-r.left)*k),Math.round((w.top+w.height/2-r.top)*k),1,1).data)};});
 assert.ok(canvas.pixels<=16.8e6,`the canvas stays within iOS's limit (${(canvas.pixels/1e6).toFixed(1)}M pixels)`);
 assert.ok(canvas.css>3024*1.7,'at the full zoomed size on screen');
 assert.equal(canvas.centre[3],255,`the photo is drawn (${canvas.centre})`);
 // A tap still finds the layer under the finger.
 const ws=await page.locator('.canvas-workspace').boundingBox();
 await page.touchscreen.tap(ws.x+ws.width/2,ws.y+ws.height/2);await page.waitForTimeout(500);
 assert.equal(await page.locator('.layer-row.selected .layer-name').textContent(),'photo.png','the tap selected the photo');
 // The export renders the same pixels at any zoom.
 const zoomed=await exportPng();
 assert.ok(fitted.equals(zoomed),'export identical at fit and at high zoom');
 assert.deepEqual(errors,[]);
 await context.close();
});

test('one finger scrolls a zoomed page unless it starts on the selected layer',{timeout:300000},async()=>{
 const {context,page,cdp}=await boot();
 await page.locator('.zoom-controls button[title="Reset to 100%"]').click();await page.waitForTimeout(800);
 const before=await saved(page),s0=await scrollOf(page),ws=await page.locator('.canvas-workspace').boundingBox(),x=ws.x+ws.width/2,y=ws.y+ws.height/2;
 await touches(cdp,drag(x,y,0,-160,8));
 const s1=await scrollOf(page);
 assert.ok(s1[1]>s0[1]+120,`scrolled ${s0} → ${s1}`);
 assert.deepEqual(await saved(page),before,'nothing moved');assert.equal(await undoable(page),false,'no history step');
 // Tap a layer to select it (the sage circle, by its centre); then the same drag moves it.
 const [cx,cy]=await at(page,209,561);assert.ok(cy>ws.y+40&&cy<ws.y+ws.height-40,'the circle is in view');
 await page.touchscreen.tap(cx,cy);await page.waitForTimeout(450);
 await touches(cdp,drag(cx,cy,30,30));
 const moved=(await saved(page)).filter((o,i)=>o.left!==before[i].left||o.top!==before[i].top);
 assert.deepEqual(moved.map(o=>[o.name,o.scaleX,o.scaleY]),[['Sage circle',1,1]],'the selected layer moved');
 assert.deepEqual(await scrollOf(page),s1,'and the page did not scroll');
 await context.close();
});

test('a pinch whose second finger lands late leaves no stroke, shape or move behind',{timeout:300000},async()=>{
 const {context,page,cdp}=await boot();
 const ws=await page.locator('.canvas-workspace').boundingBox(),x=ws.x+ws.width/2,y=ws.y+ws.height/2;
 const late=(x0,y0,gap,driftX=0,driftY=0)=>[['touchStart',[[x0,y0]],driftX?10:gap],...(driftX?[['touchMove',[[x0+driftX/2,y0+driftY/2]]],['touchMove',[[x0+driftX,y0+driftY]],40]]:[]),
  ['touchStart',[[x0+driftX,y0+driftY],[x0+70,y0+30]]],...Array.from({length:6},(_,i)=>['touchMove',[[x0+driftX-(i+1)*6,y0+driftY-(i+1)*3],[x0+70+(i+1)*6,y0+30+(i+1)*3]]]),['touchEnd',[]]];
 const count=(await saved(page)).length;
 for(const tool of ['Brush','Rectangle','Text box','Paint bucket']){
  await page.locator(`.tool-rail button[aria-label="${tool}"]`).click();
  const z=await zoomOf(page);await touches(cdp,late(x-60,y,150));await page.waitForTimeout(400);
  assert.ok(await zoomOf(page)>z*1.2,`${tool}: the pinch zoomed`);
  await touches(cdp,late(x-60,y,20,10,8));
  assert.equal((await saved(page)).length,count,`${tool}: nothing added`);
  await page.locator('.zoom-controls button[aria-label="Fit to screen"]').click();await page.waitForTimeout(400);
 }
 // One finger still draws.
 await page.locator('.tool-rail button[aria-label="Brush"]').click();
 await touches(cdp,drag(x-40,y,80,10,8));assert.equal((await saved(page)).length,count+1,'one finger drew');
 await page.keyboard.press('Control+z');await page.waitForTimeout(500);
 // A tap still fills (the bucket acts when the finger lifts).
 await page.locator('.tool-rail button[aria-label="Paint bucket"]').click();
 await touches(cdp,[['touchStart',[[x-60,y]],60],['touchEnd',[]]]);assert.equal((await saved(page)).length,count+1,'one tap filled');
 await page.keyboard.press('Control+z');await page.waitForTimeout(500);
 // Move tool: the selected headline, a finger that drifts 12 px, then the pinch.
 await page.locator('.tool-rail button[aria-label="Move & select"]').click();
 const before=await saved(page),p=await at(page,100,140);await page.touchscreen.tap(...p);await page.waitForTimeout(450);
 await touches(cdp,late(...p,20,9,8));
 assert.deepEqual(await saved(page),before,'the headline did not move');
 await context.close();
});

test('editing small text zooms it to a readable size and keeps it above the keyboard',{timeout:300000},async()=>{
 const {context,page}=await boot('android');
 // Footer: 9 pt at (44,757), near the bottom of the page.
 const p=await at(page,90,761);await page.touchscreen.tap(...p);await page.waitForTimeout(400);await page.touchscreen.tap(...p);await page.waitForTimeout(900);
 assert.equal((await editing(page))?.value,'DESIGNED TO BEGIN AGAIN');
 assert.ok(await zoomOf(page)*9>=15.9,`letters at least 16 px tall (zoom ${await zoomOf(page)})`);
 // The keyboard takes 300 px (the layout viewport shrinks, as in Android Chrome and the app's WebView).
 await page.setViewportSize({width:360,height:440});await page.waitForTimeout(1200);
 const [,top]=await at(page,44,757),[,bottom]=await at(page,44,767),ws=await page.locator('.canvas-workspace').boundingBox();
 assert.ok(top>=ws.y&&bottom<=ws.y+ws.height,`the text (${top}–${bottom}) is in the visible workspace (${ws.y}–${ws.y+ws.height})`);
 assert.equal(await page.evaluate(()=>scrollY),0,'the app itself did not scroll');
 assert.equal((await editing(page))?.value,'DESIGNED TO BEGIN AGAIN','still editing');
 // The typing textarea sits at the caret, which is what the browser keeps above the keyboard.
 const ta=await page.evaluate(()=>document.activeElement.getBoundingClientRect().top);
 assert.ok(ta>=ws.y&&ta<=ws.y+ws.height,`the hidden textarea (${ta}) is at the visible text`);
 await context.close();
});

test('a finger inside a small shape moves it; its handles still resize it from outside',{timeout:300000},async()=>{
 const {context,page,cdp}=await boot();
 await page.locator('.tool-rail button[aria-label="Rectangle"]').click();
 await page.touchscreen.tap(...await at(page,200,300));await page.waitForTimeout(600);
 const rect=async()=>(await saved(page)).find(o=>o.name==='Rect');
 let r=await rect();assert.deepEqual([r.width,r.height],[160,100]);
 // About 60×40 px on screen at fit. Fingers 6 px inside its top edge, and inside the bottom
 // edge a little right of the middle, used to land on the top and bottom handles.
 for(const [fx,fy] of [[0,-1],[10,1]]){
  const h=50*await zoomOf(page)-6,[cx,cy]=await at(page,r.left+80,r.top+50),dx=fx,dy=fy*h;await touches(cdp,drag(cx+dx,cy+dy,15,15));
  const n=await rect();assert.deepEqual([n.width*n.scaleX,n.height*n.scaleY],[160,100],`drag from ${dx},${dy} keeps the size`);
  assert.ok(n.left>r.left+10&&n.top>r.top+10,`and moves it (${r.left},${r.top} → ${n.left},${n.top})`);r=n;
 }
 // The bottom-right handle, grabbed just outside the corner.
 const z=await zoomOf(page),[bx,by]=await at(page,r.left+160,r.top+100);await touches(cdp,drag(bx+8,by+8,30,30));
 const n=await rect();assert.ok(n.width*n.scaleX>160+30/z*.8,`resized from the corner (${n.width*n.scaleX})`);
 await context.close();
});

test('a long press opens the layer menu and the lift does not close it',{timeout:300000},async()=>{
 const {context,page,cdp}=await boot();
 const before=await saved(page),p=await at(page,100,140);
 await touches(cdp,[['touchStart',[p],800]]);
 const menu=page.locator('[role=menu][aria-label="Text box actions"]');
 assert.ok(await menu.isVisible(),'the menu opened under the finger');
 await touches(cdp,[['touchEnd',[],400]]);
 assert.ok(await menu.isVisible(),'still open after the finger lifts');
 assert.deepEqual(await saved(page),before,'nothing moved');
 await context.close();
});

test('zoom and tool controls are finger-sized and the page fills the phone; desktop is unchanged',{timeout:300000},async()=>{
 const size=(page,selector)=>page.$$eval(selector,els=>els.filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];}));
 for(const device of ['phone','android','tablet']){
  const {context,page}=await boot(device);
  for(const [w,h] of await size(page,'.zoom-controls button'))assert.ok(w>=44&&h>=44,`${device}: zoom control ${w}×${h}`);
  for(const [w,h] of await size(page,'.tool-rail .tool-group button,.rail-bottom label'))assert.ok(w>=44&&h>=44,`${device}: tool ${w}×${h}`);
  const bar=await page.evaluate(()=>{const b=document.querySelector('.options-bar'),r=document.querySelector('.tool-rail');return {overflow:b.scrollWidth-b.clientWidth,zoom:!!document.querySelector('.header-zoom')?.offsetParent,shadow:getComputedStyle(r).backgroundAttachment};});
  assert.ok(bar.overflow<=0&&!bar.zoom,`${device}: the options bar fits without its duplicate zoom`);
  assert.match(bar.shadow,/local/,`${device}: the rail shows when more tools are scrolled away`);
  if(device==='tablet')assert.ok(await page.evaluate(()=>{const r=document.querySelector('.tool-rail');return r.scrollHeight<=r.clientHeight;}),'tablet: every tool fits the rail');
  if(device!=='tablet'){
   const fit=await page.evaluate(()=>{const w=document.querySelector('.canvas-workspace'),a=document.querySelector('.artboard').getBoundingClientRect();return {page:a.width,room:w.clientWidth,overflow:w.scrollWidth-w.clientWidth};});
   assert.ok(fit.page>=fit.room*.85&&fit.overflow<=0,`${device}: the page fills the width (${fit.page} of ${fit.room})`);
  }
  await context.close();
 }
 {const {context,page}=await boot('landscape');
  const fit=await page.evaluate(()=>{const w=document.querySelector('.canvas-workspace'),a=document.querySelector('.artboard').getBoundingClientRect(),r=w.getBoundingClientRect();return {bottom:a.bottom,limit:r.bottom,overflow:w.scrollWidth-w.clientWidth};});
  assert.ok(fit.bottom<=fit.limit&&fit.overflow<=0,'landscape: the page fits the workspace, with no sideways scroll');
  await context.close();}
 // Desktop (1400×900) keeps its layout: fit zoom, rail, footer and options-bar zoom.
 {const {context,page}=await boot('desktop');
  assert.ok(Math.abs((await page.locator('.artboard').boundingBox()).width-481)<=1,'desktop fit unchanged');
  assert.deepEqual((await size(page,'.tool-rail .tool-group button'))[0],[35,30],'desktop rail unchanged');
  assert.ok(await page.locator('input[aria-label="Zoom percentage"]').isVisible(),'desktop zoom field unchanged');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.canvas-workspace')).padding),'36px');
  await context.close();}
});

async function writeDataUrl(page,file,make){
 const {writeFile}=await import('node:fs/promises');
 await writeFile(file,Buffer.from((await page.evaluate(make)).split(',')[1],'base64'));
}
