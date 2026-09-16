// Install the message handler immediately; the WASM module uses top-level await.
const engineReady=import('./pdf-core');
let queue=Promise.resolve();
self.onmessage=(event:MessageEvent)=>{
  const {id,method,args}=event.data;
  queue=queue.then(async()=>{
    try {
      const engine=await engineReady;
      let result:unknown;
      switch(method){
        case 'health':result={ok:true,office:globalThis.isSecureContext&&globalThis.crossOriginIsolated};break;
        case 'import':result=await engine.importBytes(args.bytes,args.name,args.password);break;
        case 'restore':result=await engine.restore(args);break;
        case 'render':result=engine.render(args.source,args.index,args.scale);break;
        case 'export':result=await engine.exportDocument(args);break;
        default:throw new Error('Unknown document operation.');
      }
      self.postMessage({id,result});
    }catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e)});}
  });
};
