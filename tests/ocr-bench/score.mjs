// Scoring for the OCR benchmark (pure; unit-tested in tests/ocr-bench-score.test.mjs).
const norm=s=>s.normalize('NFC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();

// Fewest edits turning `needle` into some stretch of `hay` (Sellers' algorithm).
export function substringDistance(needle,hay){
 let prev=new Array(hay.length+1).fill(0);
 for(let i=1;i<=needle.length;i++){const cur=[i];for(let j=1;j<=hay.length;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(needle[i-1]===hay[j-1]?0:1));prev=cur;}
 return Math.min(...prev);
}
// Each true line against its best match in any OCR line; the rate is edits per true character.
export function lineErrors(truth,read){
 const hay=read.map(norm);let errors=0,chars=0;const worst=[];
 for(const t of truth.map(norm)){
  const d=hay.length?Math.min(t.length,...hay.map(h=>substringDistance(t,h))):t.length;
  errors+=d;chars+=t.length;if(d)worst.push({line:t,errors:d});
 }
 worst.sort((a,b)=>b.errors-a.errors);
 return {rate:chars?errors/chars:0,worst:worst.slice(0,5)};
}
const words=lines=>lines.flatMap(l=>norm(l).split(' ')).map(w=>w.replace(/^[("'«]+|[)"'»,.;:!?]+$/g,'')).filter(Boolean);
// Multiset word recall (true words read) and precision (read words that are true).
export function wordScores(truth,read){
 const want=new Map();for(const w of words(truth))want.set(w,(want.get(w)??0)+1);
 const got=words(read);let hit=0;const left=new Map(want);
 for(const w of got){const n=left.get(w)??0;if(n){hit++;left.set(w,n-1);}}
 const total=[...want.values()].reduce((a,b)=>a+b,0);
 return {recall:total?hit/total:1,precision:got.length?hit/got.length:(total?0:1)};
}
// OCR lines on the same visual row (overlapping vertically), joined left to
// right: a table row read cell by cell still matches its true line. On a
// page tilted clockwise by `angle` degrees, rows are followed along the tilt.
export function joinRows(regions,angle=0){
 const rows=[],slope=Math.tan(angle*Math.PI/180);
 for(const r of [...regions].map(r=>({...r,top:r.top-(r.left+r.width/2)*slope})).sort((a,b)=>a.top-b.top)){
  const mid=r.top+r.height/2,row=rows.find(w=>mid>w.top&&mid<w.top+w.height);
  if(row)row.items.push(r);else rows.push({top:r.top,height:r.height,items:[r]});
 }
 return rows.filter(w=>w.items.length>1).map(w=>w.items.sort((a,b)=>a.left-b.left).map(r=>r.text).join(' '));
}
