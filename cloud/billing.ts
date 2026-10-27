// Billing operations are serialized per account and reconciled from Stripe's
// current state. Webhook snapshots and their timestamps are never entitlements.
import {emptyCheckout,type Store,type User,type CheckoutState} from './store';

export type BillingEnv={APP_URL:string;STRIPE_SECRET_KEY?:string;STRIPE_PRICE_ID?:string;STRIPE_AUTOMATIC_TAX?:string};
const DAY=86400000,LEASE_MS=60000,STRIPE_VERSION='2025-02-24.acacia';
export class BillingError extends Error{constructor(public status:number,message:string){super(message);}}
const unavailable=()=>new BillingError(503,'Payments are temporarily unavailable. Please try again.');
const idOf=(value:unknown):string|undefined=>typeof value==='string'?value:value&&typeof value==='object'&&'id' in value&&typeof value.id==='string'?value.id:undefined;

type StripeCustomer={id:string;metadata?:Record<string,string>;deleted?:boolean};
type StripeItem={id:string;price?:string|{id:string};current_period_end?:number};
type StripeSubscription={id:string;customer:string|{id:string};status:string;current_period_end?:number;metadata?:Record<string,string>;items:{data:StripeItem[];has_more?:boolean}};
type StripeSession={id:string;customer:string|{id:string};subscription?:string|{id:string}|null;status:string;url?:string|null;expires_at:number;metadata?:Record<string,string>};
type StripeList<T>={data:T[];has_more:boolean};
type RequestOptions={method?:'GET'|'POST';idempotencyKey?:string};
export type StripeClient=<T>(path:string,params?:Record<string,string>|string,options?:RequestOptions)=>Promise<T>;

function configured(env:BillingEnv){if(!env.STRIPE_SECRET_KEY||!env.STRIPE_PRICE_ID)throw new BillingError(503,'Payments are not configured.');}
export async function stripeRequest<T>(env:BillingEnv,path:string,params:Record<string,string>|string={},options:RequestOptions={}):Promise<T>{
 if(!env.STRIPE_SECRET_KEY)throw new BillingError(503,'Payments are not configured.');
 const method=options.method??'GET',body=typeof params==='string'?params:new URLSearchParams(params).toString();
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(`https://api.stripe.com/v1/${path}${method==='GET'&&body?'?'+body:''}`,{
   method,headers:{authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'stripe-version':STRIPE_VERSION,
    ...(method==='POST'?{'content-type':'application/x-www-form-urlencoded'}:{}),
    ...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})},
   ...(method==='POST'?{body}:{}),signal:controller.signal
  });
  if(!response.ok)throw unavailable();
  return await response.json() as T;
 }catch{throw unavailable();}finally{clearTimeout(timeout);}
}
async function list<T extends {id:string}>(api:StripeClient,path:string,params:Record<string,string>):Promise<T[]>{
 const items:T[]=[];let after='';
 // Bound work on unexpected accounts rather than silently truncating entitlement.
 for(let page=0;page<20;page++){
  const result=await api<StripeList<T>>(path,{...params,limit:'100',...(after?{starting_after:after}:{})});
  if(!Array.isArray(result.data)||typeof result.has_more!=='boolean')throw unavailable();
  items.push(...result.data);if(!result.has_more)return items;
  const next=result.data.at(-1)?.id;if(!next||next===after)throw unavailable();after=next;
 }
 throw unavailable();
}

type BillingContext={user:User;checkout:CheckoutState;now:()=>number;api:StripeClient;save:(eventId?:string)=>Promise<void>};
async function withBilling<T>(env:BillingEnv,store:Store,userId:string,now:number,run:(ctx:BillingContext)=>Promise<T>,busyStatus=409):Promise<T>{
 const started=Date.now(),clock=()=>now+Date.now()-started,token=crypto.randomUUID();
 const state=await store.acquireBilling(userId,token,clock(),clock()+LEASE_MS);
 if(!state)throw new BillingError(busyStatus,'Your billing update is in progress. Please try again in a moment.');
 try{
  const user=await store.userById(userId);if(!user)throw new BillingError(401,'Sign in again.');
  const renew=async()=>{const at=clock();if(!await store.renewBilling(userId,token,at,at+LEASE_MS))throw new BillingError(busyStatus,'Your billing update is in progress. Please try again in a moment.');};
  const ctx:BillingContext={user,checkout:{checkout_key:state.checkout_key,checkout_params:state.checkout_params,checkout_session:state.checkout_session,checkout_url:state.checkout_url,checkout_expires:state.checkout_expires},now:clock,
   api:async <R>(path:string,params?:Record<string,string>|string,options?:RequestOptions)=>{await renew();return stripeRequest<R>(env,path,params,options);},
   save:async(eventId?:string)=>{
    if(!await store.saveBilling(userId,token,clock(),ctx.user,ctx.checkout,eventId))throw new BillingError(busyStatus,'Your billing update is in progress. Please try again in a moment.');
   }};
  return await run(ctx);
 }finally{await store.releaseBilling(userId,token);}
}

async function ensureCustomer(ctx:BillingContext){
 if(ctx.user.stripe_customer)return ctx.user.stripe_customer;
 // Recover a customer after a successful Stripe request whose DB write failed,
 // including retries after Stripe's 24-hour idempotency retention window.
 const matches=(await list<StripeCustomer>(ctx.api,'customers',{email:ctx.user.email})).filter(c=>!c.deleted&&c.metadata?.user_id===ctx.user.id);
 if(matches.length>1)throw new BillingError(503,'Your billing account needs attention. Please contact support.');
 const customer=matches[0]??await ctx.api<StripeCustomer>('customers',{email:ctx.user.email,'metadata[user_id]':ctx.user.id},{method:'POST',idempotencyKey:'bide-customer-'+ctx.user.id});
 if(!customer.id||customer.deleted)throw unavailable();
 ctx.user={...ctx.user,stripe_customer:customer.id};await ctx.save();return customer.id;
}
const terminal=(s:StripeSubscription)=>['canceled','incomplete_expired'].includes(s.status);
async function subscriptions(ctx:BillingContext,env:BillingEnv,customer:string){
 const rows=await list<StripeSubscription>(ctx.api,'subscriptions',{customer,price:env.STRIPE_PRICE_ID!,status:'all'});
 const relevant:StripeSubscription[]=[];
 for(const row of rows){
  if(idOf(row.customer)!==customer||row.metadata?.user_id&&row.metadata.user_id!==ctx.user.id)continue;
  if(!row.items||!Array.isArray(row.items.data)||typeof row.status!=='string')throw unavailable();
  const items=row.items.has_more?await list<StripeItem>(ctx.api,'subscription_items',{subscription:row.id}):row.items.data;
  const matching=items.filter(item=>idOf(item.price)===env.STRIPE_PRICE_ID);
  if(matching.length)relevant.push({...row,items:{data:matching,has_more:false}});
 }
 return relevant;
}
function paidUntil(s:StripeSubscription){return Math.max(0,...s.items.data.map(item=>(item.current_period_end??s.current_period_end??0)*1000));}
function accessUntil(s:StripeSubscription){
 const until=paidUntil(s);return ['active','trialing'].includes(s.status)?until:s.status==='past_due'?until+7*DAY:0;
}
function applySubscriptions(ctx:BillingContext,customer:string,rows:StripeSubscription[]){
 const now=ctx.now();
 const ranked=[...rows].sort((a,b)=>{
  const aAccess=accessUntil(a)>now?accessUntil(a):0,bAccess=accessUntil(b)>now?accessUntil(b):0;
  return bAccess-aAccess||Number(terminal(a))-Number(terminal(b))||paidUntil(b)-paidUntil(a)||a.id.localeCompare(b.id);
 });
 const selected=ranked[0];
 ctx.user={...ctx.user,stripe_customer:customer,subscription_id:selected?.id??null,subscription_status:selected?.status??null,paid_until:selected?paidUntil(selected):null};
 return rows.some(s=>!terminal(s));
}
async function portal(api:StripeClient,env:BillingEnv,customer:string){
 const result=await api<{url:string}>('billing_portal/sessions',{customer,return_url:new URL('/app/',env.APP_URL).href},{method:'POST'});
 if(!result.url)throw unavailable();return {url:result.url};
}
export async function billingPortal(env:BillingEnv,customer:string){
 return portal((path,params,options)=>stripeRequest(env,path,params,options),env,customer);
}

async function pendingCheckout(ctx:BillingContext,customer:string){
 let pending:StripeSession|undefined;
 if(ctx.checkout.checkout_session)pending=await ctx.api<StripeSession>('checkout/sessions/'+encodeURIComponent(ctx.checkout.checkout_session));
 else if(ctx.checkout.checkout_key&&(ctx.checkout.checkout_expires??0)>ctx.now()){
  // The create response may have been lost after Stripe accepted it. Recover
  // its ID before deciding whether the account may start another purchase.
  pending=(await list<StripeSession>(ctx.api,'checkout/sessions',{customer})).find(s=>s.metadata?.checkout_key===ctx.checkout.checkout_key);
 }
 if(pending){
  if(idOf(pending.customer)!==customer)throw unavailable();
  ctx.checkout={...ctx.checkout,checkout_session:pending.id,checkout_url:pending.url??null,checkout_expires:pending.expires_at*1000};
  await ctx.save();
 }
 return pending;
}

export async function checkout(env:BillingEnv,store:Store,userId:string,now:number){
 configured(env);
 return withBilling(env,store,userId,now,async ctx=>{
  const customer=await ensureCustomer(ctx),rows=await subscriptions(ctx,env,customer);
  const existing=applySubscriptions(ctx,customer,rows),pending=await pendingCheckout(ctx,customer);
  if(existing){
   const operation=ctx.checkout.checkout_key;
   // A Checkout can already own an incomplete subscription while the customer
   // finishes SCA or retries an initial payment. Resume that same purchase.
   if(pending?.status==='open'&&pending.url&&pending.expires_at*1000>ctx.now()&&
      rows.filter(s=>!terminal(s)).every(s=>s.id===idOf(pending.subscription)||!!operation&&s.metadata?.checkout_key===operation)){
    await ctx.save();return {url:pending.url};
   }
   // A still-open checkout may predate a subscription created outside this flow.
   // Expire it before directing the customer to manage the existing subscription.
   if(pending?.status==='open')await ctx.api('checkout/sessions/'+encodeURIComponent(pending.id)+'/expire',{}, {method:'POST',idempotencyKey:'bide-expire-'+pending.id});
   ctx.checkout=emptyCheckout();await ctx.save();return portal(ctx.api,env,customer);
  }
  await ctx.save();
  if(pending){
   if(pending.status==='open'&&pending.expires_at*1000>ctx.now()&&pending.url)return {url:pending.url};
   if(pending.status==='complete'&&!rows.some(s=>s.id===idOf(pending.subscription)&&terminal(s)))
    throw new BillingError(503,'Your payment is being confirmed. Please try again in a moment.');
   if(pending.status!=='expired'&&pending.status!=='complete')throw unavailable();
   ctx.checkout=emptyCheckout();
  }else if(ctx.checkout.checkout_key&&(ctx.checkout.checkout_expires??0)<=ctx.now()){
   // The old attempt has an explicit Stripe expiry, so it cannot be paid after
   // its idempotency key ages out. Reconcile above before starting a new one.
   ctx.checkout=emptyCheckout();
  }
  if(!ctx.checkout.checkout_key){
   const key=crypto.randomUUID(),expires=Math.floor((ctx.now()+DAY)/1000);
   const params:Record<string,string>={mode:'subscription',customer,'line_items[0][price]':env.STRIPE_PRICE_ID!,'line_items[0][quantity]':'1',
    success_url:new URL('/app/?subscribed=1',env.APP_URL).href,cancel_url:new URL('/app/',env.APP_URL).href,client_reference_id:ctx.user.id,
    'metadata[user_id]':ctx.user.id,'metadata[checkout_key]':key,'subscription_data[metadata][user_id]':ctx.user.id,'subscription_data[metadata][checkout_key]':key,
    allow_promotion_codes:'true',billing_address_collection:'auto',expires_at:String(expires)};
   if(env.STRIPE_AUTOMATIC_TAX==='1'){params['automatic_tax[enabled]']='true';params['customer_update[address]']='auto';}
   ctx.checkout={...emptyCheckout(),checkout_key:key,checkout_expires:expires*1000,checkout_params:new URLSearchParams(params).toString()};
   // Persist the exact operation before Stripe can create anything. A timeout
   // reuses the same key AND parameters instead of creating another session.
   await ctx.save();
  }
  if(!ctx.checkout.checkout_params)throw unavailable();
  const created=await ctx.api<StripeSession>('checkout/sessions',ctx.checkout.checkout_params,{method:'POST',idempotencyKey:'bide-checkout-'+ctx.checkout.checkout_key});
  if(!created.id||!created.url||created.status!=='open'||idOf(created.customer)!==customer)throw unavailable();
  ctx.checkout={...ctx.checkout,checkout_session:created.id,checkout_url:created.url,checkout_expires:created.expires_at*1000};
  await ctx.save();return {url:created.url};
 });
}

export type StripeEvent={id:string;type:string;data:{object:Record<string,unknown>}};
export async function reconcileStripeEvent(env:BillingEnv,store:Store,event:StripeEvent,now:number){
 const isCheckout=event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded';
 if(!isCheckout&&!event.type.startsWith('customer.subscription.'))return;
 configured(env);
 if(await store.stripeEventProcessed(event.id))return;
 const object=event.data.object,customer=idOf(object.customer);
 const metadata=object.metadata as Record<string,string>|undefined;
 const userId=isCheckout?object.client_reference_id:metadata?.user_id;
 const user=(customer&&await store.userByCustomer(customer))||(typeof userId==='string'&&await store.userById(userId));
 if(!user||!customer)return; // Unrelated Stripe product/account.
 if(user.stripe_customer&&user.stripe_customer!==customer)return;
 await withBilling(env,store,user.id,now,async ctx=>{
  if(await store.stripeEventProcessed(event.id))return;
  if(ctx.user.stripe_customer&&ctx.user.stripe_customer!==customer)return;
  const rows=await subscriptions(ctx,env,customer);
  // Older installations may first learn the customer via a webhook. Require a
  // current Bide-price subscription carrying this user's metadata before adoption.
  if(!ctx.user.stripe_customer&&!rows.some(s=>s.metadata?.user_id===ctx.user.id))return;
  applySubscriptions(ctx,customer,rows);
  // Preserve pending Checkout identity until its status can be checked. An
  // unrelated active subscription must not strand a still-payable session.
  // Both writes commit together; failed Stripe reads/DB writes remain retryable.
  await ctx.save(event.id);
 },503);
}
