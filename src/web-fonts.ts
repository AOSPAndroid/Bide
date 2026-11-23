// Open fonts on demand. The app bundles 63 families; Google Fonts has some
// 1,800 open ones (OFL, Apache, UFL). An index built at build time
// (scripts/build-font-index.py: for each family's Regular and Bold, every
// letter and digit as an 8x8 picture of its ink plus its width over its
// height, 34 bytes a character) lets the letters of a page pick the few
// families worth trying; only those are downloaded, checked against the
// index's SHA-256, and compared on the page's pixels like bundled faces.
import {HOSTED_BUILD} from './build-flags';
import {registerFont,isExtraFont,type FaceStyle} from './extra-fonts';
import {digest} from './browser/crypto';

// On in the hosted editions, and on any copy served from a public https site
// (however it was built): only a copy opened from this computer or the office
// network (localhost, a private address, a file) stays offline.
// VITE_WEB_FONTS=1 or 0 decides it at build time.
export function publicSite(location:{protocol:string;hostname:string}|undefined=typeof window==='undefined'?undefined:window.location){
 if(!location||location.protocol!=='https:')return false;
 const h=location.hostname;
 return !(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.lan')||h.endsWith('.internal')||!h.includes('.')||/^(127|10)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)||h.includes(':'));
}
const setting=(import.meta.env as Record<string,string|undefined>|undefined)?.VITE_WEB_FONTS;
export const WEB_FONTS=setting==='1'||setting!=='0'&&(HOSTED_BUILD||publicSite());
type Family={family:string;slug:string;licence:string;category:string;files:Record<string,{sha256:string;bytes:number;variable:boolean}>;faces:{style:FaceStyle;file:string;row:number}[]};
type Index={revision:string;chars:string;cell:number;rows:number;families:Family[];bin:Uint8Array};
let loading:Promise<Index|undefined>|undefined;
export function fontIndex(base=document.baseURI){
 return loading??=(async()=>{
  try{
   const [meta,bin]=await Promise.all([fetch(new URL('fonts/index.json',base)),fetch(new URL('fonts/index.bin',base))]);if(!meta.ok||!bin.ok)return undefined;
   return {...await meta.json(),bin:new Uint8Array(await bin.arrayBuffer())} as Index;
  }catch{return undefined;}
 })();
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
   let sum=0,n=0;for(const g of known){const at=face.row*index.cell*index.chars.length+g.at*index.cell;sum+=distance(g.d,index.bin,at);n++;}
   if(n&&sum/n<best)best=sum/n;
  }
  if(best<Infinity)scored.push({family,score:best});
 }
 return scored.sort((a,b)=>a.score-b.score).slice(0,count);
}

const BASE=(import.meta.env as Record<string,string|undefined>).VITE_FONT_BASE??'https://raw.githubusercontent.com/google/fonts/';
const fetched=new Map<string,Promise<boolean>>();
const hex=(b:Uint8Array)=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
// Downloads a family's Regular and Bold (one file when it is variable),
// verified, and makes it drawable. False when it could not be had.
export function loadWebFont(index:Index,family:Family,request:typeof fetch=fetch){
 if(isExtraFont(family.family))return Promise.resolve(true);
 if(!fetched.has(family.family))fetched.set(family.family,(async()=>{
  const got=new Map<string,Uint8Array>();
  for(const face of family.faces){
   const info=family.files[face.file];let bytes=got.get(face.file);
   if(!bytes){
    const response=await request(`${BASE}${index.revision}/${family.licence}/${family.slug}/${encodeURIComponent(face.file)}`,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)return false;
    bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==info.bytes||hex(await digest(bytes))!==info.sha256)return false;got.set(face.file,bytes);
   }
   await registerFont(family.family,bytes,face.style,'web',info.variable);
   if(info.variable)break;
  }
  return true;
 })().catch(()=>false).then(ok=>{if(!ok)fetched.delete(family.family);return ok;}));
 return fetched.get(family.family)!;
}
