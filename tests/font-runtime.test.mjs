import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

let imports=0;
const extra=()=>import(`../tmp/extra-fonts.mjs?case=${++imports}`);
const web=()=>import(`../tmp/web-fonts.mjs?case=${++imports}`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Browser storage/font parsing are isolated boundaries here. Browser cases
// exercise real font files, matching and exports; these tests force races,
// storage corruption and byte-integrity failures without network timing.
function browser(){
 const saved=new Map(),fonts=new Set(),installed=new Set(),state={opens:0,failWrites:false};
 class Face{
  constructor(family,source,options={}){this.family=family;this.source=source;Object.assign(this,options);}
  async load(){if(typeof this.source==='string'){
   const family=JSON.parse(this.source.slice(6,-1));if(!installed.has(family.toLowerCase()))throw new Error('not installed');
  }return this;}
 }
 const factory={open(){
  state.opens++;const request={};
  const db={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},transaction(_name,mode){
   const tx={error:null},values=new Map([...saved].map(([k,v])=>[k,structuredClone(v)]));let pending=0,aborted=false;
   const operation=(run,write=false)=>{pending++;const out={};queueMicrotask(()=>{
    if(aborted)return;
    if(write&&state.failWrites){aborted=true;tx.error=new Error('quota');tx.onerror?.();return;}
    out.result=run();out.onsuccess?.();pending--;
    if(!pending)queueMicrotask(()=>{if(!pending&&!aborted){if(mode==='readwrite'){saved.clear();for(const [k,v]of values)saved.set(k,v);}tx.oncomplete?.();}});
   });return out;};
   tx.abort=()=>{aborted=true;tx.onabort?.();};
   tx.objectStore=()=>({getAll:()=>operation(()=>[...values.values()].map(v=>structuredClone(v))),getAllKeys:()=>operation(()=>[...values.keys()]),put:(value,key)=>operation(()=>{values.set(key,structuredClone(value));return key;},true),delete:key=>operation(()=>values.delete(key),true)});
   return tx;
  }};
  request.result=db;queueMicrotask(()=>request.onsuccess?.());return request;
 }};
 const globals={document:{fonts,baseURI:'https://bide.example/'},FontFace:Face,indexedDB:factory};
 const prior=new Map(Object.keys(globals).map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const [name,value]of Object.entries(globals))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 return {saved,fonts,installed,state,restore(){for(const [name,descriptor]of prior)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}};
}
function fixture(){
 const regular=Uint8Array.from([1,2,3,4]),bold=Uint8Array.from([5,6,7,8]),revision='a'.repeat(40);
 const family={family:'Test Open Face',slug:'testopenface',licence:'ofl',category:'sans',files:{'Regular.ttf':{sha256:sha(regular),bytes:regular.length,variable:false},'Bold.ttf':{sha256:sha(bold),bytes:bold.length,variable:false}},faces:[{style:'Regular',file:'Regular.ttf',row:0},{style:'Bold',file:'Bold.ttf',row:1}]};
 const index={revision,chars:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',cell:34,rows:2,families:[family],bin:new Uint8Array(2*34*62)};
 const request=async url=>new Response(String(url).endsWith('Regular.ttf')?regular:bold);
 return {index,family,regular,bold,request};
}

test('font restoration shares one readiness promise and accepts earlier user-font records',async()=>{
 const b=browser();try{
  b.saved.set('Legacy/Regular',{family:'Legacy',style:'Regular',variable:false,bytes:Uint8Array.from([1,2])});
  const m=await extra(),first=m.restoreFonts();assert.equal(m.restoreFonts(),first);assert.deepEqual(await first,['Legacy']);assert.equal(b.state.opens,1);assert.equal(m.extraFonts('yours')[0].family,'Legacy');assert.equal(b.fonts.size,1);
 }finally{b.restore();}
});

test('uploaded names do not shadow installed faces, group weights case-insensitively and preserve earlier versions',async()=>{
 const b=browser();try{
  b.installed.add('arial');const m=await extra(),regular=Uint8Array.from([1]),bold=Uint8Array.from([2]);
  assert.deepEqual(await m.addFontFiles([file('Arial-Regular.ttf',regular),file('ARIAL-Bold.ttf',bold)]),['Arial (yours)']);
  const original=m.fontRequirement('ARIAL (YOURS)');assert.deepEqual(m.extraFonts('yours')[0].styles,['Regular','Bold']);assert.ok([...b.fonts].every(f=>f.family.toLowerCase()!=='arial'));
  assert.deepEqual(await m.addFontFiles([file('arial-Regular.ttf',regular)]),['Arial (yours)']);
  assert.deepEqual(await m.addFontFiles([file('Arial-Regular.ttf',Uint8Array.from([3])),file('Arial-Bold.ttf',Uint8Array.from([4]))]),['Arial (yours 2)']);
  assert.deepEqual(m.fontRequirement('Arial (yours)'),original,'new bytes never replace a face used by an existing document');
  assert.deepEqual(await m.addFontFiles([file('Protected-Regular.ttf',regular)],['protected']),['Protected (yours)']);
 }finally{b.restore();}
});

test('adding a missing weight clears Fabric metrics and font identities contain no font bytes',async()=>{
 const b=browser();try{
  const m=await extra(),{cache}=await import('fabric');await m.addFontFiles([file('House-Regular.ttf',Uint8Array.from([7]))]);
  cache.getFontCache({fontFamily:'House',fontStyle:'normal',fontWeight:'bold'}).set('A',99);
  await m.addFontFiles([file('House-Bold.ttf',Uint8Array.from([8]))]);assert.equal(cache.getFontCache({fontFamily:'House',fontStyle:'normal',fontWeight:'bold'}).size,0);
  const identity=m.fontRequirement('House');assert.equal(identity.faces.length,2);assert.ok(identity.faces.every(f=>/^[0-9a-f]{64}$/.test(f.sha256)));assert.ok(!JSON.stringify(identity).includes('bytes'));
 }finally{b.restore();}
});

test('rich-text requirements survive missing files, clear after a family change and recover by exact bytes',async()=>{
 const b=browser();try{
  const m=await extra(),bytes=Uint8Array.from([11]);await m.addFontFiles([file('House-Regular.ttf',bytes)]);
  const text={fontFamily:'System',styles:{0:{0:{fontFamily:'House'}}}},required=m.textFontRequirements(text);assert.equal(required.length,1);assert.equal(required[0].family,'House');
  await m.removeFont('House');assert.throws(()=>m.assertExtraFontsAvailable(required),/font.*unavailable.*Add the same font file/i);
  assert.deepEqual(m.textFontRequirements({...text,styles:{},extraFontRequired:required}),[],'changing every reference clears the old requirement');
  await m.addFontFiles([file('House-Regular.ttf',bytes)],['House']);assert.equal(m.matchingExtraFont(required[0]),'House (yours)','the same file can recover under a safe new alias');
 }finally{b.restore();}
});

test('web fonts publish and persist all pinned faces atomically, reject wrong bytes and retry',async()=>{
 const b=browser();try{
  const m=await web(),f=fixture();let calls=0;
  assert.equal(await m.loadWebFont(f.index,f.family,async(url,options)=>{calls++;return String(url).endsWith('Bold.ttf')?new Response('offline',{status:503}):f.request(url,options);}),false);assert.equal(b.fonts.size,0);assert.equal(b.saved.size,0);
  assert.equal(await m.loadWebFont(f.index,f.family,async()=>new Response(Uint8Array.from([0,0,0,0]))),false);assert.equal(b.fonts.size,0);assert.equal(b.saved.size,0);
  assert.equal(await m.loadWebFont(f.index,f.family,async(url,options)=>{calls++;return f.request(url,options);}),true);assert.equal(b.fonts.size,2);assert.equal(b.saved.size,2);assert.ok([...b.saved.values()].every(r=>r.origin==='web'&&r.sha256===r.source.sha256));
  const before=calls;assert.equal(await m.loadWebFont(f.index,f.family,async()=>{throw new Error('must be cached');}),true);assert.equal(calls,before);
  b.fonts.clear();assert.equal(await m.loadWebFont(f.index,f.family,f.request),true);assert.equal(b.fonts.size,2,'a cleared FontFaceSet is rehydrated rather than mistaken for a ready family');
 }finally{b.restore();}
});

test('an unresponsive font host settles promptly, cannot register late faces, and can be retried',async()=>{
 const b=browser();try{
  const m=await web(),f=fixture(),pending=[];let signal;
  const start=Date.now();assert.equal(await m.loadWebFont(f.index,f.family,(url,options)=>{signal=options.signal;return new Promise(resolve=>pending.push(()=>f.request(url).then(resolve)));},{timeoutMs:30}),false);
  assert.ok(Date.now()-start<1000);assert.equal(signal.aborted,true);for(const complete of pending)complete();await tick();await tick();assert.equal(b.fonts.size,0);assert.equal(b.saved.size,0);
  assert.equal(await m.loadWebFont(f.index,f.family,f.request),true);assert.equal(b.fonts.size,2);
 }finally{b.restore();}
});

test('a failed or incomplete descriptor index can be retried with matching metadata and bytes',async()=>{
 const b=browser();try{
  const m=await web(),f=fixture(),{bin,...meta}=f.index;
  assert.equal(await m.fontIndex('https://bide.example/',async()=>new Response('missing',{status:404})),undefined);
  assert.equal(await m.fontIndex('https://bide.example/',async url=>String(url).endsWith('.json')?Response.json(meta):new Response(bin.subarray(1))),undefined);
  const loaded=await m.fontIndex('https://bide.example/',async url=>String(url).endsWith('.json')?Response.json(meta):new Response(bin));assert.equal(loaded.families[0].family,f.family.family);assert.equal(loaded.bin.length,meta.rows*meta.cell*meta.chars.length);
 }finally{b.restore();}
});
