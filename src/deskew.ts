// Page tilt from text lines: the projection-profile method. Rows of a
// straight text page alternate between ink and gaps, so the row histogram of
// ink pixels is most "peaky" (largest sum of squares) when projected along
// the text direction. Pure functions on RGBA buffers.

// Ink pixels (1): clearly darker than the surroundings on both sides, left
// and right or above and below (dark text), or clearly lighter (light text),
// whichever marks fewer pixels, since text is the minority. Strokes thinner
// than `radius` pass; the edge of a photographed sheet on a dark desk does
// not, because one side of it is the desk.
export function inkMap(rgba:ArrayLike<number>,width:number,height:number,threshold=60,radius=8){
 const n=width*height,luma=new Uint8Array(n);
 for(let i=0;i<n;i++)luma[i]=(rgba[i*4]*299+rgba[i*4+1]*587+rgba[i*4+2]*114)/1000*(rgba[i*4+3]/255)+255*(1-rgba[i*4+3]/255);
 // For each pixel, the brightest (or darkest) neighbour within `radius` on
 // each side; `dx,dy` is the step direction. Edges count as no contrast.
 const side=(dx:number,dy:number,bright:boolean)=>{
  const out=new Uint8Array(n);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   let v=luma[y*width+x];
   for(let k=1;k<=radius;k++){const X=x+dx*k,Y=y+dy*k;if(X<0||Y<0||X>=width||Y>=height)break;const w=luma[Y*width+X];v=bright?Math.max(v,w):Math.min(v,w);}
   out[y*width+x]=v;
  }
  return out;
 };
 const [l,r,u,d]=[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy])=>side(dx,dy,true)),[L,R,U,D]=[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy])=>side(dx,dy,false));
 const dark=new Uint8Array(n),light=new Uint8Array(n);let darkCount=0,lightCount=0;
 for(let i=0;i<n;i++){
  const v=luma[i];
  if(Math.max(Math.min(l[i],r[i]),Math.min(u[i],d[i]))-v>threshold){dark[i]=1;darkCount++;}
  if(v-Math.min(Math.max(L[i],R[i]),Math.max(U[i],D[i]))>threshold){light[i]=1;lightCount++;}
 }
 return darkCount<=lightCount?dark:light;
}

// Clockwise rotation (degrees) of the text in an ink map, within ±range.
// Rotating the image by -angle straightens it. Confidence compares the best
// profile with the average one; ruled or empty pages come back undefined.
export function estimateSkew(ink:ArrayLike<number>,width:number,height:number,{range=15,maxPoints=60000}:{range?:number;maxPoints?:number}={}){
 let count=0;for(let i=0;i<ink.length;i++)if(ink[i])count++;
 if(count<50||count>ink.length*.5)return undefined;
 const keep=Math.max(1,Math.ceil(count/maxPoints)),xs:number[]=[],ys:number[]=[];
 for(let i=0,k=0;i<ink.length;i++)if(ink[i]&&k++%keep===0){xs.push(i%width-width/2);ys.push(Math.floor(i/width)-height/2);}
 const reach=Math.ceil(Math.hypot(width,height)/2)+1,rows=new Float64Array(reach*2+1);
 const energy=(degrees:number)=>{
  const t=degrees*Math.PI/180,c=Math.cos(t),s=Math.sin(t);rows.fill(0);
  for(let i=0;i<xs.length;i++){const r=ys[i]*c-xs[i]*s+reach,f=Math.floor(r),w=r-f;rows[f]+=1-w;rows[f+1]+=w;}
  let e=0;for(const v of rows)e+=v*v;return e;
 };
 const coarse:{angle:number;energy:number}[]=[];
 for(let a=-range;a<=range+1e-9;a+=.5)coarse.push({angle:a,energy:energy(a)});
 let best=coarse.reduce((a,b)=>b.energy>a.energy?b:a);
 for(let a=best.angle-.5;a<=best.angle+.5+1e-9;a+=.05){const e=energy(a);if(e>best.energy)best={angle:a,energy:e};}
 const mean=coarse.reduce((sum,c)=>sum+c.energy,0)/coarse.length;
 return {angle:Math.round(best.angle*100)/100,confidence:best.energy/mean};
}

