// Finding what to redact: a search text and/or presets for common personal
// data, matched in detected text, and the page rectangles that cover each
// match. Pure functions; applying redactions is in redact-canvas.ts and the
// PDF engine.
export type Rect={left:number;top:number;width:number;height:number};
export type Match={start:number;end:number;text:string};
type RegionLike={text:string;left:number;top:number;width:number;height:number;glyphs?:{x0:number;x1:number}[]};

const digits=(s:string)=>s.replace(/\D/g,'');
// Luhn checksum (payment cards).
function luhn(number:string){let sum=0;for(let i=0;i<number.length;i++){let d=+number[number.length-1-i];if(i%2){d*=2;if(d>9)d-=9;}sum+=d;}return sum%10===0;}
// ISO 13616 mod-97 check (IBAN).
function iban(text:string){
 const s=text.replace(/\s/g,'').toUpperCase();if(s.length<15||s.length>34)return false;
 const moved=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
 let rest=0;for(const ch of moved)rest=(rest*10+ +ch)%97;return rest===1;
}

export const redactionPresets=[
 {id:'email',label:'Email addresses',pattern:/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu,valid:(_:string)=>true},
 {id:'phone',label:'Phone numbers',pattern:/(?<![\p{L}\p{N}])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{1,4}(?:[ .-]?\d{2,4}){2,5}(?![\p{L}\p{N}])/gu,valid:(s:string)=>{const n=digits(s).length;return n>=9&&n<=15&&!/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s);}},
 {id:'iban',label:'IBANs',pattern:/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g,valid:iban},
 {id:'card',label:'Card numbers',pattern:/(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g,valid:(s:string)=>luhn(digits(s))},
] as const;
export type PresetId=typeof redactionPresets[number]['id'];

// Matches of `query` (case-insensitive, literal) and of the chosen presets.
// Overlapping matches are merged.
export function findRedactions(text:string,{query='',presets=[]}:{query?:string;presets?:readonly PresetId[]}){
 const found:Match[]=[];
 const q=query.trim();
 if(q){const hay=text.toLocaleLowerCase(),needle=q.toLocaleLowerCase();for(let i=hay.indexOf(needle);i>=0;i=hay.indexOf(needle,i+needle.length))found.push({start:i,end:i+needle.length,text:text.slice(i,i+needle.length)});}
 for(const preset of redactionPresets)if(presets.includes(preset.id))for(const m of text.matchAll(preset.pattern))if(preset.valid(m[0]))found.push({start:m.index!,end:m.index!+m[0].length,text:m[0]});
 found.sort((a,b)=>a.start-b.start);
 const merged:Match[]=[];
 for(const m of found){const last=merged.at(-1);if(last&&m.start<=last.end){if(m.end>last.end){last.end=m.end;last.text=text.slice(last.start,last.end);}}else merged.push({...m});}
 return merged;
}

// The page rectangle covering `match` in an OCR region: from its letters'
// positions when every letter has one, otherwise the whole region (covering
// too much is safe, too little is not). `pad` grows it on every side.
export function ocrMatchRect(region:RegionLike,match:Match,pad=1.5):Rect{
 const chars=Array.from(region.text),letters=chars.filter(c=>!/\s/.test(c)).length;
 let box:Rect={left:region.left,top:region.top,width:region.width,height:region.height};
 if(region.glyphs&&region.glyphs.length===letters){
  // Code-unit offsets to letter (non-space) indexes.
  let unit=0,letter=0,first=-1,last=-1;
  for(const c of chars){if(!/\s/.test(c)){if(unit>=match.start&&unit<match.end){if(first<0)first=letter;last=letter;}letter++;}unit+=c.length;}
  if(first>=0){const x0=region.glyphs[first].x0,x1=region.glyphs[last].x1;if(x1>x0)box={left:x0,top:region.top,width:x1-x0,height:region.height};}
 }
 return {left:box.left-pad,top:box.top-pad,width:box.width+pad*2,height:box.height+pad*2};
}

export const overlaps=(a:Rect,b:Rect)=>a.left<b.left+b.width&&b.left<a.left+a.width&&a.top<b.top+b.height&&b.top<a.top+a.height;
export const inside=(a:Rect,b:Rect)=>a.left>=b.left&&a.top>=b.top&&a.left+a.width<=b.left+b.width&&a.top+a.height<=b.top+b.height;
