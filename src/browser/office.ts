let iframe:HTMLIFrameElement|undefined;
let ready:Promise<void>|undefined;
let sequence=0;
const jobs=new Map<number,{resolve:(bytes:Uint8Array<ArrayBuffer>)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function init(){
 if(ready)return ready;
 if(!globalThis.isSecureContext)throw new Error('Office conversion on another PC needs a trusted HTTPS address. Ask the host to configure HTTPS using HOSTING.md. On the hosting PC, launch bide.bat supports Office conversion locally. PDF and image tools still work at this HTTP address.');
 if(!crossOriginIsolated)throw new Error('Office conversion needs browser isolation enabled by the website host. Use the bide sharing launcher with HTTPS, or ask your host to apply the response headers in HOSTING.md.');
 ready=new Promise<void>((resolve,reject)=>{
  iframe=document.createElement('iframe');iframe.src=new URL('office/index.html',document.baseURI).href;iframe.hidden=true;iframe.title='Local Office conversion engine';
  const timer=setTimeout(()=>reject(new Error('The Office engine did not finish loading. Check the connection and reload the workspace.')),240000);
  window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.source!==iframe?.contentWindow)return;
   const msg=event.data;
   if(msg?.type==='bide-office-ready'){clearTimeout(timer);resolve();}
   if(msg?.type==='bide-office-error'&&!msg.id){clearTimeout(timer);reject(new Error(msg.error));}
   if(msg?.id&&jobs.has(msg.id)){const job=jobs.get(msg.id)!;clearTimeout(job.timer);jobs.delete(msg.id);msg.error?job.reject(new Error(msg.error)):job.resolve(new Uint8Array(msg.bytes));}
  });
  document.body.appendChild(iframe);
 });
 return ready;
}
let conversionQueue=Promise.resolve();
export async function convertOffice(bytes:Uint8Array,name:string):Promise<Uint8Array<ArrayBuffer>>{
 await init();
 return new Promise((resolve,reject)=>{
  conversionQueue=conversionQueue.then(()=>new Promise<void>(done=>{
   const id=++sequence,timer=setTimeout(()=>{jobs.delete(id);reject(new Error('Office conversion timed out. Reload the app before trying again.'));done();},120000);
   jobs.set(id,{resolve:b=>{resolve(b);done();},reject:e=>{reject(e);done();},timer});
   const data=bytes.slice().buffer;iframe!.contentWindow!.postMessage({type:'bide-office-convert',id,name,bytes:data},location.origin,[data]);
  }));
 });
}
