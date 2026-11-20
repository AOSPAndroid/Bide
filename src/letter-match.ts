// Is another line of the page set in the same lettering as the one being
// edited? A letter the edited line lacks is only taken from a line verified
// by its own pixels: the characters the two lines share must have the same
// shape and the same amount of ink. Measured on rendered letters, crisp or
// blurred by up to 1.8 px with noise: the same face scores 0.03-0.07 (0.18 at
// worst), while bold (0.31), italic (0.17-0.34), a serif (0.28-0.38) or a size
// 8% larger (0.20-0.30) do not pass, and bold has 45% more ink.

// One letter's ink: coverage per pixel as a share of the edited line's ink
// contrast (the same value for both lines, so paler ink weighs less and
// darker ink more, up to 2), with rows cut at the same distances from each
// line's baseline.
export type Cover={data:Float32Array;width:number;height:number};

// Characters that tell lettering apart; punctuation is too small to.
export const telling=(ch:string)=>/[\p{L}\p{N}\p{Sc}%&@#]/u.test(ch);

export function letterCover(pixels:ArrayLike<number>,width:number,height:number,background:readonly number[],contrast:number):Cover{
 const data=new Float32Array(width*height),k=1/Math.max(1,contrast);
 for(let i=0;i<data.length;i++){const p=i*4,v=Math.max(Math.abs(pixels[p]-background[0]),Math.abs(pixels[p+1]-background[1]),Math.abs(pixels[p+2]-background[2]))*k;data[i]=v<.1?0:Math.min(2,v);}
 return {data,width,height};
}
export const coverMass=(c:Cover)=>{let m=0;for(const v of c.data)m+=v;return m;};

// A light smoothing, so letters cut at different sub-pixel positions can be
// laid over each other by interpolation.
function smooth(c:Cover):Cover{
 const {width:w,height:h}=c,t=new Float32Array(w*h),o=new Float32Array(w*h),v=(d:Float32Array,x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h?d[y*w+x]:0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)t[y*w+x]=(v(c.data,x-1,y)+2*v(c.data,x,y)+v(c.data,x+1,y))/4;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)o[y*w+x]=(v(t,x,y-1)+2*v(t,x,y)+v(t,x,y+1))/4;
 return {data:o,width:w,height:h};
}
// 0 = the same ink, 1 = nothing in common, at the best sub-pixel shift. The
// letters are laid over each other by the centre of their ink across and by
// their rows (both cut from the baseline), then moved in quarter pixels.
// `dy`: how far below its own baseline cut the second letter matched best.
export function letterFit(first:Cover,second:Cover):{mismatch:number;dy:number}{
 const a=smooth(first),b=smooth(second);
 const centre=(c:Cover)=>{let m=0,s=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const v=c.data[y*c.width+x];m+=v;s+=v*x;}return m?s/m:c.width/2;};
 const at=(x:number,y:number)=>{const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,v=(xx:number,yy:number)=>xx>=0&&yy>=0&&xx<b.width&&yy<b.height?b.data[yy*b.width+xx]:0;return v(x0,y0)*(1-fx)*(1-fy)+v(x0+1,y0)*fx*(1-fy)+v(x0,y0+1)*(1-fx)*fy+v(x0+1,y0+1)*fx*fy;};
 const shift=centre(b)-centre(a),h=Math.max(a.height,b.height),x0=Math.floor(Math.min(0,-shift))-2,x1=Math.ceil(Math.max(a.width,b.width-shift))+2;let best={mismatch:1,dy:0};
 for(let dy=-1.5;dy<=1.5;dy+=.25)for(let dx=-.75;dx<=.75;dx+=.25){
  let diff=0,union=0;
  for(let y=-2;y<h+2;y++)for(let x=x0;x<x1;x++){const va=x>=0&&y>=0&&x<a.width&&y<a.height?a.data[y*a.width+x]:0,vb=at(x+shift+dx,y+dy);diff+=Math.abs(va-vb);union+=Math.max(va,vb);}
  if(union>0&&diff/union<best.mismatch)best={mismatch:diff/union,dy};
 }
 return best;
}
export const letterMismatch=(first:Cover,second:Cover)=>letterFit(first,second).mismatch;

// The verdict over the characters two lines share, each on its closest pair
// among the first two instances. Two telling characters in common must be
// alike on average with none far off, in the same ink within 8%; a single
// shared character must be closer still (one similar digit proves little).
// `dy`: the second line's baseline against the first's, as their letters sit.
export const LETTERING={mismatch:.12,worst:.18,mass:1.08,single:{mismatch:.08,mass:1.05}};
export function sameLettering(target:Map<string,Cover[]>,other:Map<string,Cover[]>){
 const scores:number[]=[],shifts:number[]=[];let ratio=0;
 for(const [ch,mine] of target){
  const theirs=other.get(ch);if(!theirs?.length||!mine.length||!telling(ch))continue;
  let best:{mismatch:number;dy:number;mass:number}|undefined;
  for(const a of mine.slice(0,2))for(const b of theirs.slice(0,2)){const ma=coverMass(a),mb=coverMass(b);if(ma<=0||mb<=0)continue;const fit=letterFit(a,b);if(!best||fit.mismatch<best.mismatch)best={...fit,mass:mb/ma};}
  if(best){scores.push(best.mismatch);shifts.push(best.dy);ratio+=Math.log(best.mass);}
 }
 const shared=scores.length,mismatch=shared?scores.reduce((s,v)=>s+v,0)/shared:1,mass=shared?Math.exp(ratio/shared):0,inside=(limit:number)=>mass<=limit&&mass>=1/limit;
 const ok=shared>=2?mismatch<=LETTERING.mismatch&&Math.max(...scores)<=LETTERING.worst&&inside(LETTERING.mass):shared===1&&mismatch<=LETTERING.single.mismatch&&inside(LETTERING.single.mass);
 return {ok,shared,mismatch,mass,dy:shifts.length?[...shifts].sort((x,y)=>x-y)[shifts.length>>1]:0};
}

// A borrowed letter drawn over another background: its ink kept, the paper
// under it exchanged (`coverage` 0-1 of the letter at that pixel).
export const overBackground=(source:number,coverage:number,from:number,to:number)=>Math.max(0,Math.min(255,Math.round(source+(to-from)*(1-coverage))));
