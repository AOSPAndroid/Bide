import {edgeWidth,blurFromEdgeWidth,estimateTextColor,type Pixels} from './ocr-image';

// Share of a tight text box at the core of its strokes, whatever the polarity
// or the ink colour: each pixel counts by how near its contrast is to the
// strongest (the mean of the top 1% of inked pixels), from 0 at 70% of it to
// 1 at 90% (a ramp: with one threshold, strokes of the same width all cross
// it at once). Blur thins a stroke's core at a rate set by its width, so
// cores still tell regular from bold on soft text, where peak darkness and
// total coverage (ink / peak) come out the same for both.
export function inkDensity(pixels:ArrayLike<number>,background:readonly number[]):number|undefined{
 const n=pixels.length>>2,contrast=new Float32Array(n),levels=new Uint32Array(256);let inked=0;
 for(let j=0,i=0;j<n;j++,i+=4){const v=Math.max(Math.abs(pixels[i]-background[0]),Math.abs(pixels[i+1]-background[1]),Math.abs(pixels[i+2]-background[2]))*(pixels[i+3]/255);contrast[j]=v;if(v>12){levels[Math.min(255,Math.round(v))]++;inked++;}}
 if(inked<8)return undefined;
 const top=Math.max(2,Math.ceil(inked*.01));let left=top,sum=0;
 for(let v=255;left>0;v--){const k=Math.min(left,levels[v]);sum+=k*v;left-=k;}
 const peak=sum/top;if(peak<35)return undefined;
 let core=0;for(let j=0;j<n;j++)core+=Math.max(0,Math.min(1,(contrast[j]/peak-.7)/.2));
 return core/n;
}
export function chooseBold(source:number|undefined,regular:number|undefined,bold:number|undefined):boolean{
 if(source===undefined||regular===undefined||bold===undefined||bold-regular<.015)return false;
 return source>regular+(bold-regular)*.55;
}
// A word's weight from its core share alone, against references rendered with
// the source's blur estimate (scaled to the reference size) and measured like
// the source. Only for words the scan gave no ink mass or width: the estimate
// reads about half the blur, so soft regular text can come out bold here.
// Lines are judged by lineWeight (below).
export function estimateOcrBold(text:string,family:string,height:number,density:number|undefined,blur=0):boolean{
 if(density===undefined||height<8||!text.trim())return false;
 const canvas=document.createElement('canvas');
 try{
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!,size=Math.max(12,Math.min(100,height/.75)),soft=blur*size/(height/.75);
  function measure(weight:string){
   const font=`${weight} ${size}px "${family}"`;
   ctx.font=font;const m=ctx.measureText(text),pad=Math.ceil(soft*3);
   const w=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight),h=Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
   if(w<1||h<1||(w+pad*2)*(h+pad*2)>2000000)return undefined;
   canvas.width=w+pad*2;canvas.height=h+pad*2;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.font=font;ctx.filter=soft>.05?`blur(${soft}px)`:'none';ctx.fillStyle='#000';ctx.fillText(text,pad+m.actualBoundingBoxLeft,pad+m.actualBoundingBoxAscent);ctx.filter='none';
   return inkDensity(ctx.getImageData(pad,pad,w,h).data,[255,255,255]);
  }
  return chooseBold(density,measure('normal'),measure('bold'));
 }finally{canvas.width=canvas.height=0;}
}

// Per-word ink evidence for a line. Words on one line share a text size, so
// ink mass divided by the reference glyph area compares weights without any
// scaling (scaling each reference to its word's width would make a regular
// reference as heavy as the bold word, hiding the difference). `scale` (word
// width / reference width) is only used afterwards for the absolute ink level.
export type WordInk={chars:number;ink:[regular:number,bold:number];scale:[regular:number,bold:number]};
export function wordInk(text:string,mass:number,width:number,regular:{area:number;width:number},bold:{area:number;width:number}):WordInk{
 return {chars:Array.from(text).length,ink:[mass/regular.area,mass/bold.area],scale:[width/regular.width,width/bold.width]};
}

// Pick per-word weights for one line: every word shares one ink colour, so the
// right labelling makes mass/area consistent (low weighted variance of its log).
// A bold/regular split must explain the line much better than one weight;
// otherwise `uniformBold` (the line-level estimate) decides. `ink` is the ink
// level as a fraction of full contrast. Unmeasured words stay undefined.
// `pageInk` (from mixed lines elsewhere on the page) settles single-weight lines
// when the line itself cannot: the reading whose ink level matches it wins.
// `settled`: the line-level estimate is certain (the line's strokes gave it,
// see lineWeight); ink levels, which are measured against the face chosen for
// the text and not the page's own, then do not overrule it.
export function classifyWordWeights(words:(WordInk|undefined)[],uniformBold:boolean,pageInk?:number,settled=false):{bold:(boolean|undefined)[];ink?:number}{
 const measured=words.map((w,i)=>({w,i})).filter((x):x is {w:WordInk;i:number}=>!!x.w&&[...x.w.ink,...x.w.scale].every(v=>Number.isFinite(v)&&v>0));
 // Single characters (€, 1, /) are too noisy to steer the fit; they are
 // assigned afterwards to whichever reading matches the line's ink level.
 const long=measured.filter(({w})=>w.chars>1),known=long.length?long:measured,short=long.length?measured.filter(({w})=>w.chars<=1):[];
 const total=known.reduce((s,{w})=>s+w.chars,0);
 const fit=(labels:boolean[])=>{let mean=0;known.forEach(({w},j)=>{mean+=w.chars*Math.log(w.ink[+labels[j]]);});mean/=total;let v=0;known.forEach(({w},j)=>{v+=w.chars*(Math.log(w.ink[+labels[j]])-mean)**2;});return {labels,v:v/total,mean};};
 const level=(f:{labels:boolean[];mean:number})=>{const scales=known.map(({w},j)=>w.scale[+f.labels[j]]).sort((a,b)=>a-b);return Math.exp(f.mean)/scales[scales.length>>1]**2;};
 // One weight for the line: a regular reading that needs ink darker than full
 // contrast is impossible, so the line is bold.
 let best=fit(known.map(()=>uniformBold));
 const open=known.length>0&&!settled;
 if(open&&!uniformBold&&level(best)>1.1&&level(fit(known.map(()=>true)))<=1.1)best=fit(known.map(()=>true));
 else if(open&&pageInk!==undefined){
  const regular=fit(known.map(()=>false)),heavy=fit(known.map(()=>true)),dr=Math.abs(Math.log(level(regular)/pageInk)),db=Math.abs(Math.log(level(heavy)/pageInk));
  if(Math.abs(dr-db)>.1)best=dr<db?regular:heavy;
 }
 const order=known.map((_,j)=>j).sort((a,b)=>known[b].w.ink[0]-known[a].w.ink[0]);
 for(let n=1;n<order.length;n++){
  const labels=known.map((_,j)=>order.indexOf(j)<n),boldChars=known.reduce((s,{w},j)=>s+(labels[j]?w.chars:0),0);
  if(boldChars<3||total-boldChars<3)continue;
  const split=fit(labels);if(split.v+.002<best.v*.4&&split.v<best.v)best=split;
 }
 const bold:(boolean|undefined)[]=words.map(()=>undefined);known.forEach(({i},j)=>bold[i]=best.labels[j]);
 const used=new Set(best.labels);for(const {w,i} of short)bold[i]=used.size<2?best.labels[0]:Math.abs(Math.log(w.ink[1])-best.mean)<Math.abs(Math.log(w.ink[0])-best.mean);
 if(!known.length)return {bold};
 return {bold,ink:level(best)};
}

// Reference ink of `text` in a face: alpha-weighted glyph area and ink width at 64px.
export function glyphInk(text:string,family:string,weight:string):{area:number;width:number}|undefined{
 const canvas=document.createElement('canvas');
 try{
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!,font=`${weight} 64px "${family}"`;
  ctx.font=font;const m=ctx.measureText(text),w=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight),h=Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
  if(w<1||h<1||w*h>4e6)return undefined;
  canvas.width=w;canvas.height=h;ctx.font=font;ctx.fillText(text,m.actualBoundingBoxLeft,m.actualBoundingBoxAscent);
  const data=ctx.getImageData(0,0,w,h).data;let area=0;for(let i=3;i<data.length;i+=4)area+=data[i]/255;
  return area>0?{area,width:w}:undefined;
 }finally{canvas.width=canvas.height=0;}
}

// --- One weight for a line, from the shape of its strokes ---------------------
// Soft text hides its weight from darkness and coverage: a regular line that
// blur attenuates more and a bold line in lighter ink that it attenuates less
// reach the same peak and the same ink mass. What still differs is how much of
// each stroke stays near its peak. So the line's words are drawn in the face
// in both weights and passed through the scan (its blur, read back from the
// edge width; the ink each weight implies); the weight whose stroke cores,
// and darkest pixels, come out as measured is the line's.

// Words drawn apart on one row: coverage (0-1) and the column span of each.
export type Strokes={alpha:Float32Array;width:number;height:number;slots:{x0:number;x1:number}[]};
const WHITE=[255,255,255];

// Gaussian blur of a coverage map (nothing lies beyond its edges). The last
// result is kept: one blur is measured several ways.
const softened=new WeakMap<Strokes,{sigma:number;alpha:Float32Array}>();
function soften(s:Strokes,sigma:number){
 if(sigma<.05)return s.alpha;
 const kept=softened.get(s);if(kept?.sigma===sigma)return kept.alpha;
 const {alpha:a,width:w,height:h}=s,r=Math.ceil(sigma*3),k=new Float32Array(2*r+1),t=new Float32Array(w*h),out=new Float32Array(w*h);let ks=0;
 for(let i=-r;i<=r;i++)ks+=k[i+r]=Math.exp(-i*i/(2*sigma*sigma));
 for(let i=0;i<k.length;i++)k[i]/=ks;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let j=Math.max(-r,-x),e=Math.min(r,w-1-x);j<=e;j++)v+=k[j+r]*a[y*w+x+j];t[y*w+x]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let j=Math.max(-r,-y),e=Math.min(r,h-1-y);j<=e;j++)v+=k[j+r]*t[(y+j)*w+x];out[y*w+x]=v;}
 softened.set(s,{sigma,alpha:out});return out;
}
// The strokes as a scan shows them: dark on white, blurred by `sigma` pixels,
// in ink of contrast `ink` (0-1).
export function scanned(s:Strokes,sigma:number,ink:number):Pixels{
 const a=soften(s,sigma),data=new Uint8ClampedArray(a.length*4);
 for(let i=0;i<a.length;i++){const v=255-255*ink*a[i];data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255;}
 return {data,width:s.width,height:s.height};
}
// Blur at which the drawn strokes read the scan's blur estimate. The estimate
// is not the blur itself (on thin strokes it reads about half of it, and it
// stalls where strokes merge), so the drawing is measured the same way,
// starting near where the estimate puts it, until it reads the same (secant
// steps; the closest blur tried wins).
const blurNear=(estimate:number)=>.53+estimate*1.07;
export function scanBlur(s:Strokes,estimate:number){
 const read=(sigma:number)=>{const e=edgeWidth(scanned(s,sigma,1),{x0:0,y0:0,x1:s.width,y1:s.height},WHITE);return e===undefined?undefined:blurFromEdgeWidth(e);},within=(v:number)=>Math.max(.2,Math.min(blurNear(estimate)+1,v));
 let a=blurNear(estimate),fa=read(a);if(fa===undefined)return a;
 let b=within(a+(estimate-fa)/.95),best=a,off=Math.abs(fa-estimate);
 for(let i=0;i<3&&off>=.03;i++){
  const fb=read(b);if(fb===undefined)break;
  if(Math.abs(fb-estimate)<off){best=b;off=Math.abs(fb-estimate);}
  if(Math.abs(fb-fa)<1e-3)break;
  const next=within(b+(estimate-fb)*(b-a)/(fb-fa));a=b;fa=fb;b=next;
 }
 return best;
}
// What the scan measures on the drawn strokes: the core share of each word in
// its tight box (the recognizer trims a word to its pixels over a contrast of
// 60) and the contrast (0-1) of the colour, sampled as estimateTextColor
// does: the mean of the strongest 8% of the pixels over 40.
function measured(s:Strokes,sigma:number,ink:number){
 const {data,width,height}=scanned(s,sigma,ink),levels=new Uint32Array(256);let strongest=0,strong=0;
 for(let i=0;i<data.length;i+=4){const c=255-data[i];levels[c]++;if(c>strongest)strongest=c;if(c>40)strong++;}
 const t=255-(strongest>60?60:strongest/2),density=s.slots.map(({x0,x1})=>{
  let left=x1,right=x0-1,top=height,bottom=-1;
  for(let y=0;y<height;y++)for(let x=x0,i=(y*width+x0)*4;x<x1;x++,i+=4)if(data[i]<t){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;}
  if(bottom<0)return undefined;
  const w=right-left+1,h=bottom-top+1,box=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)box.set(data.subarray(((top+y)*width+left)*4,((top+y)*width+left+w)*4),y*w*4);
  return inkDensity(box,WHITE);
 });
 if(strong<4)return {density,peak:undefined};
 const core=Math.max(2,Math.ceil(strong*.08));let left=core,sum=0;
 for(let c=255;left>0;c--){const k=Math.min(left,levels[c]);sum+=k*c;left-=k;}
 return {density,peak:sum/core/255};
}
// How far the measured stroke cores (and, when the ink of each weight is known
// from the ink mass, the measured peak) are from each weight's drawing, as a
// difference of squared errors: positive when bold explains the line better.
// Tolerances: cores vary by 15% from the drawing at the right weight and 30 to
// 55% at the wrong one; peaks by 10% (and tell little on soft text).
// `observed[i]` is the core share of word i (inkDensity of its box); `blur`
// the scan's estimate (blurFromEdgeWidth) in the pixels of the drawings. A
// crisp scan's estimate is clamped at 0 while its blur can reach 0.5 px (a
// tenth less core): each weight is then tried nearly sharp and at 0.5 px.
// `scale` under 1: the drawings are that much smaller than the scan (large
// text); the scan's blur is then taken from the estimate and shrunk with them.
export function weightEvidence(observed:(number|undefined)[],chars:number[],blur:number,drawn:[regular:Strokes,bold:Strokes],peak?:number,ink?:[regular:number,bold:number],scale=1):number|undefined{
 const error=drawn.map((strokes,b)=>{
  let least:number|undefined;
  for(const sigma of blur<=0?[.15*scale,.5*scale]:[scale<1?blurNear(blur)*scale:scanBlur(strokes,blur)]){
   let level=ink?Math.min(1,ink[b]):1;
   // Without the ink mass, the ink is what gives the drawing the measured peak.
   if(!ink&&peak!==undefined){const unit=measured(strokes,sigma,1).peak;if(unit)level=Math.min(1,peak/unit);}
   const m=measured(strokes,sigma,level);let sum=0,n=0;
   observed.forEach((o,i)=>{const d=m.density[i];if(o&&d){sum+=chars[i]*Math.log(o/d);n+=chars[i];}});
   if(!n)continue;
   const core=sum/n/.15,dark=ink&&peak&&m.peak?Math.log(peak/m.peak)/.1:0,e=core*core+dark*dark;
   if(least===undefined||e<least)least=e;
  }
  return least;
 });
 return error[0]===undefined||error[1]===undefined?undefined:error[0]-error[1];
}
// Words drawn in a face and weight at a font size in pixels, `pad` pixels
// of margin around each: room for three times the largest blur tried.
export function drawWords(words:string[],family:string,weight:string,size:number,pad=12):Strokes|undefined{
 const canvas=document.createElement('canvas');
 try{
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!,font=`${weight} ${size}px "${family}"`;
  ctx.font=font;const metrics=words.map(w=>ctx.measureText(w));let x=0;
  const ascent=Math.ceil(Math.max(...metrics.map(m=>m.actualBoundingBoxAscent))),descent=Math.ceil(Math.max(...metrics.map(m=>m.actualBoundingBoxDescent)));
  const slots=metrics.map(m=>{const slot={x0:x,x1:x+Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight)+pad*2,left:m.actualBoundingBoxLeft};x=slot.x1;return slot;}),height=ascent+descent+pad*2;
  if(!words.length||x<1||height<1||x*height>6e5)return undefined;
  canvas.width=x;canvas.height=height;ctx.font=font;slots.forEach((s,i)=>ctx.fillText(words[i],s.x0+pad+s.left,pad+ascent));
  const data=ctx.getImageData(0,0,x,height).data,alpha=new Float32Array(x*height);for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3]/255;
  return {alpha,width:x,height,slots:slots.map(({x0,x1})=>({x0,x1}))};
 }finally{canvas.width=canvas.height=0;}
}
// Weight of a line set in one weight. `words`: its measurable words with the
// core share of each (inkDensity) and, when the scan measured it, their ink
// (wordInk); `size`: the font size of each weight in scan pixels when no word
// has ink; `blur`: the scan's blur estimate in scan pixels; `peak`: contrast
// (0-1) of the line's colour. Bold must explain the line a little better than
// regular (most text is regular); `sure` is false when the two are close.
export function lineWeight(words:{text:string;density?:number;ink?:WordInk}[],family:string,blur:number,peak?:number,size?:[regular:number,bold:number]):{bold:boolean;sure:boolean}|undefined{
 const usable=words.filter(w=>w.density!==undefined&&w.text.trim()),inked=usable.filter((w):w is typeof w&{ink:WordInk}=>!!w.ink);
 const middle=(v:number[])=>v.sort((a,b)=>a-b)[v.length>>1];
 const sizes=inked.length?[0,1].map(b=>64*middle(inked.map(w=>w.ink.scale[b]))):size;
 if(!usable.length||!sizes||!sizes.every(s=>s>=4&&s<=400))return undefined;
 // Text over 64 px is drawn at 64: core shares and peaks do not depend on the
 // size there, and a full-size drawing would take tens of milliseconds.
 const shrink=Math.min(1,64/Math.max(...sizes)),drawnSize=sizes[0]*shrink;
 // The blur estimate depends on the letters it was read on (a serif € reads
 // half as much again as the digits beside it), so the whole line is drawn
 // when it is short enough to draw and blur in a few milliseconds, else its
 // longest words. Cores are not compared on single characters (€, 1, /),
 // too noisy, unless the line has nothing longer.
 const budget=Math.max(6,Math.round(15e3/(drawnSize*drawnSize))),length=(w:{text:string})=>Array.from(w.text).length,longest=[...usable].sort((a,b)=>length(b)-length(a));let taken=0;
 const fitting=longest.filter(w=>{if(taken+length(w)>budget)return false;taken+=length(w);return true;}),sample=fitting.length?fitting:[longest.at(-1)!],long=sample.some(w=>length(w)>1);
 const pad=Math.ceil(3*(blur*shrink*1.07+1.53)),drawn=['normal','bold'].map((weight,b)=>drawWords(sample.map(w=>w.text),family,weight,sizes[b]*shrink,pad));
 if(!drawn[0]||!drawn[1])return undefined;
 // The ink each weight implies: ink mass over the weight's glyph area, as classifyWordWeights measures it.
 const chars=inked.reduce((s,w)=>s+w.ink.chars,0),ink=inked.length?[0,1].map(b=>Math.exp(inked.reduce((s,w)=>s+w.ink.chars*Math.log(w.ink.ink[b]),0)/chars)/(sizes[b]/64)**2) as [number,number]:undefined;
 const evidence=weightEvidence(sample.map(w=>w.density),sample.map(w=>long&&length(w)<2?0:length(w)),blur,drawn as [Strokes,Strokes],peak,ink,shrink);
 return evidence===undefined?undefined:{bold:evidence>.5,sure:Math.abs(evidence-.5)>=2};
}
