// The local edition always uses its bundled, offline model pack. The public
// edition downloads an immutable model only when an action needs it; document
// pixels and text never leave the browser. Verify bytes before inference or
// caching, including cached copies that may have been damaged or replaced.
import manifest from '../../public/ai/manifest.json';
import {PUBLIC_DEMO} from '../build-flags';

export type PinnedModel={url:string;bytes:number;sha256:string};
export type ModelProgress={loaded:number;total:number;stage:'download'|'verify'|'prepare'};
type ModelOptions={fetch?:typeof fetch;cacheStorage?:Pick<CacheStorage,'open'>|null;onProgress?:(progress:ModelProgress)=>void;downloadTimeoutMs?:number};
export const MODEL_CACHE='bide-ai-models-sha256-v1';
const downloadError='AI model download failed. Check your internet connection and try again, or choose Standard OCR.';

function keyFor(source:PinnedModel){
 const key=new URL(source.url);key.searchParams.set('bide-sha256',source.sha256);return key.href;
}
async function verified(bytes:Uint8Array,source:PinnedModel,onProgress?:ModelOptions['onProgress']){
 if(bytes.byteLength!==source.bytes)throw new Error(downloadError+' The model size did not match.');
 onProgress?.({stage:'verify',loaded:bytes.byteLength,total:source.bytes});
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
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
  if(error instanceof Error&&error.message.startsWith(downloadError))throw error;
  throw new Error(downloadError);
 }
 try{await cache?.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{}
 return bytes;
}

export async function modelBytes(model:string,base:string,publicDemo=PUBLIC_DEMO,options:ModelOptions={}):Promise<Uint8Array>{
 if(publicDemo){
  const source=manifest.files[`${model}.onnx` as keyof typeof manifest.files];
  if(!source)throw new Error('This AI model is unavailable. Choose Standard OCR or try another action.');
  return loadPinnedModel(source,options);
 }
 // Converted FP16 models have their own build-time checksums. Keep the local
 // path unchanged and never fall back to a network download in this edition.
 const response=await (options.fetch??globalThis.fetch)(new URL(`ai/models/${model}.onnx`,base));
 if(!response.ok)throw new Error(`AI model ${model} is not bundled with this build.`);
 return new Uint8Array(await response.arrayBuffer());
}
