import {test} from 'node:test';import assert from 'node:assert/strict';
import {handle,licenceFor,verifyStripeSignature} from '../tmp/cloud.mjs';
import {MemoryStore,D1Store,emptyCheckout} from '../tmp/cloud-store.mjs';
import {readFile} from 'node:fs/promises';
import {verifyLicence,importPublicKey,trialDaysLeft} from '../tmp/licence.mjs';

const DAY=86400000,T0=Date.UTC(2026,9,20);
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey=await importPublicKey(await crypto.subtle.exportKey('jwk',pair.publicKey));
const env={APP_URL:'https://bide.test',LICENCE_PRIVATE_KEY:JSON.stringify(privateJwk),DEV_SHOW_CODE:'1',STRIPE_SECRET_KEY:'sk_test',STRIPE_PRICE_ID:'price_2eur',STRIPE_WEBHOOK_SECRET:'whsec_test'};
const call=(store,path,{method='GET',body,token,headers={},now=T0,e=env}={})=>handle(new Request('https://bide.test'+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}),e,store,now);

async function signIn(store,email='alex@example.com',now=T0){
 const {devCode}=await (await call(store,'/api/auth/start',{method:'POST',body:{email},now})).json();
 const {session}=await (await call(store,'/api/auth/verify',{method:'POST',body:{email,code:devCode},now})).json();
 return session;
}
async function hmacHeader(body,secret,t){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${body}`)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return `t=${t},v1=${mac}`;
}


// A deterministic Stripe API model. All keys, sessions and customers are fixtures.
function fakeStripe(t){
 const real=globalThis.fetch,state={requests:[],customers:[],subscriptions:[],sessions:new Map(),operations:new Map(),failCheckout:null,beforeRequest:null};
 t.after(()=>{globalThis.fetch=real;});
 const ok=body=>new Response(JSON.stringify(body),{status:200});
 globalThis.fetch=async(url,init={})=>{
  const parsed=new URL(url),path=parsed.pathname.replace('/v1/',''),method=init.method??'GET';
  assert.equal(parsed.origin,'https://api.stripe.com','billing tests never send network requests');
  const params=method==='GET'?parsed.searchParams:new URLSearchParams(init.body),headers=new Headers(init.headers),key=headers.get('idempotency-key');
  const request={path,method,params,key,body:String(init.body??'')};state.requests.push(request);
  if(state.beforeRequest)await state.beforeRequest(request);
  if(path==='customers'&&method==='GET')return ok({data:state.customers.filter(c=>c.email===params.get('email')),has_more:false});
  if(path==='customers'&&method==='POST'){
   if(state.operations.has(key))return ok(state.operations.get(key));
   const customer={id:'cus_'+(state.customers.length+1),email:params.get('email'),metadata:{user_id:params.get('metadata[user_id]')}};
   state.customers.push(customer);state.operations.set(key,customer);return ok(customer);
  }
  if(path==='subscriptions')return ok({data:state.subscriptions.filter(s=>s.customer===params.get('customer')),has_more:false});
  if(path==='checkout/sessions'&&method==='GET')return ok({data:[...state.sessions.values()].filter(s=>s.customer===params.get('customer')),has_more:false});
  if(path==='checkout/sessions'&&method==='POST'){
   if(state.failCheckout==='before'){state.failCheckout=null;throw new Error('Fixture connection failed before creation');}
   if(state.operations.has(key))return ok(state.operations.get(key));
   const session={id:'cs_'+(state.sessions.size+1),customer:params.get('customer'),status:'open',url:'https://checkout.stripe.com/c/pay/'+(state.sessions.size+1),
    expires_at:Number(params.get('expires_at')),metadata:{checkout_key:params.get('metadata[checkout_key]')}};
   state.sessions.set(session.id,session);state.operations.set(key,session);
   if(state.failCheckout==='after'){state.failCheckout=null;throw new Error('Fixture response lost after creation');}
   return ok(session);
  }
  if(path.startsWith('checkout/sessions/')&&path.endsWith('/expire')){
   const session=state.sessions.get(path.split('/')[2]);assert.ok(session);session.status='expired';return ok(session);
  }
  if(path.startsWith('checkout/sessions/')){const session=state.sessions.get(path.split('/')[2]);assert.ok(session);return ok(session);}
  if(path==='billing_portal/sessions')return ok({url:'https://billing.stripe.com/p/session/test'});
  throw new Error('Unexpected fixture request: '+path);
 };
 return state;
}
const subscription=(user,{id='sub_1',status='active',customer='cus_1',price='price_2eur',until=T0+38*DAY}={})=>({
 id,customer,status,metadata:{user_id:user.id},items:{data:[{id:'si_'+id,price:{id:price},current_period_end:Math.floor(until/1000)}],has_more:false}
});
async function webhook(store,id,type,object,now=T0+8*DAY){
 const body=JSON.stringify({id,type,created:Math.floor(T0/1000),data:{object}});
 return call(store,'/api/stripe/webhook',{method:'POST',body,headers:{'stripe-signature':await hmacHeader(body,env.STRIPE_WEBHOOK_SECRET,Math.floor(now/1000))},now});
}
const checkoutCalls=fake=>fake.requests.filter(r=>r.path==='checkout/sessions'&&r.method==='POST');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('sign-in by email code starts a 7-day trial with a signed licence',async()=>{
 const store=new MemoryStore(),session=await signIn(store);
 assert.ok(session);
 const reply=await call(store,'/api/licence',{token:session}),body=await reply.json();
 assert.equal(body.status,'trial');assert.equal(body.trialEnds,T0+7*DAY);
 const licence=await verifyLicence(body.licence,publicKey,T0+1000);
 assert.equal(licence.email,'alex@example.com');assert.equal(trialDaysLeft(licence,T0),7);
 assert.ok(licence.exp<=T0+3*DAY,'a licence lasts at most 3 days offline');
 assert.match(reply.headers.get('set-cookie'),/^bide_licence=.+HttpOnly/);
 // Signing in again later keeps the same trial.
 const again=await signIn(store,'Alex@Example.com',T0+5*DAY);
 assert.equal((await (await call(store,'/api/licence',{token:again,now:T0+5*DAY})).json()).trialEnds,T0+7*DAY);
});

test('wrong codes, expired codes and too many requests are refused',async()=>{
 const store=new MemoryStore();
 const {devCode}=await (await call(store,'/api/auth/start',{method:'POST',body:{email:'a@b.co'}})).json();
 assert.equal((await call(store,'/api/auth/verify',{method:'POST',body:{email:'a@b.co',code:devCode==='000000'?'111111':'000000'}})).status,401);
 assert.equal((await call(store,'/api/auth/verify',{method:'POST',body:{email:'a@b.co',code:devCode},now:T0+11*60000})).status,401,'expired after 10 minutes');
 for(let i=0;i<4;i++)await call(store,'/api/auth/start',{method:'POST',body:{email:'a@b.co'}});
 assert.equal((await call(store,'/api/auth/start',{method:'POST',body:{email:'a@b.co'}})).status,429);
 assert.equal((await call(store,'/api/auth/start',{method:'POST',body:{email:'not-an-email'}})).status,400);
 assert.equal((await call(store,'/api/licence',{token:'forged'})).status,401);
});

test('after the trial the licence is expired; a paid subscription renews it',async()=>{
 const user={id:'u1',email:'a@b.co',created_at:T0,trial_ends:T0+7*DAY};
 assert.equal(licenceFor(user,T0+8*DAY).status,'expired');
 assert.equal(licenceFor({...user,subscription_status:'active',paid_until:T0+38*DAY},T0+8*DAY).status,'active');
 assert.equal(licenceFor({...user,subscription_status:'past_due',paid_until:T0+8*DAY},T0+12*DAY).status,'active','a week of grace while Stripe retries');
 assert.equal(licenceFor({...user,subscription_status:'canceled',paid_until:T0+8*DAY},T0+9*DAY).status,'expired');
 const store=new MemoryStore(),session=await signIn(store);
 const {licence}=await (await call(store,'/api/licence',{token:session,now:T0+8*DAY})).json();
 assert.equal(await verifyLicence(licence,publicKey,T0+8*DAY),undefined,'an expired licence does not unlock the app');
});

test('checkout reuses one customer and one pending session with persisted idempotency',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0];
 const first=await call(store,'/api/checkout',{method:'POST',token:session});
 assert.equal(first.status,200);const body=await first.json();
 const second=await call(store,'/api/checkout',{method:'POST',token:session});
 assert.equal(second.status,200);assert.equal((await second.json()).url,body.url);
 assert.equal(stripe.customers.length,1);assert.equal(checkoutCalls(stripe).length,1);
 const request=checkoutCalls(stripe)[0],state=store.billing.get(user.id);
 assert.equal(request.params.get('mode'),'subscription');assert.equal(request.params.get('line_items[0][price]'),'price_2eur');
 assert.equal(request.params.get('customer'),'cus_1');assert.equal(request.params.get('customer_email'),null);
 assert.equal(request.params.get('client_reference_id'),user.id);
 assert.equal(request.key,'bide-checkout-'+state.checkout_key);assert.equal(request.body,state.checkout_params);
 assert.equal(state.checkout_session,'cs_1');assert.equal(store.users.get(user.id).stripe_customer,'cus_1');
 assert.ok(stripe.requests.some(r=>r.path==='subscriptions'&&r.params.get('price')==='price_2eur'));
});

test('concurrent checkout requests create only one purchase operation',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),entered=deferred(),release=deferred();
 stripe.beforeRequest=async request=>{if(request.path==='customers'&&request.method==='GET'){entered.resolve();await release.promise;}};
 const first=call(store,'/api/checkout',{method:'POST',token:session});await entered.promise;
 const concurrent=await call(store,'/api/checkout',{method:'POST',token:session});
 assert.equal(concurrent.status,409);release.resolve();assert.equal((await first).status,200);
 assert.equal(checkoutCalls(stripe).length,1);assert.equal(stripe.customers.length,1);
});

test('a lost Checkout response recovers the existing session instead of making another',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store);stripe.failCheckout='after';
 assert.equal((await call(store,'/api/checkout',{method:'POST',token:session})).status,503);
 assert.equal(stripe.sessions.size,1);
 const retry=await call(store,'/api/checkout',{method:'POST',token:session});
 assert.equal(retry.status,200);assert.equal((await retry.json()).url,stripe.sessions.get('cs_1').url);
 assert.equal(checkoutCalls(stripe).length,1);
});

test('a failed Checkout request retries the exact persisted parameters and key',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store);stripe.failCheckout='before';
 assert.equal((await call(store,'/api/checkout',{method:'POST',token:session})).status,503);
 assert.equal((await call(store,'/api/checkout',{method:'POST',token:session,now:T0+10000})).status,200);
 const requests=checkoutCalls(stripe);assert.equal(requests.length,2);
 assert.equal(requests[0].key,requests[1].key);assert.equal(requests[0].body,requests[1].body);assert.equal(stripe.sessions.size,1);
});

test('an existing subscription goes to management and a stale open checkout expires',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0];
 await call(store,'/api/checkout',{method:'POST',token:session});
 stripe.subscriptions=[subscription(user)];
 const reply=await call(store,'/api/checkout',{method:'POST',token:session});
 assert.equal(reply.status,200);assert.match((await reply.json()).url,/billing.stripe.com/);
 assert.equal(checkoutCalls(stripe).length,1);assert.equal(stripe.sessions.get('cs_1').status,'expired');
 assert.equal(store.billing.get(user.id).checkout_key,null);
});

test('an incomplete subscription owned by the open checkout resumes payment instead of expiring it',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0];
 await call(store,'/api/checkout',{method:'POST',token:session});
 const pending=stripe.sessions.get('cs_1');pending.subscription='sub_sca';
 stripe.subscriptions=[subscription(user,{id:'sub_sca',status:'incomplete'})];
 const resumed=await call(store,'/api/checkout',{method:'POST',token:session});
 assert.equal(resumed.status,200);assert.equal((await resumed.json()).url,pending.url);
 assert.equal(pending.status,'open');assert.equal(checkoutCalls(stripe).length,1);
 assert.equal(stripe.requests.some(r=>r.path==='billing_portal/sessions'),false);
 assert.equal(checkoutCalls(stripe)[0].params.get('subscription_data[metadata][checkout_key]'),store.billing.get(user.id).checkout_key);
});

test('completed checkout awaiting subscription confirmation cannot create a second purchase',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store);
 await call(store,'/api/checkout',{method:'POST',token:session});
 Object.assign(stripe.sessions.get('cs_1'),{status:'complete',subscription:'sub_1',url:null});
 assert.equal((await call(store,'/api/checkout',{method:'POST',token:session})).status,503);
 assert.equal(checkoutCalls(stripe).length,1);
});

test('webhooks reconcile current Stripe state, ignore replay, and protect replacement subscriptions',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0],now=T0+8*DAY;
 await call(store,'/api/checkout',{method:'POST',token:session,now});
 const active=subscription(user);stripe.subscriptions=[active];
 assert.equal((await webhook(store,'evt_active','customer.subscription.updated',active,now)).status,200);
 const licence=await (await call(store,'/api/licence',{token:session,now})).json();
 assert.equal(licence.status,'active');assert.ok(await verifyLicence(licence.licence,publicKey,now));

 stripe.subscriptions=[{...active,status:'canceled'}];
 assert.equal((await webhook(store,'evt_cancel','customer.subscription.deleted',stripe.subscriptions[0],now)).status,200);
 assert.equal(licenceFor(store.users.get(user.id),now).status,'expired');
 const count=stripe.requests.length;
 assert.equal((await webhook(store,'evt_active','customer.subscription.updated',active,now)).status,200);
 assert.equal(stripe.requests.length,count,'processed event IDs do not repeat effects');
 // A different delayed event has the same timestamp but an obsolete active snapshot.
 assert.equal((await webhook(store,'evt_delayed','customer.subscription.updated',active,now)).status,200);
 assert.equal(licenceFor(store.users.get(user.id),now).status,'expired','the API state, not the event snapshot, wins');

 const replacement=subscription(user,{id:'sub_2'});stripe.subscriptions.push(replacement);
 assert.equal((await webhook(store,'evt_new','customer.subscription.created',replacement,now)).status,200);
 assert.equal((await webhook(store,'evt_old_delete','customer.subscription.deleted',stripe.subscriptions[0],now)).status,200);
 assert.equal(store.users.get(user.id).subscription_id,'sub_2');
 assert.equal(licenceFor(store.users.get(user.id),now).status,'active');
});

test('other Stripe prices never grant Bide access',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0],now=T0+8*DAY;
 await call(store,'/api/checkout',{method:'POST',token:session,now});
 const unrelated=subscription(user,{price:'price_other'});stripe.subscriptions=[unrelated];
 assert.equal((await webhook(store,'evt_other','customer.subscription.updated',unrelated,now)).status,200);
 assert.equal(licenceFor(store.users.get(user.id),now).status,'expired');
});

test('failed reconciliation remains retryable and a forged webhook is refused',async t=>{
 const stripe=fakeStripe(t),store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0],now=T0+8*DAY;
 await call(store,'/api/checkout',{method:'POST',token:session,now});
 const active=subscription(user);stripe.subscriptions=[active];
 stripe.beforeRequest=async r=>{if(r.path==='subscriptions')throw new Error('Fixture Stripe outage');};
 assert.equal((await webhook(store,'evt_retry','customer.subscription.updated',active,now)).status,503);
 assert.equal(await store.stripeEventProcessed('evt_retry'),false);
 stripe.beforeRequest=null;
 assert.equal((await webhook(store,'evt_retry','customer.subscription.updated',active,now)).status,200);
 assert.equal(await store.stripeEventProcessed('evt_retry'),true);
 const body=JSON.stringify({id:'evt_forged',type:'customer.subscription.deleted',data:{object:active}}),stamp=Math.floor(now/1000);
 assert.equal((await call(store,'/api/stripe/webhook',{method:'POST',body,headers:{'stripe-signature':await hmacHeader(body,'wrong',stamp)},now})).status,400);
 assert.equal(await verifyStripeSignature(body,await hmacHeader(body,env.STRIPE_WEBHOOK_SECRET,stamp-600),env.STRIPE_WEBHOOK_SECRET,now),false);
});

test('concurrent verification consumes one email code once',async()=>{
 const store=new MemoryStore(),email='race@example.com';
 const {devCode}=await (await call(store,'/api/auth/start',{method:'POST',body:{email}})).json();
 const replies=await Promise.all([0,1].map(()=>call(store,'/api/auth/verify',{method:'POST',body:{email,code:devCode}})));
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,401]);assert.equal(store.sessions.size,1);assert.equal(store.users.size,1);
});

test('five failed attempts invalidate a code even when requests overlap',async()=>{
 const store=new MemoryStore(),email='attempts@example.com';
 const {devCode}=await (await call(store,'/api/auth/start',{method:'POST',body:{email}})).json();
 const wrong=devCode==='000000'?'111111':'000000';
 const replies=await Promise.all(Array.from({length:5},()=>call(store,'/api/auth/verify',{method:'POST',body:{email,code:wrong}})));
 assert.ok(replies.every(r=>r.status===401));
 assert.equal((await call(store,'/api/auth/verify',{method:'POST',body:{email,code:devCode}})).status,401);
});

test('the AI models and engines need a valid licence cookie',async()=>{
 const store=new MemoryStore(),session=await signIn(store);
 const assets={fetch:async()=>new Response('model bytes')},e={...env,ASSETS:assets};
 assert.equal((await call(store,'/ai/models/lama.onnx',{e})).status,402);
 assert.equal((await call(store,'/index.html',{e})).status,200,'the page itself loads, to show sign-in');
 const cookie=(await call(store,'/api/licence',{token:session,e})).headers.get('set-cookie').split(';')[0];
 assert.equal(await (await call(store,'/ai/models/lama.onnx',{e,headers:{cookie}})).text(),'model bytes');
 assert.equal((await call(store,'/ocr/lang/eng.traineddata.gz',{e,headers:{cookie},now:T0+8*DAY})).status,402,'not after the trial');
});

// Exercise production SQL and transactional rollback, rather than only MemoryStore.
// node:sqlite is available on current Node 22+ releases; older 22.x can run the
// handler suite and must run this persistence gate on a current supported Node.
const sqlite=await import('node:sqlite').catch(()=>null);
function sqliteD1(db){
 const prepare=sql=>{
  let values=[];
  const run=()=>{
   const results=db.prepare(sql).all(...values);
   return {results,meta:{changes:Number(db.prepare('SELECT changes() AS n').get().n)}};
  };
  return {bind(...next){values=next;return this;},first:async()=>run().results[0]??null,all:async()=>run(),run:async()=>run(),execute:run};
 };
 return {prepare,batch:async statements=>{
  db.exec('BEGIN');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }};
}

test('D1 migration preserves accounts; fenced billing writes and event acknowledgement are atomic',{skip:!sqlite},async t=>{
 const db=new sqlite.DatabaseSync(':memory:');t.after(()=>db.close());
 const schema=await readFile(new URL('../cloud/schema.sql',import.meta.url),'utf8');
 const migration=await readFile(new URL('../cloud/migrations/0001_billing_safety.sql',import.meta.url),'utf8');
 db.exec(schema.split('-- Durable checkout')[0]);
 const store=new D1Store(sqliteD1(db)),user={id:'u_sql',email:'sql@example.com',created_at:T0,trial_ends:T0+7*DAY};
 await store.createUser(user);await store.addSession('session_hash',user.id,T0+DAY);
 db.exec(migration);db.exec(migration);
 assert.deepEqual({...await store.userById(user.id)},{...user,stripe_customer:null,subscription_id:null,subscription_status:null,paid_until:null});
 assert.equal((await store.session('session_hash')).user_id,user.id);
 const old=await store.acquireBilling(user.id,'lease_old',T0,T0+1000);assert.ok(old);
 assert.equal(await store.acquireBilling(user.id,'blocked',T0,T0+1000),undefined);
 const paid={stripe_customer:'cus_1',subscription_id:'sub_1',subscription_status:'active',paid_until:T0+30*DAY};
 assert.equal(await store.saveBilling(user.id,'lease_old',T0,paid,emptyCheckout(),'evt_sql'),true);
 assert.equal(await store.stripeEventProcessed('evt_sql'),true);

 assert.ok(await store.acquireBilling(user.id,'lease_new',T0+2000,T0+3000));
 assert.equal(await store.saveBilling(user.id,'lease_old',T0+2000,{...paid,subscription_status:'canceled'},emptyCheckout(),'evt_stale'),false);
 assert.equal(await store.stripeEventProcessed('evt_stale'),false);
 await store.releaseBilling(user.id,'lease_old');
 assert.equal(await store.acquireBilling(user.id,'still_blocked',T0+2000,T0+3000),undefined,'an expired owner cannot release a newer lease');
 await assert.rejects(store.saveBilling(user.id,'lease_new',T0+2000,{...paid,subscription_status:'canceled'},emptyCheckout(),'evt_sql'));
 assert.equal((await store.userById(user.id)).subscription_status,'active','duplicate event insertion rolls the entitlement write back');
 assert.equal(await store.saveBilling(user.id,'lease_new',T0+2000,{...paid,subscription_status:'canceled'},emptyCheckout(),'evt_sql_next'),true);

 const fresh=new sqlite.DatabaseSync(':memory:');t.after(()=>fresh.close());fresh.exec(schema);fresh.exec(migration);
 for(const table of ['billing_state','stripe_events'])assert.deepEqual(fresh.prepare('PRAGMA table_info('+table+')').all(),db.prepare('PRAGMA table_info('+table+')').all());
});

test('D1-backed sign-in, checkout and signed webhook survive duplicate requests',{skip:!sqlite},async t=>{
 const stripe=fakeStripe(t),db=new sqlite.DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(await readFile(new URL('../cloud/schema.sql',import.meta.url),'utf8'));
 const store=new D1Store(sqliteD1(db)),email='d1@example.com';
 const {devCode}=await (await call(store,'/api/auth/start',{method:'POST',body:{email}})).json();
 const verified=await Promise.all([0,1].map(()=>call(store,'/api/auth/verify',{method:'POST',body:{email,code:devCode}})));
 assert.deepEqual(verified.map(r=>r.status).sort(),[200,401]);
 const {session}=await verified.find(r=>r.status===200).json();
 const user=await store.userByEmail(email);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
 assert.equal((await call(store,'/api/checkout',{method:'POST',token:session})).status,200);
 assert.equal((await call(store,'/api/checkout',{method:'POST',token:session})).status,200);
 assert.equal(checkoutCalls(stripe).length,1);
 stripe.subscriptions=[subscription(user)];
 assert.equal((await webhook(store,'evt_d1','customer.subscription.created',stripe.subscriptions[0])).status,200);
 assert.equal((await webhook(store,'evt_d1','customer.subscription.created',stripe.subscriptions[0])).status,200);
 assert.equal((await store.userById(user.id)).subscription_status,'active');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,1);
});

test('the apps call across origins and download models with the licence as a bearer token',async()=>{
 const store=new MemoryStore(),session=await signIn(store),e={...env,ASSETS:{fetch:async()=>new Response('model bytes')}};
 const preflight=await call(store,'/api/licence',{method:'OPTIONS',headers:{origin:'capacitor://localhost','access-control-request-headers':'authorization'},e});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'capacitor://localhost');assert.match(preflight.headers.get('access-control-allow-headers'),/authorization/);
 assert.equal((await call(store,'/api/licence',{method:'OPTIONS',headers:{origin:'https://evil.example'},e})).status,403,'other sites are refused');
 const reply=await call(store,'/api/licence',{token:session,headers:{origin:'https://localhost'},e}),{licence}=await reply.json();
 assert.equal(reply.headers.get('access-control-allow-origin'),'https://localhost');
 assert.equal(await (await call(store,'/ai/models/lama.onnx',{e,token:licence,headers:{origin:'https://localhost'}})).text(),'model bytes');
 assert.equal((await call(store,'/ai/models/lama.onnx',{e,token:session})).status,402,'a session token is not a licence');
 assert.equal((await call(store,'/api/licence',{token:session,headers:{origin:'https://evil.example'},e})).headers.get('access-control-allow-origin'),null);
});

test('deleting the account removes the user, their sessions and their Stripe customer',async()=>{
 const store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0];await store.updateUser(user.id,{stripe_customer:'cus_9'});
 const real=globalThis.fetch,sent=[];globalThis.fetch=async(url,init)=>{sent.push({url:String(url),method:init.method});return new Response('{"deleted":true}',{status:200});};
 try{assert.equal((await call(store,'/api/account/delete',{method:'POST',token:session})).status,200);}finally{globalThis.fetch=real;}
 assert.deepEqual(sent,[{url:'https://api.stripe.com/v1/customers/cus_9',method:'DELETE'}]);
 assert.equal(store.users.size,0);assert.equal(store.sessions.size,0);
 assert.equal((await call(store,'/api/licence',{token:session})).status,401,'signed out everywhere');
 assert.equal((await call(store,'/api/account/delete',{method:'POST'})).status,401);
 // Only a hash of the email is kept, and signing up again keeps the old trial end.
 assert.ok(![...store.trials.keys()].some(k=>k.includes('alex')));
 const back=await signIn(store,'alex@example.com',T0+20*DAY);
 assert.equal((await (await call(store,'/api/licence',{token:back,now:T0+20*DAY})).json()).status,'expired','no second trial');
});

test('D1 account deletion removes dependent billing records and retains the original trial',{skip:!sqlite},async t=>{
 const db=new sqlite.DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('PRAGMA foreign_keys=ON');
 db.exec(await readFile(new URL('../cloud/schema.sql',import.meta.url),'utf8'));
 const migration=await readFile(new URL('../cloud/migrations/0003_used_trials.sql',import.meta.url),'utf8');
 db.exec(migration);db.exec(migration);
 const store=new D1Store(sqliteD1(db)),session=await signIn(store),user=await store.userByEmail('alex@example.com');
 const other={id:'other',email:'other@example.com',created_at:T0,trial_ends:T0+7*DAY};await store.createUser(other);
 for(const u of [user,other]){
  assert.ok(await store.acquireBilling(u.id,'delete_fixture',T0,T0+DAY));
  await store.saveBilling(u.id,'delete_fixture',T0,{stripe_customer:'cus_'+u.id,subscription_status:'active',paid_until:T0+30*DAY},emptyCheckout(),'evt_'+u.id);
  await store.addCode({email:u.email,hash:'code_'+u.id,created_at:T0,expires:T0+DAY,attempts:0});
  db.prepare('INSERT INTO payment_receipts VALUES (?,?,?,?,?,?)').run('in_'+u.id,u.id,'sub_'+u.id,T0,200,'eur');
 }
 const real=globalThis.fetch;t.after(()=>{globalThis.fetch=real;});
 globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.stripe.com/v1/customers/cus_'+user.id);assert.equal(init.method,'DELETE');return Response.json({deleted:true});};
 assert.equal((await call(store,'/api/account/delete',{method:'POST',token:session})).status,200);
 assert.equal(await store.userById(user.id),undefined);
 for(const table of ['billing_state','stripe_events','sessions','payment_receipts']){
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(user.id).n,0,table);
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM codes WHERE email=?').get(user.email).n,0);
 assert.ok(await store.userById(other.id));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_receipts WHERE user_id=?').get(other.id).n,1);
 const back=await signIn(store,user.email,T0+20*DAY);
 assert.equal((await (await call(store,'/api/licence',{token:back,now:T0+20*DAY})).json()).status,'expired');
});
