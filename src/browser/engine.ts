import type { ExportSpec } from './pdf-core';
import { convertOffice } from './office';
let worker:Worker|undefined;
let nextId=1;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function rpc<T>(method:string,args:unknown={}):Promise<T>{
  if(!worker){
    worker=new Worker(new URL('./pdf.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.data.id);if(e.data.error)p.reject(new Error(e.data.error));else p.resolve(e.data.result);};
    worker.onerror=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(e.message||'The browser document engine could not start.'));}pending.clear();worker?.terminate();worker=undefined;};
  }
  return new Promise((resolve,reject)=>{
    const id=nextId++,timer=setTimeout(()=>{pending.delete(id);reject(new Error('This document operation took too long. Try a smaller file.'));},180000);
    pending.set(id,{resolve,reject,timer});worker!.postMessage({id,method,args});
  });
}
export const engineHealth=()=>rpc<{ok:boolean;office:boolean}>('health');
export const restoreSources=(sources:Record<string,string>)=>rpc('restore',sources);
export async function importDocument(file:File,password?:string){
  let bytes=new Uint8Array(await file.arrayBuffer()),name=file.name;
  if(/\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i.test(name)){bytes=await convertOffice(bytes,name);name='converted.pdf';}
  return rpc<{id:string;data:string;pages:{index:number;width:number;height:number}[]}>('import',{bytes,name,password});
}
export async function exportInBrowser(spec:ExportSpec){const result=await rpc<{bytes:Uint8Array<ArrayBuffer>;mime:string}>('export',spec);return new Blob([result.bytes],{type:result.mime});}
const previews=new Map<string,Promise<string>>();
export function pagePreview(source:string,index:number,scale:number){const key=`${source}/${index}/${scale}`;let p=previews.get(key);if(!p){p=rpc<Uint8Array<ArrayBuffer>>('render',{source,index,scale}).then(data=>URL.createObjectURL(new Blob([data],{type:'image/png'}))).catch(e=>{previews.delete(key);throw e;});previews.set(key,p);}return p;}

export const detectPdfText=(source:string,index:number)=>rpc<{regions:import('../text-regions').TextRegion[];skipped:number}>('detectText',{source,index});
export const removePdfText=(source:string,index:number,regionId:string)=>rpc<{id:string;data:string}>('removeText',{source,index,regionId});
export const fontSupportsText=(data:string,text:string)=>rpc<boolean>('fontSupports',{data,text});
