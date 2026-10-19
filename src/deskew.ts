// Page tilt from text lines: the projection-profile method. Rows of a
// straight text page alternate between ink and gaps, so the row histogram of
// ink pixels is most "peaky" (largest sum of squares) when projected along
// the text direction. Pure functions on RGBA buffers.

// Ink pixels (1) differ clearly from the page's background luminance, so both
// dark-on-light and light-on-dark text count.
export function inkMap(rgba:ArrayLike<number>,width:number,height:number,threshold=60){
 const n=width*height,luma=new Uint8Array(n),histogram=new Uint32Array(256);
 for(let i=0;i<n;i++){const v=(rgba[i*4]*299+rgba[i*4+1]*587+rgba[i*4+2]*114)/1000*(rgba[i*4+3]/255)+255*(1-rgba[i*4+3]/255);luma[i]=v;histogram[luma[i]]++;}
 let seen=0,background=255;for(let v=0;v<256;v++){seen+=histogram[v];if(seen>=n/2){background=v;break;}}
 const ink=new Uint8Array(n);for(let i=0;i<n;i++)ink[i]=Math.abs(luma[i]-background)>threshold?1:0;
 return ink;
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

