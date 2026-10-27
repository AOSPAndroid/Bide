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
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined}).catch(async error=>{await server.close();throw error;});
 const store=new MemoryStore();let clock=Date.now(),checkouts=0;
 const env={APP_URL:server.resolvedUrls.local[0].replace(/\/$/,''),LICENCE_PRIVATE_KEY:JSON.stringify(priv),DEV_SHOW_CODE:'1',STRIPE_SECRET_KEY:'sk_test',STRIPE_PRICE_ID:'price_2eur',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
 const realFetch=globalThis.fetch;
 let subscriptions=[];
 // Stripe's API, as the licence server sees it.
 globalThis.fetch=async(url,init={})=>{
  if(!String(url).startsWith('https://api.stripe.com/'))return realFetch(url,init);
  const path=new URL(url).pathname,params=new URLSearchParams(init.body),ok=body=>new Response(JSON.stringify(body));
  if(path==='/v1/customers'&&init.method==='GET')return ok({data:[],has_more:false});
  if(path==='/v1/customers')return ok({id:'cus_1',metadata:{user_id:params.get('metadata[user_id]')}});
  if(path==='/v1/subscriptions')return ok({data:subscriptions,has_more:false});
  if(path==='/v1/checkout/sessions'&&init.method==='POST'){
   checkouts++;return ok({id:'cs_fixture',customer:'cus_1',status:'open',expires_at:Number(params.get('expires_at')),url:'https://checkout.stripe.com/c/pay/test'});
  }
  throw new Error('Unexpected fixture Stripe request: '+path);
 };
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
  const user=[...store.users.values()][0];
  subscriptions=[{id:'sub_fixture',customer:'cus_1',status:'active',metadata:{user_id:user.id},items:{data:[{id:'si_fixture',price:{id:'price_2eur'},current_period_end:Math.floor((clock+30*DAY)/1000)}],has_more:false}}];
  const event=JSON.stringify({id:'evt_fixture_paid',type:'customer.subscription.created',data:{object:subscriptions[0]}}),stamp=Math.floor(clock/1000);
  const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(`${stamp}.${event}`)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const paid=await handle(new Request(env.APP_URL+'/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':`t=${stamp},v1=${signature}`},body:event}),env,store,clock);
  assert.equal(paid.status,200);assert.equal(await store.stripeEventProcessed('evt_fixture_paid'),true);
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
 }finally{globalThis.fetch=realFetch;await browser.close();await server.close();delete process.env.VITE_PAYWALL;delete process.env.VITE_LICENCE_PUBLIC_KEY;}
});
