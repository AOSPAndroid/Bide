import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadPinnedModel,loadModelSources,modelBytes,MODEL_CACHE} from '../tmp/ai-models.mjs';
const bytes=new Uint8Array([1,2,3,4]),sha256=createHash('sha256').update(bytes).digest('hex');
const source={url:'https://example.test/model/resolve/pinned-revision/model.onnx',bytes:bytes.length,sha256};
const local=new URL('https://local.test/bide/ai/models/model.onnx');
function storage(initial){
 const state={value:initial,deleted:0,writes:0,key:undefined};
 return {state,async open(name){assert.equal(name,MODEL_CACHE);return {
  async match(key){state.key=key;return state.value===undefined?undefined:new Response(state.value);},
  async delete(){state.deleted++;state.value=undefined;return true;},
  async put(key,response){state.key=key;state.writes++;state.value=new Uint8Array(await response.arrayBuffer());},
 };}};
}
test('remote AI downloads are immutable, verified, cached and fetched without credentials',async()=>{
 const cacheStorage=storage();let calls=0;
 const fetch=async(url,init)=>{calls++;assert.equal(url,source.url);assert.deepEqual({mode:init.mode,credentials:init.credentials,cache:init.cache,referrerPolicy:init.referrerPolicy},{mode:'cors',credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer'});assert.ok(init.signal instanceof AbortSignal);return new Response(bytes);};
 assert.deepEqual(await loadPinnedModel(source,{fetch,cacheStorage}),bytes);
 assert.equal(cacheStorage.state.writes,1);assert.equal(new URL(cacheStorage.state.key).searchParams.get('bide-sha256'),sha256);
 assert.deepEqual(await loadPinnedModel(source,{fetch,cacheStorage}),bytes);assert.equal(calls,1);
});
test('corrupt cached model is evicted and retried from the network before inference',async()=>{
 const cacheStorage=storage(new Uint8Array([9,9,9,9]));let calls=0;
 const result=await loadPinnedModel(source,{cacheStorage,fetch:async()=>{calls++;return new Response(bytes);}});
 assert.deepEqual(result,bytes);assert.equal(cacheStorage.state.deleted,1);assert.equal(cacheStorage.state.writes,1);assert.equal(calls,1);
});
test('bad network model is rejected instead of cached or passed to ONNX',async()=>{
 for(const damaged of [new Uint8Array([7,2,3,4]),new Uint8Array([1,2])]){
  const cacheStorage=storage();await assert.rejects(loadPinnedModel(source,{cacheStorage,fetch:async()=>new Response(damaged)}),/AI model download failed.*(?:integrity|size)/);
  assert.equal(cacheStorage.state.writes,0);
 }
});
test('blocked or full cache storage does not stop verified inference',async()=>{
 const fetch=async()=>new Response(bytes);
 assert.deepEqual(await loadPinnedModel(source,{fetch,cacheStorage:{open:async()=>{throw new Error('Storage blocked');}}}),bytes);
 assert.deepEqual(await loadPinnedModel(source,{fetch,cacheStorage:{open:async()=>({match:async()=>undefined,put:async()=>{throw new Error('Quota exceeded');}})}}),bytes);
});
test('network errors show a useful recovery without exposing a download URL',async()=>{
 for(const fetch of [async()=>{throw new Error('Failed fetching https://secret.test?token=sensitive');},async()=>new Response('missing',{status:404})]){
  await assert.rejects(loadPinnedModel(source,{fetch,cacheStorage:null}),error=>/Check your internet.*Standard OCR/.test(error.message)&&!error.message.includes('https://'));
 }
});
test('local models use the verified offline pack only, including converted models',async()=>{
 let requested;
 assert.deepEqual(await loadModelSources(source,local,false,{fetch:async url=>{requested=String(url);return new Response(bytes);}}),bytes);
 assert.equal(requested,local.href);
 const converted=new Uint8Array([4,3,2,1]),output={bytes:4,sha256:createHash('sha256').update(converted).digest('hex')};
 assert.deepEqual(await loadModelSources({...source,output},local,false,{fetch:async()=>new Response(converted)}),converted);
 await assert.rejects(loadModelSources(source,local,false,{fetch:async()=>new Response(converted)}),/integrity check failed/);
 let calls=0;await assert.rejects(loadModelSources(source,local,false,{fetch:async()=>{calls++;return new Response('',{status:404});}}),/not bundled/);assert.equal(calls,2);
});
test('split local models are assembled in order and never fall back to a remote source',async()=>{
 const requests=[];
 const fetch=async url=>{
  const path=new URL(url);requests.push(path.pathname);assert.equal(path.origin,'https://local.test');
  if(path.pathname.endsWith('.parts.json'))return Response.json({size:4,parts:3});
  if(path.pathname.endsWith('.part0'))return new Response(bytes.slice(0,1));
  if(path.pathname.endsWith('.part1'))return new Response(bytes.slice(1,2));
  if(path.pathname.endsWith('.part2'))return new Response(bytes.slice(2));
  return new Response('',{status:404});
 };
 assert.deepEqual(await loadModelSources(source,local,false,{fetch}),bytes);
 assert.deepEqual(requests,['/bide/ai/models/model.onnx','/bide/ai/models/model.onnx.parts.json',...['0','1','2'].map(i=>`/bide/ai/models/model.onnx.part${i}`)]);
});
test('split models reject malformed manifests, missing parts and incorrect combined sizes',async()=>{
 for(const [manifest,chunks,message] of [
  [{size:4,parts:0},[],/invalid parts manifest/],
  [{size:4,parts:1},[undefined],/Part 1.*missing/],
  [{size:4,parts:1},[bytes.slice(0,2)],/incomplete/],
  [{size:2,parts:1},[bytes],/invalid parts manifest/],
 ]){
  const fetch=async url=>String(url).endsWith('.parts.json')?Response.json(manifest):/\.part\d+$/.test(String(url))&&chunks[0]?new Response(chunks[0]):new Response('',{status:404});
  await assert.rejects(loadModelSources(source,local,false,{fetch}),message);
 }
 let calls=0;await assert.rejects(loadModelSources(source,local,false,{fetch:async()=>{calls++;return new Response('',{status:402});}}),/active bide trial/);assert.equal(calls,1);
});
test('unknown public model fails before making any request',async()=>{
 let calls=0;await assert.rejects(modelBytes('../untrusted','https://local.test/',true,{fetch:async()=>{calls++;throw new Error('unexpected');}}),/unavailable/);assert.equal(calls,0);
});
test('model sources try the local pack before the configured bearer-licence server',async()=>{
 const requests=[],remote='https://licensed.test/bide';
 const fetch=async(url,init)=>{requests.push({url:String(url),init});return String(url).startsWith(remote)?new Response(bytes):new Response('',{status:404});};
 assert.deepEqual(await loadModelSources(source,local,true,{fetch,remote,licence:'test-licence',cacheStorage:null}),bytes);
 assert.deepEqual(requests.map(r=>r.url),[local.href,local.href+'.parts.json',remote+'/ai/models/model.onnx']);
 assert.equal(requests[2].init.headers.authorization,'Bearer test-licence');
 assert.equal(requests[2].init.credentials,'omit');
 requests.length=0;
 assert.deepEqual(await loadModelSources(source,local,true,{remote,licence:'test-licence',cacheStorage:null,fetch:async(url,init)=>{requests.push({url:String(url),init});return new Response(bytes);}}),bytes);
 assert.deepEqual(requests.map(r=>r.url),[local.href]);
 assert.equal(requests[0].init,undefined,'no licence is sent with local or upstream fetches');
});
test('the public demo reaches pinned upstream after unavailable or corrupt licensed sources without leaking the licence',async()=>{
 for(const damaged of [undefined,new Uint8Array([9,2,3,4])]){
  const requests=[],remote='https://licensed.test/';
  const fetch=async(url,init)=>{
   requests.push(String(url));
   if(String(url).startsWith(remote))return damaged?new Response(damaged):new Response('',{status:404});
   if(String(url)===source.url){assert.equal(new Headers(init?.headers).has('authorization'),false);return new Response(bytes);}
   return new Response('',{status:404});
  };
  assert.deepEqual(await loadModelSources(source,local,true,{remote,licence:'test-licence',fetch,cacheStorage:null}),bytes);
  assert.equal(requests.at(-1),source.url);
 }
});
test('unconfigured model base is never requested and corrupt local models cannot enter inference',async()=>{
 const requests=[];
 const fetch=async(url,init)=>{requests.push(String(url));assert.equal(new Headers(init?.headers).has('authorization'),false);return new Response(String(url)===source.url?bytes:new Uint8Array([9,2,3,4]));};
 assert.deepEqual(await loadModelSources(source,local,true,{fetch,licence:'test-licence',cacheStorage:null}),bytes);
 assert.deepEqual(requests,[local.href,source.url]);
});
test('all model source authentication denials stop without public fallback',async()=>{
 for(const status of [401,402,403])for(const denialAt of ['local','remote']){
  const requests=[],remote='https://licensed.test/';
  const fetch=async url=>{requests.push(String(url));if(denialAt==='local'||String(url).startsWith(remote))return new Response('',{status});return new Response('',{status:404});};
  await assert.rejects(loadModelSources(source,local,true,{remote,licence:'test-licence',fetch,cacheStorage:null}),/active bide trial/);
  assert.equal(requests.includes(source.url),false);
 }
});
test('paid and offline builds never bypass an unavailable licence server using the demo upstream',async()=>{
 const requests=[];
 await assert.rejects(loadModelSources(source,local,false,{remote:'https://licensed.test/',licence:'test-licence',cacheStorage:null,fetch:async url=>{requests.push(String(url));return new Response('',{status:404});}}),/not bundled/);
 assert.equal(requests.includes(source.url),false);
});
test('licensed app sources assemble split models with bearer authentication and verify their cached copy',async()=>{
 const remote='https://licensed.test/',requests=[],cacheStorage=storage();
 const fetch=async(url,init)=>{
  const path=String(url);requests.push(path);
  if(!path.startsWith(remote))return new Response('',{status:404});
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-licence');
  if(path.endsWith('.parts.json'))return Response.json({size:4,parts:2});
  if(path.endsWith('.part0'))return new Response(bytes.slice(0,2));
  if(path.endsWith('.part1'))return new Response(bytes.slice(2));
  return new Response('',{status:404});
 };
 const options={remote,licence:'test-licence',cacheStorage,fetch};
 assert.deepEqual(await loadModelSources(source,local,false,options),bytes);
 assert.equal(cacheStorage.state.writes,1);
 assert.equal(requests.filter(p=>p.startsWith(remote)).length,4);
 requests.length=0;
 assert.deepEqual(await loadModelSources(source,local,false,options),bytes);
 assert.equal(requests.some(p=>p.startsWith(remote)),false);
});
test('streamed downloads report bounded bytes and verification before inference',async()=>{
 const progress=[],cacheStorage=storage();
 const fetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,2));controller.enqueue(bytes.slice(2));controller.close();}}));
 assert.deepEqual(await loadPinnedModel(source,{fetch,cacheStorage,onProgress:p=>progress.push(p)}),bytes);
 assert.deepEqual(progress[0],{stage:'download',loaded:0,total:4});assert.deepEqual(progress.at(-1),{stage:'verify',loaded:4,total:4});
 assert.ok(progress.some(p=>p.stage==='download'&&p.loaded===4));assert.ok(progress.every(p=>p.loaded>=0&&p.loaded<=p.total&&p.total===4));
 progress.length=0;await loadPinnedModel(source,{fetch,cacheStorage,onProgress:p=>progress.push(p)});assert.deepEqual(progress,[{stage:'verify',loaded:4,total:4}]);
});
test('oversized streamed models cancel before accumulating unbounded bytes',async()=>{
 let cancelled=false,signal;
 const fetch=async(_,init)=>{signal=init.signal;return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3,4,5]));},cancel(){cancelled=true;}}));};
 await assert.rejects(loadPinnedModel(source,{fetch,cacheStorage:null}),/model size did not match/);assert.equal(cancelled,true);assert.equal(signal.aborted,true);
});
test('download timeout covers waiting for headers and a stalled response body',async()=>{
 let headerSignal;
 await assert.rejects(loadPinnedModel(source,{cacheStorage:null,downloadTimeoutMs:15,fetch:(_,init)=>{headerSignal=init.signal;return new Promise(()=>{});}}),/Download timed out/);assert.equal(headerSignal.aborted,true);
 let cancelled=false,bodySignal;
 const fetch=async(_,init)=>{bodySignal=init.signal;return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,2));},cancel(){cancelled=true;}}));};
 await assert.rejects(loadPinnedModel(source,{fetch,cacheStorage:null,downloadTimeoutMs:15}),/Download timed out/);assert.equal(bodySignal.aborted,true);assert.equal(cancelled,true);
 // The timeout and aborted stream do not poison a subsequent attempt.
 assert.deepEqual(await loadPinnedModel(source,{cacheStorage:null,fetch:async()=>new Response(bytes)}),bytes);
});
