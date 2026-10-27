import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
// scripts/test-cloud.mjs builds these modules before launching the test runner.
// No test makes a live Stripe/network request.
import {handle} from '../tmp/cloud.mjs';
import {D1Store,MemoryStore} from '../tmp/cloud-store.mjs';
import {D1PaymentStore,recordPaidInvoice} from '../tmp/cloud-measurement.mjs';
import {checkout,billingPortal} from '../tmp/cloud-billing.mjs';
const schema=await readFile(new URL('../cloud/schema.sql',import.meta.url),'utf8');
const migration=await readFile(new URL('../cloud/migrations/0002_measurement.sql',import.meta.url),'utf8');
const T0=Date.UTC(2026,9,24),DAY=86400000;
const env={APP_URL:'https://bide.test/',LICENCE_PRIVATE_KEY:'{}',STRIPE_SECRET_KEY:'sk_fixture',STRIPE_PRICE_ID:'price_bide',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
const user={id:'user_bide',email:'user@example.test',created_at:T0-DAY,trial_ends:T0+6*DAY,stripe_customer:'cus_bide',subscription_id:'sub_replacement',subscription_status:'active',paid_until:T0+30*DAY};

function sqliteD1(db){
 const prepare=sql=>{
  let values=[];
  const execute=()=>({results:db.prepare(sql).all(...values),meta:{changes:Number(db.prepare('SELECT changes() AS n').get().n)}});
  return {bind(...next){values=next;return this;},first:async()=>execute().results[0]??null,all:async()=>execute(),run:async()=>execute(),execute};
 };
 return {prepare,batch:async statements=>{
  db.exec('BEGIN');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }};
}
async function database(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(schema);
 const d1=sqliteD1(db),store=new D1Store(d1);
 await store.createUser(user);await store.updateUser(user.id,user);
 return {db,d1,store,e:{...env,DB:d1},payments:new D1PaymentStore(d1)};
}
const line=(overrides={})=>({id:'il_bide',amount:200,currency:'eur',price:{id:'price_bide'},subscription:'sub_original',discount_amounts:[],...overrides});
const invoice=(overrides={})=>({id:'in_bide',customer:'cus_bide',subscription:'sub_original',status:'paid',paid:true,amount_paid:200,currency:'eur',status_transitions:{paid_at:T0/1000},lines:{data:[line()],has_more:false},...overrides});
const event=(object=invoice(),overrides={})=>({id:'evt_paid',type:'invoice.paid',data:{object},...overrides});
async function signature(body,secret){
 const at=Math.floor(T0/1000),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${at}.${body}`))).toString('hex');
 return `t=${at},v1=${mac}`;
}
async function webhook(db,eventObject,secret=env.STRIPE_WEBHOOK_SECRET){
 const body=JSON.stringify(eventObject);
 return handle(new Request('https://bide.test/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':await signature(body,secret)},body}),db.e,db.store,T0);
}
function stripe(t,respond){
 const original=globalThis.fetch,requests=[];
 t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,options={})=>{
  const parsed=new URL(url),headers=new Headers(options.headers);
  assert.equal(parsed.origin,'https://api.stripe.com');
  assert.equal(headers.get('stripe-version'),'2025-02-24.acacia');
  const request={path:parsed.pathname.replace('/v1/',''),params:options.method==='POST'?new URLSearchParams(options.body):parsed.searchParams,method:options.method??'GET'};
  requests.push(request);
  const body=await respond(request);
  return body instanceof Response?body:new Response(JSON.stringify(body),{status:200});
 };
 return requests;
}
const count=db=>db.prepare('SELECT COUNT(*) AS n FROM payment_receipts').get().n;

test('verified paid invoices persist once across duplicate events without changing entitlements',async t=>{
 const db=await database(t),before=await db.store.userById(user.id);
 const requests=stripe(t,({path})=>{assert.equal(path,'invoices/in_bide');return invoice();});
 assert.equal((await webhook(db,event())).status,200);
 assert.equal((await webhook(db,event())).status,200);
 assert.equal((await webhook(db,event(invoice(),{id:'evt_distinct_same_invoice'}))).status,200);
 assert.equal(count(db.db),1);assert.equal(requests.length,1);
 assert.deepEqual({...db.db.prepare('SELECT * FROM payment_receipts').get()},
  {invoice_id:'in_bide',user_id:user.id,subscription_id:'sub_original',paid_at:T0,amount_paid:200,currency:'eur'});
 assert.deepEqual(await db.store.userById(user.id),before,'old invoice does not replace current subscription');
 assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n,0,'payment receipts do not consume entitlement event IDs');
});

test('a forged webhook cannot call Stripe or record a payment',async t=>{
 const db=await database(t),requests=stripe(t,()=>{throw new Error('Must not fetch');});
 assert.equal((await webhook(db,event(),'wrong_secret')).status,400);
 assert.equal(requests.length,0);assert.equal(count(db.db),0);
});

test('zero, unpaid, unrelated, fully discounted and unowned invoices are excluded',async t=>{
 const db=await database(t);let authoritative=invoice();
 const requests=stripe(t,()=>authoritative);
 for(const changes of [
  {amount_paid:0}, {status:'open'}, {paid:false}, {subscription:null},
  {lines:{data:[line({price:'price_other'})],has_more:false}},
  {lines:{data:[line({amount:0}),line({id:'il_other',amount:500,price:'price_other'})],has_more:false}},
  {lines:{data:[line({discount_amounts:[{amount:200}]}),line({id:'il_other',amount:500,price:'price_other'})],has_more:false}}
 ]){
  authoritative=invoice(changes);
  assert.equal((await webhook(db,event())).status,200);
  assert.equal(count(db.db),0);
 }
 const requested=requests.length;
 assert.equal((await webhook(db,event(invoice({customer:'cus_unknown',metadata:{user_id:user.id}})))).status,200);
 assert.equal(requests.length,requested,'metadata cannot attach an unowned customer');
 assert.equal(count(db.db),0);
});

test('all invoice pages are checked and newer nested price/subscription fields are accepted',async t=>{
 const db=await database(t),payload=invoice({subscription:undefined,parent:{subscription_details:{subscription:'sub_original'}},
  lines:{data:[line({id:'il_other',price:'price_other'})],has_more:true}});
 const requests=stripe(t,({path,params})=>{
  if(path==='invoices/in_bide')return payload;
  assert.equal(path,'invoices/in_bide/lines');assert.equal(params.get('starting_after'),'il_other');
  return {data:[line({price:undefined,subscription:undefined,pricing:{price_details:{price:'price_bide'}},parent:{subscription_item_details:{subscription:'sub_original'}}})],has_more:false};
 });
 assert.equal((await webhook(db,event())).status,200);assert.equal(count(db.db),1);assert.equal(requests.length,2);
});

test('Stripe failures and incomplete line pages remain retryable',async t=>{
 const db=await database(t);let fail=true,malformed=false;
 stripe(t,()=>fail?new Response('unavailable',{status:503}):malformed?invoice({lines:{data:[],has_more:true}}):invoice());
 assert.equal((await webhook(db,event())).status,503);assert.equal(count(db.db),0);
 fail=false;malformed=true;
 assert.equal((await webhook(db,event())).status,503);assert.equal(count(db.db),0);
 malformed=false;
 assert.equal((await webhook(db,event())).status,200);assert.equal(count(db.db),1);
});

test('receipt write failure retries the same invoice without acknowledging it',async t=>{
 const db=await database(t),original=db.d1.prepare;let fail=true;
 db.d1.prepare=sql=>{if(fail&&sql.includes('INSERT INTO payment_receipts'))throw new Error('Fixture DB outage');return original(sql);};
 stripe(t,()=>invoice());
 assert.equal((await webhook(db,event())).status,503);assert.equal(count(db.db),0);
 assert.equal(await db.store.stripeEventProcessed('evt_paid'),false);
 // Other non-entitlement event types never touch the failed measurement table.
 assert.equal((await webhook(db,event(invoice(),{type:'invoice.payment_failed'}))).status,200);
 fail=false;
 assert.equal((await webhook(db,event())).status,200);assert.equal(count(db.db),1);
});

test('the receipt write rechecks customer ownership and direct non-payment events are ignored',async t=>{
 const db=await database(t),receipt={invoice_id:'in_race',user_id:user.id,subscription_id:'sub_original',paid_at:T0,amount_paid:200,currency:'eur'};
 await db.store.updateUser(user.id,{stripe_customer:'cus_changed'});
 await assert.rejects(db.payments.record(receipt,'cus_bide'),error=>error.status===503);
 assert.equal(count(db.db),0);
 assert.equal(await recordPaidInvoice(env,db.store,db.payments,event(invoice(),{type:'checkout.session.completed'}),()=>{throw new Error('Must not fetch');}),'ignored');
});

test('delayed invoices are classified by payment time rather than delivery order',async t=>{
 const db=await database(t),later=invoice({id:'in_later',status_transitions:{paid_at:(T0+DAY)/1000}}),earlier=invoice({id:'in_earlier',status_transitions:{paid_at:T0/1000}});
 stripe(t,({path})=>path==='invoices/in_later'?later:earlier);
 assert.equal((await webhook(db,event(later,{id:'evt_later'}))).status,200);
 assert.equal((await webhook(db,event(earlier,{id:'evt_earlier'}))).status,200);
 const rows=db.db.prepare('SELECT invoice_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY paid_at, invoice_id) AS payment_number FROM payment_receipts ORDER BY paid_at, invoice_id').all();
 assert.deepEqual(rows.map(row=>({...row})),[{invoice_id:'in_earlier',payment_number:1},{invoice_id:'in_later',payment_number:2}]);
});

test('additive measurement migration is repeatable and preserves account and receipt data',async t=>{
 const db=await database(t),before=await db.store.userById(user.id);
 await db.payments.record({invoice_id:'in_existing',user_id:user.id,subscription_id:'sub_original',paid_at:T0,amount_paid:200,currency:'eur'},'cus_bide');
 db.db.exec(migration);db.db.exec(migration);
 assert.equal(count(db.db),1);assert.deepEqual(await db.store.userById(user.id),before);
 const legacy=new DatabaseSync(':memory:');t.after(()=>legacy.close());legacy.exec(schema.split('-- Positive, verified')[0]);legacy.exec(migration);
 assert.deepEqual(legacy.prepare('PRAGMA table_info(payment_receipts)').all(),db.db.prepare('PRAGMA table_info(payment_receipts)').all());
});

test('Checkout and billing portal return to the editor under /app/',async t=>{
 const store=new MemoryStore();await store.createUser(user);
 const requests=stripe(t,({path,params})=>{
  if(path==='subscriptions')return {data:[],has_more:false};
  if(path==='checkout/sessions')return {id:'cs_bide',customer:'cus_bide',status:'open',url:'https://checkout.stripe.com/c/pay/fixture',expires_at:Number(params.get('expires_at'))};
  if(path==='billing_portal/sessions')return {url:'https://billing.stripe.com/p/session/fixture'};
  throw new Error('Unexpected fixture request '+path);
 });
 await checkout(env,store,user.id,T0);await billingPortal(env,'cus_bide');
 const started=requests.find(request=>request.path==='checkout/sessions');
 assert.equal(started.params.get('success_url'),'https://bide.test/app/?subscribed=1');
 assert.equal(started.params.get('cancel_url'),'https://bide.test/app/');
 assert.equal(requests.find(request=>request.path==='billing_portal/sessions').params.get('return_url'),'https://bide.test/app/');
});
