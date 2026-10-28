// Fields the OCR may have misread, so the user checks those rather than
// proofreading the page. Measured on 490 invented fields: a confidence under
// 70 caught 13 of the 32 misread fields; under 93 (AI OCR) or with an unsure
// letter, 22, flagging 8% of the correct ones. Formats catch more: an IBAN
// whose check digits fail, a date that does not exist, a SIREN or SIRET that
// fails its checksum, an amount without the thousands space the page's other
// amounts use ("4813,33" among "1 947,80"). Text is only checked, never changed.
import {ibanValid,validSiren,validSiret} from './einvoice';
import {doubtfulLetters} from './ocr-regions';
import type {TextRegion} from './text-regions';

const grouped=/(?<![\d,.])\d{1,3}(?:[ \u00a0\u202f]\d{3})+,\d{2}(?!\d)/g,plain=/(?<![\d,.])\d{4,},\d{2}(?!\d)/g;
const groupedDot=/(?<![\d,.])\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)/g,plainDot=/(?<![\d,.])\d{4,}\.\d{2}(?!\d)/g;
const daysIn=(m:number,y:number)=>new Date(Date.UTC(y,m,0)).getUTCDate();

// The first format problem in a line of text, if any. `amounts` is the page's
// grouping convention: 'space' (1 947,80) or 'comma' (1,947.80).
export function formatDoubt(text:string,amounts?:'space'|'comma'):string|undefined{
 for(const m of text.matchAll(/\b[A-Z]{2}\d{2}(?:[  ]?[A-Z0-9]{4}){2,7}(?:[  ]?[A-Z0-9]{1,3})?\b/g)){
  const compact=m[0].replace(/\s/g,'');if(compact.length>=15&&/\d{6}/.test(compact)&&!ibanValid(compact))return 'The IBAN check digits do not match: a character may be misread.';
 }
 for(const m of text.matchAll(/(?<![\d/.-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/.-])/g)){
  const a=+m[1],b=+m[3],y=+m[4]<100?2000+ +m[4]:+m[4],ok=(d:number,mo:number)=>mo>=1&&mo<=12&&d>=1&&d<=daysIn(mo,y);
  if(!ok(a,b)&&!ok(b,a))return 'This date does not exist: a digit may be misread.';
 }
 for(const m of text.matchAll(/\b(SIRE[NT])\b\D{0,12}((?:\d[  ]?){9,14})/gi)){
  const digits=m[2].replace(/\D/g,''),kind=m[1].toUpperCase();
  if(kind==='SIREN'&&digits.length===9&&!validSiren(digits)||kind==='SIRET'&&digits.length===14&&!validSiret(digits))return `The ${kind} checksum fails: a digit may be misread.`;
 }
 if(amounts==='space'&&text.match(plain))return 'This amount has no thousands space, unlike the others on the page: a space may be lost or a digit misread.';
 if(amounts==='comma'&&text.match(plainDot))return 'This amount has no thousands comma, unlike the others on the page: a digit may be misread.';
 return undefined;
}

// The page's amounts: grouped with spaces, with commas, or no clear convention.
export function amountStyle(texts:string[]):'space'|'comma'|undefined{
 const count=(re:RegExp)=>texts.reduce((n,t)=>n+(t.match(re)?.length??0),0),space=count(grouped),comma=count(groupedDot);
 return space>=2&&space>comma*2?'space':comma>=2&&comma>space*2?'comma':undefined;
}

// Each OCR field with the reason it should be checked, if any.
export function markDoubts(regions:TextRegion[],{ai}:{ai:boolean}):TextRegion[]{
 const amounts=amountStyle(regions.map(r=>r.text));
 return regions.map(r=>{
  if(r.kind!=='ocr')return r;
  const doubt=formatDoubt(r.text,amounts)??(r.confidence!==undefined&&r.confidence<(ai?93:70)?`Low OCR confidence (${Math.round(r.confidence)}%): check the recognized text.`:doubtfulLetters(r).length?'Some letters were hard to read: check the underlined ones.':undefined);
  return doubt?{...r,doubt}:r;
 });
}
