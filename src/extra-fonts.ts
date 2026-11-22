// Font bytes stay in this browser. Documents keep identities, never font files,
// so a missing file is an explicit recovery step rather than a silent fallback.
import {digest} from './browser/crypto';
export type FaceStyle='Regular'|'Bold'|'Italic'|'BoldItalic';
export type FontOrigin='yours'|'web';
export type WebFontSource={revision:string;slug:string;licence:string;file:string;sha256:string;bytes:number};
export type ExtraFont={family:string;origin:FontOrigin;styles:FaceStyle[];sourceFamily:string};
export type ExtraFontFace={style:FaceStyle;variable:boolean;sha256:string;source?:WebFontSource};
export type ExtraFontRequirement={family:string;origin:FontOrigin;sourceFamily:string;faces:ExtraFontFace[]};
export type FontFaceInput={bytes:Uint8Array;style:FaceStyle;variable?:boolean;source?:WebFontSource};
type StoredFace=ExtraFontFace&{family:string;origin:FontOrigin;sourceFamily:string;bytes:Uint8Array};
type Registered={item:ExtraFont;records:StoredFace[];faces:Map<string,FontFace>};
const extras=new Map<string,Registered>(),protectedFamilies=new Set<string>();
const key=(family:string)=>family.trim().toLowerCase();
export const extraFonts=(origin?:FontOrigin)=>[...extras.values()].map(r=>r.item).filter(f=>!origin||f.origin===origin);
export const isExtraFont=(family:string)=>extras.has(key(family));
export const extraFont=(family:string)=>extras.get(key(family))?.item;
export const protectFontFamilies=(families:readonly string[])=>{for(const family of families)protectedFamilies.add(key(family));};
export const isProtectedFont=(family:string)=>protectedFamilies.has(key(family));
const installedProbes=new Map<string,Promise<boolean>>();
export async function protectInstalledFont(family:string){
 if(isProtectedFont(family))return;
 if(!installedProbes.has(key(family)))installedProbes.set(key(family),(async()=>{try{await new FontFace('_bide_upload_probe',`local(${JSON.stringify(family)})`).load();return true;}catch{return false;}})());
 if(await installedProbes.get(key(family)))protectFontFamilies([family]);
}

const hex=(bytes:Uint8Array)=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
const hash=async(bytes:Uint8Array)=>hex(await digest(bytes));
const styles=(r:Pick<StoredFace,'style'|'variable'>):FaceStyle[]=>r.variable?(r.style.endsWith('Italic')?['Italic','BoldItalic']:['Regular','Bold']):[r.style];
const slot=(r:Pick<StoredFace,'style'|'variable'>)=>`${r.style}/${r.variable?'variable':'static'}`;
const conflicts=(a:Pick<StoredFace,'style'|'variable'|'sha256'>,b:Pick<StoredFace,'style'|'variable'|'sha256'>)=>styles(a).some(style=>styles(b).includes(style))&&(a.sha256!==b.sha256||a.variable!==b.variable);
const facePresent=(face:FontFace|undefined)=>!!face&&typeof document!=='undefined'&&document.fonts.has(face);
const complete=(r:Registered)=>r.records.length>0&&r.records.every(face=>facePresent(r.faces.get(slot(face))));
export const validWebSource=(s:WebFontSource|undefined):s is WebFontSource=>!!s&&/^[a-f0-9]{40}$/.test(s.revision)&&/^[a-z0-9]+$/.test(s.slug)&&['ofl','apache','ufl'].includes(s.licence)&&!!s.file&&!/[\\/]/.test(s.file)&&/\.(?:ttf|otf|woff2?)$/i.test(s.file)&&/^[a-f0-9]{64}$/.test(s.sha256)&&Number.isSafeInteger(s.bytes)&&s.bytes>0;
const sameSource=(a:WebFontSource|undefined,b:WebFontSource|undefined)=>!!a&&!!b&&a.revision===b.revision&&a.slug===b.slug&&a.licence===b.licence&&a.file===b.file&&a.sha256===b.sha256&&a.bytes===b.bytes;

// "Raleway-BoldItalic.ttf" -> Raleway, BoldItalic. File names are aliases;
// they must never replace a bundled, system or previously registered face.
export function fontFileName(name:string):{family:string;style:FaceStyle;variable:boolean}|undefined{
 const m=/^(.+)\.(ttf|otf|woff2?)$/i.exec(name.trim());if(!m)return undefined;
 let base=m[1];const variable=/\[[^\]]*wght[^\]]*\]|variable/i.test(base);base=base.replace(/\[[^\]]*\]/g,'').replace(/[-_ ]?variable(font)?/i,'');
 const tail=/[-_ ]?((?:semi|demi|extra|ultra)?bold|black|heavy)?[-_ ]?(italic|oblique)?[-_ ]?(regular|roman|book|normal)?$/i.exec(base),bold=!!tail?.[1],italic=!!tail?.[2];
 const family=(tail&&tail[0]?base.slice(0,base.length-tail[0].length):base).replace(/[-_]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+/g,' ').trim();
 return family?{family,style:bold&&italic?'BoldItalic':bold?'Bold':italic?'Italic':'Regular',variable}:undefined;
}

const DB='bide-fonts',STORE='files';
function transaction<T>(mode:IDBTransactionMode,run:(s:IDBObjectStore)=>()=>T):Promise<T>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('Font storage is unavailable.'));return;}
  let open:IDBOpenDBRequest;try{open=indexedDB.open(DB,1);}catch(error){reject(error);return;}
  let settled=false,db:IDBDatabase|undefined,tx:IDBTransaction|undefined;
  const finish=(error?:unknown,value?:T)=>{if(settled)return;settled=true;clearTimeout(timer);db?.close();if(error)reject(error);else resolve(value!);};
  const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(new Error('Font storage did not respond.'));},5000);
  open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains(STORE))open.result.createObjectStore(STORE);};open.onerror=()=>finish(open.error??new Error('Font storage is unavailable.'));open.onblocked=()=>finish(new Error('Font storage is busy in another tab.'));
  open.onsuccess=()=>{
   db=open.result;if(settled){db.close();return;}
   try{tx=db.transaction(STORE,mode);const result=run(tx.objectStore(STORE));tx.oncomplete=()=>{try{finish(undefined,result());}catch(error){finish(error);}};tx.onerror=tx.onabort=()=>finish(tx?.error??new Error('Font storage is unavailable.'));}catch(error){finish(error);}
  };
 });
}
const readStored=()=>transaction('readonly',store=>{const request=store.getAll();return()=>request.result as unknown[];});
const persist=(records:StoredFace[])=>transaction('readwrite',store=>{for(const record of records)store.put(record,`${record.origin}/${record.family}/${slot(record)}`);return()=>undefined;});
function throwIfAborted(signal?:AbortSignal){if(signal?.aborted)throw signal.reason??new Error('Font loading was cancelled.');}

// All faces are loaded before any is published. A failed Bold file must not
// leave a partly registered family that a later retry mistakes for complete.
export async function registerFontFaces(family:string,inputs:FontFaceInput[],origin:FontOrigin,{sourceFamily=family,persist:keep=false,signal}:{sourceFamily?:string;persist?:boolean;signal?:AbortSignal}={}){
 if(!inputs.length)throw new Error('At least one font face is required.');
 if(!family.trim()||isProtectedFont(family))throw new Error(`The ${family} name is already used. Add this font under its own alias.`);
 const prior=extras.get(key(family));if(prior&&prior.item.origin!==origin)throw new Error(`The ${family} name is already used by another font.`);
 const records:StoredFace[]=[];
 for(const input of inputs){
  throwIfAborted(signal);const sha256=await hash(input.bytes);throwIfAborted(signal);
  if(origin==='web'&&(!validWebSource(input.source)||input.source.sha256!==sha256||input.source.bytes!==input.bytes.length))throw new Error('The downloaded font did not match its pinned source.');
  const record:StoredFace={family:prior?.item.family??family,origin,sourceFamily,style:input.style,variable:!!input.variable,sha256,bytes:input.bytes.slice(),...(input.source?{source:{...input.source}}:{})};
  const old=prior?.records.find(r=>conflicts(r,record)||slot(r)===slot(record));
  if(old&&(conflicts(old,record)||origin==='web'&&!sameSource(old.source,record.source)))throw new Error(`A different ${family} face is already in use. Add it as another font version.`);
  const duplicate=records.find(r=>conflicts(r,record)||slot(r)===slot(record));if(duplicate&&conflicts(duplicate,record))throw new Error('Two different files describe the same font style.');
  if(!duplicate)records.push(record);
 }
 const pending=records.filter(r=>!prior?.records.some(old=>slot(old)===slot(r)&&old.sha256===r.sha256&&facePresent(prior.faces.get(slot(old)))));
 const prepared=await Promise.all(pending.map(async r=>{const face=new FontFace(r.family,r.bytes.slice().buffer,{weight:r.variable?'100 900':r.style.startsWith('Bold')?'700':'400',style:r.style.endsWith('Italic')?'italic':'normal'});await face.load();throwIfAborted(signal);return{record:r,face};}));
 throwIfAborted(signal);
 // Fabric otherwise retains widths measured before a newly added face existed.
 const {cache}=await import('fabric');throwIfAborted(signal);
 const added:FontFace[]=[];
 try{for(const {face} of prepared){document.fonts.add(face);added.push(face);}}catch(error){for(const face of added)document.fonts.delete(face);throw error;}
 const all=[...prior?.records??[]];for(const r of records)if(!all.some(old=>slot(old)===slot(r)&&old.sha256===r.sha256))all.push(r);
 const item:ExtraFont={family:prior?.item.family??family,origin,sourceFamily:prior?.item.sourceFamily??sourceFamily,styles:[...new Set(all.flatMap(styles))]};
 const faces=new Map(prior?.faces??[]);for(const {record,face} of prepared)faces.set(slot(record),face);
 extras.set(key(family),{item,records:all,faces});cache.clearFontCache(item.family);
 if(keep)try{await persist(records);}catch{/* The live font still works; its document identity requires re-upload if storage was unavailable. */}
 return item;
}
export async function registerFont(family:string,bytes:Uint8Array,style:FaceStyle,origin:FontOrigin,variable=false){return registerFontFaces(family,[{bytes,style,variable}],origin);}

export function availableFontAlias(family:string,origin:FontOrigin){
 if(!isProtectedFont(family)&&!extras.has(key(family)))return family;
 const label=origin==='yours'?'yours':'web';let number=1,alias:string;
 do{alias=`${family} (${label}${number===1?'':` ${number}`})`;number++;}while(isProtectedFont(alias)||extras.has(key(alias)));
 return alias;
}
function userAlias(sourceFamily:string,records:Pick<StoredFace,'style'|'variable'|'sha256'>[]){
 const compatible=[...extras.values()].filter(r=>r.item.origin==='yours'&&key(r.item.sourceFamily)===key(sourceFamily)&&records.every(face=>!r.records.some(old=>conflicts(old,face))));
 compatible.sort((a,b)=>records.filter(r=>b.records.some(old=>slot(old)===slot(r)&&old.sha256===r.sha256)).length-records.filter(r=>a.records.some(old=>slot(old)===slot(r)&&old.sha256===r.sha256)).length);
 return compatible[0]?.item.family??availableFontAlias(sourceFamily,'yours');
}
let restoring:Promise<string[]>|undefined;
export function restoreFonts(){
 return restoring??=(async()=>{
  try{
   const all=await readStored(),groups=new Map<string,StoredFace[]>();
   for(const value of all){
    if(!value||typeof value!=='object')continue;const row=value as Partial<StoredFace>;
    if(typeof row.family!=='string'||!['Regular','Bold','Italic','BoldItalic'].includes(row.style??'')||!(row.bytes instanceof Uint8Array))continue;
    const sha256=await hash(row.bytes);if(row.sha256&&row.sha256!==sha256)continue;
    const origin:FontOrigin=row.origin==='web'?'web':'yours';if(origin==='web'&&(!validWebSource(row.source)||row.source.sha256!==sha256||row.source.bytes!==row.bytes.length))continue;
    const record:StoredFace={family:row.family,sourceFamily:row.sourceFamily??row.family,origin,style:row.style!,variable:!!row.variable,bytes:row.bytes,sha256,...(row.source?{source:row.source}:{})};
    const group=`${origin}/${key(row.family)}`,records=groups.get(group)??[];if(!records.some(old=>slot(old)===slot(record)&&old.sha256===record.sha256))records.push(record);groups.set(group,records);
   }
   for(const records of groups.values())try{
    const first=records[0];await protectInstalledFont(first.family);const family=availableFontAlias(first.family,first.origin);
    await registerFontFaces(family,records,first.origin,{sourceFamily:first.sourceFamily});
   }catch{}
  }catch{}
  return extraFonts('yours').map(f=>f.family);
 })();
}
let additions:Promise<unknown>=Promise.resolve();
export function addFontFiles(files:File[],taken:readonly string[]=[]):Promise<string[]>{
 const run=additions.then(async()=>{
  protectFontFamilies(taken);await restoreFonts();const groups=new Map<string,{sourceFamily:string;inputs:FontFaceInput[];identities:Pick<StoredFace,'style'|'variable'|'sha256'>[]}>();
  for(const file of files){
   const parsed=fontFileName(file.name);if(!parsed)throw new Error(`${file.name} is not a font file. Choose a TTF, OTF, WOFF or WOFF2 file.`);
   if(file.size>12*1024*1024)throw new Error(`${file.name} is larger than 12 MB.`);
   const bytes=new Uint8Array(await file.arrayBuffer()),sha256=await hash(bytes),group=groups.get(key(parsed.family))??{sourceFamily:parsed.family,inputs:[],identities:[]};
   const identity={style:parsed.style,variable:parsed.variable,sha256};
   if(group.identities.some(old=>conflicts(old,identity)))throw new Error(`Choose one file for each ${parsed.family} style.`);
   group.inputs.push({bytes,style:parsed.style,variable:parsed.variable});group.identities.push(identity);groups.set(key(parsed.family),group);
  }
  // Reject an invalid multi-file selection before publishing any family.
  for(const group of groups.values())for(const input of group.inputs)try{await new FontFace('_bide_font_validation',input.bytes.slice().buffer,{weight:input.variable?'100 900':input.style.startsWith('Bold')?'700':'400',style:input.style.endsWith('Italic')?'italic':'normal'}).load();}catch{throw new Error(`${group.sourceFamily} could not be read as a font.`);}
  const added:string[]=[];
  for(const group of groups.values()){
   await protectInstalledFont(group.sourceFamily);const family=userAlias(group.sourceFamily,group.identities);
   try{await registerFontFaces(family,group.inputs,'yours',{sourceFamily:group.sourceFamily,persist:true});}catch(error){if(error instanceof Error&&/already|different/.test(error.message))throw error;throw new Error(`${group.sourceFamily} could not be read as a font.`);}
   if(!added.includes(family))added.push(family);
  }
  return added;
 });additions=run.catch(()=>{});return run;
}

export function fontRequirement(family:string):ExtraFontRequirement|undefined{
 const registered=extras.get(key(family));if(!registered)return undefined;
 return {family:registered.item.family,origin:registered.item.origin,sourceFamily:registered.item.sourceFamily,faces:registered.records.map(({style,variable,sha256,source})=>({style,variable,sha256,...(source?{source:{...source}}:{})}))};
}
export function requiredFonts(value:unknown):ExtraFontRequirement[]{
 if(value===undefined||value===null)return [];
 const raw=Array.isArray(value)?value:value&&typeof value==='object'?[value]:undefined;
 if(!raw||raw.some(r=>!r||typeof r.family!=='string'||!r.family||(r.origin!=='yours'&&r.origin!=='web')||typeof r.sourceFamily!=='string'||!r.sourceFamily||!Array.isArray(r.faces)||!r.faces.length||!r.faces.every((f:ExtraFontFace)=>f&&['Regular','Bold','Italic','BoldItalic'].includes(f.style)&&typeof f.variable==='boolean'&&/^[a-f0-9]{64}$/.test(f.sha256)&&(r.origin!=='web'||validWebSource(f.source)&&f.source.sha256===f.sha256))))throw new Error('The saved font information is invalid. Add the font files again before opening or exporting.');
 return raw as ExtraFontRequirement[];
}
export function matchingExtraFont(requirement:ExtraFontRequirement):string|undefined{
 const candidates=[...extras.values()].sort((a,b)=>Number(key(b.item.family)===key(requirement.family))-Number(key(a.item.family)===key(requirement.family)));
 for(const registered of candidates){const {item,records}=registered;if(complete(registered)&&requirement.faces.every(face=>records.some(r=>r.sha256===face.sha256&&r.style===face.style&&r.variable===face.variable&&(requirement.origin!=='web'||!face.source||r.origin==='yours'||sameSource(r.source,face.source)))))return item.family;}
}
export function missingFontMessage(family:string){return `The font “${family}” used by this document is unavailable. Add the same font file again before opening or exporting. Your document has not been changed.`;}
export function textFontRequirements(text:{fontFamily:string;styles?:unknown;extraFontRequired?:unknown}):ExtraFontRequirement[]{
 const families=new Set([text.fontFamily]);
 if(text.styles&&typeof text.styles==='object')for(const line of Object.values(text.styles))if(line&&typeof line==='object')for(const style of Object.values(line))if(style&&typeof style==='object'&&typeof (style as {fontFamily?:unknown}).fontFamily==='string')families.add((style as {fontFamily:string}).fontFamily);
 const prior=requiredFonts(text.extraFontRequired);return [...families].flatMap(family=>{const live=fontRequirement(family),old=prior.find(r=>key(r.family)===key(family));if(old&&live&&(key(old.sourceFamily)!==key(live.sourceFamily)||!old.faces.every(face=>live.faces.some(candidate=>candidate.style===face.style&&candidate.variable===face.variable&&candidate.sha256===face.sha256))))return [old];return live?[live]:old?[old]:[];});
}
export function assertExtraFontsAvailable(requirements:unknown){for(const requirement of requiredFonts(requirements))if(key(matchingExtraFont(requirement)??'')!==key(requirement.family))throw new Error(missingFontMessage(requirement.family));}
export function completedWebFont(family:string,inputs:{style:FaceStyle;variable?:boolean;source:WebFontSource}[]){
 const current=extras.get(key(family));return !!current&&complete(current)&&current.item.origin==='web'&&inputs.every(face=>current.records.some(r=>r.style===face.style&&r.variable===!!face.variable&&r.sha256===face.source.sha256&&sameSource(r.source,face.source)));
}
export async function ensureExtraFont(family:string){
 const current=extras.get(key(family));if(!current)return false;
 if(!complete(current))await registerFontFaces(current.item.family,current.records,current.item.origin,{sourceFamily:current.item.sourceFamily});
 return true;
}
export async function removeFont(family:string){
 const current=extras.get(key(family));extras.delete(key(family));if(current)for(const face of current.faces.values())document.fonts.delete(face);
 const {cache}=await import('fabric');cache.clearFontCache(family);
 try{await transaction('readwrite',store=>{const keys=store.getAllKeys(),values=store.getAll();values.onsuccess=()=>{for(let i=0;i<values.result.length;i++)if(key(values.result[i]?.family??'')===key(family))store.delete(keys.result[i]);};return()=>undefined;});}catch{}
}
