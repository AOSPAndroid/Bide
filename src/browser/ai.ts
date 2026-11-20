// Main-thread access to the AI worker: one shared worker, calls queued in order.
// Inputs are float32, or int64 when given as a BigInt64Array; outputs are float32.
import {PUBLIC_DEMO} from '../build-flags';
import type {ModelProgress} from './ai-models';
type Feeds=Record<string,{data:Float32Array;dims:number[]}>;
type Inputs=Record<string,{data:Float32Array|BigInt64Array;dims:number[]}>;
let worker:Worker|undefined,ready:Promise<void>|undefined,seq=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:unknown)=>void;onProgress?:(progress:ModelProgress)=>void}>();
const remoteModels=()=>{const remote=(import.meta.env as Record<string,string|undefined>).VITE_MODEL_BASE;if(!remote)return {};let licence='';try{licence=localStorage.getItem('bide-licence')??'';}catch{}return {remote,licence};};
export let aiBackend='';
function resetWorker(current:Worker,error:Error){
 if(worker!==current)return;
 worker=undefined;ready=undefined;aiBackend='';current.terminate();
 const calls=[...pending.values()];pending.clear();for(const p of calls)p.reject(error);
}
function call(message:Record<string,unknown>,transfer:Transferable[]=[],onProgress?:(progress:ModelProgress)=>void){
 if(!worker){
  const current=worker=new Worker(new URL('./ai.worker.ts',import.meta.url),{type:'module'});
  current.onmessage=e=>{
   if(worker!==current)return;
   const p=pending.get(e.data.id);if(!p)return;
   if(e.data.progress){p.onProgress?.(e.data.progress);return;}
   if(e.data.error&&e.data.restart){
    resetWorker(current,new Error('AI could not start. Check your connection, then use Rescan or retry the action.',{cause:new Error(e.data.error)}));return;
   }
   pending.delete(e.data.id);e.data.error?p.reject(new Error(e.data.error)):p.resolve(e.data);
  };
  current.onerror=e=>resetWorker(current,new Error(e.message||'AI worker failed.'));
 }
 const id=++seq;return new Promise<any>((resolve,reject)=>{pending.set(id,{resolve,reject,onProgress});worker!.postMessage({...message,id},transfer);});
}
export async function runModel(model:string,feeds:Inputs,signal?:AbortSignal,onProgress?:(progress:ModelProgress)=>void):Promise<Feeds>{
 signal?.throwIfAborted();ready??=call({type:'init',base:new URL('./',document.baseURI).href,...remoteModels()}).then(()=>{});await ready;
 const reply=await call({type:'run',model,feeds,...remoteModels()},Object.values(feeds).map(f=>f.data.buffer as ArrayBuffer),onProgress);aiBackend=reply.backend;signal?.throwIfAborted();return reply.outputs;
}
// The hosted edition loads pinned models on demand; local builds require their
// bundled pack. Availability does not download or initialize a model.
let available:Promise<boolean>|undefined;
export function aiAvailable(){return available??=(PUBLIC_DEMO?Promise.resolve(true):fetch(new URL('ai/models/ppocr-det.onnx',document.baseURI),{method:'HEAD'}).then(r=>r.ok,()=>false));}
