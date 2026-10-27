// End-to-end: the subscription build. Sign in by email code, use the 7-day
// trial, hit the paywall when it ends, subscribe through Stripe Checkout
// (mocked) and get back in. API calls go to the real licence server handler
// (cloud/worker.ts) running here with an in-memory store.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {build} from 'esbuild';

const DAY=86400000;
await build({entryPoints:['cloud/worker.ts'],bundle:true,format:'esm',platform:'neutral',outfile:'tmp/cloud.mjs',logLevel:'error'});
await build({entryPoints:['cloud/store.ts'],bundle:true,format:'esm',platform:'neutral',outfile:'tmp/cloud-store.mjs',logLevel:'error'});
const {handle}=await import('../../tmp/cloud.mjs'),{MemoryStore}=await import('../../tmp/cloud-store.mjs');

test('trial, paywall and subscription in the subscription build',{timeout:600000},async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const priv=await crypto.subtle.exportKey('jwk',pair.privateKey),pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
 process.env.VITE_PAYWALL='1';process.env.VITE_LICENCE_PUBLIC_KEY=JSON.stringify({kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y});
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 const store=new MemoryStore();let clock=Date.now(),checkouts=0;
 const env={APP_URL:server.resolvedUrls.local[0].replace(/\/$/,''),LICENCE_PRIVATE_KEY:JSON.stringify(priv),DEV_SHOW_CODE:'1',STRIPE_SECRET_KEY:'sk_test',STRIPE_PRICE_ID:'price_2eur'};
 const realFetch=globalThis.fetch;
 // Stripe's API, as the licence server sees it.
 globalThis.fetch=async(url,init)=>String(url).startsWith('https://api.stripe.com/')?(checkouts++,new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/test'}))):realFetch(url,init);
 try{
  const context=await browser.newContext({viewport:{width:1400,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{const r=route.request(),body=r.postData();
   const reply=await handle(new Request(r.url(),{method:r.method(),headers:r.headers(),body:body??undefined}),env,store,clock);
   await route.fulfill({status:reply.status,headers:Object.fromEntries(reply.headers),body:await reply.text()});});
  await context.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Stripe Checkout</h1>'}));
  // The browser's clock follows the licence server's, so the trial can run out.
  await context.clock.install({time:clock});
  await page.goto(server.resolvedUrls.local[0]);
  // Sign-in: email, then the code (the test server returns it instead of emailing).
  await page.getByRole('heading',{name:'Try bide free for 7 days'}).waitFor({timeout:60000});
  assert.equal(await page.locator('.artboard').count(),0,'the editor is locked before sign-in');
  await page.getByLabel('Email').fill('alex@example.com');await page.getByRole('button',{name:'Email me a sign-in code'}).click();
  await page.getByLabel('Sign-in code').waitFor();assert.match(await page.getByLabel('Sign-in code').inputValue(),/^\d{6}$/);
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.locator('.artboard').waitFor({timeout:60000});
  assert.match(await page.locator('.account-chip summary').innerText(),/Trial · 7 days left/);
  // Day 8: the trial is over.
  clock+=8*DAY;await context.clock.setSystemTime(clock);await page.reload();
  await page.getByRole('heading',{name:'Your free trial has ended'}).waitFor({timeout:60000});
  assert.equal(await page.locator('.artboard').count(),0);
  await page.getByRole('button',{name:'Subscribe'}).click();
  await page.waitForURL('https://checkout.stripe.com/**');assert.equal(checkouts,1);
  // Stripe's webhook marks the subscription paid; back in the app it opens again.
  const user=[...store.users.values()][0];await store.updateUser(user.id,{stripe_customer:'cus_1',subscription_status:'active',paid_until:clock+30*DAY});
  await page.goto(server.resolvedUrls.local[0]+'?subscribed=1');
  await page.locator('.artboard').waitFor({timeout:60000});
  assert.equal(await page.locator('.account-chip summary').innerText(),'bide');
  // With the licence server unreachable, the stored licence still opens the editor.
  await context.unroute('**/api/**');await context.route('**/api/**',route=>route.abort('internetdisconnected'));
  await page.reload();await page.locator('.artboard').waitFor({timeout:60000});
  // …but not once it has expired (3 days at most).
  clock+=4*DAY;await context.clock.setSystemTime(clock);await page.reload();
  await page.getByRole('heading',{name:"Can't check your subscription"}).waitFor({timeout:60000});
  assert.deepEqual(errors,[],JSON.stringify(errors));
 }finally{globalThis.fetch=realFetch;await browser.close();await server.close();delete process.env.VITE_PAYWALL;}
});

// The iOS/Android build: sign-in only, no prices or purchase; account
// deletion; the licence server across origins; a model left out of the app
// bundle fetched from the server with the licence.
test('the app build signs in, shows no purchase, deletes the account and fetches models',{timeout:600000},async()=>{
 const {readFile}=await import('node:fs/promises');
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const priv=await crypto.subtle.exportKey('jwk',pair.privateKey),pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const remote='https://bide.example';
 Object.assign(process.env,{VITE_LICENCE_PUBLIC_KEY:JSON.stringify({kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}),VITE_LICENCE_API:remote,VITE_MODEL_BASE:remote+'/'});
 const server=await createServer({mode:'app',logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 const origin=server.resolvedUrls.local[0].replace(/\/$/,''),store=new MemoryStore(),served=[];let clock=Date.now();
 const env={APP_URL:remote,LICENCE_PRIVATE_KEY:JSON.stringify(priv),DEV_SHOW_CODE:'1',APP_ORIGINS:origin,STRIPE_SECRET_KEY:'sk_test',
  ASSETS:{fetch:async r=>{const path=new URL(r.url).pathname;served.push(path);return new Response(await readFile('public'+path));}}};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // The licence server is another origin, as it is for the apps.
  await context.route(remote+'/**',async route=>{const r=route.request(),body=r.postData();
   const reply=await handle(new Request(r.url(),{method:r.method(),headers:r.headers(),body:body??undefined}),env,store,clock);
   await route.fulfill({status:reply.status,headers:Object.fromEntries(reply.headers),body:Buffer.from(await reply.arrayBuffer())});});
  // ppocr-det is not in this "app bundle": it must come from the server.
  await context.route(`${origin}/ai/models/ppocr-det.onnx*`,route=>route.fulfill({status:404,body:''}));
  await context.clock.install({time:clock});
  await page.goto(origin);
  await page.getByRole('heading',{name:'Sign in to bide'}).waitFor({timeout:60000});
  const text=await page.locator('.paywall').innerText();assert.doesNotMatch(text,/€|per month|subscribe|Apple Pay/i,'no price or purchase in the app');
  await page.getByLabel('Email').fill('alex@example.com');await page.getByRole('button',{name:'Email me a sign-in code'}).click();
  await page.getByLabel('Sign-in code').waitFor();await page.getByRole('button',{name:'Sign in'}).click();
  await page.locator('.account-chip').waitFor({timeout:60000});
  await page.locator('.account-chip summary').click();
  assert.equal(await page.locator('.account-chip').getByRole('button',{name:/Subscribe|Manage/}).count(),0,'no purchase buttons');
  // The AI reads text with a model downloaded from the server, the licence as a bearer token.
  const read=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=420;c.height=80;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,420,80);g.fillStyle='#111';g.font='32px Arial';g.fillText('Invoice 2026',20,52);
   const {recognizeImage}=await import('/src/browser/ocr.ts');return (await recognizeImage(c,{engine:'paddle',grouping:'lines'})).map(r=>r.text).join(' ');});
  assert.match(read,/Invoice 2026/);assert.ok(served.includes('/ai/models/ppocr-det.onnx'),'the model came from the server');
  // After the trial: no purchase, only sign out or delete.
  clock+=8*24*3600000;await context.clock.setSystemTime(clock);await page.reload();
  await page.getByRole('heading',{name:'No active plan'}).waitFor({timeout:60000});
  assert.doesNotMatch(await page.locator('.paywall').innerText(),/€|subscribe|website|web/i);
  page.on('dialog',d=>void d.accept());
  await page.getByRole('button',{name:'Delete account'}).click();
  await page.getByRole('heading',{name:'Sign in to bide'}).waitFor({timeout:30000});
  assert.equal(store.users.size,0,'the account is gone from the server');
  assert.deepEqual(errors,[],JSON.stringify(errors));
 }finally{await browser.close();await server.close();for(const k of ['VITE_LICENCE_PUBLIC_KEY','VITE_LICENCE_API','VITE_MODEL_BASE'])delete process.env[k];}
});
