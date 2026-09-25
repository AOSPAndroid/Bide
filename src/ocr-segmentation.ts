export type OcrGrouping='smart'|'words'|'lines';
type Box={x0:number;y0:number;x1:number;y1:number};
type Word={text:string;bbox:Box};
type Line={text:string;bbox:Box;words?:Word[]};
export function segmentOcrLine(line:Line,mode:OcrGrouping='smart'):Word[]{
 const words=(line.words||[]).filter(w=>w.text.trim()&&w.bbox.x1>w.bbox.x0&&w.bbox.y1>w.bbox.y0);
 if(mode==='lines'||!words.length)return [{text:line.text.trim(),bbox:{...line.bbox}}];
 if(mode==='words')return words.map(w=>({text:w.text.trim(),bbox:{...w.bbox}}));
 const heights=words.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b),height=heights[Math.floor(heights.length/2)];
 const groups:Word[]=[];let last:Word|undefined;
 for(const word of words){
  const gap=last?word.bbox.x0-last.bbox.x1:0;
  // UI avatar initials and adjacent chat text often share an OCR line but are
  // separated by a gap much larger than a normal space. Keep tight phrases.
  if(!last||gap>Math.max(10,height*1.1))groups.push({text:word.text.trim(),bbox:{...word.bbox}});
  else {const group=groups[groups.length-1];group.text+=' '+word.text.trim();group.bbox={x0:Math.min(group.bbox.x0,word.bbox.x0),y0:Math.min(group.bbox.y0,word.bbox.y0),x1:Math.max(group.bbox.x1,word.bbox.x1),y1:Math.max(group.bbox.y1,word.bbox.y1)};}
  last=word;
 }
 return groups;
}
