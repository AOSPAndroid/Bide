// End-to-end on phones and tablets: the shell around the editor. The workspace switcher is
// labelled with 44px targets, phones start on the PDF home, landscape phones fit the screen,
// a tapped button keeps its look (no sticky hover), the demo notice works by touch, the
// subscription build's paywall card and account chip fit and close by touch, and the site has
// a manifest and a touch icon. Desktop keeps its layout and its hover looks.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

const touch=(width,height)=>({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const rect=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};});
const current=page=>page.locator('.workspace-nav button[aria-current=page]').getAttribute('aria-label');
const background=locator=>locator.evaluate(e=>getComputedStyle(e).backgroundColor);
const nav=(page,name)=>page.locator('.workspace-nav').getByRole('button',{name,exact:true});
// Elements that a finger at their centre does not reach (skipping those scrolled out of view).
const hits=(page,selector)=>page.evaluate(selector=>[...document.querySelectorAll(selector)].map(e=>{
 const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;let top=0,bottom=innerHeight;
 for(let p=e.parentElement;p;p=p.parentElement)if(getComputedStyle(p).overflowY!=='visible'){const c=p.getBoundingClientRect();top=Math.max(top,c.top);bottom=Math.min(bottom,c.bottom);}
 if(!r.width||y<top+1||y>bottom-1)return null;const hit=document.elementFromPoint(x,y);
 return e.contains(hit)?null:`${e.getAttribute('aria-label')||e.textContent} is covered by ${hit?.tagName}.${hit?.className}`;}).filter(Boolean),selector);
const tapAt=async(page,locator)=>{const r=await rect(locator);await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);};
async function swipe(cdp,x,from,to){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
 for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/8}]});await new Promise(r=>setTimeout(r,20));}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function open(browser,url,options){
 const context=await browser.newContext(options),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.workspace-nav').waitFor({timeout:60000});await page.waitForTimeout(800);
 return {context,page,errors};
}

test('phone shell: labelled workspaces, PDF home start, landscape fits, no sticky hover, manifest',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 const url=server.resolvedUrls.local[0]+'app/';
 try{
  for(const [width,height] of [[390,844],[360,740]]){
   const {context,page,errors}=await open(browser,url,touch(width,height)),at=`${width}x${height}`;
   assert.equal(await current(page),'PDF MasterTool',`${at}: a phone starts on the PDF home`);
   // The three workspaces carry their short names and are 44px targets.
   const buttons=page.locator('.topbar .workspace-nav>button');
   assert.deepEqual(await buttons.evaluateAll(b=>b.map(e=>e.innerText.trim())),['PHOTO','PDF','DOCS'],`${at}: the workspace names show`);
   for(const box of await buttons.evaluateAll(b=>b.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];})))assert.ok(box[0]>=44&&box[1]>=44,`${at}: workspace button is ${box}`);
   assert.ok((await rect(page.locator('.command-button'))).right<=width,`${at}: the search button stays on screen`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${at}: no sideways scroll`);
   await nav(page,'Photo editor').tap();await page.locator('.artboard').waitFor({timeout:60000});
   assert.equal(await current(page),'Photo editor');
   // A tapped button keeps its own look, not the pale hover tint that reads as "active".
   // The footer's zoom button: the options bar's duplicate zoom is hidden on touch screens.
   const zoom=page.locator('.zoom-controls button[aria-label="Zoom in"]').first(),plain=await background(zoom);
   await zoom.tap();await page.waitForTimeout(400);
   assert.ok(await zoom.evaluate(e=>e.matches(':hover')),'the tapped button is :hover, as on a real phone');
   assert.equal(await background(zoom),plain,`${at}: the tapped button keeps its colour`);
   assert.deepEqual(errors,[]);await context.close();
  }
  // Landscape phones: the editor fits the screen; the status bar is visible and nothing covers it.
  for(const [width,height] of [[844,390],[740,360]]){
   const {context,page,errors}=await open(browser,url,touch(width,height)),at=`${width}x${height}`;
   assert.equal(await current(page),'PDF MasterTool',`${at}: a landscape phone starts on the PDF home`);
   await nav(page,'Photo editor').tap();await page.locator('.artboard').waitFor({timeout:60000});await page.waitForTimeout(800);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),`${at}: the page does not scroll`);
   assert.ok((await rect(page.locator('.statusbar'))).bottom<=height,`${at}: the status bar is on screen`);
   assert.deepEqual(await hits(page,'.statusbar button'),[],`${at}: the status bar buttons are not covered`);
   const inspector=page.locator('.inspector');
   if(await inspector.isVisible()){
    assert.ok(await inspector.evaluate(e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'),`${at}: the inspector scrolls as one column`);
    assert.ok((await rect(inspector)).bottom<=(await rect(page.locator('.statusbar'))).y+1,`${at}: the inspector ends above the status bar`);
   }
   assert.ok((await rect(page.locator('.command-button'))).right<=width,`${at}: the search button stays on screen`);
   for(const box of await page.locator('.topbar .workspace-nav>button').evaluateAll(b=>b.map(e=>e.getBoundingClientRect().height)))assert.ok(box>=44);
   assert.deepEqual(errors,[]);await context.close();
  }
  // Tablets keep the Photo editor start, with the labelled switcher.
  {
   const {context,page,errors}=await open(browser,url,touch(820,1180));
   assert.equal(await current(page),'Photo editor','a tablet starts in the Photo editor');
   assert.deepEqual(await page.locator('.topbar .workspace-nav>button').evaluateAll(b=>b.map(e=>[e.innerText.trim(),e.getBoundingClientRect().height>=44])),[['PHOTO',true],['PDF',true],['DOCS',true]]);
   assert.ok((await rect(page.locator('.command-button'))).right<=820);
   assert.deepEqual(errors,[]);await context.close();
  }
  // Desktop: unchanged start, full names, 40px header, hover looks, 570px minimum height.
  {
   const {context,page,errors}=await open(browser,url,{viewport:{width:1400,height:900}});
   assert.equal(await current(page),'Photo editor');
   assert.deepEqual(await page.locator('.topbar .workspace-nav>button').evaluateAll(b=>b.map(e=>e.innerText.trim())),['Photo editor','PDF MasterTool','Documents']);
   assert.equal((await rect(page.locator('.topbar'))).height,40);
   const pdf=nav(page,'PDF MasterTool'),plain=await background(pdf);await pdf.hover();await page.waitForTimeout(100);
   assert.notEqual(await background(pdf),plain,'desktop keeps its hover look');
   assert.equal(await page.locator('.app').evaluate(e=>getComputedStyle(e).minHeight),'570px');
   // Add to Home Screen: a manifest with icons, and an apple-touch-icon.
   const cdp=await context.newCDPSession(page),manifest=await cdp.send('Page.getAppManifest');
   assert.match(manifest.url,/\/manifest\.webmanifest$/);assert.deepEqual(manifest.errors,[]);
   const data=JSON.parse(manifest.data);assert.equal(data.short_name,'bide');assert.equal(data.theme_color,'#ffffff');
   const sizes=await page.evaluate(async srcs=>Promise.all([...srcs,document.querySelector('link[rel=apple-touch-icon]')?.href??'none'].map(src=>new Promise(r=>{const i=new Image();i.onload=()=>r(`${i.naturalWidth}x${i.naturalHeight}`);i.onerror=()=>r('missing');i.src=src;}))),data.icons.map(i=>new URL(i.src,manifest.url).href));
   assert.deepEqual(sizes,[...data.icons.map(i=>i.sizes),'180x180']);
   assert.equal(await page.locator('meta[name=apple-mobile-web-app-title]').getAttribute('content'),'bide');
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser.close();await server.close();}
});

test('demo notice: 44px close, 40px links, no Windows download on phones',{timeout:300000},async()=>{
 const server=await createServer({mode:'demo',logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 const url=server.resolvedUrls.local[0]+'app/';
 try{
  for(const [width,height] of [[390,844],[360,740],[820,1180]]){
   const {context,page,errors}=await open(browser,url,touch(width,height)),at=`${width}x${height}`,notice=page.locator('.demo-notice');
   const close=await rect(notice.getByRole('button',{name:'Hide demo notice'}));
   assert.ok(close.width>=44&&close.height>=44,`${at}: close is ${close.width}x${close.height}`);
   for(const target of [notice.getByRole('link',{name:'Source'}),notice.getByRole('button',{name:'Try OCR'})])assert.ok((await rect(target)).height>=40,`${at}: notice targets are 40px tall`);
   assert.equal(await notice.getByRole('link',{name:'Download bide'}).isVisible(),false,`${at}: no Windows download on a touch screen`);
   assert.ok((await rect(notice)).right<=width);assert.deepEqual(await hits(page,'.demo-notice a,.demo-notice button'),[]);
   await notice.getByRole('button',{name:'Hide demo notice'}).tap();await notice.waitFor({state:'detached'});
   assert.deepEqual(errors,[]);await context.close();
  }
  const {context,page}=await open(browser,url,{viewport:{width:1400,height:900}});
  assert.ok(await page.locator('.demo-notice').getByRole('link',{name:'Download bide'}).isVisible(),'desktop keeps the download');
  await context.close();
 }finally{await browser.close();await server.close();}
});

test('subscription build on phones: paywall card fits and scrolls, account chip covers nothing and closes',{timeout:600000},async()=>{
 const algorithm={name:'ECDSA',namedCurve:'P-256'},pair=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
 const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
 process.env.VITE_PAYWALL='1';process.env.VITE_LICENCE_PUBLIC_KEY=JSON.stringify({kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y});
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined}).catch(async error=>{await server.close();throw error;});
 const url=server.resolvedUrls.local[0]+'app/';
 const b64=bytes=>Buffer.from(bytes).toString('base64url');
 const licence=async(status,email)=>{const now=Date.now(),payload=b64(new TextEncoder().encode(JSON.stringify({sub:'u1',email,status,trialEnds:status==='trial'?now+5*86400000:now-86400000,exp:now+3600000})));
  return `${payload}.${b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(payload))))}`;};
 // The licence server, as the app sees it: sign-in is rate limited once, then codes are wrong.
 const signedIn=async(options,status,email='alex@example.com')=>{
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const token=status&&await licence(status,email);let starts=0;
  await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname,json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(path==='/api/licence')return token?json(200,{licence:token,status}):json(401,{error:'Sign in'});
   if(path==='/api/auth/start')return ++starts===1?json(429,{error:'Too many attempts. Try again in a few minutes.'}):json(200,{sent:true});
   if(path==='/api/auth/verify')return json(400,{error:'That code is wrong or expired.'});
   return json(404,{error:'Not found'});});
  if(token)await context.addInitScript(()=>{try{localStorage.setItem('bide-session','fixture');}catch{}});
  await page.goto(url);return {context,page,errors};
 };
 try{
  // Sign-in on a short landscape screen: the submit button is on screen.
  {
   const {context,page,errors}=await signedIn(touch(740,280));
   const submit=page.getByRole('button',{name:'Email me a sign-in code'});await submit.waitFor({timeout:60000});
   assert.ok((await rect(submit)).bottom<=280,'the sign-in button fits a 280px tall screen');
   assert.deepEqual(errors,[]);await context.close();
  }
  // A tapped primary button stays orange after an error; a card taller than the screen scrolls.
  {
   const {context,page,errors}=await signedIn(touch(390,844)),cdp=await context.newCDPSession(page);
   await page.getByLabel('Email').waitFor({timeout:60000});await page.getByLabel('Email').fill('alex@example.com');
   const submit=page.getByRole('button',{name:'Email me a sign-in code'}),orange=await background(submit);
   // The browser moves :hover onto the button once the error has moved the card.
   await submit.tap();await page.getByRole('alert').waitFor();await page.waitForTimeout(400);
   assert.ok(await submit.evaluate(e=>e.matches(':hover')),'the tapped button is :hover, as on a real phone');
   assert.equal(await background(submit),orange,'the tapped button keeps its colour');
   await submit.tap();await page.getByLabel('Sign-in code').fill('123456');await page.getByRole('button',{name:'Sign in'}).tap();
   await page.getByRole('alert').filter({hasText:'wrong'}).waitFor();
   // Landscape with the keyboard open: about 180px left.
   await page.setViewportSize({width:740,height:180});await page.waitForTimeout(300);
   const alert=page.getByRole('alert');
   assert.ok((await rect(alert)).bottom>180,'the error starts below the edge');
   const card=await rect(page.locator('.paywall-card'));await swipe(cdp,card.x+card.width/2,160,20);await page.waitForTimeout(400);
   assert.ok((await rect(alert)).bottom<=180,'a swipe scrolls the card to the error');
   await page.getByRole('button',{name:'Use another email'}).tap();await page.getByLabel('Email').waitFor();
   assert.deepEqual(errors,[]);await context.close();
  }
  // Trial ended, with a long address: the card and everything in it stays on screen.
  for(const [width,height] of [[360,740],[390,844]]){
   const {context,page,errors}=await signedIn(touch(width,height),'expired','jean-baptiste.lefebvre-martin@groupe-industriel-exemple.com');
   await page.getByRole('heading',{name:'Your free trial has ended'}).waitFor({timeout:60000});
   const card=await rect(page.locator('.paywall-card'));assert.ok(card.x>=0&&card.right<=width,`${width}px: the card is ${card.x}-${card.right}`);
   for(const part of await page.locator('.paywall-card>*').evaluateAll(e=>e.map(e=>e.getBoundingClientRect().right)))assert.ok(part<=card.right+1,`${width}px: card content ends at ${part}, past ${card.right}`);
   // The address in "Sign out (…)" wraps inside its button instead of running past it.
   assert.deepEqual(await page.locator('.paywall-card button').evaluateAll(b=>b.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)),[],`${width}px: button text fits`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(errors,[]);await context.close();
  }
  // Trial account in the Photo editor: the pill covers no tool, its menu closes on an outside tap.
  {
   const {context,page,errors}=await signedIn(touch(390,844),'trial');
   const chip=page.locator('.account-chip'),summary=chip.locator('summary');await summary.waitFor({timeout:60000});
   await nav(page,'Photo editor').tap();await page.locator('.artboard').waitFor({timeout:60000});await page.waitForTimeout(800);
   assert.ok((await rect(summary)).height>=40,'the pill is 40px tall');
   assert.deepEqual(await hits(page,'.tool-rail button'),[],'no tool under the pill');
   await page.locator('.tool-rail').evaluate(e=>{e.scrollTop=e.scrollHeight;});await page.waitForTimeout(200);
   assert.deepEqual(await hits(page,'.tool-rail button'),[],'no tool under the pill with the rail scrolled down');
   await summary.tap();await page.waitForTimeout(200);
   assert.ok(await chip.evaluate(e=>e.open));
   for(const height of await chip.locator('button').evaluateAll(b=>b.map(e=>e.getBoundingClientRect().height)))assert.ok(height>=44,`menu button is ${height}px`);
   // A tap on the canvas only closes the menu: it does not select the headline underneath.
   const options=await page.locator('.options-bar').innerText(),board=await rect(page.locator('.artboard'));
   await page.touchscreen.tap(board.x+board.width*.3,board.y+board.height*.2);await page.waitForTimeout(400);
   assert.equal(await chip.evaluate(e=>e.open),false,'an outside tap closes the menu');
   assert.equal(await page.locator('.options-bar').innerText(),options,'the tap did not reach the canvas');
   // Nor does it stay open over another workspace.
   await chip.evaluate(e=>{e.open=true;});await tapAt(page,nav(page,'Documents'));await page.waitForTimeout(300);
   assert.equal(await chip.evaluate(e=>e.open),false,'the menu does not stay open');
   assert.deepEqual(errors,[]);await context.close();
  }
  // Desktop keeps the small pill and no backdrop.
  {
   const {context,page}=await signedIn({viewport:{width:1400,height:900}},'trial');
   const summary=page.locator('.account-chip summary');await summary.waitFor({timeout:60000});
   assert.ok((await rect(summary)).height<30);await summary.click();
   assert.equal(await page.locator('.account-chip').evaluate(e=>getComputedStyle(e,'::before').content),'none');
   await context.close();
  }
 }finally{await browser.close();await server.close();delete process.env.VITE_PAYWALL;delete process.env.VITE_LICENCE_PUBLIC_KEY;}
});
