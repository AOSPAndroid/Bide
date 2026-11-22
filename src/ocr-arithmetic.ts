// Arithmetic as a proofreader. In a column of amounts, the last is often the
// sum of the others (an invoice's lines and its total), or of the two before
// it (net + tax = total). When such a sum fails as read, and exactly one
// digit the recognizer doubted (under 0.9), changed to another digit, makes
// it hold, that digit is the reading. Nothing is changed when the sum holds,
// when no digit was doubted, or when more than one change would do.
type Glyph={ch:string;x0:number;x1:number;p?:number};
export type SumRegion={text:string;left:number;top:number;width:number;height:number;glyphs?:Glyph[]};
type Amount={index:number;cents:number;digits:{at:number;place:number;p:number}[]};

// "1 482,36 €", "€ 2103.00", "12,50": cents, and each digit's place value
// (in cents) and probability. Two decimals are required.
export function parseAmount(text:string,glyphs?:Glyph[]):Omit<Amount,'index'>|undefined{
 const m=/^\s*(?:[€$£]\s*)?(\d{1,3}(?:[   .,']\d{3})*|\d+)[.,](\d{2})\s*(?:€|EUR|\$|£)?\s*$/.exec(text);if(!m)return undefined;
 const chars=Array.from(text),inked=chars.map((ch,i)=>({ch,i})).filter(c=>/\S/.test(c.ch)),probs=glyphs?.filter(g=>g.ch!=='￼');
 if(probs&&probs.length!==inked.length)return undefined;
 const digits=inked.map((c,k)=>({at:c.i,ch:c.ch,p:probs?.[k].p??1})).filter(c=>/\d/.test(c.ch));let place=1,cents=0;const out:Amount['digits']=[];
 for(let k=digits.length-1;k>=0;k--){cents+=Number(digits[k].ch)*place;out.unshift({at:digits[k].at,place,p:digits[k].p});place*=10;}
 return {cents,digits:out};
}
// The corrections: region index and its new text (one digit changed).
export function sumFixes(regions:SumRegion[],doubt=.9):{index:number;text:string}[]{
 const amounts=regions.flatMap((r,index)=>{const a=parseAmount(r.text,r.glyphs);return a?[{...a,index,right:r.left+r.width,top:r.top,h:r.height}]:[];});
 const fixes:{index:number;text:string}[]=[];
 // Columns: amounts ending at the same right edge, top to bottom.
 const columns:typeof amounts[]=[];
 for(const a of [...amounts].sort((x,y)=>x.top-y.top)){const c=columns.find(c=>Math.abs(c[0].right-a.right)<=Math.max(3,.5*a.h));if(c)c.push(a);else columns.push([a]);}
 for(const column of columns){
  if(column.length<3)continue;
  const total=column[column.length-1],relations=[column.slice(0,-1),column.slice(-3,-1)].filter(parts=>parts.length>=2);
  // A sum that holds as read settles the column; otherwise every relation
  // is tried, and the corrections they allow must be one and the same.
  if(relations.some(parts=>total.cents===parts.reduce((s,a)=>s+a.cents,0)))continue;
  const found=new Map<string,{index:number;text:string}>();
  for(const parts of relations){
   const gap=total.cents-parts.reduce((s,a)=>s+a.cents,0);
   for(const [a,sign] of [[total,-1],...parts.map(p=>[p,1])] as [typeof total,number][])for(const d of a.digits){
    if(d.p>=doubt)continue;const now=Math.floor(a.cents/d.place)%10,next=now+sign*gap/d.place;
    if(!Number.isInteger(next)||next<0||next>9||next===now)continue;
    const chars=Array.from(regions[a.index].text);chars[d.at]=String(next);found.set(`${a.index}/${chars.join('')}`,{index:a.index,text:chars.join('')});
   }
  }
  if(found.size===1)fixes.push([...found.values()][0]);
 }
 return fixes;
}
