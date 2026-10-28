// Typographic marks on image text, settled from each letter cell's own ink.
// The Latin recognizer has ’ and − but mostly answers ' and -, and it has no
// en dash (it drops one, or a neighbouring letter's cell takes it) and no ★:
// on 490 invented fields, 22 differed from the truth only by such marks.
// Run once per scan on the regions of the level raster they were read from:
// - a dash is judged by its ink length against the line's x-height and the
//   page's own hyphens: − in front of a number, – alone between spaces or
//   between digits, — when much longer; a hyphen-length one is -.
// - an apostrophe after a letter is ’ when its tail curls like a comma's,
//   or when the page uses ’ in clear cases (the recognizer read one, or one
//   curls clearly). Below about 18 px straight and curly marks look alike,
//   so nothing ever turns ’ into '.
// - ink no cell explains (a run of columns apart from its cell's letter, or
//   between cells) gets a cell of its own: a level bar at dash height is a
//   dash; a symbol-sized blot is an UNREAD placeholder, which adds nothing
//   to the text but lets a letter edit keep its pixels (glyph-edit.ts).
// Anything not clearly one way keeps the recognizer's reading.
import {UNREAD,type Glyph} from './glyph-edit';

type Pixels={data:ArrayLike<number>;width:number;height:number};
type Measured={text:string;inkDensity?:number;inkMass?:number;width?:number};
export type TypeRegion={text:string;left:number;top:number;width:number;height:number;background?:string;glyphs?:Glyph[];words?:Measured[];line?:{words:Measured[];start:number;count:number}};
type Run={a:number;b:number};
type Token={ch:string;glyph?:Glyph;word?:number;found?:boolean};

const median=(v:number[])=>v.length?[...v].sort((a,b)=>a-b)[v.length>>1]:undefined;
const rgb=(hex='#ffffff')=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)||0);
const LETTER=/^\p{L}$/u,DIGIT=/^\p{N}$/u,DASH=/^[-−–—]$/,QUOTE=/^['’]$/,MARK=/^[.,:;·•'’‘`´"“”«»_\-−–—]$/;

// Contrast with the line's background over its box, the ink threshold (as
// for letter cells, 45% of the strongest), and the line's x-height and
// baseline from letters without ascenders or descenders (capitals and
// digits stand in at 72% when there are none).
export function measureLine(img:Pixels,r:TypeRegion){
 const bg=rgb(r.background),x0=Math.max(0,Math.floor(r.left)),x1=Math.min(img.width,Math.ceil(r.left+r.width)),y0=Math.max(0,Math.floor(r.top)),y1=Math.min(img.height,Math.ceil(r.top+r.height)),w=Math.max(0,x1-x0),h=Math.max(0,y1-y0);
 const c=new Float32Array(w*h);let peak=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((y+y0)*img.width+x+x0)*4,v=Math.max(Math.abs(img.data[i]-bg[0]),Math.abs(img.data[i+1]-bg[1]),Math.abs(img.data[i+2]-bg[2]));c[y*w+x]=v;if(v>peak)peak=v;}
 const t=Math.max(40,peak*.45),cols=new Int32Array(w);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(c[y*w+x]>t)cols[x]++;
 // Contrast at page x, box row y; inked rows of page columns [a, b); inked column runs.
 const at=(x:number,y:number)=>x<x0||x>=x1||y<0||y>=h?0:c[y*w+x-x0];
 const span=(a:number,b:number,from=0,to=h)=>{let top=-1,bottom=-1;for(let y=Math.max(0,from);y<Math.min(h,to);y++)for(let x=Math.max(a,x0);x<Math.min(b,x1);x++)if(at(x,y)>t){if(top<0)top=y;bottom=y;break;}return top<0?undefined:{top,bottom:bottom+1};};
 const runs=(a:number,b:number)=>{const out:Run[]=[];for(let x=Math.max(a,x0);x<Math.min(b,x1);x++)if(cols[x-x0]){const last=out.at(-1);if(last&&last.b===x)last.b++;else out.push({a:x,b:x+1});}return out;};
 const body=(g:Glyph)=>{const m=(g.x1-g.x0)*.2;return span(Math.round(g.x0+m),Math.max(Math.round(g.x0+m)+1,Math.round(g.x1-m)));};
 const glyphs=(r.glyphs??[]).filter(g=>g.ch!==UNREAD),low=glyphs.filter(g=>/^[acemnorsuvwxz]$/.test(g.ch)).map(body).filter(s=>!!s),high=glyphs.filter(g=>/^[A-HK-PR-Z0-9]$/.test(g.ch)).map(body).filter(s=>!!s);
 const xh=median(low.map(s=>s.bottom-s.top))??(high.length?median(high.map(s=>s.bottom-s.top))!*.72:h*.5),baseline=median((low.length?low:high).map(s=>s.bottom))??h;
 return {x0,x1,w,h,t,cols,at,span,runs,xh:Math.max(1,xh),baseline};
}
export type LineInk=ReturnType<typeof measureLine>;
const mass=(m:LineInk,r:Run)=>{let s=0;for(let x=r.a;x<r.b;x++)s+=m.cols[x-m.x0];return s;};

// Ink length of a level bar over columns [a, b), in x-heights: each column
// counts by its strongest pixel against the bar's own, so a soft edge
// counts in part (blur spreads a bar's ink but keeps its total).
export function barLength(m:LineInk,run:Run){
 const s=m.span(run.a,run.b);if(!s)return 0;
 const strongest=(x:number)=>{let v=0;for(let y=s.top-1;y<=s.bottom;y++)v=Math.max(v,m.at(x,y));return v;};
 let peak=0;for(let x=run.a;x<run.b;x++)peak=Math.max(peak,strongest(x));if(!peak)return 0;
 let sum=0;for(let x=run.a-1;x<=run.b;x++){if((x<run.a||x>=run.b)&&m.cols[x-m.x0])continue;sum+=Math.min(1,strongest(x)/peak);}
 return sum/m.xh;
}
// A level bar at dash height: at least `min` x-heights long, thin, its
// middle between 15% and 80% of the x-height above the baseline.
export function isBar(m:LineInk,run:Run,min=.65){
 const s=m.span(run.a,run.b);if(!s)return false;
 const thick=s.bottom-s.top,long=run.b-run.a,mid=m.baseline-(s.top+s.bottom)/2;
 return long>=min*m.xh&&thick<=Math.max(2.5,.35*m.xh)&&long>=thick*2.5&&mid>=.15*m.xh&&mid<=.8*m.xh;
}
// Ink the size of a letter or symbol (★), not a speck, accent or tick.
const isSymbol=(m:LineInk,run:Run)=>{const s=m.span(run.a,run.b);return !!s&&s.bottom-s.top>=.6*m.xh&&run.b-run.a>=.4*m.xh;};

// Shape of an apostrophe-like mark over columns run.a-1 .. run.b: its
// pixels over a quarter of its strongest, 8-connected to it, above the
// baseline. `tail`: how far its last solid row (one reaching half its
// strongest) ends left of its rightmost row, by each row's centre of ink.
// A ’ is a raised comma whose tail curls back left; a straight ' is a level
// or tapered tick. On invented lines in five faces at 13 to 42 px, clean and
// scanned, straight ticks stayed under 0.4 px and curly ones from 18 px up
// reached 0.4 to 4.8 px (Arial's are the least curled).
export function markShape(m:LineInk,run:Run){
 const s=m.span(run.a,run.b,0,Math.round(m.baseline-.2*m.xh));if(!s)return undefined;
 let peak=0,seed=-1;for(let y=s.top;y<s.bottom;y++)for(let x=run.a;x<run.b;x++){const v=m.at(x,y);if(v>peak){peak=v;seed=y*1e5+x;}}
 const blob=new Map<number,number>(),stack=[seed];
 while(stack.length){const k=stack.pop()!,y=Math.floor(k/1e5),x=k-y*1e5;if(blob.has(k)||x<run.a-1||x>run.b||y<0||y>=m.baseline)continue;const v=m.at(x,y);if(v<peak*.25)continue;blob.set(k,v);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)stack.push((y+dy)*1e5+x+dx);}
 const rows=new Map<number,{w:number;x:number;max:number}>();
 for(const [k,v] of blob){const y=Math.floor(k/1e5),x=k-y*1e5,r=rows.get(y)??{w:0,x:0,max:0};r.w+=v;r.x+=v*(x+.5);r.max=Math.max(r.max,v);rows.set(y,r);}
 const ys=[...rows.keys()].sort((a,b)=>a-b),solid=ys.filter(y=>rows.get(y)!.max>=peak*.5),centre=(y:number)=>rows.get(y)!.x/rows.get(y)!.w;
 if(solid.length<2)return undefined;
 return {tail:Math.max(...solid.map(centre))-centre(solid.at(-1)!),height:ys.reduce((a,y)=>a+rows.get(y)!.max/peak,0)};
}

// The line as characters, each non-space one with its cell (placeholders
// too, in cell order), and its word number. Undefined if they disagree.
function tokensOf(text:string,glyphs:Glyph[]){
 const out:Token[]=[];let g=0,word=-1,gap=true;
 for(const ch of Array.from(text)){
  if(/\s/.test(ch)){out.push({ch});gap=true;continue;}
  if(gap){word++;gap=false;}
  while(glyphs[g]?.ch===UNREAD)out.push({ch:UNREAD,glyph:{...glyphs[g++]},word});
  const glyph=glyphs[g++];if(!glyph||glyph.ch!==ch)return undefined;out.push({ch,glyph:{...glyph},word});
 }
 while(glyphs[g]?.ch===UNREAD)out.push({ch:UNREAD,glyph:{...glyphs[g++]},word});
 return g===glyphs.length?out:undefined;
}
const inked=(t:Token|undefined)=>!!t?.glyph&&t.ch!==UNREAD;

// Ink no character explains, given its own cell (found inside a letter's
// cell, apart from the letter's run, or between cells), with the spaces
// its gaps to the ink around it are worth. Cells are cut at the midpoints
// between runs; a dash replaces the spaces between its neighbours.
function unreadInk(m:LineInk,tokens:Token[]){
 const space=Math.max(2,.35*m.xh),cell=(g:{x0:number;x1:number}):Run=>({a:Math.round(g.x0),b:Math.round(g.x1)});
 const inkOf=(t:Token)=>m.runs(cell(t.glyph!).a,cell(t.glyph!).b);
 const found:{run:Run;bar:boolean;x0:number;x1:number}[]=[];
 tokens.forEach((t,i)=>{
  if(!inked(t))return;const runs=inkOf(t);if(runs.length<2)return;
  // A bar beside a letter is a dash. A symbol-sized run apart from the
  // rest is unread ink when it sits where the word was cut (before a word's
  // first letter, after its last) and a letter-sized run is left, next to
  // a mark (·, -), whose own run is its smallest, or beside a word of one
  // letter, away from where the recognizer placed it.
  const bar=runs.map(r=>!DASH.test(t.ch)&&isBar(m,r)),rest=runs.flatMap((r,k)=>bar[k]?[]:[k]);if(!rest.length)return;
  const sized=runs.map(r=>isSymbol(m,r)),apart=Math.max(3,.45*m.xh),extra=new Set<number>(),mark=MARK.test(t.ch);
  const first=!inked(tokens[i-1])&&tokens[i-1]?.ch!==UNREAD,last=!inked(tokens[i+1])&&tokens[i+1]?.ch!==UNREAD;
  let host=rest.reduce((p,q)=>mass(m,runs[q])<mass(m,runs[p])?q:p);
  if(mark){for(const k of rest)if(k!==host&&sized[k]&&(k>host?runs[k].a-runs[k-1].b:runs[k+1].a-runs[k].b)>=apart)extra.add(k);}
  else{
   if(first&&!last&&rest.length>1&&sized[rest[0]]&&runs[rest[1]].a-runs[rest[0]].b>=apart&&rest.slice(1).some(k=>sized[k]))extra.add(rest[0]);
   if(last&&!first&&rest.length>1&&sized[rest.at(-1)!]&&runs[rest.at(-1)!].a-runs[rest.at(-2)!].b>=apart&&rest.slice(0,-1).some(k=>sized[k]))extra.add(rest.at(-1)!);
   // A word of one letter: its run is the one the recognizer placed it in.
   const c=t.glyph!.c,off=(k:number)=>c===undefined?0:c<runs[k].a?runs[k].a-c:c>=runs[k].b?c-runs[k].b+1:0,lone=first&&last&&c!==undefined?rest.reduce((p,q)=>off(q)<off(p)?q:p):undefined;
   if(lone!==undefined&&sized[lone])for(const k of rest)if(k!==lone&&sized[k]&&(k>lone?runs[k].a-runs[k-1].b:runs[k+1].a-runs[k].b)>=apart)extra.add(k);
   host=rest.filter(k=>!extra.has(k)).reduce((p,q)=>mass(m,runs[q])>mass(m,runs[p])?q:p);
  }
  const kind=runs.map((r,k)=>bar[k]?'bar':extra.has(k)?'symbol':undefined);
  // Cells meet midway between two runs, or at their ink across a space;
  // the letter keeps the runs up to the nearest found ones, a found run
  // those beyond it up to the next.
  const edge=(k:number,end:boolean)=>runs[k].a-runs[k-1].b>=space?end?runs[k-1].b:runs[k].a:(runs[k-1].b+runs[k].a)/2,g=t.glyph!;let left=0,right=runs.length;
  for(let k=host-1;k>=0;k--)if(kind[k]){left=k+1;break;}
  for(let k=host+1;k<runs.length;k++)if(kind[k]){right=k;break;}
  runs.forEach((r,k)=>{
   if(!kind[k])return;
   let end=k+1;if(k>host)while(end<runs.length&&!kind[end])end++;
   let start=k;if(k<host)while(start>0&&!kind[start-1])start--;
   found.push({run:r,bar:kind[k]==='bar',x0:k>host?edge(k,false):start?edge(start,false):g.x0,x1:k<host?edge(k+1,true):end<runs.length?edge(end,true):g.x1});
  });
  const x0=left?edge(left,false):g.x0,x1=right<runs.length?edge(right,true):g.x1;g.x0=x0;g.x1=x1;
 });
 // Between cells: runs over uncovered columns, with blank columns on both sides.
 const covered=new Uint8Array(m.w);for(const c of [...tokens.filter(inked).map(t=>cell(t.glyph!)),...found.map(f=>cell(f))])for(let x=Math.max(c.a,m.x0);x<Math.min(c.b,m.x1);x++)covered[x-m.x0]=1;
 for(const r of m.runs(m.x0,m.x1)){
  let free=!covered.subarray(r.a-m.x0,r.b-m.x0).some(Boolean);if(!free)continue;
  // Touching a covered inked column: a letter's ink beyond its cell.
  if(r.a>m.x0&&covered[r.a-1-m.x0]||r.b<m.x1&&covered[r.b-m.x0])free=false;
  const bar=isBar(m,r);if(!free||!bar&&!isSymbol(m,r))continue;
  found.push({run:r,bar,x0:r.a,x1:r.b});
 }
 // Each found run goes in after the last cell left of it.
 for(const f of found.sort((p,q)=>q.run.a-p.run.a)){
  let i=-1;tokens.forEach((t,k)=>{if(inked(t)&&t.glyph!.x0<f.run.a)i=k;});
  let j=i+1;while(j<tokens.length&&!inked(tokens[j]))j++;
  if(!f.bar){tokens.splice(i+1,0,{ch:UNREAD,glyph:{ch:UNREAD,x0:f.x0,x1:f.x1},word:tokens[i]?.word??0});continue;}
  const prev=i>=0?inkOf(tokens[i]).at(-1)?.b:undefined,next=j<tokens.length?inkOf(tokens[j])[0]?.a:undefined;
  const before=prev!==undefined&&f.run.a-prev>=space,after=next!==undefined&&next-f.run.b>=space;
  // The dash replaces the spaces between its neighbours, with the spaces its gaps are worth.
  const held=tokens.slice(i+1,j).filter(t=>t.ch===UNREAD);
  tokens.splice(i+1,j-i-1,...held.filter(t=>t.glyph!.x0<f.run.a),...before?[{ch:' '}]:[],{ch:'-',glyph:{ch:'-',x0:f.x0,x1:f.x1},word:before?undefined:tokens[i]?.word,found:true},...after?[{ch:' '}]:[],...held.filter(t=>t.glyph!.x0>=f.run.a));
 }
}

// The character a dash is, from its length L (x-heights) and its
// neighbours; H is the page's hyphen length. Undefined: not clear.
export function dashFor(L:number,prev:string|undefined,next:string|undefined,H=.5){
 const open=(c?:string)=>c===undefined||c===' ',en=Math.max(.65,1.3*H),hyphen=Math.max(.6,1.15*H),em=1.4;
 if(open(prev)&&open(next))return L>=em?'—':L>=en?'–':L<=hyphen?'-':undefined;
 if((open(prev)||prev==='(')&&next!==undefined&&DIGIT.test(next))return L>=em?undefined:L>=en?'−':L<=hyphen?'-':undefined;
 if(prev!==undefined&&next!==undefined&&DIGIT.test(prev)&&DIGIT.test(next))return L>=em?undefined:L>=en?'–':L<=hyphen?'-':undefined;
 if(prev!==undefined&&next!==undefined&&LETTER.test(prev)&&LETTER.test(next))return L>=em?'—':L<=hyphen?'-':undefined;
 return undefined;
}
// An apostrophe whose tail curls clearly (markShape), measured on enough
// rows and the height of an apostrophe (0.3 to 0.75 x-heights).
export const curlyShape=(s:{tail:number;height:number}|undefined,xh:number)=>!!s&&s.height>=2.5&&s.height>=.3*xh&&s.height<=.75*xh&&s.tail>=Math.max(.5,.08*s.height);

export function typesetRegions<T extends TypeRegion>(regions:T[],img:Pixels):T[]{
 const lines=regions.map(r=>{const tokens=r.glyphs?.length?tokensOf(r.text,r.glyphs):undefined;return tokens&&{m:measureLine(img,r),tokens};});
 for(const l of lines)if(l)unreadInk(l.m,l.tokens);
 const own=(l:{m:LineInk},t:Token)=>{const runs=l.m.runs(Math.round(t.glyph!.x0),Math.round(t.glyph!.x1));return runs.length?runs.reduce((p,q)=>q.b-q.a>p.b-p.a?q:p):undefined;};
 const near=(tokens:Token[],i:number,step:number)=>{for(let k=i+step;k>=0&&k<tokens.length;k+=step)if(tokens[k].ch!==UNREAD)return tokens[k].ch;return undefined;};
 // The page's hyphens: dashes between two letters, shorter than an en dash.
 const hyphens=lines.flatMap(l=>l?l.tokens.flatMap((t,i)=>{if(t.ch!=='-'||!LETTER.test(near(l.tokens,i,-1)??'')||!LETTER.test(near(l.tokens,i,1)??''))return [];const r=own(l,t);const L=r?barLength(l.m,r):0;return L&&L<.75?[L]:[];}):[]);
 const H=median(hyphens)??.5;
 // Apostrophes: the page uses ’ when one reads or curls as ’.
 const quotes=lines.flatMap(l=>l?l.tokens.flatMap((t,i)=>QUOTE.test(t.ch)&&LETTER.test(near(l.tokens,i,-1)??'')?[{l,t,i}]:[]):[]);
 const curly=(q:typeof quotes[number])=>{if(q.t.ch==='’')return true;const runs=q.l.m.runs(Math.round(q.t.glyph!.x0),Math.round(q.t.glyph!.x1));return runs.length===1&&curlyShape(markShape(q.l.m,runs[0]),q.l.m.xh);};
 const page=quotes.some(curly);
 for(const q of quotes)if(q.t.ch!=='’'&&(page||curly(q))){q.t.ch='’';q.t.glyph!.ch='’';}
 for(const l of lines)if(l)l.tokens.forEach((t,i)=>{
  if(!DASH.test(t.ch)||!t.glyph)return;const r=own(l,t),L=r?barLength(l.m,r):0,ch=r&&dashFor(L,near(l.tokens,i,-1),near(l.tokens,i,1),H);
  // A bar the recognizer did not read is most likely the en dash it lacks;
  // one it read as — stays so from an x-height long (a monospace em dash).
  const next=ch==='–'&&t.ch==='—'&&L>=1?undefined:ch??(t.found?'–':undefined);if(next){t.ch=next;t.glyph.ch=next;}
 });
 // The recognizer's letter centres are not kept (later mappings move cells only).
 const bare=(g:Glyph):Glyph=>{const {c:_,...rest}=g;return rest;};
 return relink(regions.map((r,k)=>{const l=lines[k];if(!l)return r.glyphs?.some(g=>g.c!==undefined)?{...r,glyphs:r.glyphs.map(bare)}:r;
  const text=l.tokens.filter(t=>t.ch!==UNREAD).map(t=>t.ch).join(''),glyphs=l.tokens.flatMap(t=>t.glyph?[bare(t.glyph)]:[]);
  if(text===r.text&&glyphs.length===r.glyphs!.length&&glyphs.every((g,i)=>g.ch===r.glyphs![i].ch&&g.x0===r.glyphs![i].x0&&g.x1===r.glyphs![i].x1))return {...r,glyphs};
  return {...r,text,glyphs,...wordsAfter(r,l.tokens)};
 }));
}

// Words of the new text, each keeping the measurements of the word its
// first original character came from (a dash between spaces is new).
function wordsAfter(r:TypeRegion,tokens:Token[]){
 const groups:Token[][]=[];let gap=true;
 for(const t of tokens){if(t.ch===UNREAD)continue;if(t.ch===' '){gap=true;continue;}if(gap)groups.push([]);gap=false;groups.at(-1)!.push(t);}
 const from=(old:Measured[]|undefined)=>{const used=new Set<number>();return groups.map(g=>{const text=g.map(t=>t.ch).join(''),w=g.find(t=>t.word!==undefined&&!t.found)?.word;if(w===undefined||used.has(w)||!old?.[w])return {text};used.add(w);return {...old[w],text};});};
 const words=r.words||groups.length>1?from(r.words??r.line?.words.slice(r.line.start,r.line.start+r.line.count)):undefined;
 return {words,...r.line?{lineWords:from(r.line.words.slice(r.line.start,r.line.start+r.line.count))}:{}};
}
// Regions of one recognized line share its measured words: rebuilt from
// each region's own words, in order.
function relink<T extends TypeRegion>(regions:(T&{lineWords?:Measured[]})[]):T[]{
 const byLine=new Map<Measured[],(T&{lineWords?:Measured[]})[]>();
 for(const r of regions)if(r.line)byLine.set(r.line.words,[...byLine.get(r.line.words)??[],r]);
 const out=new Map<object,T>();
 for(const [words,group] of byLine){
  if(!group.some(r=>r.lineWords))continue;
  const sorted=[...group].sort((a,b)=>a.line!.start-b.line!.start),line:Measured[]=[];let from=0;
  for(const r of sorted){line.push(...words.slice(from,r.line!.start));const start=line.length,own=r.lineWords??words.slice(r.line!.start,r.line!.start+r.line!.count);line.push(...own);from=r.line!.start+r.line!.count;out.set(r,{...r,line:{words:line,start,count:own.length}});}
  line.push(...words.slice(from));
 }
 return regions.map(r=>{const {lineWords:_,...rest}=(out.get(r)??r) as T&{lineWords?:Measured[]};return rest as T;});
}
