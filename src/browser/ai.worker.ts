// Runs the bundled ONNX models off the main thread. WebGPU (graphics card) is
// used when the browser offers it, otherwise multithreaded WebAssembly on the
// CPU; a model that fails on WebGPU is reloaded on the CPU.
import * as ort from 'onnxruntime-web/webgpu';
type Feeds=Record<string,{data:Float32Array|BigInt64Array;dims:number[]}>;
type Loaded={session:ort.InferenceSession;backend:'webgpu'|'wasm'};
const sessions=new Map<string,Promise<Loaded>>();let base='',remote='',licence='';

// A file of the build, or, in the apps, one that is not bundled: fetched once
// from the bide server with the licence and kept in the cache (large models
// are downloaded only when a tool first needs them).
async function get(path:string){
 const local=await fetch(new URL(path,base)).catch(()=>undefined);
 if(local?.ok||!remote)return local??new Response(null,{status:404});
 const url=new URL(path,remote).href,cache=typeof caches==='undefined'?undefined:await caches.open('bide-models').catch(()=>undefined);
 const hit=await cache?.match(url);if(hit)return hit;
 const response=await fetch(url,{headers:licence?{authorization:`Bearer ${licence}`}:{}});
 if(response.ok&&cache)await cache.put(url,response.clone()).catch(()=>{});
 return response;
}
// A model in one file, or in parts with a manifest (hosts limit file size;
// see splitLargeFiles in vite.config.ts).
async function modelBytes(model:string){
 const path=`ai/models/${model}.onnx`,whole=await get(path);if(whole.ok)return new Uint8Array(await whole.arrayBuffer());
 const manifest=await get(`${path}.parts.json`);if(!manifest.ok)throw new Error(whole.status===402||manifest.status===402?'An active bide trial or subscription is needed for the AI tools.':`AI model ${model} is not bundled with this build.`);
 const {size,parts}=await manifest.json() as {size:number;parts:number},bytes=new Uint8Array(size);let at=0;
 for(let i=0;i<parts;i++){const part=await get(`${path}.part${i}`);if(!part.ok)throw new Error(`Part ${i+1} of AI model ${model} is missing.`);const chunk=new Uint8Array(await part.arrayBuffer());bytes.set(chunk,at);at+=chunk.length;}
 if(at!==size)throw new Error(`AI model ${model} is incomplete.`);
 return bytes;
}
// One session is created at a time: ONNX Runtime's WebGPU backend fails with
// "Session mismatch" when two are created together (OCR and the tilt check).
let creating:Promise<unknown>=Promise.resolve();
function create(bytes:Uint8Array,backend:Loaded['backend']):Promise<Loaded>{
 const next=creating.then(async()=>({session:await ort.InferenceSession.create(bytes,{executionProviders:[backend],graphOptimizationLevel:'all',logSeverityLevel:3}),backend}));
 creating=next.catch(()=>{});return next;
}
function load(model:string,cpuOnly=false){
 const key=cpuOnly?model+'#cpu':model;
 if(!sessions.has(key))sessions.set(key,(async()=>{
  // Downloaded once for both attempts (LaMa alone is 106 MB). ONNX Runtime
  // may take over the buffer it is given, so WebGPU gets its own copy.
  const bytes=await modelBytes(model);
  if(!cpuOnly&&'gpu' in navigator)try{return await create(bytes.slice(),'webgpu');}catch{}
  return create(bytes,'wasm');
 })().catch(e=>{sessions.delete(key);throw e;}));
 return sessions.get(key)!;
}
async function run(model:string,feeds:Feeds,cpuOnly=false):Promise<{outputs:Feeds;backend:string}>{
 const {session,backend}=await load(model,cpuOnly);
 try{
  const result=await session.run(Object.fromEntries(Object.entries(feeds).map(([k,v])=>[k,v.data instanceof BigInt64Array?new ort.Tensor('int64',v.data,v.dims):new ort.Tensor('float32',v.data,v.dims)])));
  return {backend,outputs:Object.fromEntries(Object.entries(result).map(([k,t])=>[k,{data:t.data as Float32Array,dims:[...t.dims]}]))};
 }catch(e){if(backend==='webgpu'&&!cpuOnly)return run(model,feeds,true);throw e;}
}
self.onmessage=async(event:MessageEvent)=>{
 const {id,type}=event.data;
 try{
  if(type==='init'){base=event.data.base;remote=event.data.remote??'';licence=event.data.licence??'';ort.env.wasm.wasmPaths={mjs:new URL('ai/ort/ort-wasm-simd-threaded.jsep.mjs',base).href,wasm:new URL('ai/ort/ort-wasm-simd-threaded.jsep.wasm',base).href};ort.env.wasm.numThreads=self.crossOriginIsolated?Math.max(1,Math.min(4,navigator.hardwareConcurrency||1)):1;ort.env.logLevel='error';self.postMessage({id});return;}
  const {outputs,backend}=await run(event.data.model,event.data.feeds);
  self.postMessage({id,outputs,backend},{transfer:Object.values(outputs).map(o=>o.data.buffer as ArrayBuffer)});
 }catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e)});}
};
