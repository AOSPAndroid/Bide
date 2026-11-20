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
// `m`: the middle of the letter's ink across (its centroid), and `i0`, `i1`
// where that ink starts and ends, when measured.
export type Cell=Glyph&{space?:boolean;m?:number;i0?:number;i1?:number};
// Borrowed letters carry their line's band and baseline (page units) and the page they come from.
export type LibraryGlyph=Glyph&{y0:number;y1:number;source:string;baseline?:number;page?:string;m?:number;i0?:number;i1?:number};
// Where a new letter goes for its ink to stand where the old one's stood:
// ink of about the same width is laid edge to edge (a 3 over a 6: their
// centroids differ, their outlines do not); a narrower or wider letter (a 1
// over an 8) by the centre of its ink.
const over=(old:Cell,g:Cell|LibraryGlyph)=>{
 if(old.i0!==undefined&&old.i1!==undefined&&g.i0!==undefined&&g.i1!==undefined){const a=old.i1-old.i0,b=g.i1-g.i0;if(Math.abs(a-b)<=Math.max(1,Math.max(a,b)*.15))return g.x0+(old.i0+old.i1)/2-(g.i0+g.i1)/2;}
 return g.x0+old.m!-g.m!;
};
// A stretch of source columns drawn into the edited line. Pieces follow each
// other from the plan's start, unless `to` says where a piece's first column goes.
export type Piece={x0:number;x1:number;y0?:number;y1?:number;source?:string;blank?:boolean;baseline?:number;page?:string;to?:number};

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
 // A comma, full stop, colon or apostrophe is a small run of its own, and
 // the recognizer places it loosely (its centres come in steps of about half
 // a letter): on a small run it may sit half a letter off for free, on a
 // letter-sized run it costs as much. A comma read at the start of the next
 // digit used to share that digit's run and leave its own ink to the digit before.
 const widths=runs.map(r=>r.b-r.a).sort((p,q)=>p-q),slack=widths[widths.length>>1]/2,mark=chars.map(ch=>/^[.,:;'’‘`·]$/.test(ch)),small=mass.map(m=>m<median*.45);
 const dist=(i:number,j:number)=>{const c=centers[i],r=runs[j],d=c<r.a?r.a-c:c>=r.b?c-r.b+1:0;return mark[i]?small[j]?Math.max(0,d-slack):d+slack:d;};
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

// `next`, an edit of the line's text, with its unread cells kept in order.
// They are absent from the editable text, so replacing/deleting their
// visible neighbours must not silently erase their ink. Kept letters anchor
// them; inside a replaced span their boundary follows that span's new length.
// Only an empty replacement removes the whole field, unread cells included.
export function withUnread(text:string,cells:Cell[],next:string){
 const read=Array.from(text),b=Array.from(next),at=new Array<number>(read.length).fill(-1);align(read,b).forEach((k,j)=>{if(k>=0)at[k]=j;});
 const before=new Array<number>(b.length+1).fill(0);let i=0;
 for(const c of cells){
  if(c.ch!==UNREAD){i++;continue;}
  if(!b.length)continue;
  let slot:number;
  if(i===0)slot=0;else if(i===read.length)slot=b.length;
  else if(at[i]>=0)slot=at[i];else if(at[i-1]>=0)slot=at[i-1]+1;
  else{
   let left=i-1,right=i;while(left>=0&&at[left]<0)left--;while(right<read.length&&at[right]<0)right++;
   const start=left>=0?at[left]+1:0,end=right<read.length?at[right]:b.length;
   slot=Math.round(start+(end-start)*(i-left-1)/Math.max(1,right-left-1));
  }
  before[slot]++;
 }
 return b.map((ch,j)=>UNREAD.repeat(before[j])+ch).join('')+UNREAD.repeat(before[b.length]);
}

// The advance of a line set at one pitch (a typewriter face, or a run of
// digits): the distance between the ink middles of neighbouring characters,
// when every character sits on that grid. Needs five measured characters.
// Returns the pitch and the grid's origin (the middle of character 0).
export function fixedPitch(cells:Cell[]):{pitch:number;origin:number}|undefined{
 const at=cells.flatMap((c,i)=>c.space||c.ch===UNREAD||c.m===undefined?[]:[{i,m:c.m}]);if(at.length<5)return undefined;
 const middle=(v:number[])=>[...v].sort((x,y)=>x-y)[v.length>>1],steps:number[]=[];
 for(let k=0;k+1<at.length;k++)steps.push((at[k+1].m-at[k].m)/(at[k+1].i-at[k].i));
 const pitch=middle(steps);if(!(pitch>0))return undefined;
 const origin=middle(at.map(x=>x.m-x.i*pitch));
 return at.every(x=>Math.abs(x.m-origin-x.i*pitch)<=pitch*.14)?{pitch,origin}:undefined;
}

// Plan for rendering `next` in place of `text`: everything before the first
// change stays untouched; from there the line is rebuilt from cells (kept
// characters use their own pixels, new ones the nearest identical letter on the
// line or, failing that, from `library`). Undefined when a letter is missing.
// Where characters share one advance, a new one takes the place of the old:
//  - a digit for a digit, or any character for another on a line set at one
//    pitch, text of the same length: the new letter's ink is centred where the
//    old one's was and nothing else moves (cells are cut between letters, so a
//    1's cell is narrower than an 8's and chaining cells shifted the rest);
//  - a line at one pitch whose length changes: every character from the change
//    on sits on the line's grid.
// Otherwise cells follow each other at their own widths. `right`: the line is
// right-aligned, so a change of width moves its start, not its end.
export function planGlyphEdit(text:string,cells:Cell[],next:string,library:LibraryGlyph[]=[],{right=false}:{right?:boolean}={}):{startX:number;oldEnd:number;end:number;pieces:Piece[]}|undefined{
 const a=Array.from(text),b=Array.from(next);if(a.join('')===b.join(''))return undefined;
 let first=0;while(first<a.length&&first<b.length&&a[first]===b[first])first++;
 const oldEnd=cells[cells.length-1].x1,digit=(ch:string)=>/^\p{Nd}$/u.test(ch),grid=fixedPitch(cells);
 const spaces=cells.filter(c=>c.space).map(c=>c.x1-c.x0).sort((x,y)=>x-y),space=spaces.length?spaces[spaces.length>>1]:undefined;
 // The advance of the line's digits: between the ink middles of two that touch.
 const steps=cells.flatMap((c,i)=>i&&digit(c.ch)&&digit(cells[i-1].ch)&&c.m!==undefined&&cells[i-1].m!==undefined?[c.m-cells[i-1].m!]:[]).sort((x,y)=>x-y),figures=steps.length?steps[steps.length>>1]:undefined;
 // A new letter: the nearest identical one on this line (by position), then the page library.
 const letter=(ch:string,j:number):(Cell|LibraryGlyph)|undefined=>cells.map((c,i)=>({c,i})).filter(({c})=>!c.space&&c.ch===ch).sort((x,y)=>Math.abs(x.i-Math.min(j,a.length-1))-Math.abs(y.i-Math.min(j,a.length-1)))[0]?.c??library.find(g=>g.ch===ch);
 const piece=(g:Cell|LibraryGlyph):Piece=>'source' in g?{x0:g.x0,x1:g.x1,y0:g.y0,y1:g.y1,source:g.source,...g.baseline===undefined?{}:{baseline:g.baseline},...g.page===undefined?{}:{page:g.page}}:{x0:g.x0,x1:g.x1};
 const placed=(pieces:Piece[],from:number)=>({startX:Math.min(from,...pieces.map(q=>q.to!)),oldEnd,end:Math.max(...pieces.map(q=>q.to!+q.x1-q.x0)),pieces});
 // The same length, each changed character on the advance of the one it replaces.
 if(a.length===b.length){
  const changed=a.flatMap((ch,i)=>ch===b[i]?[]:[i]);
  if(changed.every(i=>!cells[i].space&&!/\s/.test(b[i])&&cells[i].m!==undefined&&(grid||digit(a[i])&&digit(b[i])))){
   const from=Math.max(0,changed[0]-1),pieces:Piece[]=[];
   for(let i=from;i<cells.length;i++){
    const c=cells[i];if(a[i]===b[i]){pieces.push(c.space?{x0:0,x1:c.x1-c.x0,blank:true,to:c.x0}:{x0:c.x0,x1:c.x1,to:c.x0});continue;}
    const g=letter(b[i],i);if(!g)return undefined;
    if(g.m===undefined){pieces.length=0;break;}
    pieces.push({...piece(g),to:over(c,g)});
   }
   if(pieces.length)return placed(pieces,cells[from].x0);
  }
 }
 const plan=(p:number)=>{
  const keep=align(a,b),pieces:Piece[]=[];
  // One pitch: each character from the change on takes its place on the grid.
  if(grid&&cells.every(c=>c.space||c.ch===UNREAD||c.m!==undefined)){
   for(let j=p;j<b.length;j++){
    const k=keep[j],middle=grid.origin+j*grid.pitch;
    if(k>=p&&!cells[k].space){pieces.push({x0:cells[k].x0,x1:cells[k].x1,to:cells[k].x0+(j-k)*grid.pitch});continue;}
    if(/\s/.test(b[j])){pieces.push({x0:0,x1:grid.pitch,blank:true,to:middle-grid.pitch/2});continue;}
    const g=letter(b[j],j);if(!g)return undefined;
    if(g.m===undefined){pieces.length=0;break;}
    pieces.push({...piece(g),to:g.x0+middle-g.m});
   }
   if(pieces.length||p>=b.length)return pieces.length?placed(pieces,p<cells.length?cells[p].x0:oldEnd):{startX:p<cells.length?cells[p].x0:oldEnd,oldEnd,end:p<cells.length?cells[p].x0:oldEnd,pieces};
  }
  for(let j=p;j<b.length;j++){
   const k=keep[j];
   if(k>=p){pieces.push({x0:cells[k].x0,x1:cells[k].x1});continue;}
   const ch=b[j];
   if(/\s/.test(ch)){if(space===undefined)return undefined;pieces.push({x0:0,x1:space,blank:true});continue;}
   const g=letter(ch,j);if(!g)return undefined;
   // A new digit takes a digit's advance, its ink in the middle (its own cell is cut at the ink of its old neighbours).
   const lead=figures!==undefined&&digit(ch)&&g.m!==undefined?figures/2-(g.m-g.x0):0,w=g.x1-g.x0;
   if(lead>0)pieces.push({x0:0,x1:lead,blank:true});
   pieces.push(piece(g));
   if(figures!==undefined&&digit(ch)&&g.m!==undefined&&figures-lead-w>0)pieces.push({x0:0,x1:figures-Math.max(0,lead)-w,blank:true});
  }
  const startX=p<cells.length?cells[p].x0:oldEnd;
  return {startX,oldEnd,end:startX+pieces.reduce((n,q)=>n+q.x1-q.x0,0),pieces};
 };
 const made=plan(first);if(!made||!right)return made;
 // Right-aligned: the whole line is laid again, ending where it ended.
 const delta=made.end-oldEnd;if(Math.abs(delta)<.5)return made;
 const whole=plan(0);if(!whole)return undefined;
 return {startX:whole.startX-delta,oldEnd,end:whole.end-delta,pieces:whole.pieces.map(q=>q.to===undefined?q:{...q,to:q.to-delta})};
}

// The characters of `next` an edit cannot take from the line itself (as
// planGlyphEdit would, with no library): letters the line lacks, and a space
// when the line has none to copy. Each listed once, in typing order.
export function missingLetters(text:string,cells:Cell[],next:string){
 const a=Array.from(text),b=Array.from(next),keep=align(a,b),out:string[]=[];
 let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
 for(let j=p;j<b.length;j++){
  const ch=b[j];if(keep[j]>=p||out.includes(ch))continue;
  if(/\s/.test(ch)?!cells.some(c=>c.space):!cells.some(c=>!c.space&&c.ch===ch))out.push(/\s/.test(ch)?' ':ch);
 }
 return out;
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
