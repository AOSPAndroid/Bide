// Runs the bundled ONNX models off the main thread. WebGPU (graphics card) is
// used when the browser offers it, otherwise multithreaded WebAssembly on the
// CPU; a model that fails on WebGPU is reloaded on the CPU.
import * as ort from 'onnxruntime-web/webgpu';
import {modelBytes,type ModelProgress} from './ai-models';
type Feeds=Record<string,{data:Float32Array|BigInt64Array;dims:number[]}>;
type Loaded={session:ort.InferenceSession;backend:'webgpu'|'wasm'};
const sessions=new Map<string,Promise<Loaded>>();let base='',remote='',licence='';

async function create(bytes:Uint8Array,backend:Loaded['backend'],onProgress?:(progress:ModelProgress)=>void):Promise<Loaded>{
 onProgress?.({stage:'prepare',loaded:bytes.byteLength,total:bytes.byteLength});
 return {session:await ort.InferenceSession.create(bytes,{executionProviders:[backend],graphOptimizationLevel:'all',logSeverityLevel:3}),backend};
}
function load(model:string,cpuOnly=false,onProgress?:(progress:ModelProgress)=>void){
 const key=cpuOnly?model+'#cpu':model;
 if(!sessions.has(key))sessions.set(key,(async()=>{
  const bytes=await modelBytes(model,base,undefined,{onProgress,...(remote?{remote,licence}:{})});
  if(!cpuOnly&&'gpu' in navigator)try{return await create(bytes.slice(),'webgpu',onProgress);}catch{}
  return create(bytes,'wasm',onProgress);
 })().catch(e=>{sessions.delete(key);throw e;}));
 return sessions.get(key)!;
}
async function run(model:string,feeds:Feeds,cpuOnly=false,onProgress?:(progress:ModelProgress)=>void):Promise<{outputs:Feeds;backend:string}>{
 const {session,backend}=await load(model,cpuOnly,onProgress);
 try{
  const result=await session.run(Object.fromEntries(Object.entries(feeds).map(([k,v])=>[k,v.data instanceof BigInt64Array?new ort.Tensor('int64',v.data,v.dims):new ort.Tensor('float32',v.data,v.dims)])));
  return {backend,outputs:Object.fromEntries(Object.entries(result).map(([k,t])=>[k,{data:t.data as Float32Array,dims:[...t.dims]}]))};
 }catch(e){if(backend==='webgpu'&&!cpuOnly)return run(model,feeds,true,onProgress);throw e;}
}
async function handle(event:MessageEvent){
 const {id,type}=event.data;
 try{
  if(type==='init'){base=event.data.base;remote=event.data.remote??'';licence=event.data.licence??'';ort.env.wasm.wasmPaths={mjs:new URL('ai/ort/ort-wasm-simd-threaded.jsep.mjs',base).href,wasm:new URL('ai/ort/ort-wasm-simd-threaded.jsep.wasm',base).href};ort.env.wasm.numThreads=self.crossOriginIsolated?Math.max(1,Math.min(4,navigator.hardwareConcurrency||1)):1;ort.env.logLevel='error';self.postMessage({id});return;}
  if('remote' in event.data){remote=event.data.remote??'';licence=event.data.licence??'';}
  const {outputs,backend}=await run(event.data.model,event.data.feeds,false,progress=>self.postMessage({id,progress}));
  self.postMessage({id,outputs,backend},{transfer:Object.values(outputs).map(o=>o.data.buffer as ArrayBuffer)});
 }catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e)});}
}
// ONNX's JSEP/WASM runtime shares session state across asynchronous calls.
// Recognition and automatic orientation can arrive together; await each whole
// operation before starting the next session creation or inference. A failed
// request reports to its own caller and cannot block later queued requests.
let operation=Promise.resolve();
self.onmessage=(event:MessageEvent)=>{
 if(event.data.type==='init'){void handle(event);return;}
 operation=operation.then(()=>handle(event),()=>handle(event));
};
