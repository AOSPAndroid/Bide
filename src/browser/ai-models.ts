// The local edition always uses its bundled, offline model pack. The public
// edition downloads an immutable model only when an action needs it; document
// pixels and text never leave the browser. Verify bytes before inference or
// caching, including cached copies that may have been damaged or replaced.
import manifest from '../../public/ai/manifest.json';
import {PUBLIC_DEMO,HOSTED_BUILD} from '../build-flags';
import {digest} from './crypto';

export type PinnedModel={url:string;bytes:number;sha256:string};
type ModelSource=PinnedModel&{output?:{bytes:number;sha256:string}};
export type ModelProgress={loaded:number;total:number;stage:'download'|'verify'|'prepare'};
type ModelOptions={fetch?:typeof fetch;cacheStorage?:Pick<CacheStorage,'open'>|null;onProgress?:(progress:ModelProgress)=>void;downloadTimeoutMs?:number;remote?:string;licence?:string;store?:ModelStore|null};
// Where a downloaded model is kept between visits, by address and digest.
export type ModelStore={get(key:string):Promise<Uint8Array|undefined>;put(key:string,bytes:Uint8Array):Promise<void>;delete(key:string):Promise<void>};
export const MODEL_CACHE='bide-ai-models-sha256-v1';
const downloadError='AI model download failed. Check your internet connection and try again, or choose Standard OCR.';
const accessError='An active bide trial or subscription is needed for the AI tools.';
const denied=(status:number)=>status===401||status===402||status===403;

function keyFor(source:PinnedModel){
 const key=new URL(source.url);key.searchParams.set('bide-sha256',source.sha256);return key.href;
}
async function verified(bytes:Uint8Array,source:PinnedModel,onProgress?:ModelOptions['onProgress']){
 if(bytes.byteLength!==source.bytes)throw new Error(downloadError+' The model size did not match.');
 onProgress?.({stage:'verify',loaded:bytes.byteLength,total:source.bytes});
 // An HTTP address on the office network (a shared bide) has no SubtleCrypto:
 // digest() hashes in JavaScript there, so the AI tools still load and verify.
 const hash=Array.from(await digest(bytes),n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==source.sha256)throw new Error(downloadError+' The model integrity check failed.');
 return bytes;
}

async function download(source:PinnedModel,request:typeof fetch,onProgress:ModelOptions['onProgress'],timeoutMs:number){
 const abort=new AbortController(),timeoutError=new Error(downloadError+' Download timed out.');
 let fail!:(error:unknown)=>void;
 const stopped=new Promise<never>((_,reject)=>{fail=reject;});
 const timer=setTimeout(()=>{fail(timeoutError);abort.abort(timeoutError);},timeoutMs);
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  onProgress?.({stage:'download',loaded:0,total:source.bytes});
  const response=await Promise.race([request(source.url,{mode:'cors',credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer',signal:abort.signal}),stopped]);
  if(denied(response.status))throw new Error(accessError);
  if(!response.ok)throw new Error(downloadError);
  const bytes=new Uint8Array(source.bytes);let loaded=0,lastProgress=0;
  reader=response.body?.getReader();
  if(reader){
   for(;;){
    const {value,done}=await Promise.race([reader.read(),stopped]);if(done)break;
    if(loaded+value.byteLength>source.bytes)throw new Error(downloadError+' The model size did not match.');
    bytes.set(value,loaded);loaded+=value.byteLength;
    const now=Date.now();if(now-lastProgress>=100||loaded===source.bytes){onProgress?.({stage:'download',loaded,total:source.bytes});lastProgress=now;}
   }
  }else{
   const body=new Uint8Array(await Promise.race([response.arrayBuffer(),stopped]));
   if(body.byteLength>source.bytes)throw new Error(downloadError+' The model size did not match.');
   bytes.set(body);loaded=body.byteLength;onProgress?.({stage:'download',loaded,total:source.bytes});
  }
  if(loaded!==source.bytes)throw new Error(downloadError+' The model size did not match.');
  return bytes;
 }catch(error){
  // Cancel a partial or oversized stream as well as a stalled network fetch.
  abort.abort();void reader?.cancel().catch(()=>{});throw error;
 }finally{clearTimeout(timer);}
}
async function optionalCache(storage:ModelOptions['cacheStorage']){
 try{return await (storage===undefined?globalThis.caches:storage)?.open(MODEL_CACHE);}catch{return undefined;}
}

export async function loadPinnedModel(source:PinnedModel,{fetch:request=globalThis.fetch,cacheStorage,onProgress,downloadTimeoutMs=180_000}:ModelOptions={}):Promise<Uint8Array>{
 const cache=await optionalCache(cacheStorage),key=keyFor(source);
 if(cache){
  try{
   const saved=await cache.match(key);
   if(saved)return await verified(new Uint8Array(await saved.arrayBuffer()),source,onProgress);
  }catch{
   // Never let a bad cache trap the user in repeated integrity failures. Fetch
   // a fresh copy below; restricted storage is optional, not a prerequisite.
   try{await cache.delete(key);}catch{}
  }
 }
 let bytes:Uint8Array;
 try{
  bytes=await verified(await download(source,request,onProgress,downloadTimeoutMs),source,onProgress);
 }catch(error){
  if(error instanceof Error&&(error.message.startsWith(downloadError)||error.message===accessError))throw error;
  throw new Error(downloadError);
 }
 try{await cache?.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{}
 return bytes;
}

async function bundledBytes(url:URL,source:PinnedModel,options:ModelOptions):Promise<Uint8Array>{
 const request=options.fetch??globalThis.fetch;
 const response=await request(url);
 if(denied(response.status))throw new Error(accessError);
 if(response.ok)return verified(new Uint8Array(await response.arrayBuffer()),source,options.onProgress);
 // Subscription builds split large local models to fit static-host limits.
 // Public-demo models continue through the pinned, verified path above.
 const partsResponse=await request(`${url}.parts.json`);
 if(denied(partsResponse.status))throw new Error(accessError);
 if(!partsResponse.ok)throw new Error('This AI model is not bundled with this build.');
 const {size,parts}=await partsResponse.json() as {size:number;parts:number};
 if(size!==source.bytes||!Number.isSafeInteger(parts)||parts<=0||parts>size)throw new Error('This AI model has an invalid parts manifest.');
 const bytes=new Uint8Array(size);let at=0;
 for(let i=0;i<parts;i++){
  const part=await request(`${url}.part${i}`);
  if(denied(part.status))throw new Error(accessError);
  if(!part.ok)throw new Error(`Part ${i+1} of this AI model is missing.`);
  const chunk=new Uint8Array(await part.arrayBuffer());
  if(at+chunk.length>size)throw new Error('This AI model is incomplete.');
  bytes.set(chunk,at);at+=chunk.length;
 }
 if(at!==size)throw new Error('This AI model is incomplete.');
 return verified(bytes,source,options.onProgress);
}

async function cachedBundledBytes(url:URL,source:PinnedModel,options:ModelOptions){
 const cache=await optionalCache(options.cacheStorage),key=keyFor({...source,url:url.href});
 try{
  const saved=await cache?.match(key);
  if(saved)return await verified(new Uint8Array(await saved.arrayBuffer()),source,options.onProgress);
 }catch{try{await cache?.delete(key);}catch{}}
 const bytes=await bundledBytes(url,source,options);
 try{await cache?.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{}
 return bytes;
}

// A copy of bide shared on the office network is opened from another computer:
// its models (5 to 106 MB) cross the network, and a browser's HTTP cache
// keeps no file that large (a fresh profile none over about 6 MB), so every
// visit downloaded them again. They are kept in IndexedDB, which also works
// on a plain HTTP address, and verified again on every load. Not for the
// computer running bide (the files are on its disk) or the hosted editions
// (their licence decides each download).
const sharedCopy=()=>!HOSTED_BUILD&&typeof indexedDB!=='undefined'&&!['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname??'localhost');
export function modelStore(name='bide-ai-models'):ModelStore{
 let db:Promise<IDBDatabase>|undefined;
 const open=()=>db??=new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('models');r.onsuccess=()=>resolve(r.result);r.onerror=()=>{db=undefined;reject(r.error);};});
 const run=<T,>(mode:IDBTransactionMode,act:(s:IDBObjectStore)=>IDBRequest<T>)=>open().then(d=>new Promise<T>((resolve,reject)=>{const t=d.transaction('models',mode),r=act(t.objectStore('models'));t.oncomplete=()=>resolve(r.result);t.onerror=t.onabort=()=>reject(t.error);}));
 return {
  get:async key=>{const v=await run('readonly',s=>s.get(key));return v instanceof ArrayBuffer?new Uint8Array(v):undefined;},
  // One model per address: an older version of it goes, in the same transaction.
  put:async(key,bytes)=>{const at=key.split('#')[0];await run('readwrite',s=>{const r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(!c){s.put(bytes.slice().buffer,key);return;}if(String(c.key).split('#')[0]===at&&c.key!==key)c.delete();c.continue();};return r;});},
  delete:async key=>{await run('readwrite',s=>s.delete(key));},
 };
}
async function storedBundledBytes(url:URL,source:PinnedModel,options:ModelOptions,store:ModelStore){
 const key=`${url.href}#${source.sha256}`;
 try{const saved=await store.get(key);if(saved)return await verified(saved,source,options.onProgress);}
 catch{try{await store.delete(key);}catch{}}
 const bytes=await bundledBytes(url,source,options);
 // Storage may be full or refused (private windows): the model still works this time.
 try{await store.put(key,bytes);}catch{}
 return bytes;
}

// Every source is checked against the pinned manifest. The local/app pack may
// contain converted FP16 weights, whose output digest differs from upstream.
// Authentication denial is terminal: it must never turn into a public fallback.
export async function loadModelSources(source:ModelSource,local:URL,publicDemo:boolean,options:ModelOptions={}):Promise<Uint8Array>{
 const bundled={...source,...source.output};let failure:unknown;
 const store=options.store===undefined?sharedCopy()?modelStore():null:options.store;
 try{return store?await storedBundledBytes(local,bundled,options,store):await bundledBytes(local,bundled,options);}catch(error){if(error instanceof Error&&error.message===accessError)throw error;failure=error;}
 if(options.remote){
  const root=options.remote.endsWith('/')?options.remote:options.remote+'/';
  const remote=new URL(`ai/models/${local.pathname.split('/').pop()}`,root);
  const request=options.fetch??globalThis.fetch;
  try{
   return await cachedBundledBytes(remote,bundled,{...options,fetch:(input,init)=>request(input,{mode:'cors',credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer',...init,headers:{...Object.fromEntries(new Headers(init?.headers)),...(options.licence?{authorization:`Bearer ${options.licence}`}:{})}})});
  }catch(error){if(error instanceof Error&&error.message===accessError)throw error;failure=error;}
 }
 // The downloadable edition remains offline, and paid builds retain their
 // licence server boundary. Only the public demo uses the Hugging Face source.
 if(publicDemo)return loadPinnedModel(source,options);
 throw failure;
}

export async function modelBytes(model:string,base:string,publicDemo=PUBLIC_DEMO,options:ModelOptions={}):Promise<Uint8Array>{
 const source=manifest.files[`${model}.onnx` as keyof typeof manifest.files];
 if(!source)throw new Error('This AI model is unavailable. Choose Standard OCR or try another action.');
 return loadModelSources(source,new URL(`ai/models/${model}.onnx`,base),publicDemo,options);
}
