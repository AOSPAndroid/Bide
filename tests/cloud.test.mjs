import {test} from 'node:test';import assert from 'node:assert/strict';
import {handle,licenceFor,verifyStripeSignature} from '../tmp/cloud.mjs';
import {MemoryStore} from '../tmp/cloud-store.mjs';
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

test('checkout and webhooks: paying through Stripe unlocks the app',async()=>{
 const store=new MemoryStore(),session=await signIn(store),user=[...store.users.values()][0],sent=[];
 const real=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{sent.push({url:String(url),body:String(init.body)});return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/x'}),{status:200});};
 try{
  const reply=await (await call(store,'/api/checkout',{method:'POST',token:session})).json();
  assert.equal(reply.url,'https://checkout.stripe.com/c/pay/x');
  const params=new URLSearchParams(sent[0].body);
  assert.equal(sent[0].url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(params.get('mode'),'subscription');assert.equal(params.get('line_items[0][price]'),'price_2eur');assert.equal(params.get('client_reference_id'),user.id);assert.equal(params.get('customer_email'),'alex@example.com');
 }finally{globalThis.fetch=real;}
 const now=T0+8*DAY,t=Math.floor(now/1000);
 const completed=JSON.stringify({type:'checkout.session.completed',data:{object:{client_reference_id:user.id,customer:'cus_1',subscription:'sub_1'}}});
 assert.equal((await call(store,'/api/stripe/webhook',{method:'POST',body:completed,headers:{'stripe-signature':await hmacHeader(completed,'whsec_test',t)},now})).status,200);
 const updated=JSON.stringify({type:'customer.subscription.updated',data:{object:{id:'sub_1',customer:'cus_1',status:'active',metadata:{user_id:user.id},items:{data:[{current_period_end:Math.floor((now+30*DAY)/1000)}]}}}});
 assert.equal((await call(store,'/api/stripe/webhook',{method:'POST',body:updated,headers:{'stripe-signature':await hmacHeader(updated,'whsec_test',t)},now})).status,200);
 const body=await (await call(store,'/api/licence',{token:session,now})).json();
 assert.equal(body.status,'active');assert.ok(await verifyLicence(body.licence,publicKey,now));
 // A forged or stale webhook is refused.
 assert.equal((await call(store,'/api/stripe/webhook',{method:'POST',body:updated,headers:{'stripe-signature':await hmacHeader(updated,'wrong',t)},now})).status,400);
 assert.equal(await verifyStripeSignature(updated,await hmacHeader(updated,'whsec_test',t-600),'whsec_test',now),false);
 // Cancelling ends access.
 const deleted=JSON.stringify({type:'customer.subscription.deleted',data:{object:{id:'sub_1',customer:'cus_1',status:'canceled',items:{data:[{current_period_end:Math.floor(now/1000)}]}}}});
 await call(store,'/api/stripe/webhook',{method:'POST',body:deleted,headers:{'stripe-signature':await hmacHeader(deleted,'whsec_test',t)},now});
 assert.equal((await (await call(store,'/api/licence',{token:session,now:now+DAY})).json()).status,'expired');
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
