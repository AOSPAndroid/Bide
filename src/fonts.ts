import {bundledFonts} from './font-catalog';
const loaded=new Map<string,Promise<void>>();
export function ensureFont(family:string):Promise<void> {
  const item=bundledFonts.find(font=>font.family===family);if(!item)return Promise.resolve();
  if(!loaded.has(family))loaded.set(family,Promise.all(item.faces.map(async face=>{
    const font=new FontFace(family,`url("${face.url}")`,{weight:face.style.includes('Bold')?'700':'400',style:face.style.includes('Italic')?'italic':'normal'});
    await font.load();document.fonts.add(font);
  })).then(()=>{}).catch(error=>{loaded.delete(family);throw error;}));
  return loaded.get(family)!;
}
export async function ensureDocumentFonts(value:unknown):Promise<void> {
  const families=new Set<string>();
  const visit=(node:unknown)=>{if(!node||typeof node!=='object')return;const obj=node as Record<string,unknown>;if(typeof obj.fontFamily==='string')families.add(obj.fontFamily);if(Array.isArray(obj.objects))obj.objects.forEach(visit);if(obj.styles)Object.values(obj.styles as object).forEach(line=>Object.values(line as object).forEach(visit));};
  visit(value);await Promise.all(Object.entries(documentEmbeddedFonts(value)).map(([family,data])=>ensureEmbeddedFont(family,data)));await Promise.all([...families].map(ensureFont));
}

export function ensureEmbeddedFont(family:string,data:string,bold=false,italic=false):Promise<void>{if(!loaded.has(family))loaded.set(family,(async()=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const font=new FontFace(family,bytes,{weight:bold?'700':'400',style:italic?'italic':'normal'});await font.load();document.fonts.add(font);})().catch(error=>{loaded.delete(family);throw error;}));return loaded.get(family)!;}
export function documentEmbeddedFonts(value:unknown):Record<string,string>{const result:Record<string,string>={};const visit=(node:any)=>{if(!node||typeof node!=='object')return;if(typeof node.fontFamily==='string'&&node.fontFamily.startsWith('PDFfont-')&&typeof node.pdfFontData==='string')result[node.fontFamily]=node.pdfFontData;if(Array.isArray(node.objects))node.objects.forEach(visit);};visit(value);return result;}
