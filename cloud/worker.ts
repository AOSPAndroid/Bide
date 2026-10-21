// bide licence server: email sign-in codes, a 7-day trial from sign-up, Stripe
// Checkout (cards, Apple Pay, Google Pay) and the customer portal, Stripe
// webhooks, signed licences for the app, and licence-gated heavy assets.
// Written as a standard fetch handler (Cloudflare Workers); see cloud/README.md.
import {signLicence,verifyLicence,importPrivateKey,importPublicKey,base64url,type Licence} from '../src/licence';
import {D1Store,type Store,type User} from './store';

export type Env={
 DB?:unknown;                      // D1 database (cloud/schema.sql)
 ASSETS?:{fetch(request:Request):Promise<Response>}; // the built app, when served by this worker
 APP_URL:string;                   // e.g. https://bide.example
 LICENCE_PRIVATE_KEY:string;       // JWK (JSON) from `node cloud/keys.mjs`
 STRIPE_SECRET_KEY?:string;
 STRIPE_PRICE_ID?:string;          // the €2/month price
 STRIPE_WEBHOOK_SECRET?:string;
 STRIPE_AUTOMATIC_TAX?:string;     // "1" to let Stripe Tax add VAT
 RESEND_API_KEY?:string;           // email delivery for sign-in codes
 MAIL_FROM?:string;                // e.g. "bide <login@bide.example>"
 TRIAL_DAYS?:string;               // default 7
 DEV_SHOW_CODE?:string;            // "1" only for local testing: return the code instead of emailing it
};

const DAY=86400000,LICENCE_DAYS=3,CODE_MINUTES=10,SESSION_DAYS=90;
// Paths of the app that need a licence: the AI models, OCR data, Office and diagram engines.
export const gatedPaths=[/^\/ai\//,/^\/ocr\//,/^\/office\//,/^\/diagrams\/runtime\//];

const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...headers}});
const fail=(status:number,error:string)=>json({error},status);
const sha256=async(text:string)=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
const randomToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const sixDigits=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
const normalEmail=(value:unknown)=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())&&value.length<=254?value.trim().toLowerCase():undefined;

// What the user may do now. A paid subscription counts until the end of the
// period paid for; past_due keeps a week's grace while Stripe retries.
export function licenceFor(u:User,now:number):Licence{
 const until=u.paid_until??0,s=u.subscription_status??'';
 const paid=(['active','trialing'].includes(s)&&until>now)||(s==='past_due'&&until+7*DAY>now);
 const status=paid?'active':now<u.trial_ends?'trial':'expired';
 const exp=status==='active'?now+LICENCE_DAYS*DAY:status==='trial'?Math.min(now+LICENCE_DAYS*DAY,u.trial_ends):now;
 return {sub:u.id,email:u.email,status,trialEnds:u.trial_ends,...(until?{paidUntil:until}:{}),exp};
}

async function stripe(env:Env,path:string,params:Record<string,string>){
 if(!env.STRIPE_SECRET_KEY)throw new Error('Payments are not configured.');
 const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:'POST',headers:{authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
 const body=await response.json() as {url?:string;error?:{message?:string}};
 if(!response.ok)throw new Error(body.error?.message||`Stripe error ${response.status}`);
 return body;
}

// Stripe-Signature: "t=<seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>", within 5 minutes.
export async function verifyStripeSignature(body:string,header:string|null,secret:string,now=Date.now()){
 if(!header)return false;
 const parts=Object.fromEntries(header.split(',').map(p=>p.split('=') as [string,string])),t=Number(parts.t);
 const signatures=header.split(',').filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
 if(!t||!signatures.length||Math.abs(now/1000-t)>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${body}`)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return signatures.some(s=>s.length===mac.length&&[...s].reduce((d,c,i)=>d|(c.charCodeAt(0)^mac.charCodeAt(i)),0)===0);
}

async function sendCode(env:Env,email:string,code:string){
 if(!env.RESEND_API_KEY||!env.MAIL_FROM)throw new Error('Email sign-in is not configured.');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},
  body:JSON.stringify({from:env.MAIL_FROM,to:email,subject:`Your bide sign-in code: ${code}`,text:`Your bide sign-in code is ${code}. It expires in ${CODE_MINUTES} minutes.\n\nIf you did not ask for it, ignore this email.`})});
 if(!response.ok)throw new Error('The sign-in email could not be sent. Try again in a minute.');
}

async function signedIn(request:Request,store:Store,now:number){
 const token=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token)return undefined;
 const hash=await sha256(token),session=await store.session(hash);
 if(!session||session.expires<now)return undefined;
 return {user:await store.userById(session.user_id),hash};
}

const cookie=(token:string,exp:number,now:number)=>`bide_licence=${token}; Path=/; Max-Age=${Math.max(0,Math.floor((exp-now)/1000))}; Secure; HttpOnly; SameSite=Lax`;
const readCookie=(request:Request)=>/(?:^|;\s*)bide_licence=([^;]+)/.exec(request.headers.get('cookie')??'')?.[1];

export async function handle(request:Request,env:Env,store:Store,now=Date.now()):Promise<Response>{
 const url=new URL(request.url),path=url.pathname,post=request.method==='POST';
 const privateKey=()=>importPrivateKey(JSON.parse(env.LICENCE_PRIVATE_KEY));
 try{
  if(path==='/api/auth/start'&&post){
   const email=normalEmail(((await request.json().catch(()=>({}))) as {email?:unknown}).email);if(!email)return fail(400,'Enter a valid email address.');
   const recent=(await store.codes(email)).filter(c=>c.created_at>now-3600000);
   if(recent.length>=5)return fail(429,'Too many codes requested. Try again in an hour.');
   const code=sixDigits();await store.addCode({email,hash:await sha256(`${email}:${code}`),expires:now+CODE_MINUTES*60000,attempts:0,created_at:now});
   if(env.DEV_SHOW_CODE==='1')return json({sent:true,devCode:code});
   await sendCode(env,email,code);return json({sent:true});
  }
  if(path==='/api/auth/verify'&&post){
   const body=await request.json().catch(()=>({})) as {email?:unknown;code?:unknown},email=normalEmail(body.email),code=typeof body.code==='string'?body.code.trim():'';
   if(!email||!/^\d{6}$/.test(code))return fail(400,'Enter the 6-digit code from the email.');
   const hash=await sha256(`${email}:${code}`),codes=(await store.codes(email)).filter(c=>c.expires>now&&c.attempts<5);
   const match=codes.find(c=>c.hash===hash);
   if(!match){for(const c of codes)await store.recordAttempt(email,c.hash);return fail(401,'That code is wrong or has expired.');}
   await store.deleteCodes(email);
   let user=await store.userByEmail(email);
   // The trial starts at the first sign-in and belongs to the email address.
   if(!user){user={id:crypto.randomUUID(),email,created_at:now,trial_ends:now+Number(env.TRIAL_DAYS||7)*DAY};await store.createUser(user);}
   const session=randomToken();await store.addSession(await sha256(session),user.id,now+SESSION_DAYS*DAY);
   return json({session});
  }
  if(path==='/api/licence'&&request.method==='GET'){
   const auth=await signedIn(request,store,now);if(!auth?.user)return fail(401,'Sign in again.');
   const licence=licenceFor(auth.user,now),token=await signLicence(licence,await privateKey());
   return json({licence:token,status:licence.status,trialEnds:licence.trialEnds,paidUntil:licence.paidUntil??null,email:licence.email},200,{'set-cookie':cookie(token,licence.exp,now)});
  }
  if(path==='/api/logout'&&post){const auth=await signedIn(request,store,now);if(auth)await store.deleteSession(auth.hash);return json({ok:true},200,{'set-cookie':cookie('',now,now)});}
  if(path==='/api/checkout'&&post){
   const auth=await signedIn(request,store,now),u=auth?.user;if(!u)return fail(401,'Sign in again.');
   if(!env.STRIPE_PRICE_ID)return fail(503,'Payments are not configured.');
   const params:Record<string,string>={mode:'subscription','line_items[0][price]':env.STRIPE_PRICE_ID,'line_items[0][quantity]':'1',
    success_url:`${env.APP_URL}/?subscribed=1`,cancel_url:`${env.APP_URL}/`,client_reference_id:u.id,'subscription_data[metadata][user_id]':u.id,allow_promotion_codes:'true',billing_address_collection:'auto'};
   if(u.stripe_customer){params.customer=u.stripe_customer;if(env.STRIPE_AUTOMATIC_TAX==='1')params['customer_update[address]']='auto';}else params.customer_email=u.email;
   if(env.STRIPE_AUTOMATIC_TAX==='1')params['automatic_tax[enabled]']='true';
   return json({url:(await stripe(env,'checkout/sessions',params)).url});
  }
  if(path==='/api/portal'&&post){
   const auth=await signedIn(request,store,now),u=auth?.user;if(!u)return fail(401,'Sign in again.');
   if(!u.stripe_customer)return fail(400,'There is no subscription to manage yet.');
   return json({url:(await stripe(env,'billing_portal/sessions',{customer:u.stripe_customer,return_url:`${env.APP_URL}/`})).url});
  }
  if(path==='/api/stripe/webhook'&&post){
   const body=await request.text();
   if(!env.STRIPE_WEBHOOK_SECRET||!await verifyStripeSignature(body,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET,now))return fail(400,'Bad signature.');
   const event=JSON.parse(body) as {type:string;data:{object:Record<string,any>}},o=event.data.object;
   if(event.type==='checkout.session.completed'&&o.client_reference_id)await store.updateUser(o.client_reference_id,{stripe_customer:o.customer,subscription_id:o.subscription});
   if(event.type.startsWith('customer.subscription.')){
    const user=(o.metadata?.user_id&&await store.userById(o.metadata.user_id))||(o.customer&&await store.userByCustomer(o.customer));
    // Newer API versions keep the period on the subscription item.
    const end=o.current_period_end??o.items?.data?.[0]?.current_period_end;
    if(user)await store.updateUser(user.id,{stripe_customer:o.customer,subscription_id:o.id,subscription_status:event.type==='customer.subscription.deleted'?'canceled':o.status,paid_until:end?end*1000:user.paid_until??null});
   }
   return json({received:true});
  }
  if(path.startsWith('/api/'))return fail(404,'Not found.');
  // The app itself: its heavy engines and models need a valid licence cookie.
  if(env.ASSETS){
   if(gatedPaths.some(p=>p.test(path))){
    const token=readCookie(request),key=await importPublicKey(JSON.parse(env.LICENCE_PRIVATE_KEY));
    if(!token||!await verifyLicence(token,key,now))return new Response('A bide subscription or trial is needed for this file.',{status:402});
   }
   return env.ASSETS.fetch(request);
  }
  return fail(404,'Not found.');
 }catch(e){return fail(500,e instanceof Error?e.message:'Server error.');}
}

export default {fetch:(request:Request,env:Env)=>handle(request,env,new D1Store(env.DB as never))};
