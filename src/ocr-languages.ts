// OCR languages bundled at build time (see scripts/prepare-ocr.mjs).
export type OcrLanguage={code:string;name:string};
export const defaultOcrLanguages=['eng','fra'];
const fallback:OcrLanguage[]=[{code:'eng',name:'English'},{code:'fra',name:'Français'}];
let manifest:Promise<OcrLanguage[]>|undefined;
export function bundledOcrLanguages(){
 return manifest??=fetch(new URL('ocr/lang/languages.json',document.baseURI)).then(r=>r.ok?r.json():fallback).then((list:OcrLanguage[])=>Array.isArray(list)&&list.length?list:fallback).catch(()=>fallback);
}
export function languageLabel(codes:string[],available:OcrLanguage[]){return codes.map(c=>available.find(l=>l.code===c)?.name??c).join(' + ');}
const key='bide-ocr-languages';
export function storedOcrLanguages(){try{const value=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(value)&&value.length&&value.every(v=>typeof v==='string'&&/^[a-z]{3}$/.test(v)))return value as string[];}catch{}return defaultOcrLanguages;}
export function storeOcrLanguages(codes:string[]){try{localStorage.setItem(key,JSON.stringify(codes));}catch{}}
