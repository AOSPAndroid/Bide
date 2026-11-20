import {corporateFonts,corporateFallback} from './corporate-fonts';
import {bundledFonts} from './font-catalog';
const loaded=new Map<string,Promise<void>>();
const bundledBytes=new Map<string,Promise<string>>();
type FontStyle={fontFamily?:string;fontWeight?:string|number;fontStyle?:string};
type PdfFontText=FontStyle&{text:string;pdfOriginalFont?:string;recognizedKey?:string;styles?:Record<string,Record<string,FontStyle>>;graphemeSplit?:(value:string)=>string[]};
export const isPdfDerivedText=(value:{pdfOriginalFont?:unknown;recognizedKey?:unknown})=>!(typeof value.recognizedKey==='string'&&value.recognizedKey.startsWith('ocr:'))&&(typeof value.recognizedKey==='string'&&value.recognizedKey.startsWith('pdf:')||typeof value.pdfOriginalFont==='string'&&!!value.pdfOriginalFont);

// A bundled PDF replacement must draw its text itself. Browser font fallback
// can show a missing character that the PDF exporter would replace by .notdef.
// Check the same face/style the exporter selects, including per-grapheme styles.
export async function bundledPdfFontError(text:PdfFontText,pdfDerived=isPdfDerivedText(text)):Promise<string|undefined>{
 if(!pdfDerived)return undefined;
 const runs=new Map<string,{family:string;url:string;text:string}>();
 for(const [lineIndex,line] of text.text.split(/\r?\n/).entries()){
  const chars=text.graphemeSplit?text.graphemeSplit(line):Array.from(line);
  for(const [index,char] of chars.entries()){
   const own=text.styles?.[lineIndex]?.[index],style={fontFamily:own?.fontFamily??text.fontFamily,fontWeight:own?.fontWeight??text.fontWeight,fontStyle:own?.fontStyle??text.fontStyle},family=style.fontFamily?.split(',')[0].trim().replace(/^['"]|['"]$/g,''),item=bundledFonts.find(font=>font.family===family);
   if(!item)continue;
   const bold=/^(?:bold|bolder|[6-9]00)$/.test(String(style.fontWeight).toLowerCase()),italic=/^(?:italic|oblique)$/.test(style.fontStyle?.toLowerCase()??''),wanted=bold&&italic?'BoldItalic':bold?'Bold':italic?'Italic':'Regular';
   const face=item.faces.find(face=>face.style===wanted)??item.faces.find(face=>face.style==='Regular');if(!face)continue;
   const run=runs.get(face.url);if(run)run.text+=char;else runs.set(face.url,{family:item.family,url:face.url,text:char});
  }
 }
 for(const run of runs.values()){
  if(!bundledBytes.has(run.url))bundledBytes.set(run.url,(async()=>{
   const response=await fetch(run.url);if(!response.ok)throw new Error(`The bundled ${run.family} font could not be loaded.`);
   const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
  })().catch(error=>{bundledBytes.delete(run.url);throw error;}));
  const {fontSupportsText}=await import('./browser/engine');
  if(!await fontSupportsText(await bundledBytes.get(run.url)!,run.text))return `The selected ${run.family} font cannot draw some typed characters. Your text and font were kept. Remove those characters or choose a font that includes them before exporting.`;
 }
}
export function ensureFont(family:string):Promise<void> {
  const item=bundledFonts.find(font=>font.family===family);if(!item){if(!corporateFonts.includes(family))return Promise.resolve();if(!loaded.has(family))loaded.set(family,new FontFace(family,`local("${family}")`).load().then(()=>{}).catch(()=>{loaded.delete(family);throw new Error(`${family} is not installed on this PC. Choose bundled ${corporateFallback(family)} or another installed font.`);}));return loaded.get(family)!;}
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
