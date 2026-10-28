// End-to-end on phone-sized touch screens: the editor chrome. A Menu sheet and a
// labelled Find button replace the menubar; controls are touch-sized; the OCR
// bar folds its actions behind More; drawers close from their own buttons or a
// tap beside them; Clone Stamp picks its source with a tap. Desktop keeps its layout.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';import {pickTool} from './rail.mjs';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const iphone={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
const landscape={viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true};
const android={viewport:{width:360,height:740},deviceScaleFactor:2,isMobile:true,hasTouch:true};
const tablet={viewport:{width:820,height:1180},deviceScaleFactor:2,isMobile:true,hasTouch:true};
let server,browser;
before(async()=>{server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});});
after(async()=>{await browser?.close();await server?.close();});

// One fresh editor per check, on the given device; fails on page errors.
const check=(name,device,body,timeout=120000)=>test(name,{timeout},async()=>{
 const context=await browser.newContext(device),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('.workspace-nav').getByRole('button',{name:'Photo editor',exact:true}).click();await page.locator('.artboard').waitFor({timeout:60000});await page.waitForTimeout(1200);
  await body(page,await context.newCDPSession(page));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
const box=(page,selector)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null;},selector);
// A real finger tap on whatever is drawn at x,y (no actionability checks).
async function touchTap(cdp,x,y){for(const type of ['touchStart','touchEnd']){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});await new Promise(r=>setTimeout(r,40));}}
const tapCentre=async(page,cdp,selector)=>{const b=await box(page,selector);assert.ok(b,`${selector} is on screen`);await touchTap(cdp,b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(300);};
const panel=page=>page.evaluate(()=>document.querySelector('.workspace-layout').dataset.panel??null);
// Visible controls smaller than 40x40.
const small=(page,selector)=>page.evaluate(s=>[...document.querySelectorAll(s)].map(e=>({e,r:e.getBoundingClientRect()})).filter(({e,r})=>r.width&&r.height&&e.checkVisibility()&&r.bottom>0&&r.top<innerHeight).filter(({r})=>r.width<40||r.height<40).map(({e,r})=>`${e.getAttribute('aria-label')||e.textContent.trim()||e.className} ${Math.round(r.width)}x${Math.round(r.height)}`),selector);
// Visible text under 11px inside any of the comma-separated `selector`s.
const tinyText=(page,selector)=>page.evaluate(s=>[...document.querySelectorAll(s.split(',').map(x=>`${x} *`).join(','))].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.getBoundingClientRect().width>0&&e.checkVisibility()).filter(e=>parseFloat(getComputedStyle(e).fontSize)<11).map(e=>`${e.textContent.trim().slice(0,30)} ${getComputedStyle(e).fontSize}`),selector);

check('finding 14: a labelled Menu button opens File…Help as a sheet; Find is labelled; the palette drops keyboard hints',iphone,async page=>{
 const menu=await box(page,'.phone-menu-button');
 assert.ok(menu&&menu.width>=40&&menu.height>=40,`Menu button is visible and touch-sized (${JSON.stringify(menu)})`);
 assert.equal((await page.locator('.phone-menu-button').innerText()).trim(),'Menu');
 const find=await box(page,'.command-button');
 assert.ok(find.width>=40&&find.height>=40,`Find button is touch-sized (${find.width}x${find.height})`);
 assert.match(await page.locator('.command-button').innerText(),/Find a tool/,'the Find button shows its label');
 await page.locator('.phone-menu-button').tap();
 const sheet=page.getByRole('dialog',{name:'Menu'});await sheet.waitFor();
 assert.deepEqual(await sheet.locator('summary').allInnerTexts(),['File','Edit','Image','View','Layer','Select','Insert','Page','PDF','Help']);
 assert.ok((await sheet.boundingBox()).width>=388,'the sheet is full width');
 await sheet.locator('summary',{hasText:'Image'}).tap();
 await sheet.getByRole('button',{name:'Image size…'}).tap();
 const dialog=page.getByRole('dialog',{name:'Image size'});await dialog.waitFor();
 await dialog.getByRole('button',{name:'Close dialog'}).tap();
 // The palette on touch: no keyboard hints, a 16px field, a big close button.
 await page.locator('.command-button').tap();await page.getByRole('dialog',{name:'What would you like to do?'}).waitFor();
 assert.equal(await page.locator('.modal kbd:visible, .palette-footer:visible').count(),0,'no keyboard hints in the palette');
 assert.equal(await page.locator('.palette-search input').evaluate(e=>getComputedStyle(e).fontSize),'16px');
 assert.deepEqual(await small(page,'.modal-header .icon-button'),[]);
});

// The command palette on touch: the list shows at once and the keyboard waits for a tap on
// the field. A key that opens it (a hardware keyboard) still focuses the field, as on desktop.
const focused=page=>page.locator('.palette-search input').evaluate(e=>e===document.activeElement);
check('a tap opens the palette without focusing its field; tapping the field focuses it',iphone,async page=>{
 await page.locator('.command-button').tap();await page.getByRole('dialog',{name:'What would you like to do?'}).waitFor();
 assert.equal(await focused(page),false,'the search field is not focused, so no on-screen keyboard');
 assert.ok(await page.locator('.command-list>button').nth(5).isVisible(),'the commands show at once');
 await page.locator('.palette-search input').tap();assert.equal(await focused(page),true,'a tap on the field focuses it');
 await page.getByRole('button',{name:'Close dialog'}).tap();
 await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'What would you like to do?'}).waitFor();
 assert.equal(await focused(page),true,'Ctrl K focuses the field');
});
check('desktop: the palette focuses its search field',{viewport:{width:1400,height:900}},async page=>{
 await page.locator('.command-button').click();await page.getByRole('dialog',{name:'What would you like to do?'}).waitFor();
 assert.equal(await focused(page),true,'opened with the mouse');
 await page.keyboard.press('Escape');await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'What would you like to do?'}).waitFor();
 assert.equal(await focused(page),true,'opened with Ctrl K');
});

// Phones group the tool rail: one button per group, a flyout for the rest.
const railButtons=page=>page.locator('.tool-rail .tool-group>div>button');
const railGroups=page=>railButtons(page).evaluateAll(bs=>bs.map(b=>b.title.split(': ')[1].split(', ')));
const centre=async locator=>{const b=await locator.boundingBox();return [b.x+b.width/2,b.y+b.height/2];};
async function longPress(cdp,[x,y]){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await new Promise(r=>setTimeout(r,700));await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await new Promise(r=>setTimeout(r,200));}
for(const [name,device] of [['390×844',iphone],['360×740',android],['844×390',landscape],['740×360',{...android,viewport:{width:740,height:360}}],['740×390',{...android,viewport:{width:740,height:390}}],['568×320',{...android,viewport:{width:568,height:320}}],['600×360',{...android,viewport:{width:600,height:360}}]])check(`phones (${name}): the tool rail shows one button per group, never scrolls, and reaches every tool in two touches`,device,async(page,cdp)=>{
 const rail=await page.locator('.tool-rail').evaluate(r=>({scroll:r.scrollHeight,client:r.clientHeight,overflow:[...r.querySelectorAll('button,label')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().bottom>r.getBoundingClientRect().bottom).map(e=>e.getAttribute('aria-label')||e.textContent)}));
 assert.ok(rail.scroll<=rail.client&&!rail.overflow.length,`the rail does not scroll (${rail.scroll} > ${rail.client}; below the fold: ${rail.overflow})`);
 const layout=await page.evaluate(()=>({railRight:document.querySelector('.tool-rail').getBoundingClientRect().right,canvasLeft:document.querySelector('.canvas-workspace').getBoundingClientRect().left,scroll:document.documentElement.scrollWidth,width:innerWidth}));
 assert.ok(layout.canvasLeft>=layout.railRight-1,`the rail leaves the canvas its own space (${JSON.stringify(layout)})`);
 assert.ok(layout.scroll<=layout.width,`the document does not scroll sideways (${JSON.stringify(layout)})`);
 const footer=await page.evaluate(()=>{
  const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0;
  const buttons=[...document.querySelectorAll('.canvas-tab>button,.zoom-controls button')].filter(visible),rail=[...document.querySelectorAll('.tool-rail .tool-group>div>button,.rail-bottom>label')].filter(visible);
  const overlap=(a,b)=>{a=a.getBoundingClientRect();b=b.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;};
  return buttons.filter((b,i)=>{const r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth||!b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))||rail.some(t=>overlap(b,t))||buttons.slice(i+1).some(t=>overlap(b,t));}).map(b=>b.getAttribute('aria-label')||b.textContent);
 });
 assert.deepEqual(footer,[],'Pages, Properties and zoom stay reachable without overlapping each other or the rail');
 const groups=await railGroups(page);
 assert.deepEqual(groups.map(g=>g[0]),['Move & select','Text box','Brush','Clone Stamp'],'one button per group');
 assert.deepEqual(groups.flat().sort(),await page.evaluate(async()=>(await import('/src/editor-types.ts')).TOOLS.map(t=>t.label).sort()),'every tool remains in a group');
 for(const s of await railButtons(page).evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect()).map(r=>[r.width,r.height])))assert.ok(s[0]>=44&&s[1]>=44,`group buttons are 44px (${s})`);
 const flyout=page.locator('.tool-flyout');
 for(const [g,tools] of groups.entries())for(const label of tools){
  // A long press opens the group's flyout and a tap picks the tool: two touches from anywhere.
  await longPress(cdp,await centre(railButtons(page).nth(g)));
  assert.ok(await flyout.isVisible(),`${label}: a long press opens the flyout`);
  const bounds=await flyout.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=device.viewport.width,`${label}: the flyout stays inside the screen`);
  for(const [w,h] of await flyout.locator('button').evaluateAll(bs=>bs.map(b=>[b.offsetWidth,b.offsetHeight])))assert.ok(w>=44&&h>=44,'flyout rows are 44px');
  const item=await flyout.locator(`button[aria-label="${label}"]`).boundingBox();assert.ok(item.y>=0&&item.y+item.height<=device.viewport.height,`${label} is on screen`);
  await touchTap(cdp,item.x+item.width/2,item.y+item.height/2);await page.waitForTimeout(200);
  assert.equal(await flyout.count(),0,'the pick closes the flyout');
  assert.equal(await railButtons(page).nth(g).getAttribute('aria-label'),label,`${label} becomes its group's button`);
  assert.equal(await railButtons(page).nth(g).getAttribute('aria-pressed'),'true',`${label} is the tool`);
 }
 // A tap on another group selects its last tool; a tap on the selected tool opens the
 // flyout; a tap beside it closes it and draws nothing.
 const create='.tool-rail .tool-group:nth-of-type(2)>div>button';
 await tapCentre(page,cdp,create);
 assert.match(await page.locator('.options-bar .tool-caption').textContent(),/Line$/,'a tap picks the group’s last tool');assert.equal(await flyout.count(),0,'…without the flyout');
 await tapCentre(page,cdp,create);assert.ok(await flyout.isVisible(),'a second tap opens the flyout');
 const layers=await page.locator('.layers-list .layer-row').count();
 // A wider landscape flyout can cover the old fixed point on the page. Tap a
 // measured uncovered part of the page (or workspace), where the scrim is hit.
 const outside=await page.evaluate(()=>{
  for(const selector of ['.artboard','.canvas-workspace']){
   const r=document.querySelector(selector).getBoundingClientRect(),x0=Math.max(0,r.left),x1=Math.min(innerWidth,r.right),y0=Math.max(0,r.top),y1=Math.min(innerHeight,r.bottom);
   for(let y=1;y<10;y++)for(let x=1;x<10;x++){const p={x:x0+(x1-x0)*x/10,y:y0+(y1-y0)*y/10};if(document.elementFromPoint(p.x,p.y)?.classList.contains('tool-flyout-scrim'))return p;}
  }return null;
 });
 assert.ok(outside,'the canvas has a visible point beside the flyout on its scrim');
 await touchTap(cdp,outside.x,outside.y);await page.waitForTimeout(400);
 assert.equal(await flyout.count(),0,'a tap beside the flyout closes it');assert.equal(await page.locator('.layers-list .layer-row').count(),layers,'…and draws no line');
});

check('phones: the grouped rail works from the keyboard and names its groups for screen readers',iphone,async page=>{
 const draw=railButtons(page).nth(2),flyout=page.locator('.tool-flyout');
 assert.equal(await draw.getAttribute('aria-expanded'),'false');assert.match(await draw.getAttribute('title'),/^Draw: Brush, Highlight, Eraser, Gradient, Paint bucket, Mask brush$/);
 await draw.focus();await page.keyboard.press('Enter');assert.equal(await draw.getAttribute('aria-pressed'),'true','Enter picks the group’s tool');
 await page.keyboard.press('Enter');assert.equal(await draw.getAttribute('aria-expanded'),'true','Enter again opens the flyout');
 assert.equal(await page.evaluate(()=>document.querySelector(`#${CSS.escape(document.activeElement.closest('.tool-flyout')?.id??'')}`)?.getAttribute('aria-label')),'Draw tools','focus moves into the named flyout');
 assert.equal(await draw.getAttribute('aria-controls'),await flyout.getAttribute('id'));
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Brush','on the current tool');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 assert.equal(await flyout.count(),0);assert.equal(await draw.getAttribute('aria-label'),'Eraser','ArrowDown and Enter pick a tool');
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Eraser','focus returns to the group');
 await page.keyboard.press('ArrowRight');assert.ok(await flyout.isVisible(),'ArrowRight opens the flyout');
 await page.keyboard.press('Escape');assert.equal(await flyout.count(),0,'Escape closes it');
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Eraser','…back on the group');
 assert.match(await page.locator('.options-bar .tool-caption').textContent(),/Eraser$/,'Escape kept the tool');
});

check('tablets from 821px keep every tool in the rail',{...tablet,viewport:{width:1180,height:820}},async page=>{
 assert.equal(await page.locator('.tool-rail.grouped').count(),0);
 assert.equal(await railButtons(page).count(),await page.evaluate(async()=>(await import('/src/editor-types.ts')).TOOLS.length),'one button per tool');
});

check('finding 19: header, file actions, tool rail, bottom bar and drawers are touch-sized and named',iphone,async(page,cdp)=>{
 assert.deepEqual(await small(page,'.topbar button, .document-actions>button, .document-actions .icon-button, .tool-group button, .rail-bottom>*, .canvas-tab>button, .zoom-controls button'),[]);
 for(const name of ['Photo editor','PDF MasterTool','Documents','Place image','Export'])assert.ok(await page.getByRole('button',{name,exact:true}).isVisible(),`${name} has a name`);
 assert.ok(await page.locator('.topbar .nav-short',{hasText:'PDF'}).isVisible(),'workspaces show their names');
 await pickTool(page,'Magic wand',{tap:true});
 assert.deepEqual(await small(page,'.options-bar .check-label, .options-bar input:not([type=checkbox])'),[]);
 assert.ok((await page.locator('.options-end input[type=checkbox]').first().boundingBox()).width>=20,'checkboxes are 20px');
 await tapCentre(page,cdp,'.small-pages-button');
 assert.deepEqual(await small(page,'.pages-panel .panel-heading .icon-button, .page-more, .page-panel-bottom button'),[]);
 await tapCentre(page,cdp,'.small-properties-button');
 assert.deepEqual(await small(page,'.close-small-properties, .layer-retouch-actions button, .quick-insert button, .inspector summary'),[]);
 await page.locator('.form-panel>summary').tap();
 assert.deepEqual(await small(page,'.form-add button'),[]);
});

check('finding 20: no empty status bar; name and file actions share a row; the page gets the room',iphone,async page=>{
 assert.equal(await box(page,'.statusbar'),null,'the empty status bar is gone');
 const name=await box(page,'.document-name>input'),open=await box(page,'.open-document');
 assert.ok(Math.abs((name.y+name.height/2)-(open.y+open.height/2))<6,'document name and file actions share one row');
 // A self-hosted build without Office shows a hosting notice above the editor; it is not chrome.
 const workspace=await box(page,'.canvas-workspace'),notice=await box(page,'.hosting-notice');
 assert.ok(workspace.height+(notice?.height??0)>=620,`the page area is ${workspace.height}px tall (was 595)`);
});

check('finding 22: no keyboard-only tips on touch; chrome text is at least 11px',iphone,async page=>{
 assert.equal(await page.locator('.tip-card, .rail-bottom>button[aria-label="Keyboard shortcuts"], .tool-group button>kbd').evaluateAll(l=>l.filter(e=>e.checkVisibility()).length),0);
 assert.deepEqual(await tinyText(page,'.topbar, .command-strip, .tool-rail, .canvas-tab, .canvas-footer'),[],'chrome text');
 await page.locator('.small-properties-button').tap();await page.waitForTimeout(300);
 assert.deepEqual(await tinyText(page,'.inspector'),[],'Properties text');
});

check('finding 15: a tap beside a drawer closes it without selecting; Pages and Properties close their own drawers',android,async(page,cdp)=>{
 await tapCentre(page,cdp,'.small-pages-button');assert.equal(await panel(page),'pages');
 const board=await box(page,'.artboard'),drawer=await box(page,'.pages-panel');
 await touchTap(cdp,Math.max(drawer.right+30,board.x+board.width*.8),board.y+board.height*.7);await page.waitForTimeout(500);
 assert.equal(await page.locator('.panel-context').textContent(),'Page','a tap beside the drawer selects nothing');
 assert.equal(await panel(page),null,'…and closes it');
 await tapCentre(page,cdp,'.small-pages-button');assert.equal(await panel(page),'pages');
 await tapCentre(page,cdp,'.small-pages-button');assert.equal(await panel(page),null,'Pages closes its own drawer');
 await tapCentre(page,cdp,'.small-properties-button');assert.equal(await panel(page),'properties');
 await tapCentre(page,cdp,'.small-properties-button');assert.equal(await panel(page),null,'Properties closes its own drawer');
});

check('finding 16: the Properties drawer gives Layers and History room and touch-sized rows',android,async(page,cdp)=>{
 await tapCentre(page,cdp,'.small-properties-button');
 const list=await box(page,'.inspector .layers-list');assert.ok(list.height>=130,`layer list is ${list.height}px tall (was 60)`);
 assert.deepEqual(await small(page,'.inspector .layer-row, .inspector .layer-row>button, .inspector .layers-header button'),[]);
 await page.locator('.panel-tabs button',{hasText:'History'}).tap();await page.waitForTimeout(300);
 const history=await box(page,'.inspector .history-list');assert.ok(history.height>=130,`history list is ${history.height}px tall (was 60)`);
 assert.deepEqual(await small(page,'.inspector .history-list button'),[]);
});

check('finding 18: Design & layout fits the Properties drawer',android,async(page,cdp)=>{
 await tapCentre(page,cdp,'.small-properties-button');
 await page.locator('.design-tools summary').tap();await page.waitForTimeout(300);
 const fit=await page.evaluate(()=>{const c=document.querySelector('.properties-content');return {scroll:c.scrollWidth,client:c.clientWidth,right:Math.max(...[...document.querySelectorAll('.design-tools-body button')].map(b=>b.getBoundingClientRect().right))};});
 assert.ok(fit.scroll<=fit.client+1,`Design & layout is no wider than the drawer (${fit.scroll} > ${fit.client})`);
 assert.ok(fit.right<=360,`its buttons stay on screen (right edge ${fit.right})`);
});

check('finding 18: Design & layout also fits the inspector of a landscape phone',landscape,async page=>{
 await page.locator('.design-tools summary').tap();await page.waitForTimeout(300);
 const fit=await page.evaluate(()=>{const c=document.querySelector('.properties-content');return {scroll:c.scrollWidth,client:c.clientWidth};});
 assert.ok(fit.scroll<=fit.client+1,`Design & layout is no wider than the inspector (${fit.scroll} > ${fit.client})`);
});

check('finding 17: the options bar drops the duplicate zoom and Snap to page, and both scrollers show a cue',iphone,async page=>{
 assert.equal(await box(page,'.options-bar .header-zoom'),null,'the zoom is left to the bottom bar');
 assert.equal(await page.locator('.options-bar .check-label',{hasText:'Snap to page'}).isVisible(),false,'Snap to page moved to Menu › View');
 for(const s of ['.options-bar','.tool-rail'])assert.match(await page.locator(s).evaluate(e=>getComputedStyle(e).backgroundImage),/radial-gradient/,`${s} shows a scroll cue`);
 await pickTool(page,'Brush',{tap:true});
 const hidden=await page.locator('.options-bar').evaluate(e=>e.scrollWidth-e.clientWidth);assert.ok(hidden<354,`less of the Brush options is hidden (${hidden}px, was 354)`);
 await page.locator('.phone-menu-button').tap();await page.locator('.phone-menu summary',{hasText:'View'}).tap();
 assert.ok(await page.getByRole('button',{name:'Toggle snapping to page'}).isVisible(),'Snap to page is in Menu › View');
});

check('finding 12: Clone Stamp takes its source from a tap, marks it, then paints with a drag',iphone,async(page,cdp)=>{
 await pickTool(page,'Clone Stamp',{tap:true});
 const source=page.locator('.options-bar .set-source');
 assert.equal(await source.count(),1,'a Set source button');
 assert.equal(await source.getAttribute('aria-pressed'),'true','…on for the first tap');
 const b=await source.boundingBox();assert.ok(b.width>=40&&b.height>=40,'Set source is touch-sized');
 assert.equal(await page.getByText('Alt-click to sample').count(),0,'no Alt-click hint on touch');
 const board=await box(page,'.artboard'),sx=board.x+board.width*.3,sy=board.y+board.height*.7;
 await touchTap(cdp,sx,sy);await page.waitForTimeout(400);
 assert.match(await page.locator('.toast').textContent(),/Source set/);
 assert.equal(await source.getAttribute('aria-pressed'),'false');
 const mark=await box(page,'.retouch-source-mark');assert.ok(mark&&Math.abs(mark.x+mark.width/2-sx)<3&&Math.abs(mark.y+mark.height/2-sy)<3,'a cross marks the source');
 const layers=()=>page.locator('.layers-list .layer-name').allTextContents(),count=(await layers()).length;
 const cx=board.x+board.width*.6,cy=board.y+board.height*.3;
 for(const [type,pts] of [['touchStart',[[cx,cy]]],...Array.from({length:8},(_,i)=>['touchMove',[[cx+(i+1)*6,cy+(i+1)*3]]]),['touchEnd',[]]]){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});await page.waitForTimeout(25);}
 await page.waitForTimeout(800);
 const now=await layers();assert.equal(now.length,count+1,'the drag added a layer');assert.ok(now.includes('Clone patch'),'…a clone patch');
 await source.tap();assert.equal(await source.getAttribute('aria-pressed'),'true','Set source picks again');
});

// An invented two-line page rendered to PNG, opened so the OCR bar fills in.
async function ocrImage(page){
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const obj=doc.addPage([0,0,420,200],0,{Font:{F:ref}},'1 1 1 rg 0 0 420 200 re f 0.1 0.1 0.1 rg BT /F 22 Tf 30 140 Td (Garden party invitation) Tj ET BT /F 14 Tf 30 80 Td (Bring a friend and a dessert) Tj ET');
 doc.insertPage(-1,obj);const p=doc.loadPage(0),pix=p.toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true),png=Buffer.from(pix.asPNG());
 pix.destroy();p.destroy();obj.destroy();ref.destroy();font.destroy();doc.destroy();
 const file=join(await mkdtemp(join(tmpdir(),'bide-chrome-')),'invitation.png');await writeFile(file,png);
 await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 await page.waitForFunction(()=>/\d+ OCR regions?/.test(document.querySelector('.text-detection-bar>span')?.textContent||''),null,{timeout:240000});await page.waitForTimeout(500);
}
const actions=['Proofread','Find & replace','Convert all to font text','OCR settings','Rescan'];
// Actions that are missing, off screen, covered or shorter than `min`.
const unreachable=(page,min)=>page.evaluate(([names,min])=>names.map(name=>{const e=[...document.querySelectorAll('.text-detection-bar button, .text-detection-bar summary')].find(b=>b.textContent.trim()===name);if(!e)return `${name}: missing`;
 const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 return r.width&&r.right<=innerWidth&&r.height>=min&&e.contains(hit)?'':`${name}: ${Math.round(r.x)}-${Math.round(r.right)} x ${Math.round(r.height)}`;}).filter(Boolean),[actions,min]);

check('finding 11: on a phone the OCR bar reaches every action through More',android,async page=>{
 await ocrImage(page);
 const more=page.locator('.ocr-more');if(await more.count())await more.tap();
 assert.deepEqual(await unreachable(page,40),[]);
 assert.ok(parseFloat(await page.locator('.text-detection-bar>label').evaluate(e=>getComputedStyle(e).fontSize))>=11,'Edit detected text keeps its label');
 assert.equal(await page.locator('.text-detection-bar>span').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'the full status shows');
 await page.locator('.ocr-settings>summary').tap();
 const font=await page.getByLabel('OCR replacement font').boundingBox();assert.ok(font&&font.x>=0&&font.x+font.width<=360,'OCR settings open on screen');
 // The sheet may cover the bar: its own Done button closes it.
 await page.locator('.ocr-settings-done').tap();assert.equal(await page.locator('.ocr-settings').evaluate(d=>d.open),false,'Done closes the OCR settings');
 await page.locator('.ocr-more').tap();
 // The palette's OCR settings open the dropdown, not the Properties drawer behind it.
 await page.locator('.command-button').tap();await page.locator('.palette-search input').fill('Choose OCR replacement font');
 await page.locator('.command-list>button').first().tap();await page.waitForTimeout(400);
 assert.notEqual(await panel(page),'properties','the Properties drawer stays shut');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'OCR replacement font');
},300000);

// A tilted photo still offers Straighten without opening More.
check('finding 11: a tilted photo keeps its Straighten hint on the folded OCR bar',iphone,async page=>{
 const shot=await browser.newPage({viewport:{width:700,height:700}});
 await shot.setContent('<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:700px"><div style="width:520px;padding:28px;font:17px Georgia;line-height:1.6;color:#222;transform:rotate(4deg)">Quarterly report<br>Revenue grew strongly across all regions while costs remained stable through the year.<br>Invoice total 1284 EUR</div></body>');
 const file=join(await mkdtemp(join(tmpdir(),'bide-chrome-')),'tilted.png');await shot.screenshot({path:file});await shot.close();
 await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
 const hint=page.locator('.straighten-hint');await hint.waitFor({state:'attached',timeout:180000});await page.waitForTimeout(500);
 assert.equal(await page.locator('.text-detection-bar').evaluate(e=>e.classList.contains('more')),false,'the bar is folded');
 const b=await hint.boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=390&&b.height>=40,`Straighten is on screen and touch-sized (${JSON.stringify(b)})`);
},300000);

check('finding 21: on a tablet the OCR bar wraps clear of Properties and its settings open on screen',tablet,async page=>{
 await ocrImage(page);
 const overlap=await page.evaluate(()=>{const left=document.querySelector('.inspector').getBoundingClientRect().left;return [...document.querySelectorAll('.text-detection-bar>*')].filter(e=>e.getBoundingClientRect().right>left+1).map(e=>e.textContent.trim().slice(0,20));});
 assert.deepEqual(overlap,[],'nothing in the OCR bar paints over Properties');
 assert.deepEqual(await unreachable(page,20),[]);
 await page.locator('.ocr-settings>summary').tap();const settings=await box(page,'.ocr-settings-panel');
 assert.ok(settings.x>=0&&settings.right<=820,`OCR settings open on screen (${settings.x}-${settings.right})`);
 const pages=await box(page,'.small-pages-button');assert.ok(pages.height>=32,`Pages is ${pages.height}px tall`);
},300000);

check('small tablets: the bottom bar keeps the zoom buttons clear of Pages',{...tablet,viewport:{width:640,height:960}},async page=>{
 const covered=await page.evaluate(()=>[...document.querySelectorAll('.zoom-controls button,.canvas-tab>button')].filter(b=>b.checkVisibility()).filter(b=>{const r=b.getBoundingClientRect();return !b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}).map(b=>b.getAttribute('aria-label')||b.textContent.trim()));
 assert.deepEqual(covered,[],'every bottom-bar button can be tapped');
 assert.match(await page.locator('.canvas-tab').innerText(),/1 \/ 1/,'the page number stays');
});

check('desktop keeps its menubar and status bar; phone controls stay hidden',{viewport:{width:1400,height:900}},async page=>{
 assert.ok(await page.locator('.menubar').isVisible());assert.ok(await page.locator('.statusbar').isVisible());
 for(const s of ['.phone-menu-button','.canvas-tab'])assert.equal(await page.locator(s).isVisible(),false,`${s} hidden`);
 await page.locator('.tool-rail button[aria-label="Clone Stamp"]').click();
 assert.ok(await page.getByText('Alt-click to sample').isVisible());assert.equal(await page.locator('.set-source').count(),0);
});
