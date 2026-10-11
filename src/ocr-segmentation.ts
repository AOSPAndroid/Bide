export type OcrGrouping='smart'|'words'|'lines';
type Box={x0:number;y0:number;x1:number;y1:number};
type Word={text:string;bbox:Box;confidence?:number};
// Specks, borders and icons come back as low-confidence punctuation-only "words".
const noise=(w:Word)=>(w.confidence??100)<25&&!/[\p{L}\p{N}]/u.test(w.text);
// A group is only as reliable as its least certain word.
const lowest=(words:Word[])=>{const known=words.map(w=>w.confidence).filter((c):c is number=>c!==undefined);return known.length?{confidence:Math.min(...known)}:{};};
type Line={text:string;bbox:Box;words?:Word[]};
export function segmentOcrLine(line:Line,mode:OcrGrouping='smart'):Word[]{
 const words=(line.words||[]).filter(w=>w.text.trim()&&w.bbox.x1>w.bbox.x0&&w.bbox.y1>w.bbox.y0);
 const kept=words.filter(w=>!noise(w));
 if(!words.length)return [{text:line.text.trim(),bbox:{...line.bbox}}];
 if(!kept.length)return [];
 if(mode==='lines')return [kept.length===words.length?{text:line.text.trim(),bbox:{...line.bbox},...lowest(kept)}:{text:kept.map(w=>w.text.trim()).join(' '),bbox:{x0:Math.min(...kept.map(w=>w.bbox.x0)),y0:Math.min(...kept.map(w=>w.bbox.y0)),x1:Math.max(...kept.map(w=>w.bbox.x1)),y1:Math.max(...kept.map(w=>w.bbox.y1))},...lowest(kept)}];
 if(mode==='words')return kept.map(w=>({text:w.text.trim(),bbox:{...w.bbox},...lowest([w])}));
 const heights=kept.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b),height=heights[Math.floor(heights.length/2)];
 const groups:Word[]=[];let last:Word|undefined;
 for(const word of kept){
  const gap=last?word.bbox.x0-last.bbox.x1:0;
  // UI avatar initials and adjacent chat text often share an OCR line but are
  // separated by a gap much larger than a normal space. Keep tight phrases.
  if(!last||gap>Math.max(10,height*1.1))groups.push({text:word.text.trim(),bbox:{...word.bbox},...lowest([word])});
  else {const group=groups[groups.length-1];group.text+=' '+word.text.trim();if(word.confidence!==undefined)group.confidence=Math.min(group.confidence??100,word.confidence);group.bbox={x0:Math.min(group.bbox.x0,word.bbox.x0),y0:Math.min(group.bbox.y0,word.bbox.y0),x1:Math.max(group.bbox.x1,word.bbox.x1),y1:Math.max(group.bbox.y1,word.bbox.y1)};}
  last=word;
 }
 return groups;
}
// Lines from a second (sparse-text) pass that the first pass did not cover.
export function missingLines<T extends {bbox:Box}>(primary:{bbox:Box}[],extra:T[]):T[]{
 const area=(b:Box)=>Math.max(0,b.x1-b.x0)*Math.max(0,b.y1-b.y0);
 return extra.filter(e=>area(e.bbox)>0&&!primary.some(p=>{
  const overlap=area({x0:Math.max(p.bbox.x0,e.bbox.x0),y0:Math.max(p.bbox.y0,e.bbox.y0),x1:Math.min(p.bbox.x1,e.bbox.x1),y1:Math.min(p.bbox.y1,e.bbox.y1)});
  return overlap>.3*Math.min(area(p.bbox),area(e.bbox));
 }));
}
