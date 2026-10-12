// Compare foreground coverage inside tight glyph bounds, independent of polarity.
export function inkDensity(pixels:ArrayLike<number>,background:readonly number[]):number|undefined{
 const contrasts:number[]=[];
 for(let i=0;i<pixels.length;i+=4)contrasts.push(Math.max(...[0,1,2].map(c=>Math.abs(pixels[i+c]-background[c])))*(pixels[i+3]/255));
 const sorted=contrasts.filter(v=>v>12).sort((a,b)=>a-b);
 if(sorted.length<8)return undefined;
 const peak=sorted[Math.floor((sorted.length-1)*.95)];
 if(peak<35)return undefined;
 return contrasts.reduce((sum,v)=>sum+(v<peak*.12?0:Math.min(1,v/peak)),0)/contrasts.length;
}
export function chooseBold(source:number|undefined,regular:number|undefined,bold:number|undefined):boolean{
 if(source===undefined||regular===undefined||bold===undefined||bold-regular<.015)return false;
 return source>regular+(bold-regular)*.55;
}
// References are rendered with the source's blur (scaled to the reference size)
// and measured with inkDensity like the source: blur spreads thin strokes and
// lowers their peak contrast, so crisp references made soft regular text look bold.
export function estimateOcrBold(text:string,family:string,height:number,density:number|undefined,blur=0):boolean{
 if(density===undefined||height<8||!text.trim())return false;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!,size=Math.max(12,Math.min(100,height/.75)),soft=blur*size/(height/.75);
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
export function classifyWordWeights(words:(WordInk|undefined)[],uniformBold:boolean,pageInk?:number):{bold:(boolean|undefined)[];ink?:number}{
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
 if(known.length&&!uniformBold&&level(best)>1.1&&level(fit(known.map(()=>true)))<=1.1)best=fit(known.map(()=>true));
 else if(known.length&&pageInk!==undefined){
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
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!,font=`${weight} 64px "${family}"`;
 ctx.font=font;const m=ctx.measureText(text),w=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight),h=Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
 if(w<1||h<1||w*h>4e6)return undefined;
 canvas.width=w;canvas.height=h;ctx.font=font;ctx.fillText(text,m.actualBoundingBoxLeft,m.actualBoundingBoxAscent);
 const data=ctx.getImageData(0,0,w,h).data;let area=0;for(let i=3;i<data.length;i+=4)area+=data[i]/255;
 return area>0?{area,width:w}:undefined;
}
