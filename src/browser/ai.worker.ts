// Runs the bundled ONNX models off the main thread. WebGPU (graphics card) is
// used when the browser offers it, otherwise multithreaded WebAssembly on the
// CPU; a model that fails on WebGPU is reloaded on the CPU.
import * as ort from 'onnxruntime-web/webgpu';
type Feeds=Record<string,{data:Float32Array|BigInt64Array;dims:number[]}>;
type Loaded={session:ort.InferenceSession;backend:'webgpu'|'wasm'};
const sessions=new Map<string,Promise<Loaded>>();let base='';

async function create(model:string,backend:Loaded['backend']):Promise<Loaded>{
 const response=await fetch(new URL(`ai/models/${model}.onnx`,base));if(!response.ok)throw new Error(`AI model ${model} is not bundled with this build.`);
 return {session:await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()),{executionProviders:[backend],graphOptimizationLevel:'all',logSeverityLevel:3}),backend};
}
function load(model:string,cpuOnly=false){
 const key=cpuOnly?model+'#cpu':model;
 if(!sessions.has(key))sessions.set(key,(async()=>{
  if(!cpuOnly&&'gpu' in navigator)try{return await create(model,'webgpu');}catch{}
  return create(model,'wasm');
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
  if(type==='init'){base=event.data.base;ort.env.wasm.wasmPaths={mjs:new URL('ai/ort/ort-wasm-simd-threaded.jsep.mjs',base).href,wasm:new URL('ai/ort/ort-wasm-simd-threaded.jsep.wasm',base).href};ort.env.wasm.numThreads=self.crossOriginIsolated?Math.max(1,Math.min(4,navigator.hardwareConcurrency||1)):1;ort.env.logLevel='error';self.postMessage({id});return;}
  const {outputs,backend}=await run(event.data.model,event.data.feeds);
  self.postMessage({id,outputs,backend},{transfer:Object.values(outputs).map(o=>o.data.buffer as ArrayBuffer)});
 }catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e)});}
};
