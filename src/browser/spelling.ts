// Main-thread access to the spelling worker.
import type {Doubt} from '../spelling';
let worker:Worker|undefined,seq=0;const pending=new Map<number,(r:{doubts?:Doubt[];error?:string})=>void>();
// Dictionaries bundled for proofreading: English and French cover the default OCR languages.
export const spellLanguages=['en','fr'];
export function proofread(text:string,unsure:number[]=[]):Promise<Doubt[]>{
 if(!worker){worker=new Worker(new URL('./spell.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{pending.get(e.data.id)?.(e.data);pending.delete(e.data.id);};}
 const id=++seq;
 return new Promise((resolve,reject)=>{pending.set(id,r=>r.error?reject(new Error(r.error)):resolve(r.doubts??[]));worker!.postMessage({id,base:new URL('./',document.baseURI).href,languages:spellLanguages,text,unsure});});
}
