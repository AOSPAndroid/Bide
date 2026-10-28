// Editing image text with its own letters: character cells measured on the
// original line, and a plan that rebuilds edited text from those cells (or
// matching letters elsewhere on the page) instead of a substitute font.
// `p`: the recognizer's confidence in this letter (0-1), when known; `c`:
// where it placed the letter, until the scan is typeset (ocr-typography.ts).
export type Glyph={ch:string;x0:number;x1:number;p?:number;c?:number};
// A placeholder cell: ink the reading did not cover (a symbol the recognizer
// lacks, such as ★). It adds no character to the text; its cell sits in the
// line before the next character, so a letter edit can keep its pixels.
export const UNREAD='\uFFFC';
export type Cell=Glyph&{space?:boolean};
// Borrowed letters carry their line's band and baseline (page units) and the page they come from.
export type LibraryGlyph=Glyph&{y0:number;y1:number;source:string;baseline?:number;page?:string};
export type Piece={x0:number;x1:number;y0?:number;y1?:number;source?:string;blank?:boolean;baseline?:number;page?:string};

// Baseline and x-height of a text line from its ink per row (top to bottom).
// Lowercase bodies hold most of the ink: rows above 40% of the busiest row form
// the x-height band; its last row is the baseline, so descenders (g, y, p) and
// capitals do not move it. Returns row offsets within `rows`.
export function lineMetrics(rows:ArrayLike<number>){
 let max=0;for(let i=0;i<rows.length;i++)max=Math.max(max,rows[i]);
 if(!max)return undefined;
 let first=-1,last=-1;for(let i=0;i<rows.length;i++)if(rows[i]>=max*.4){if(first<0)first=i;last=i;}
 return {xTop:first,baseline:last+1,xHeight:last+1-first};
}

// Split a word into characters. Letters are first taken from the inked
// column runs (at small sizes they are usually separated by blank columns);
// the recognizer's character centres assign runs to characters and split runs
// where letters touch, at the faintest column between two centres. Runs with
// no centre (a detached accent or dot) join their nearest neighbour.
export function segmentGlyphs(text:string,centers:number[],x0:number,x1:number,columns:ArrayLike<number>,offset=0,min=.5):Glyph[]|undefined{
 const chars=Array.from(text);if(chars.length!==centers.length||!chars.length)return undefined;
 const ink=(x:number)=>(columns[x-offset]??0)>=min,runs:{a:number;b:number;c:number[]}[]=[];
 for(let x=Math.floor(x0);x<Math.ceil(x1);x++){if(!ink(x))continue;const last=runs.at(-1);if(last&&last.b===x)last.b=x+1;else runs.push({a:x,b:x+1,c:[]});}
 if(!runs.length)return undefined;
 // Ordered matching of letters to runs: a letter costs its centre's distance
 // to its run; a run left without letters costs 8 px per median letter's worth
 // of ink, so a faint detached dot merges cheaply but a whole thin letter
 // ("i") does not, even when the centres drift by a letter.
 const mass=runs.map(r=>{let m=0;for(let x=r.a;x<r.b;x++)m+=columns[x-offset]??0;return m;}),median=[...mass].sort((p,q)=>p-q)[mass.length>>1]||1;
 const skip=(from:number,to:number)=>{let s=0;for(let j=from;j<to;j++)s+=8*mass[j]/median;return s;};
 const dist=(i:number,j:number)=>{const c=centers[i],r=runs[j];return c<r.a?r.a-c:c>=r.b?c-r.b+1:0;};
 const R=runs.length,N=centers.length,cost=Array.from({length:N},()=>new Float64Array(R).fill(Infinity)),from=Array.from({length:N},()=>new Int32Array(R).fill(-1));
 for(let j=0;j<R;j++)cost[0][j]=skip(0,j)+dist(0,j);
 for(let i=1;i<N;i++)for(let j=0;j<R;j++)for(let k=0;k<=j;k++){const v=cost[i-1][k]+(k===j?0:skip(k+1,j))+dist(i,j);if(v<cost[i][j]){cost[i][j]=v;from[i][j]=k;}}
 let end=0;for(let j=0;j<R;j++)if(cost[N-1][j]+skip(j+1,R)<cost[N-1][end]+skip(end+1,R))end=j;
 for(let i=N-1,j=end;i>=0;j=from[i][j],i--)runs[j].c.unshift(i);
 const kept=runs.filter(r=>r.c.length);
 for(const r of runs)if(!r.c.length){const host=kept.reduce((h,k)=>Math.min(Math.abs(k.a-r.b),Math.abs(r.a-k.b))<Math.min(Math.abs(h.a-r.b),Math.abs(r.a-h.b))?k:h);host.a=Math.min(host.a,r.a);host.b=Math.max(host.b,r.b);}
 kept.sort((p,q)=>p.a-q.a);
 // Character order must follow run order (a run's centres are consecutive).
 const order=kept.flatMap(r=>r.c);if(order.some((v,i)=>v!==i))return undefined;
 const bounds:number[]=[];
 kept.forEach((r,k)=>{
  const left=k?(kept[k-1].b+r.a)/2:Math.min(x0,r.a);bounds.push(left);
  for(let j=0;j+1<r.c.length;j++){
   const a=centers[r.c[j]],b=centers[r.c[j+1]],lo=Math.max(r.a+1,Math.ceil(a)),hi=Math.min(r.b-1,Math.floor(b)),mid=(a+b)/2;let best=Math.round(Math.min(Math.max(mid,lo),hi)),v=Infinity;
   for(let x=lo;x<=hi;x++){const value=columns[x-offset]??0;if(value<v||(value===v&&Math.abs(x-mid)<Math.abs(best-mid))){v=value;best=x;}}
   bounds.push(best);
  }
 });
 bounds.push(Math.max(x1,kept[kept.length-1].b));
 return chars.map((ch,i)=>({ch,x0:bounds[i],x1:bounds[i+1]}));
}

// A comma or full stop touching the next letter (blurred photos) was often
// cut through its middle, so the neighbour, reused elsewhere, carried half
// of it. A mark's cell grows over the run of columns around it that are
// inked low (`lower`) with nothing above (`upper`: ink per column, index
// x - offset), and the cells next to it give those columns up.
export function settleMarks(glyphs:Glyph[],upper:ArrayLike<number>,lower:ArrayLike<number>,offset=0):Glyph[]{
 const out=glyphs.map(g=>({...g})),mark=(x:number)=>(upper[x-offset]??1)===0&&(lower[x-offset]??0)>0;
 out.forEach((g,i)=>{
  if(!/^[.,]$/.test(g.ch))return;
  const prev=out[i-1],next=out[i+1],from=Math.ceil(prev?(prev.x0+prev.x1)/2:g.x0-1),to=Math.floor(next?(next.x0+next.x1)/2:g.x1+1);
  let run:{a:number;b:number}|undefined,distance=Infinity;
  for(let x=from;x<to;){if(!mark(x)){x++;continue;}let b=x;while(b<to&&mark(b))b++;const d=b<=g.x0?g.x0-b:x>=g.x1?x-g.x1:0;if(d<distance){distance=d;run={a:x,b};}x=b;}
  if(!run||distance>1||run.a>=g.x0&&run.b<=g.x1||prev&&run.a<prev.x0+1||next&&run.b>next.x1-1)return;
  g.x0=Math.min(g.x0,run.a);g.x1=Math.max(g.x1,run.b);if(prev&&prev.x1>g.x0)prev.x1=g.x0;if(next&&next.x0<g.x1)next.x0=g.x1;
 });
 return out;
}

// Contiguous cells for every character of a line, spaces included, from the
// glyph boxes of its non-space characters (in order). Within a word, gaps or
// overlaps between boxes are split at their midpoint; a space spans the gap
// between the words around it. Returns undefined if glyphs and text disagree.
// A placeholder glyph (UNREAD) is a cell of its own before the next
// character: the cells spell the text with UNREAD where they lie.
export function lineCells(text:string,glyphs:Glyph[]):Cell[]|undefined{
 const chars=Array.from(text),cells:Cell[]=[];let g=0;
 const unread=()=>{while(glyphs[g]?.ch===UNREAD)cells.push({...glyphs[g++]});};
 for(const ch of chars){
  if(/\s/.test(ch)){cells.push({ch,x0:NaN,x1:NaN,space:true});continue;}
  unread();const glyph=glyphs[g++];if(!glyph||glyph.ch!==ch)return undefined;cells.push({...glyph});
 }
 unread();
 if(g!==glyphs.length)return undefined;
 for(let i=0;i+1<cells.length;i++){const a=cells[i],b=cells[i+1];if(!a.space&&!b.space&&a.x1!==b.x0){const m=(a.x1+b.x0)/2;a.x1=m;b.x0=m;}}
 for(let i=0;i<cells.length;i++){const c=cells[i];if(!c.space)continue;const prev=cells.slice(0,i).reverse().find(x=>!x.space),next=cells.slice(i+1).find(x=>!x.space);if(!prev||!next)return undefined;c.x0=prev.x1;c.x1=next.x0;}
 return cells;
}

// Longest common subsequence alignment: for each character of `next`, the index
// of the identical character of `text` it keeps, or -1 if it is new.
function align(text:string[],next:string[]){
 const n=text.length,m=next.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=text[i]===next[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const keep=new Array<number>(m).fill(-1);let i=0,j=0;
 while(i<n&&j<m){if(text[i]===next[j]){keep[j]=i;i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
 return keep;
}

// `next`, an edit of the line's text, with the line's placeholder cells
// (lineCells) in place: each stays before the character it preceded, or
// after the one before that, while the edit keeps that character; an edit
// of both takes it away.
export function withUnread(text:string,cells:Cell[],next:string){
 const read=Array.from(text),b=Array.from(next),at=new Array<number>(read.length).fill(-1);align(read,b).forEach((k,j)=>{if(k>=0)at[k]=j;});
 const before=new Array<number>(b.length).fill(0),after=new Array<number>(b.length).fill(0);let i=0;
 for(const c of cells){
  if(c.ch!==UNREAD){i++;continue;}
  if(i<read.length&&at[i]>=0)before[at[i]]++;else if(i>0&&at[i-1]>=0)after[at[i-1]]++;
 }
 return b.map((ch,j)=>UNREAD.repeat(before[j])+ch+UNREAD.repeat(after[j])).join('');
}

// Plan for rendering `next` in place of `text`: everything before the first
// change stays untouched; from there the line is rebuilt from cells (kept
// characters use their own pixels, new ones the nearest identical letter on the
// line or, failing that, from `library`). Undefined when a letter is missing.
export function planGlyphEdit(text:string,cells:Cell[],next:string,library:LibraryGlyph[]=[]):{startX:number;oldEnd:number;pieces:Piece[]}|undefined{
 const a=Array.from(text),b=Array.from(next);if(a.join('')===b.join(''))return undefined;
 let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
 const keep=align(a,b),spaces=cells.filter(c=>c.space).map(c=>c.x1-c.x0).sort((x,y)=>x-y),space=spaces.length?spaces[spaces.length>>1]:undefined;
 const pieces:Piece[]=[];
 for(let j=p;j<b.length;j++){
  const k=keep[j];
  if(k>=p){pieces.push({x0:cells[k].x0,x1:cells[k].x1});continue;}
  const ch=b[j];
  if(/\s/.test(ch)){if(space===undefined)return undefined;pieces.push({x0:0,x1:space,blank:true});continue;}
  // Nearest identical letter on this line (by position), then the page library.
  const own=cells.map((c,i)=>({c,i})).filter(({c})=>!c.space&&c.ch===ch).sort((x,y)=>Math.abs(x.i-Math.min(j,a.length-1))-Math.abs(y.i-Math.min(j,a.length-1)))[0];
  if(own){pieces.push({x0:own.c.x0,x1:own.c.x1});continue;}
  const borrowed=library.find(g=>g.ch===ch);if(!borrowed)return undefined;
  pieces.push({x0:borrowed.x0,x1:borrowed.x1,y0:borrowed.y0,y1:borrowed.y1,source:borrowed.source,...borrowed.baseline===undefined?{}:{baseline:borrowed.baseline},...borrowed.page===undefined?{}:{page:borrowed.page}});
 }
 const startX=p<cells.length?cells[p].x0:cells[cells.length-1].x1;
 return {startX,oldEnd:cells[cells.length-1].x1,pieces};
}

// Pixels of this line's letters within an analysis area (RGBA, width x height):
// ink (contrast > 16 with the background, so anti-aliasing is included) in
// 8-connected blobs that stay within rows [top, bottom). Blobs reaching outside
// belong to a neighbouring line. Returns a 0/1 mask.
export function ownInk(data:ArrayLike<number>,width:number,height:number,background:readonly number[],top:number,bottom:number){
 const n=width*height,ink=new Uint8Array(n),own=new Uint8Array(n),seen=new Uint8Array(n),stack:number[]=[],blob:number[]=[];
 for(let i=0;i<n;i++)ink[i]=Math.max(Math.abs(data[i*4]-background[0]),Math.abs(data[i*4+1]-background[1]),Math.abs(data[i*4+2]-background[2]))>16?1:0;
 for(let start=0;start<n;start++){
  if(!ink[start]||seen[start])continue;
  let inside=true;seen[start]=1;stack.push(start);blob.length=0;
  while(stack.length){
   const p=stack.pop()!,x=p%width,y=(p-x)/width;blob.push(p);if(y<top||y>=bottom)inside=false;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const q=ny*width+nx;if(ink[q]&&!seen[q]){seen[q]=1;stack.push(q);}}
  }
  if(inside)for(const p of blob)own[p]=1;
 }
 return own;
}
