// Read, redraw, compare. Some characters are one shape to a recognizer and
// two to a typeface: 0 and O, 5 and S, 8 and B, 2 and Z, 6 and
// G. In reference codes ("AB0CD", "X0Z", "0SLO") neither the neighbours nor
// the recognizer's confidence tells which was printed, but the page does: the
// line's face is found from its own pixels, each candidate is drawn in it,
// and the one whose drawing is the letter's ink is the reading. A character
// is changed only when the other candidate fits clearly better; where the
// face draws both alike, or the line's face is not found, nothing changes.
import {rankOcrFonts} from '../ocr-font';
import {ensureFont} from '../fonts';
import type {TextRegion} from '../text-regions';

// Not 1, l and I: most faces draw them nearly alike, and on the reading
// benchmark the check fixed none of them and broke ten ("COLIS" to "COL1S",
// "12" to "I2", "Tél." to "TéI."), against 33 lines fixed for 0 and O.
const GROUPS=['0O','5S','8B','2Z','6G'],UNREAD='￼';
type Shape={w:number;h:number;v:Float32Array};
// The ink box of `cover` over columns [x0, x1), sampled 10 x 14, centred and
// scaled so that the product of two shapes is their correlation.
function shapeOf(cover:Float32Array,W:number,H:number,x0:number,x1:number,ink:number):Shape|undefined{
 let l=x1,r=x0-1,t=H,b=-1;
 for(let y=0;y<H;y++)for(let x=Math.max(0,x0);x<Math.min(W,x1);x++)if(cover[y*W+x]>=ink){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
 if(b<0)return undefined;
 const w=r-l+1,h=b-t+1,v=new Float32Array(140),at=(x:number,y:number)=>x<0||y<0||x>=W||y>=H?0:cover[y*W+x];let mean=0,norm=0;
 for(let j=0;j<14;j++)for(let i=0;i<10;i++){
  const fx=l+(i+.5)*w/10-.5,fy=t+(j+.5)*h/14-.5,x=Math.floor(fx),y=Math.floor(fy),ax=fx-x,ay=fy-y;
  mean+=(v[j*10+i]=(at(x,y)*(1-ax)+at(x+1,y)*ax)*(1-ay)+(at(x,y+1)*(1-ax)+at(x+1,y+1)*ax)*ay)/140;
 }
 for(let i=0;i<140;i++){v[i]-=mean;norm+=v[i]*v[i];}
 norm=Math.sqrt(norm)||1;for(let i=0;i<140;i++)v[i]/=norm;
 return {w,h,v};
}
const drawn=new Map<string,Shape|undefined>();
function drawnShape(ch:string,family:string,weight:string,blur:number){
 const key=`${family}/${weight}/${ch}/${blur}`;if(drawn.has(key))return drawn.get(key);
 const S=96,c=document.createElement('canvas');c.width=S*2;c.height=S*2;const g=c.getContext('2d',{willReadFrequently:true})!;
 if(blur)g.filter=`blur(${blur}px)`;g.font=`${weight} ${S}px "${family}"`;g.fillText(ch,S/2,S*1.4);
 const d=g.getImageData(0,0,c.width,c.height).data,cover=new Float32Array(c.width*c.height);for(let i=0;i<cover.length;i++)cover[i]=d[i*4+3]/255;
 const shape=shapeOf(cover,c.width,c.height,0,c.width,.45);drawn.set(key,shape);return shape;
}
// How well a drawn candidate is the letter's ink: shape, less a penalty for another width over height.
const fit=(a:Shape,b:Shape)=>{let sim=0;for(let i=0;i<140;i++)sim+=a.v[i]*b.v[i];return sim-.6*Math.abs(Math.log((a.w/a.h)/(b.w/b.h)));};

// Whether a character can stand in a word whose other characters are `rest`.
export const suits=(ch:string,rest:string)=>/\p{Ll}/u.test(ch)?/\p{Ll}/u.test(rest)||!rest:/\d/.test(ch)?/\d/.test(rest)||!/\p{Ll}/u.test(rest):!/\p{Ll}/u.test(rest)||/\p{Lu}/u.test(rest)||!rest;
export async function redrawCheck(image:HTMLCanvasElement,regions:TextRegion[]):Promise<TextRegion[]>{
 const ctx=image.getContext('2d',{willReadFrequently:true})!,confusable=new RegExp(`[${GROUPS.join('')}]`);
 const out=[...regions];
 for(const [k,r] of regions.entries()){
  if(r.kind!=='ocr'||r.angle||!r.glyphs||r.height<10||!confusable.test(r.text))continue;
  const x0=Math.max(0,Math.floor(r.left)-2),y0=Math.max(0,Math.floor(r.top)-2),W=Math.min(image.width,Math.ceil(r.left+r.width)+2)-x0,H=Math.min(image.height,Math.ceil(r.top+r.height)+2)-y0;if(W<4||H<4)continue;
  const pixels=ctx.getImageData(x0,y0,W,H),bg=[1,3,5].map(i=>parseInt((r.background||'#ffffff').slice(i,i+2),16)),cover=new Float32Array(W*H);let peak=0;
  for(let i=0;i<cover.length;i++){const v=Math.max(Math.abs(pixels.data[i*4]-bg[0]),Math.abs(pixels.data[i*4+1]-bg[1]),Math.abs(pixels.data[i*4+2]-bg[2]));cover[i]=v;if(v>peak)peak=v;}
  if(peak<40)continue;for(let i=0;i<cover.length;i++)cover[i]/=peak;
  // The line's face, from its own pixels.
  let family:string|undefined;
  try{const ranked=await rankOcrFonts([{text:r.text,pixels,background:bg}]);if(ranked[0]&&ranked[0].score>=.5)family=ranked[0].family;}catch{}
  if(!family)continue;
  try{await ensureFont(family);}catch{continue;}
  // The drawing is softened as the scan is: a quarter of a pixel of blur at 96 px for each pixel of the line's blur at its own size.
  const blur=Math.round(Math.min(6,(r.blur??0)*96/Math.max(8,r.height))*2)/2;
  const inked=Array.from(r.text).map((ch,at)=>({ch,at})).filter(c=>/\S/.test(c.ch)),cells=r.glyphs.filter(g=>g.ch!==UNREAD);if(cells.length!==inked.length)continue;
  const chars=Array.from(r.text);let changed=false;const glyphs=r.glyphs.map(g=>({...g}));
  for(const [n,g] of cells.entries()){
   const group=GROUPS.find(s=>s.includes(g.ch));if(!group||g.ch!==inked[n].ch)continue;
   const a=Math.round(g.x0)-x0,b=Math.round(g.x1)-x0;
   // The letter alone in its cell: blank columns on both sides.
   const col=(x:number)=>{if(x<0||x>=W)return false;for(let y=0;y<H;y++)if(cover[y*W+x]>=.45)return true;return false;};
   if(col(a-1)&&col(a)||col(b-1)&&col(b))continue;
   const shape=shapeOf(cover,W,H,a,b,.45);if(!shape||shape.h<8)continue;
   const score=(ch:string)=>Math.max(...['normal','bold'].map(w=>{const d=drawnShape(ch,family!,w,blur);return d?fit(shape,d):-1;}));
   // A candidate must suit its word: a lowercase l among lowercase letters,
   // a digit not in the middle of letters only when another digit is there…
   let i0=inked[n].at,i1=i0;while(i0>0&&/\S/.test(chars[i0-1]))i0--;while(i1+1<chars.length&&/\S/.test(chars[i1+1]))i1++;
   const rest=chars.slice(i0,i1+1).filter((_,j)=>i0+j!==inked[n].at).join('');
   const current=score(g.ch),others=[...group].filter(ch=>ch!==g.ch&&suits(ch,rest)).map(ch=>({ch,s:score(ch)})).sort((p,q)=>q.s-p.s)[0];
   if(!others||others.s<.85||others.s<current+.1)continue;
   chars[inked[n].at]=others.ch;const cell=glyphs.filter(x=>x.ch!==UNREAD)[n];cell.ch=others.ch;changed=true;
  }
  if(changed)out[k]={...r,text:chars.join(''),glyphs};
 }
 return out;
}
