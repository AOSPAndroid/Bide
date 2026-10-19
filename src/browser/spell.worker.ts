// Loads the Hunspell dictionaries off the main thread (French takes seconds)
// and answers proofreading requests.
import nspell from 'nspell';
import {findDoubts,type Checker} from '../spelling';
let checkers:Promise<Checker[]>|undefined;
self.onmessage=async(event:MessageEvent)=>{
 const {id,base,languages,text,unsure}=event.data;
 try{
  checkers??=Promise.all((languages as string[]).map(async code=>{
   const [aff,dic]=await Promise.all(['aff','dic'].map(ext=>fetch(new URL(`ocr/spell/${code}.${ext}`,base)).then(r=>{if(!r.ok)throw new Error(`Spelling dictionary ${code} is missing.`);return r.text();})));
   return nspell(aff,dic);
  }));
  self.postMessage({id,doubts:findDoubts(text,await checkers,new Set(unsure))});
 }catch(e){checkers=undefined;self.postMessage({id,error:e instanceof Error?e.message:String(e)});}
};
