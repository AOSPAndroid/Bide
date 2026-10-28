// End-to-end on phones and tablets: the PDF home and its dialogs (signature,
// warp and perspective, Find & redact, Organize pages, Protect/Export, PDF to
// images). Phone and tablet tests use real touch sequences; the last test checks
// that desktop keeps its dialogs.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';import {zipSync} from 'fflate';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const touch={deviceScaleFactor:2,isMobile:true,hasTouch:true};
const iphone={...touch,viewport:{width:390,height:844}},android={...touch,viewport:{width:360,height:740}};
const iphoneLandscape={...touch,viewport:{width:844,height:390}},androidLandscape={...touch,viewport:{width:740,height:360}};
const tablet={...touch,viewport:{width:820,height:1180}},desktop={viewport:{width:1400,height:900}};
let server,browser,dir;
before(async()=>{
 server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});dir=await mkdtemp(join(tmpdir(),'bide-mobile-dialogs-'));
});
after(async()=>{await browser?.close();await server?.close();if(dir)await rm(dir,{recursive:true,force:true});});

async function open(device){
 const context=await browser.newContext(device),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'app/');
 // Phones start on the PDF tools home; these checks begin in the editor.
 if(!await page.locator('.artboard').isVisible())await page.locator('.workspace-nav').getByRole('button',{name:'Photo editor',exact:true}).click();
 await page.locator('.artboard').waitFor({timeout:60000});await page.waitForTimeout(1200);
 return {context,page,errors,cdp:device.hasTouch?await context.newCDPSession(page):null};
}
const center=async locator=>{const l=locator.first();await l.scrollIntoViewIfNeeded();const b=await l.boundingBox();return [b.x+b.width/2,b.y+b.height/2];};
const tap=async(page,locator)=>{const [x,y]=await center(locator);await page.touchscreen.tap(x,y);await page.waitForTimeout(250);};
async function touches(cdp,steps){
 for(const [type,points] of steps){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});await new Promise(r=>setTimeout(r,16));}
}
const drag=(x,y,dx,dy,n=8)=>[['touchStart',[[x,y]]],...Array.from({length:n},(_,i)=>['touchMove',[[x+dx*(i+1)/n,y+dy*(i+1)/n]]]),['touchEnd',[]]];
async function pdfTool(page,name){
 await tap(page,page.locator('button[aria-label="PDF MasterTool"]:visible'));
 await tap(page,page.locator('.pdf-tool-card',{hasText:name}));await page.waitForTimeout(400);
}
async function command(page,label){
 await page.keyboard.press('Control+k');await page.locator('input[aria-label="Search commands"]').fill(label);
 await tap(page,page.locator('.command-list button',{hasText:label}));await page.waitForTimeout(500);
}
const closeDialog=page=>tap(page,page.getByRole('button',{name:'Close dialog'}));
const box=(page,selector,i=0)=>page.evaluate(([s,i])=>{const e=document.querySelectorAll(s)[i];if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},[selector,i]);
// Fully on screen without scrolling: inside the dialog's visible area and the viewport.
const onScreen=(page,locator)=>locator.first().evaluate(e=>{const r=e.getBoundingClientRect(),m=e.closest('.modal').getBoundingClientRect();return r.top>=Math.max(0,m.top)-1&&r.bottom<=Math.min(innerHeight,m.bottom)+1&&r.left>=m.left-1&&r.right<=m.right+1;});
// Ink box (alpha > 40) of the signature pad, or of an image data URL.
const inkOf=(page,src)=>page.evaluate(async src=>{
 let c=document.querySelector('.signature-pad canvas');
 if(src){const img=new Image();img.src=src;await img.decode();c=Object.assign(document.createElement('canvas'),{width:img.naturalWidth,height:img.naturalHeight});c.getContext('2d').drawImage(img,0,0);}
 const {width:w,height:h}=c,d=c.getContext('2d').getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>40){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 return {x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1,bitmap:[w,h],css:[c.clientWidth,c.clientHeight]};
},src);
const savedObjects=page=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal())?.pages[0].canvas.objects??[];});
const circle=(cx,cy,r,n=48)=>[['touchStart',[[cx+r,cy]]],...Array.from({length:n},(_,i)=>['touchMove',[[cx+r*Math.cos((i+1)/n*2*Math.PI),cy+r*Math.sin((i+1)/n*2*Math.PI)]]]),['touchEnd',[]]];
async function textPdf(name,lines){
 const doc=new mupdf.PDFDocument(),font=doc.addSimpleFont(new mupdf.Font('Helvetica'),'Latin');
 const p=doc.addPage([0,0,595,60+lines.length*30],0,{Font:{F:font}},lines.map((t,i)=>`BT /F 10 Tf 30 ${30+(lines.length-i)*30} Td (${t}) Tj ET`).join(' '));doc.insertPage(-1,p);
 const file=join(dir,name);await writeFile(file,doc.saveToBuffer('').asUint8Array());return file;
}

test('#24 a drawn signature keeps its shape on phones',{timeout:300000},async()=>{
 // Android at 3 device pixels per CSS pixel, as on most current phones.
 for(const device of [iphone,{...android,deviceScaleFactor:3}]){
  const {context,page,errors,cdp}=await open(device);
  await pdfTool(page,'Sign a document');
  const pad=await box(page,'.signature-pad canvas'),bitmap=await page.locator('.signature-pad canvas').evaluate(c=>[c.width,c.height]);
  assert.ok(Math.abs(bitmap[0]/bitmap[1]-pad.width/pad.height)<.02,`the pad's bitmap ${bitmap} has the shape of its box ${pad.width}×${pad.height}`);
  assert.deepEqual(bitmap,[Math.round(pad.width*device.deviceScaleFactor),Math.round(pad.height*device.deviceScaleFactor)],'the bitmap follows the pixel ratio');
  await touches(cdp,circle(pad.left+pad.width/2,pad.top+pad.height/2,50));
  const drawn=await inkOf(page);
  assert.ok(Math.abs(drawn.w/drawn.h-1)<.1,`a circle stays round in the pad (${drawn.w}×${drawn.h})`);
  await tap(page,page.getByRole('button',{name:'Place signature'}));
  // Image decoding and the following canvas autosave can take longer on a
  // CPU-only runner. Wait for the saved image, keeping every shape assertion.
  let signature;for(let i=0;i<240&&!signature;i++){await page.waitForTimeout(250);signature=(await savedObjects(page)).find(o=>o.name==='Signature');}
  assert.ok(signature,'the signature was placed');
  const placed=await inkOf(page,signature.src),w=signature.width*signature.scaleX,h=signature.height*signature.scaleY;
  assert.ok(Math.abs(placed.w/placed.h-1)<.1,`the placed circle is round (${placed.w}×${placed.h})`);
  assert.ok(Math.abs(w/h-1)<.2&&w<300,`the placed image wraps the ink (${Math.round(w)}×${Math.round(h)})`);
  assert.deepEqual(errors,[]);await context.close();
 }
});

test('#30 a second finger on the signature pad draws nothing',{timeout:300000},async()=>{
 const {context,page,errors,cdp}=await open(iphone);
 await pdfTool(page,'Sign a document');
 const pad=await box(page,'.signature-pad canvas'),x=pad.left+40,y=pad.top+60,far=pad.right-30;
 // One finger strokes to the right while a second lands near the far edge and pinches in.
 await touches(cdp,[['touchStart',[[x,y]]],['touchStart',[[x,y],[far,y+60]]],...Array.from({length:8},(_,i)=>['touchMove',[[x+(i+1)*8,y],[far-(i+1)*3,y+60]]]),['touchEnd',[]]]);
 const ink=await inkOf(page),scale=ink.bitmap[0]/ink.css[0];
 assert.ok(ink.w/scale>50,`the first finger drew (${ink.w/scale}px)`);
 assert.ok(ink.x1/scale<far-pad.left-40&&ink.y1/scale<y-pad.top+20,`no ink toward the second finger (ink ends at ${Math.round(ink.x1/scale)},${Math.round(ink.y1/scale)})`);
 assert.deepEqual(errors,[]);await context.close();
});

test('#25 landscape phones: Signature and Warp keep their buttons and handles on screen',{timeout:300000},async()=>{
 for(const device of [iphoneLandscape,androidLandscape]){
  const {context,page,errors}=await open(device);
  await pdfTool(page,'Sign a document');
  assert.ok(await onScreen(page,page.getByRole('button',{name:'Place signature'})),`Place signature is on screen at ${device.viewport.width}×${device.viewport.height}`);
  const pad=await box(page,'.signature-pad canvas'),line=await box(page,'.signature-pad span');
  assert.ok(pad.height>=90&&line.bottom<=pad.bottom,`the pad stays usable (${pad.height}px) with its guide inside`);
  await closeDialog(page);
  await tap(page,page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^Sage circle$/})}));
  for(const [label,apply,handles] of [['Warp selected layer','Apply warp',9],['Perspective distort','Apply perspective',4]]){
   await command(page,label);
   assert.ok(await onScreen(page,page.getByRole('button',{name:apply})),`${apply} is on screen`);
   for(let i=0;i<handles;i++)assert.ok(await onScreen(page,page.locator('.warp-editor circle').nth(i)),`${label}: handle ${i+1} is on screen`);
   assert.equal(await page.locator('.modal').evaluate(m=>getComputedStyle(m).overscrollBehaviorY),'contain','the dialog does not scroll the page behind it');
   await closeDialog(page);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
});

test('#29 a finger near a warp handle or perspective corner drags it',{timeout:300000},async()=>{
 const {context,page,errors,cdp}=await open(iphone);
 const art=await box(page,'.artboard'),k=art.width/595;
 await page.touchscreen.tap(art.left+209*k,art.top+561*k);await page.waitForTimeout(300); // the Sage circle
 for(const [label,index] of [['Warp selected layer',4],['Perspective distort',0]]){
  await command(page,label);
  const handle=page.locator('.warp-editor circle').nth(index),[hx,hy]=await center(handle);
  await touches(cdp,drag(hx-20,hy+8,40,0));await page.waitForTimeout(200);
  const [nx,ny]=await center(handle);
  assert.ok(Math.abs(nx-hx-40)<6&&Math.abs(ny-hy)<6,`${label}: a touch 21px away dragged the handle by the finger's 40px (${Math.round(nx-hx)},${Math.round(ny-hy)})`);
  const at=()=>handle.evaluate(c=>[c.getAttribute('cx'),c.getAttribute('cy')]),moved=await at();
  await touches(cdp,drag(hx+120,hy+120,30,0));await page.waitForTimeout(200);
  assert.deepEqual(await at(),moved,'a touch far from every handle moves nothing');
  await closeDialog(page);
 }
 assert.deepEqual(errors,[]);await context.close();
});

async function redactDialog(device){
 const file=await textPdf('pii.pdf',['Customer service contact for refunds and billing questions: billing.team@sample-shop.test','If you need to reach our office during business hours please call +33 1 45 67 89 10','Payments go to the following account IBAN FR76 3000 6000 0112 3456 7890 189 as agreed','Short: a@b.test']);
 const session=await open(device),{page}=session;
 await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 await page.waitForFunction(()=>/editable text regions/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:120000});
 await command(page,'Find & redact');await page.locator('.redact-hit').first().waitFor();
 return session;
}

test('#26 Find & redact shows every match on a phone or tablet',{timeout:300000},async()=>{
 for(const device of [iphone,tablet]){
  const {context,page,errors}=await redactDialog(device);
  const list=await page.locator('.redact-list').evaluate(l=>({client:l.clientWidth,scroll:l.scrollWidth,...l.getBoundingClientRect().toJSON()}));
  assert.ok(list.scroll<=list.client+1,`the list does not scroll sideways (${list.scroll} > ${list.client})`);
  const marks=await page.locator('.redact-hit mark').evaluateAll(ms=>ms.map(m=>({text:m.textContent,...m.getBoundingClientRect().toJSON()})));
  assert.equal(marks.length,4);
  for(const m of marks)assert.ok(m.left>=list.left&&m.right<=list.right&&m.width>10,`${m.text} is visible (${Math.round(m.left)}–${Math.round(m.right)} in ${Math.round(list.left)}–${Math.round(list.right)})`);
  const first=page.locator('.redact-hit').first();
  assert.equal(await first.locator('.redact-gap').first().evaluate(e=>getComputedStyle(e,'::before').content),'"…"');
  assert.doesNotMatch(await first.innerText(),/Customer service/,'a long line is cut to the words around its match');
  assert.deepEqual(errors,[]);await context.close();
 }
});

test('#27 Find & redact: Redact is a real, finger-sized button',{timeout:300000},async()=>{
 const {context,page,errors}=await redactDialog(android);
 const redact=page.getByRole('button',{name:/^Redact \d+$/}),b=await redact.boundingBox();
 assert.ok(b.height>=40,`Redact is ${b.height}px tall`);
 assert.notEqual(await redact.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','Redact looks like a button');
 await tap(page,redact);await page.getByText(/redacted/).first().waitFor({timeout:60000});
 assert.deepEqual(errors,[]);await context.close();
});

test('#28 Organize pages opens the page strip with touch actions',{timeout:300000},async()=>{
 for(const device of [iphone,tablet]){
  const {context,page,errors}=await open(device);
  await pdfTool(page,'Organize pages');
  const panel=await box(page,'.pages-panel');assert.ok(panel&&panel.width>100,`the page strip is shown (${panel?.width}px)`);
  const toast=await page.locator('.toast').innerText();
  assert.doesNotMatch(toast,/right-click/i);assert.match(toast,/Tap ⋯/);
  assert.equal(await page.evaluate(()=>{const r=document.querySelector('.toast').getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.toast');}),false,'a tap on the toast reaches the page below');
  const more=page.locator('.page-more').first(),m=await more.boundingBox();
  assert.ok(m.width>=40&&m.height>=40,`the page menu button is ${m.width}×${m.height}`);
  await tap(page,more);
  assert.ok(await page.getByRole('menuitem',{name:'Duplicate page'}).isVisible(),'the page menu opens with a tap');
  assert.deepEqual(errors,[]);await context.close();
 }
});

test('#32 Android: Protect PDF and Crop page keep their buttons on screen',{timeout:300000},async()=>{
 const {context,page,errors}=await open(android);
 await pdfTool(page,'Protect PDF');
 assert.ok(await onScreen(page,page.getByRole('button',{name:'Export PDF'})),'Export PDF is on screen before scrolling');
 await closeDialog(page);
 await pdfTool(page,'Crop page');
 assert.ok(await onScreen(page,page.getByRole('button',{name:'Crop current page'})),'Crop current page is on screen before scrolling');
 assert.deepEqual(errors,[]);await context.close();
});

test('#31 dialog controls are finger-sized and explain themselves without tooltips',{timeout:300000},async()=>{
 {const {context,page,errors}=await open(android);
  await pdfTool(page,'Protect PDF');
  const close=await page.getByRole('button',{name:'Close dialog'}).boundingBox();assert.ok(close.width>=44&&close.height>=44,`the close button is ${close.width}×${close.height}`);
  for(const r of await page.locator('.modal .check-label').evaluateAll(ls=>ls.map(l=>({h:l.getBoundingClientRect().height,hint:getComputedStyle(l,'::after').content,title:l.title,box:l.querySelector('input').getBoundingClientRect().width}))))
   {assert.ok(r.h>=44&&r.box>=20,`option rows are ${r.h}px with ${r.box}px boxes`);if(r.title)assert.ok(r.hint.includes(r.title.slice(0,20)),'its explanation is written out');}
  await closeDialog(page);
  await pdfTool(page,'Sign a document');
  const ink=await page.getByTitle('Signature ink').boundingBox();assert.ok(ink.width>=44&&ink.height>=44,'the ink colour is 44px');
  await closeDialog(page);
  await pdfTool(page,'Watermarks');
  const colour=await page.locator('.modal .color-field').first().evaluate(l=>({h:l.getBoundingClientRect().height,size:parseFloat(getComputedStyle(l).fontSize)}));
  assert.ok(colour.h>=44&&colour.size>=13,`the text colour row is ${colour.h}px with ${colour.size}px text`);
  assert.deepEqual(errors,[]);await context.close();}
 // Spelling suggestions apply at once, so they get finger-sized chips with room between them.
 {const shot=await browser.newPage({viewport:{width:520,height:200}});await shot.setContent('<body style="margin:0;background:#fff;font-family:Arial"><div style="padding:40px 50px;font-size:28px;line-height:2;color:#111">Our rnodern office<br>Weekly meeting notes</div></body>');
  const image=join(dir,'notes.png');await shot.screenshot({path:image});await shot.close();
  const {context,page,errors}=await open(iphone);
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').waitFor({state:'attached',timeout:240000});
  await page.waitForTimeout(4500); // the import toast has gone
  // On phones the OCR bar's actions sit behind More.
  if(await page.locator('.ocr-more').isVisible())await tap(page,page.locator('.ocr-more'));
  await tap(page,page.getByRole('button',{name:'Proofread'}));
  const chips=page.locator('.proofread-line .doubt button');await chips.first().waitFor({timeout:60000});
  const b=await chips.evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().toJSON()));
  for(const r of b)assert.ok(r.height>=40,`a suggestion is ${r.height}px tall`);
  for(let i=1;i<b.length;i++)if(Math.abs(b[i].top-b[i-1].top)<1)assert.ok(b[i].left-b[i-1].right>=8,'suggestions are 8px apart');
  assert.deepEqual(errors,[]);await context.close();}
 {const {context,page,errors}=await redactDialog(android);
  for(const s of ['.redact-presets label','.redact-hit'])for(const r of await page.locator(s).evaluateAll(ls=>ls.map(l=>l.getBoundingClientRect().height)))assert.ok(r>=40,`${s} rows are ${r}px tall`);
  assert.deepEqual(errors,[]);await context.close();}
});

test('#33 PDF to images saves a single page as the image itself on a phone',{timeout:300000},async()=>{
 const exportPng=async page=>{await pdfTool(page,'PDF to images');const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('button',{name:'Export PNG'}).click()]);return download;};
 {const {context,page,errors}=await open(iphone);
  const download=await exportPng(page),bytes=await readFile(await download.path());
  assert.match(download.suggestedFilename(),/\.png$/);assert.deepEqual([...bytes.subarray(0,4)],[0x89,0x50,0x4e,0x47],'a PNG, not a ZIP');
  // Only a split export's -pages becomes -page: a project named "Trip-pages" keeps its name.
  for(const [inner,want] of [['page-001.png','Trip-pages.png'],['page-001.pdf','Trip-page.pdf']]){
   const zip=[...zipSync({[inner]:new Uint8Array([1,2,3])})];
   const [d]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.evaluate(async zip=>{const {saveExport}=await import('/src/export-save.ts');await saveExport(new Blob([new Uint8Array(zip)],{type:'application/zip'}),'Trip-pages.zip');},zip)]);
   assert.equal(d.suggestedFilename(),want);
  }
  assert.deepEqual(errors,[]);await context.close();}
 // Where the browser can share files, the system share sheet gets the PNG.
 {const {context,page,errors}=await open(iphone);
  await page.evaluate(()=>{window.shared=[];navigator.canShare=d=>!!d.files;navigator.share=async d=>{window.shared.push(...d.files.map(f=>[f.name,f.type]));};});
  await pdfTool(page,'PDF to images');await tap(page,page.getByRole('button',{name:'Export PNG'}));
  await page.waitForFunction(()=>window.shared.length,null,{timeout:60000});
  assert.deepEqual(await page.evaluate(()=>window.shared),[['A fresh perspective.png','image/png']]);
  assert.deepEqual(errors,[]);await context.close();}
 // Desktop keeps the ZIP.
 {const {context,page,errors}=await open(desktop);
  await page.locator('button[aria-label="PDF MasterTool"]:visible').first().click();await page.locator('.pdf-tool-card',{hasText:'PDF to images'}).click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('button',{name:'Export PNG'}).click()]);
  assert.match(download.suggestedFilename(),/\.zip$/);
  assert.deepEqual(errors,[]);await context.close();}
});

test('#34 PDF home: readable labels and no keyboard shortcut on touch screens',{timeout:300000},async()=>{
 {const {context,page,errors}=await open(iphone);
  await tap(page,page.locator('button[aria-label="PDF MasterTool"]:visible'));
  for(const s of ['.workspace-eyebrow','.current-document small','.pdf-categories button>span']){const size=await page.locator(s).first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(size>=11,`${s} is ${size}px`);}
  assert.equal(await page.locator('.pdf-start-actions kbd').isVisible(),false,'no Ctrl O badge on a phone');
  assert.equal(await page.locator('.pdf-tool-search input').evaluate(e=>getComputedStyle(e).fontSize),'16px','the tool search does not zoom when focused');
  assert.deepEqual(errors,[]);await context.close();}
 {const {context,page,errors}=await open(tablet);
  await tap(page,page.locator('button[aria-label="PDF MasterTool"]:visible'));
  assert.equal(await page.locator('.pdf-start-actions kbd').isVisible(),false,'no Ctrl O badge on a touch tablet');
  assert.ok(await page.locator('.pdf-home-note').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=12,'the note is 12px');
  assert.deepEqual(errors,[]);await context.close();}
});

test('desktop keeps its dialogs; the signature pad bitmap follows its box',{timeout:300000},async()=>{
 const {context,page,errors}=await open(desktop);
 await page.locator('button[aria-label="PDF MasterTool"]:visible').first().click();
 assert.ok(await page.locator('.pdf-start-actions kbd').isVisible(),'the Ctrl O badge stays');
 await page.locator('.pdf-tool-card',{hasText:'Sign a document'}).click();
 assert.equal(await page.locator('.modal .dialog-actions').evaluate(e=>getComputedStyle(e).position),'static');
 const close=await page.getByRole('button',{name:'Close dialog'}).boundingBox();assert.deepEqual([close.width,close.height],[28,28]);
 const pad=await page.locator('.signature-pad canvas').evaluate(c=>[c.width,c.height,c.clientWidth,c.clientHeight]);
 assert.deepEqual(pad,[pad[2]*2,pad[3]*2,pad[2],pad[3]],'the pad bitmap is twice its box');
 await page.getByRole('button',{name:'Close dialog'}).click();
 // A mouse still has to land on a warp handle to drag it.
 await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^Sage circle$/})}).click();
 await page.keyboard.press('Control+k');await page.locator('input[aria-label="Search commands"]').fill('Warp selected layer');await page.keyboard.press('Enter');
 const handle=page.locator('.warp-editor circle').nth(4),at=()=>handle.evaluate(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')]),[hx,hy]=await center(handle),start=await at();
 const mouseDrag=async(x,y)=>{await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=8;i++)await page.mouse.move(x+i*5,y);await page.mouse.up();await page.waitForTimeout(200);};
 await mouseDrag(hx+14,hy);assert.deepEqual(await at(),start,'a press beside the handle moves nothing');
 await mouseDrag(hx,hy);const [nx]=await center(handle);assert.ok(Math.abs(nx-hx-40)<3,`the handle follows the mouse (${Math.round(nx-hx)}px)`);
 assert.deepEqual(errors,[]);await context.close();
});
