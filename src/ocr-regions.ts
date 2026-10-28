// Pure geometry and bookkeeping for detected text regions (no DOM, no fabric).
import type {TextRegion} from './text-regions';
type Bounds={left:number;top:number;width:number;height:number};

export function recognitionKey(r:TextRegion){return `${r.kind}:${Math.round(r.left)}:${Math.round(r.top)}:${r.text}`;}

// OCR runs on a reduced raster; map its pixel boxes back to page units.
export function scaleRegions(regions:TextRegion[],sx:number,sy:number):TextRegion[]{
 return regions.map(r=>({...r,left:r.left*sx,top:r.top*sy,width:r.width*sx,height:r.height*sy,size:r.size*sy,baseline:r.baseline*sy,...r.blur===undefined?{}:{blur:r.blur*(sx+sy)/2},...r.glyphs?{glyphs:r.glyphs.map(g=>({...g,x0:g.x0*sx,x1:g.x1*sx}))}:{}}));
}

// Hide regions that already became editable text: same key, or an OCR text
// layer covering the region's centre (it may have been moved or retyped).
export function unconvertedRegions(regions:TextRegion[],layers:{recognizedKey?:string;bounds:Bounds}[]){
 return regions.filter(r=>!layers.some(({recognizedKey:key,bounds:b})=>{
  if(key===recognitionKey(r))return true;if(!key?.startsWith('ocr:'))return false;
  const x=r.left+r.width/2,y=r.top+r.height/2;return x>=b.left&&x<=b.left+b.width&&y>=b.top&&y<=b.top+b.height;
 }));
}

// Area cleared or patched under replaced OCR text; padding < 0 means automatic.
// The margin stops at neighbouring text (`others`), so tightly spaced lines and
// adjacent words are never clipped by the patch.
export function ocrPatchBounds(region:Bounds,padding:number,page:{width:number;height:number},others:Bounds[]=[]):Bounds{
 const pad=padding<0?Math.max(2,region.height*.1):padding;
 let left=Math.max(0,region.left-pad),top=Math.max(0,region.top-pad),right=Math.min(page.width,region.left+region.width+pad),bottom=Math.min(page.height,region.top+region.height+pad);
 const rx1=region.left+region.width,ry1=region.top+region.height;
 for(const o of others){
  const ox1=o.left+o.width,oy1=o.top+o.height,overlapX=o.left<rx1&&ox1>region.left,overlapY=o.top<ry1&&oy1>region.top;
  // Lines can overlap by a pixel or two (descenders over the next line's
  // ascenders): a box starting in our lower half is the next line, one ending
  // in our upper half the previous one; the patch stops at their edge.
  const mid=region.top+region.height/2;
  if(overlapX&&(oy1<=region.top||(o.top<region.top&&oy1<=mid)))top=Math.max(top,oy1);
  if(overlapX&&(o.top>=ry1||(oy1>ry1&&o.top>=mid)))bottom=Math.min(bottom,o.top);
  if(overlapY&&ox1<=region.left)left=Math.max(left,ox1);
  if(overlapY&&o.left>=rx1)right=Math.min(right,o.left);
 }
 return {left,top,width:right-left,height:bottom-top};
}

// Below this Tesseract confidence a region is flagged for proofreading.
// A field to check: its scan gave a reason (ocr-checks.ts), or, for fields read before that, a low confidence.
export const isUncertain=(r:{kind:string;confidence?:number;doubt?:string})=>r.kind==='ocr'&&(r.doubt!==undefined||r.confidence!==undefined&&r.confidence<70);

export function ocrScanStatus(count:number,languages:string,converted:boolean,uncertain=0){
 return count?`${count} OCR regions${uncertain?` · ${uncertain} to check`:''} · ${languages} · choose a matching font`:converted?'Original text converted. Double-click the text layer to edit.':'No text detected. Use Text to add your own.';
}

// Line-level weight plus the character ranges whose weight differs, e.g. a bold
// "Nom du client:" label before a regular value. Words with unknown weight
// (undefined: punctuation, slashes) take the previous word's weight, so the
// "/" in "Dalil / pour" or the "," after a bold amount stays with its neighbour;
// the line's base weight is the majority, counted in characters.
// Offsets count code points, matching Fabric's per-character style indices.
export function mixedWeights(words:{text:string}[],bold:(boolean|undefined)[]){
 const len=(t:string)=>Array.from(t).length;
 bold=bold.map((b,i)=>b??bold.slice(0,i).reverse().find(x=>x!==undefined)??bold.slice(i+1).find(x=>x!==undefined));
 let boldChars=0,regularChars=0;words.forEach((w,i)=>{if(bold[i]===true)boldChars+=len(w.text);else if(bold[i]===false)regularChars+=len(w.text);});
 const base=boldChars>regularChars,ranges:{start:number;end:number;bold:boolean}[]=[];let offset=0;
 words.forEach((w,i)=>{const b=bold[i];if(b!==undefined&&b!==base){const last=ranges.at(-1);if(last&&last.end+1===offset)last.end=offset+len(w.text);else ranges.push({start:offset,end:offset+len(w.text),bold:b});}offset+=len(w.text)+1;});
 return {base,ranges};
}

// A lone digit or currency sign is too small to weigh reliably; it belongs to
// the number next to it ("1 284,99 €"), so it takes that number's weight. A
// digit prefers the number on its right (thousands), a currency sign the one on
// its left when both sides are numbers.
export function attachNumberParts(texts:string[],bold:(boolean|undefined)[]){
 const out=[...bold],numeric=(i:number)=>i>=0&&i<texts.length&&/\d/.test(texts[i])&&Array.from(texts[i]).length>1;
 texts.forEach((t,i)=>{
  const digit=/^\d$/.test(t),currency=/^\p{Sc}$/u.test(t);if(!digit&&!currency)return;
  const order=digit?[i+1,i-1]:[i-1,i+1],host=order.find(numeric);if(host!==undefined&&bold[host]!==undefined)out[i]=bold[host];
 });
 return out;
}

// Code-point indexes (in region.text) of letters the recognizer was unsure of.
// Glyphs follow the non-space characters of the text in order.
export const DOUBT=0.6;
export function doubtfulLetters(region:{text:string;glyphs?:{p?:number}[]},threshold=DOUBT){
 const out:number[]=[];if(!region.glyphs)return out;let g=0;
 Array.from(region.text).forEach((ch,i)=>{if(/\s/.test(ch))return;const p=region.glyphs![g++]?.p;if(p!==undefined&&p<threshold)out.push(i);});
 return out;
}
// The fields after an edit, without rescanning the page: an edited field shows
// its new text, keeps its place and remembers the region as first read; a field
// turned into a text layer leaves the overlay (the layer itself is editable).
export function regionsAfterEdit(regions:TextRegion[],edits:{region:TextRegion;text?:string;layer:string;letters:boolean}[]):TextRegion[]{
 const byId=new Map(edits.map(e=>[e.region.id,e]));
 return regions.flatMap(r=>{
  const e=byId.get(r.id);if(!e)return [r];if(!e.letters)return [];
  const original=r.original??e.region,{glyphs:_glyphs,confidence:_confidence,doubt:_doubt,...rest}=original;
  if((e.text??original.text)===original.text)return [original];
  return [{...rest,text:e.text??original.text,original,layer:e.layer}];
 });
}

