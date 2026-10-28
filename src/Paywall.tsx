// Sign-in, the 7-day trial and the subscription, around the whole editor.
// Off unless the build sets VITE_PAYWALL=1 (npm run build:saas). The licence
// server (cloud/worker.ts) signs a licence the app checks with its public key,
// so the editor also opens offline for up to three days. The editor stays
// mounted when a licence runs out mid-session, so autosave keeps the work.
// The iOS and Android apps (VITE_APP_STORE=1) only sign in to accounts: no
// prices, no purchase and no pointer to one (App Store 3.1.3(f), Google
// Play's consumption-only apps); subscribing happens on the website.
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {verifyLicence,importPublicKey,trialDaysLeft,type Licence} from './licence';
import {trackMeasurement} from './measurement';

const env=import.meta.env as Record<string,string|undefined>;
// Read straight from import.meta.env so the build drops the branches it does not use.
export const PAYWALL=import.meta.env.VITE_PAYWALL==='1',APP_STORE=import.meta.env.VITE_APP_STORE==='1';
const API=(env.VITE_LICENCE_API??'').replace(/\/$/,''),PRICE=APP_STORE?'':env.VITE_PRICE_LABEL||'€2 per month';
const store={get:(k:string)=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k:string,v:string|null)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}}};
const SESSION='bide-session',LICENCE='bide-licence';

async function api<T>(path:string,init:RequestInit={},session=store.get(SESSION)):Promise<T>{
 const response=await fetch(API+path,{...init,credentials:'include',headers:{...(init.body?{'content-type':'application/json'}:{}),...(session?{authorization:`Bearer ${session}`}:{}),...init.headers}});
 const body=await response.json().catch(()=>({})) as T&{error?:string};
 if(!response.ok)throw Object.assign(new Error(body.error||`Request failed (${response.status})`),{status:response.status});
 return body;
}
let key:Promise<CryptoKey>|undefined;
const publicKey=()=>key??=importPublicKey(JSON.parse(env.VITE_LICENCE_PUBLIC_KEY||'{}'));
const checked=async(token:string|null)=>token?verifyLicence(token,await publicKey()):undefined;

type State={step:'checking'|'email'|'code'|'ready'|'expired'|'offline';licence?:Licence;email?:string;error?:string;busy?:boolean;devCode?:string};

export default function Paywall({children}:{children:ReactNode}){
 if(!PAYWALL)return <>{children}</>;
 return <Gate>{children}</Gate>;
}

function Gate({children}:{children:ReactNode}){
 const [s,setS]=useState<State>({step:'checking'}),[email,setEmail]=useState(''),[code,setCode]=useState('');
 const patch=(p:Partial<State>)=>setS(x=>({...x,...p}));
 // Ask the server for a fresh licence; fall back to the stored one offline.
 const refresh=useCallback(async(quiet=false)=>{
  const cached=await checked(store.get(LICENCE));
  if(cached&&quiet)patch({step:'ready',licence:cached});
  if(!store.get(SESSION)){setS({step:'email'});return;}
  try{
   const reply=await api<{licence:string;status:string}>('/api/licence');
   store.set(LICENCE,reply.licence);const licence=await checked(reply.licence);
   setS(licence?{step:'ready',licence}:{step:'expired',email:(await decode(reply.licence))?.email});
  }catch(e){
   if((e as {status?:number}).status===401){store.set(SESSION,null);store.set(LICENCE,null);setS({step:'email'});return;}
   setS(cached?{step:'ready',licence:cached}:{step:'offline',error:e instanceof Error?e.message:String(e)});
  }
 },[]);
 useEffect(()=>{
  void refresh(true);
  // Back from Stripe: the webhook may land a few seconds after the redirect.
  if(new URLSearchParams(location.search).has('subscribed')){history.replaceState(null,'',location.pathname);let n=0;const t=setInterval(()=>{if(++n>10)clearInterval(t);void refresh();},3000);return()=>clearInterval(t);}
  const t=setInterval(()=>void refresh(),6*3600000);return()=>clearInterval(t);
 },[refresh]);
 // A licence that runs out while the editor is open.
 useEffect(()=>{if(s.step!=='ready'||!s.licence)return;const t=setTimeout(()=>void refresh(),Math.max(1000,s.licence.exp-Date.now()+1000));return()=>clearTimeout(t);},[s.step,s.licence,refresh]);

 const start=async()=>{patch({busy:true,error:undefined});try{const r=await api<{sent:boolean;devCode?:string}>('/api/auth/start',{method:'POST',body:JSON.stringify({email})},null);patch({step:'code',email,busy:false,devCode:r.devCode});if(r.devCode)setCode(r.devCode);}catch(e){patch({busy:false,error:(e as Error).message});}};
 const verify=async()=>{patch({busy:true,error:undefined});try{const r=await api<{session:string}>('/api/auth/verify',{method:'POST',body:JSON.stringify({email,code})},null);store.set(SESSION,r.session);trackMeasurement('sign_in_complete');await refresh();}catch(e){patch({busy:false,error:(e as Error).message});}};
 const checkout=async()=>{patch({busy:true,error:undefined});try{const r=await api<{url:string}>('/api/checkout',{method:'POST'});trackMeasurement('checkout_started');location.assign(r.url);}catch(e){patch({busy:false,error:(e as Error).message});}};
 const portal=async()=>{try{const r=await api<{url:string}>('/api/portal',{method:'POST'});location.assign(r.url);}catch(e){alert((e as Error).message);}};
 const signOut=async()=>{try{await api('/api/logout',{method:'POST'});}catch{}store.set(SESSION,null);store.set(LICENCE,null);setCode('');setS({step:'email'});};
 const remove=async()=>{
  if(!confirm('Delete your bide account? Any subscription is cancelled at once and cannot be restored. Files and invoices on this device are kept.'))return;
  try{await api('/api/account/delete',{method:'POST'});store.set(SESSION,null);store.set(LICENCE,null);setCode('');setS({step:'email',error:undefined});opened.current=false;alert('Your bide account has been deleted.');}catch(e){alert((e as Error).message);}
 };

 // Once open, the editor stays mounted under the paywall so nothing is lost.
 const opened=useRef(false);if(s.step==='ready')opened.current=true;
 const unlocked=s.step==='ready'||opened.current;
 const card=(body:ReactNode)=><div className="paywall" role="dialog" aria-modal="true" aria-label="bide account"><div className="paywall-card"><img src="./brand-logo.svg" alt="" className="paywall-logo"/>{body}{s.error&&<p className="paywall-error" role="alert">{s.error}</p>}</div></div>;
 return <>
  {unlocked&&children}
  {s.step==='ready'&&s.licence&&<AccountChip licence={s.licence} subscribe={checkout} manage={portal} signOut={signOut} remove={remove}/>}
  {s.step==='checking'&&card(<p className="muted">Checking your subscription…</p>)}
  {s.step==='email'&&card(<form onSubmit={e=>{e.preventDefault();void start();}}>
   {APP_STORE?<><h1>Sign in to bide</h1><p className="muted">Use the email of your bide account. A new account starts with 7 free days. Your files stay on your device.</p></>
    :<><h1>Try bide free for 7 days</h1><p className="muted">Edit images, PDFs and documents in your browser. Your files stay on your device. No card needed for the trial; then {PRICE}.</p></>}
   <label>Email<input type="email" required autoFocus aria-label="Email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
   <button disabled={s.busy}>Email me a sign-in code</button></form>)}
  {s.step==='code'&&card(<form onSubmit={e=>{e.preventDefault();void verify();}}>
   <h1>Check your email</h1><p className="muted">We sent a 6-digit code to {s.email}.</p>
   <label>Code<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus aria-label="Sign-in code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
   <button disabled={s.busy||code.length!==6}>Sign in</button><button type="button" className="secondary" onClick={()=>setS({step:'email'})}>Use another email</button></form>)}
  {s.step==='expired'&&card(APP_STORE?<>
   <h1>No active plan</h1><p className="muted">The account {s.email??''} has no active plan in bide. Your work is kept on this device.</p>
   <button onClick={()=>void refresh()}>Check again</button><button className="secondary" onClick={()=>void signOut()}>Sign out</button><button className="secondary" onClick={()=>void remove()}>Delete account</button></>:<>
   <h1>Your free trial has ended</h1><p className="muted">Subscribe to keep editing with bide: {PRICE}, cancel any time. Pay with Apple Pay, Google Pay or a card. Your work is saved in this browser.</p>
   <button disabled={s.busy} onClick={()=>void checkout()}>Subscribe</button><button className="secondary" onClick={()=>void signOut()}>Sign out{s.email?` (${s.email})`:''}</button></>)}
  {s.step==='offline'&&card(<>
   <h1>Can't check your subscription</h1><p className="muted">Connect to the internet once so bide can confirm your trial or subscription; it then works offline for up to three days.</p>
   <button onClick={()=>void refresh()}>Try again</button></>)}
 </>;
}

const decode=async(token:string)=>{try{return JSON.parse(atob(token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))) as Licence;}catch{return undefined;}};

function AccountChip({licence,subscribe,manage,signOut,remove}:{licence:Licence;subscribe:()=>void;manage:()=>void;signOut:()=>void;remove:()=>void}){
 const days=trialDaysLeft(licence);
 // On phones and touch screens the open menu draws a transparent backdrop (mobile-shell.css): a tap on it only closes the menu.
 return <details className="account-chip" onClick={e=>{if(e.target===e.currentTarget)e.currentTarget.open=false;}}><summary aria-label="Account">{licence.status==='trial'?`Trial · ${days} day${days===1?'':'s'} left`:'bide'}</summary><div>
  <span className="muted">{licence.email}</span>
  {!APP_STORE&&(licence.status==='trial'?<button onClick={subscribe}>Subscribe · {PRICE}</button>:<button onClick={manage}>Manage subscription</button>)}
  <button className="secondary" onClick={signOut}>Sign out</button>
  <button className="secondary" onClick={remove}>Delete account</button>
 </div></details>;
}
