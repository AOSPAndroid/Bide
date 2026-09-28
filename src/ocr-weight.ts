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
export function estimateOcrBold(text:string,family:string,height:number,density:number|undefined):boolean{
 if(density===undefined||height<8||!text.trim())return false;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
 function measure(weight:string){
  const font=`${weight} ${Math.max(12,Math.min(100,height/.75))}px "${family}"`;
  ctx.font=font;const m=ctx.measureText(text);
  const w=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight),h=Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
  if(w<1||h<1||w*h>2000000)return undefined;
  canvas.width=w;canvas.height=h;ctx.font=font;ctx.fillStyle='#fff';ctx.fillText(text,m.actualBoundingBoxLeft,m.actualBoundingBoxAscent);
  const data=ctx.getImageData(0,0,w,h).data;let sum=0;
  for(let i=3;i<data.length;i+=4)sum+=data[i]/255;
  return sum/(w*h);
 }
 return chooseBold(density,measure('normal'),measure('bold'));
}
