// Open fonts on demand. The app bundles 63 families; Google Fonts has some
// 1,800 open ones (OFL, Apache, UFL). An index built at build time
// (scripts/build-font-index.py: for each family's Regular and Bold, every
// letter and digit as an 8x8 picture of its ink plus its width over its
// height, 34 bytes a character) lets the letters of a page pick the few
// families worth trying; only those are downloaded, checked against the
// index's SHA-256, and compared on the page's pixels like bundled faces.
// Hosted editions only: the downloadable edition stays offline.
import {registerFontFaces,restoreFonts,extraFont,isProtectedFont,protectInstalledFont,availableFontAlias,completedWebFont,validWebSource,type FaceStyle,type WebFontSource,type FontFaceInput,type ExtraFontRequirement} from './extra-fonts';
import {digest} from './browser/crypto';

const env=(import.meta as ImportMeta&{env?:Record<string,string|undefined>}).env??{};
export const WEB_FONTS=(env.VITE_WEB_FONTS??(['demo','saas'].includes(env.MODE??'')?'1':''))==='1';
type Family={family:string;slug:string;licence:string;category:string;files:Record<string,{sha256:string;bytes:number;variable:boolean}>;faces:{style:FaceStyle;file:string;row:number}[]};
type Index={revision:string;chars:string;cell:number;rows:number;families:Family[];bin:Uint8Array};
export const FONT_INDEX_TIMEOUT_MS=5000,FONT_DOWNLOAD_TIMEOUT_MS=8000;
async function bounded<T>(run:(signal:AbortSignal)=>Promise<T>,timeoutMs:number):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const stopped=new Promise<never>((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true});timer=setTimeout(()=>controller.abort(new Error('The font download timed out.')),Math.max(1,timeoutMs));});
 try{return await Promise.race([run(controller.signal),stopped]);}finally{if(timer)clearTimeout(timer);}
}
const hex=(b:Uint8Array)=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
function sourceFor(index:Pick<Index,'revision'>,family:Family,file:string):WebFontSource{
 const info=family.files[file];return {revision:index.revision,slug:family.slug,licence:family.licence,file,sha256:info?.sha256,bytes:info?.bytes};
}
function validIndex(index:Index){
 if(!/^[a-f0-9]{40}$/.test(index.revision)||index.chars!=='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'||index.cell!==34||!Number.isSafeInteger(index.rows)||index.rows<1||index.bin.length!==index.rows*index.cell*index.chars.length||!Array.isArray(index.families))return false;
 return index.families.every(f=>typeof f.family==='string'&&!!f.family&&Array.isArray(f.faces)&&!!f.faces.length&&f.faces.every(face=>['Regular','Bold','Italic','BoldItalic'].includes(face.style)&&Number.isSafeInteger(face.row)&&face.row>=0&&face.row<index.rows&&validWebSource(sourceFor(index,f,face.file))));
}
let loading:Promise<Index|undefined>|undefined;
export function fontIndex(base=typeof document==='undefined'?'http://localhost/':document.baseURI,request:typeof fetch=fetch,timeoutMs=FONT_INDEX_TIMEOUT_MS){
 if(!loading){
  const attempt=bounded(async signal=>{
   const [meta,bin]=await Promise.all([request(new URL('fonts/index.json',base),{signal}),request(new URL('fonts/index.bin',base),{signal})]);if(!meta.ok||!bin.ok)return undefined;
   const index={...await meta.json(),bin:new Uint8Array(await bin.arrayBuffer())} as Index;signal.throwIfAborted();return validIndex(index)?index:undefined;
  },timeoutMs).catch(()=>undefined);
  loading=attempt;void attempt.then(index=>{if(!index&&loading===attempt)loading=undefined;});
 }
 return loading;
}

// One letter as the index describes it: the ink box of `cover` (coverage 0-1,
// row-major) scaled to 8x8 by area, 0-15 a cell, and its width over its height.
export type Descriptor={cells:Uint8Array;aspect:number};
export function describeGlyph(cover:ArrayLike<number>,width:number,height:number,x0=0,x1=width,ink=.3):Descriptor|undefined{
 let l=x1,r=x0-1,t=height,b=-1;
 for(let y=0;y<height;y++)for(let x=Math.max(0,x0);x<Math.min(width,x1);x++)if(cover[y*width+x]>=ink){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
 if(b<0)return undefined;
 const w=r-l+1,h=b-t+1,cells=new Uint8Array(64);
 for(let j=0;j<8;j++)for(let i=0;i<8;i++){
  // Box average over the cell's share of the ink box (fractional edges weighted).
  const xa=l+i*w/8,xb=l+(i+1)*w/8,ya=t+j*h/8,yb=t+(j+1)*h/8;let sum=0,area=0;
  for(let y=Math.floor(ya);y<Math.ceil(yb);y++)for(let x=Math.floor(xa);x<Math.ceil(xb);x++){const wx=Math.min(x+1,xb)-Math.max(x,xa),wy=Math.min(y+1,yb)-Math.max(y,ya),k=wx*wy;sum+=Math.min(1,cover[y*width+x])*k;area+=k;}
  cells[j*8+i]=Math.min(15,Math.round(15*sum/(area||1)));
 }
 return {cells,aspect:w/h};
}
// 0 = the same letter, about 1 = nothing alike.
function distance(d:Descriptor,bin:Uint8Array,at:number){
 let sum=0;for(let i=0;i<32;i++){const v=bin[at+i];sum+=Math.abs(d.cells[2*i]-(v>>4))+Math.abs(d.cells[2*i+1]-(v&15));}
 const aspect=bin[at+32]/64;return sum/(64*15)+(aspect>0?Math.min(1,Math.abs(Math.log(d.aspect/aspect))):1)*.5;
}
// The families whose letters look most like these (`glyphs`: character and
// descriptor), best first. A face must have every character it is judged on.
export function shortlist(index:Index,glyphs:{ch:string;d:Descriptor}[],count=6,skip:(family:string)=>boolean=()=>false){
 const known=glyphs.map(g=>({at:index.chars.indexOf(g.ch),d:g.d})).filter(g=>g.at>=0);if(known.length<4)return [];
 const scored:{family:Family;score:number}[]=[];
 for(const family of index.families){
  if(skip(family.family))continue;let best=Infinity;
  for(const face of family.faces){
   let sum=0,n=0;for(const g of known){const at=face.row*index.cell*index.chars.length+g.at*index.cell;if(!index.bin.subarray(at,at+32).some(v=>v>0)){n=0;break;}sum+=distance(g.d,index.bin,at);n++;}
   if(n&&sum/n<best)best=sum/n;
  }
  if(best<Infinity)scored.push({family,score:best});
 }
 return scored.sort((a,b)=>a.score-b.score).slice(0,count);
}

const BASE=env.VITE_FONT_BASE??'https://raw.githubusercontent.com/google/fonts/';
const fetched=new Map<string,Promise<boolean>>();
function wantedFaces(index:Pick<Index,'revision'>,family:Family){
 const seen=new Set<string>();return family.faces.flatMap(face=>{
  const info=family.files[face.file],id=info?.variable?face.file:`${face.file}/${face.style}`;if(seen.has(id))return [];seen.add(id);
  return [{style:face.style,variable:!!info?.variable,source:sourceFor(index,family,face.file)}];
 });
}
async function acquire(family:string,sourceFamily:string,wanted:{style:FaceStyle;variable:boolean;source:WebFontSource}[],request:typeof fetch,timeoutMs:number){
 await protectInstalledFont(family);
 if(wanted.some(face=>!validWebSource(face.source))||!wanted.length||isProtectedFont(family))return false;
 const current=extraFont(family);if(current?.origin==='yours')return false;
 if(completedWebFont(family,wanted))return true;
 const fingerprint=JSON.stringify([family.toLowerCase(),wanted]);
 if(!fetched.has(fingerprint)){
  const attempt=bounded(async signal=>{
   const byFile=new Map<string,Promise<Uint8Array>>();
   const inputs:FontFaceInput[]=await Promise.all(wanted.map(async face=>{
    const pin=face.source,id=JSON.stringify(pin);if(!byFile.has(id))byFile.set(id,(async()=>{
     const url=`${BASE.endsWith('/')?BASE:BASE+'/'}${pin.revision}/${pin.licence}/${pin.slug}/${encodeURIComponent(pin.file)}`;
     const response=await request(url,{signal,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('The font could not be downloaded.');
     const bytes=new Uint8Array(await response.arrayBuffer());signal.throwIfAborted();if(bytes.length!==pin.bytes||hex(await digest(bytes))!==pin.sha256)throw new Error('The font did not match its pinned size and SHA-256.');signal.throwIfAborted();return bytes;
    })());
    return {bytes:await byFile.get(id)!,style:face.style,variable:face.variable,source:pin};
   }));
   signal.throwIfAborted();await registerFontFaces(family,inputs,'web',{sourceFamily,persist:true,signal});signal.throwIfAborted();return completedWebFont(family,wanted);
  },timeoutMs).catch(()=>false);
  fetched.set(fingerprint,attempt);void attempt.finally(()=>{if(fetched.get(fingerprint)===attempt)fetched.delete(fingerprint);});
 }
 return fetched.get(fingerprint)!;
}
// A family is published only after every required file passes its pinned checks.
// The map holds in-flight work only, so removal/failure can always be retried.
export async function loadWebFont(index:Index,family:Family,request:typeof fetch=fetch,{timeoutMs=FONT_DOWNLOAD_TIMEOUT_MS}:{timeoutMs?:number}={}){
 await restoreFonts();return acquire(family.family,family.family,wantedFaces(index,family),request,timeoutMs);
}
// Saved text can recover the exact same pinned files if its local cache was
// cleared. Local editions stay offline; uploading those same files also works.
export async function restoreRequiredWebFont(required:ExtraFontRequirement,request:typeof fetch=fetch){
 if(!WEB_FONTS||required.origin!=='web'||required.faces.some(face=>!validWebSource(face.source)))return false;
 const family=extraFont(required.family)||isProtectedFont(required.family)?availableFontAlias(required.family,'web'):required.family;
 return acquire(family,required.sourceFamily,required.faces.map(face=>({style:face.style,variable:face.variable,source:face.source!})),request,FONT_DOWNLOAD_TIMEOUT_MS);
}
