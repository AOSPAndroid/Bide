export type OcrGrouping='smart'|'words'|'lines';
type Box={x0:number;y0:number;x1:number;y1:number};
type Word={text:string;bbox:Box;confidence?:number;chars?:{ch:string;x0:number;x1:number}[]};
export type OcrGroup=Word&{words:Word[]};
// Specks, borders and icons come back as low-confidence punctuation-only "words".
const noise=(w:Word)=>(w.confidence??100)<25&&!/[\p{L}\p{N}]/u.test(w.text);
// A group is only as reliable as its least certain word.
const lowest=(words:Word[])=>{const known=words.map(w=>w.confidence).filter((c):c is number=>c!==undefined);return known.length?{confidence:Math.min(...known)}:{};};
type Line={text:string;bbox:Box;words?:Word[]};
// List bullets are small centred dots that Tesseract reads as e, «, *, + or o.
// A one-character "word" well below the line's typical height, sitting around
// mid-line, is a bullet.
export function restoreBullets(words:Word[]):Word[]{
 const tall=words.filter(w=>w.text.trim().length>1).map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b);if(!tall.length)return words;
 const height=tall[tall.length>>1],top=Math.min(...words.map(w=>w.bbox.y0)),bottom=Math.max(...words.map(w=>w.bbox.y1));
 return words.map(w=>{
  const centre=(w.bbox.y0+w.bbox.y1)/2,bw=w.bbox.x1-w.bbox.x0,bh=w.bbox.y1-w.bbox.y0,t=w.text.trim();
  // Letters (Italian/Portuguese "e" is a word) must be clearly bullet-sized. For
  // symbols Tesseract sometimes stretches the box to the full line height, so
  // judge by width; wide shapes (a real dash) are left alone.
  return (/^[eoc]$/.test(t)?Math.max(bw,bh)<height*.45:/^[«»*+●°©®¢.,-]$/.test(t)&&bw<height*.6&&bw<=bh*2)&&centre>top+(bottom-top)*.25&&centre<top+(bottom-top)*.8?{...w,text:'•',confidence:undefined,chars:[{ch:'•',x0:w.bbox.x0,x1:w.bbox.x1}]}:w;
 });
}
const group=(words:Word[]):OcrGroup=>({text:words.map(w=>w.text.trim()).join(' '),bbox:{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))},words,...lowest(words)});
export function segmentOcrLine(line:Line,mode:OcrGrouping='smart'):OcrGroup[]{
 const words=restoreBullets((line.words||[]).filter(w=>w.text.trim()&&w.bbox.x1>w.bbox.x0&&w.bbox.y1>w.bbox.y0));
 const kept=words.filter(w=>!noise(w));
 if(!words.length)return [{text:line.text.trim(),bbox:{...line.bbox},words:[]}];
 if(!kept.length)return [];
 if(mode==='lines')return [{...group(kept),...kept.length===words.length?{bbox:{...line.bbox}}:{}}];
 if(mode==='words')return kept.map(w=>group([w]));
 const heights=kept.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b),height=heights[Math.floor(heights.length/2)];
 const runs:Word[][]=[];let last:Word|undefined;
 for(const word of kept){
  const gap=last?word.bbox.x0-last.bbox.x1:0;
  // UI avatar initials and adjacent chat text often share an OCR line but are
  // separated by a gap much larger than a normal space. Keep tight phrases.
  if(!last||gap>Math.max(10,height*1.1))runs.push([word]);else runs[runs.length-1].push(word);
  last=word;
 }
 return runs.map(group);
}
// Lines from a second (sparse-text) pass that the first pass did not cover.
export function missingLines<T extends {bbox:Box}>(primary:{bbox:Box}[],extra:T[]):T[]{
 const area=(b:Box)=>Math.max(0,b.x1-b.x0)*Math.max(0,b.y1-b.y0);
 return extra.filter(e=>area(e.bbox)>0&&!primary.some(p=>{
  const overlap=area({x0:Math.max(p.bbox.x0,e.bbox.x0),y0:Math.max(p.bbox.y0,e.bbox.y0),x1:Math.min(p.bbox.x1,e.bbox.x1),y1:Math.min(p.bbox.y1,e.bbox.y1)});
  return overlap>.3*Math.min(area(p.bbox),area(e.bbox));
 }));
}
