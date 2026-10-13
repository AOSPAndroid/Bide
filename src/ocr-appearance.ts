// Continuous ink coverage retains the faint edges that binary OCR masks lose.
export type Coverage={data:Float32Array;width:number;height:number};
export function contrastCoverage(pixels:ArrayLike<number>,width:number,height:number,background:readonly number[]):Coverage{
 const data=new Float32Array(width*height);
 for(let i=0;i<data.length;i++){
  const p=i*4,v=Math.max(...[0,1,2].map(c=>Math.abs(pixels[p+c]-background[c])))/255*(pixels[p+3]/255);
  data[i]=v>.035?v:0; // Ignore JPEG noise and small background variations.
 }
 return {data,width,height};
}
export function alphaCoverage(pixels:ArrayLike<number>,width:number,height:number):Coverage{
 const data=new Float32Array(width*height);for(let i=0;i<data.length;i++)data[i]=pixels[i*4+3]/255;
 return {data,width,height};
}
function at(mask:Coverage,x:number,y:number){
 const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
 const value=(xx:number,yy:number)=>xx<0||yy<0||xx>=mask.width||yy>=mask.height?0:mask.data[yy*mask.width+xx];
 return value(x0,y0)*(1-fx)*(1-fy)+value(x0+1,y0)*fx*(1-fy)+value(x0,y0+1)*(1-fx)*fy+value(x0+1,y0+1)*fx*fy;
}
// Fit colour strength independently of shape, in either text/background polarity.
// A gain > 1 would need impossible ink; penalize it instead of rewarding blur.
export function coverageFit(source:Coverage,candidate:Coverage,dx=0,dy=0){
 let cross=0,power=0,sourcePower=0;
 const integral=Number.isInteger(dx)&&Number.isInteger(dy);
 for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
  const xx=x-dx,yy=y-dy,s=source.data[y*source.width+x];
  const c=integral?(xx<0||yy<0||xx>=candidate.width||yy>=candidate.height?0:candidate.data[yy*candidate.width+xx]):at(candidate,xx,yy);
  cross+=s*c;power+=c*c;sourcePower+=s*s;
 }
 if(power<1||sourcePower<1)return {score:0,gain:0};
 const gain=Math.min(1,Math.max(0,cross/power));
 const error=Math.max(0,sourcePower-2*gain*cross+gain*gain*power);
 return {score:Math.max(0,1-error/sourcePower),gain};
}
export function matchedInkColor(color:string,background:string,gain:number){
 if(!/^#[0-9a-f]{6}$/i.test(color)||!/^#[0-9a-f]{6}$/i.test(background)||!Number.isFinite(gain))return color;
 const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),ink=rgb(color),bg=rgb(background);
 const contrast=Math.max(...ink.map((v,i)=>Math.abs(v-bg[i])));if(contrast<20)return color;
 const strength=Math.min(1,Math.max(0,gain))*255/contrast;
 return '#'+ink.map((v,i)=>Math.round(Math.min(255,Math.max(0,bg[i]+(v-bg[i])*strength))).toString(16).padStart(2,'0')).join('');
}
