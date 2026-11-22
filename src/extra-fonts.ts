// Fonts added while the app runs: the user's own font files, kept in this
// browser (IndexedDB), and open fonts downloaded on demand (web-fonts.ts).
// Each is a family the canvas can draw at once; text in such a font is
// exported as pixels (text-appearance.ts), so no file has to be embedded.
export type FaceStyle='Regular'|'Bold'|'Italic'|'BoldItalic';
export type ExtraFont={family:string;origin:'yours'|'web';styles:FaceStyle[]};
const extras=new Map<string,ExtraFont>();
export const extraFonts=(origin?:ExtraFont['origin'])=>[...extras.values()].filter(f=>!origin||f.origin===origin);
export const isExtraFont=(family:string)=>extras.has(family);

// "Raleway-BoldItalic.ttf" → Raleway, BoldItalic; "My Brand Font Bold.otf" →
// My Brand Font, Bold; "Inter[wght].ttf" → Inter (a variable font: every weight).
export function fontFileName(name:string):{family:string;style:FaceStyle;variable:boolean}|undefined{
 const m=/^(.+)\.(ttf|otf|woff2?)$/i.exec(name.trim());if(!m)return undefined;
 let base=m[1];const variable=/\[[^\]]*wght[^\]]*\]|variable/i.test(base);base=base.replace(/\[[^\]]*\]/g,'').replace(/[-_ ]?variable(font)?/i,'');
 const tail=/[-_ ]?((?:semi|demi|extra|ultra)?bold|black|heavy)?[-_ ]?(italic|oblique)?[-_ ]?(regular|roman|book|normal)?$/i.exec(base),bold=!!tail?.[1],italic=!!tail?.[2];
 const family=(tail&&tail[0]?base.slice(0,base.length-tail[0].length):base).replace(/[-_]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+/g,' ').trim();
 if(!family)return undefined;
 return {family,style:bold&&italic?'BoldItalic':bold?'Bold':italic?'Italic':'Regular',variable};
}

// A face made drawable. `taken`: families the app already has; a font of the
// same name is added as "<family> (yours)", not mixed with the bundled one.
export async function registerFont(family:string,bytes:Uint8Array,style:FaceStyle,origin:ExtraFont['origin'],variable=false){
 const face=new FontFace(family,bytes.slice().buffer,{weight:variable?'100 900':style.startsWith('Bold')?'700':'400',style:style.endsWith('Italic')?'italic':'normal'});
 await face.load();document.fonts.add(face);
 const item=extras.get(family)??{family,origin,styles:[]};if(!item.styles.includes(style))item.styles.push(style);if(variable&&!item.styles.includes('Bold'))item.styles.push('Bold');extras.set(family,item);
 return item;
}

// --- The user's own files -----------------------------------------------
const DB='bide-fonts',STORE='files';
function store<T>(mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  const open=indexedDB.open(DB,1);open.onupgradeneeded=()=>open.result.createObjectStore(STORE);open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result,tx=db.transaction(STORE,mode),request=run(tx.objectStore(STORE));tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};};
 });
}
const MAX=12*1024*1024;
// Adds font files (TTF, OTF, WOFF, WOFF2). Returns the families added;
// throws with a sentence for the user when a file is not a usable font.
export async function addFontFiles(files:File[],taken:readonly string[]=[]):Promise<string[]>{
 const added:string[]=[];
 for(const file of files){
  const parsed=fontFileName(file.name);if(!parsed)throw new Error(`${file.name} is not a font file. Choose a TTF, OTF, WOFF or WOFF2 file.`);
  if(file.size>MAX)throw new Error(`${file.name} is larger than 12 MB.`);
  const bytes=new Uint8Array(await file.arrayBuffer()),family=taken.includes(parsed.family)?`${parsed.family} (yours)`:parsed.family;
  try{await registerFont(family,bytes,parsed.style,'yours',parsed.variable);}catch{throw new Error(`${file.name} could not be read as a font.`);}
  try{await store('readwrite',s=>s.put({family,style:parsed.style,variable:parsed.variable,bytes},`${family}/${parsed.style}`));}catch{/* private window or full storage: the font works until the page closes */}
  if(!added.includes(family))added.push(family);
 }
 return added;
}
// The fonts added on earlier visits.
export async function restoreFonts(){
 try{
  const all=await store<{family:string;style:FaceStyle;variable:boolean;bytes:Uint8Array}[]>('readonly',s=>s.getAll());
  for(const f of all)try{await registerFont(f.family,f.bytes,f.style,'yours',f.variable);}catch{}
 }catch{}
 return extraFonts('yours').map(f=>f.family);
}
export async function removeFont(family:string){
 extras.delete(family);for(const face of [...document.fonts])if(face.family.replace(/^["']|["']$/g,'')===family)document.fonts.delete(face);
 try{const keys=await store<IDBValidKey[]>('readonly',s=>s.getAllKeys());for(const key of keys)if(String(key).startsWith(family+'/'))await store('readwrite',s=>s.delete(key));}catch{}
}
