// Main-thread access to the AI worker: one shared worker, calls queued in order.
type Feeds=Record<string,{data:Float32Array;dims:number[]}>;
let worker:Worker|undefined,ready:Promise<void>|undefined,seq=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:unknown)=>void}>();
export let aiBackend='';
function call(message:Record<string,unknown>,transfer:Transferable[]=[]){
 if(!worker){worker=new Worker(new URL('./ai.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(new Error(e.data.error)):p.resolve(e.data);};worker.onerror=e=>{for(const p of pending.values())p.reject(new Error(e.message||'AI worker failed.'));pending.clear();worker=undefined;ready=undefined;};}
 const id=++seq;return new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject});worker!.postMessage({...message,id},transfer);});
}
export async function runModel(model:string,feeds:Feeds,signal?:AbortSignal):Promise<Feeds>{
 signal?.throwIfAborted();ready??=call({type:'init',base:new URL('./',document.baseURI).href}).then(()=>{});await ready;
 const reply=await call({type:'run',model,feeds},Object.values(feeds).map(f=>f.data.buffer as ArrayBuffer));aiBackend=reply.backend;signal?.throwIfAborted();return reply.outputs;
}
// Builds without the model pack (such as the public demo) hide AI actions.
let available:Promise<boolean>|undefined;
export function aiAvailable(){return available??=fetch(new URL('ai/models/ppocr-det.onnx',document.baseURI),{method:'HEAD'}).then(r=>r.ok,()=>false);}
