// Text over a drawing. Everywhere else a line's ink is "what is far from the
// paper's colour": a ribbon, confetti or a photo behind the line is then ink
// too, the line's letters cannot be told apart, measured or matched, and what
// replaces them is a patch in the paper's colour over the drawing.
// Here the ink is what is near the ink's colour. Around it the drawing is
// carried on under the letters (filled in from its own pixels, ring by ring),
// which gives, for every pixel, how much of it is ink: the line as it would
// be on plain paper, for every measure, and the drawing without the line,
// to put letters back on.
type Rgb=readonly number[];
const far=(d:ArrayLike<number>,i:number,c:Rgb)=>Math.max(Math.abs(d[i]-c[0]),Math.abs(d[i+1]-c[1]),Math.abs(d[i+2]-c[2]));
const strengthOf=(ink:Rgb,paper:Rgb)=>Math.max(40,Math.abs(ink[0]-paper[0]),Math.abs(ink[1]-paper[1]),Math.abs(ink[2]-paper[2]));

// Something other than paper and this ink lies in the box: of the pixels
// away from the letters, 3% or more are well off the paper's colour. Away
// from the letters: their own soft edges are neither ink nor paper, and at
// 96 dpi or on a soft scan they are more than 3% of a tight box (every plain
// page then counted as drawn on).
export function busyBackground(data:ArrayLike<number>,width:number,height:number,ink:Rgb,paper:Rgb){
 const strength=strengthOf(ink,paper),n=width*height,near=new Uint8Array(n),reach=Math.max(3,Math.min(8,Math.round(height*.12)));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(far(data,(y*width+x)*4,ink)>strength*.7)continue;
  for(let dy=-reach;dy<=reach;dy++){const v=y+dy;if(v<0||v>=height)continue;for(let dx=-reach;dx<=reach;dx++){const u=x+dx;if(u>=0&&u<width)near[v*width+u]=1;}}
 }
 let clear=0,drawn=0;
 for(let i=0;i<n;i++){if(near[i])continue;clear++;if(far(data,i*4,paper)>28)drawn++;}
 return clear>=24&&drawn/clear>=.03;
}

// Fills the masked pixels of `data` (RGBA) from the pixels around them, ring
// by ring inwards: each takes the mean of its neighbours already known.
export function inpaint(data:Uint8ClampedArray,width:number,height:number,mask:Uint8Array){
 const todo=Uint8Array.from(mask);let left=0;for(const v of todo)left+=v;
 while(left>0){
  const ring:number[]=[],values:number[]=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=y*width+x;if(!todo[i])continue;let n=0,r=0,g=0,b=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const u=x+dx,v=y+dy;if(u<0||v<0||u>=width||v>=height)continue;const j=v*width+u;if(todo[j])continue;const w=dx&&dy?1:2;n+=w;r+=data[j*4]*w;g+=data[j*4+1]*w;b+=data[j*4+2]*w;}
   if(n){ring.push(i);values.push(r/n,g/n,b/n);}
  }
  if(!ring.length)break;
  for(const [k,i] of ring.entries()){data[i*4]=values[k*3];data[i*4+1]=values[k*3+1];data[i*4+2]=values[k*3+2];todo[i]=0;}
  left-=ring.length;
 }
}

// `data` (RGBA, a line and some room around it) taken apart: `under`, the
// page without the line's ink; `alpha`, how much of each pixel is ink; and
// `flat`, the line as it would be on plain `paper`.
export function flattenInk(data:ArrayLike<number>,width:number,height:number,ink:Rgb,paper:Rgb,reach=3){
 const n=width*height,strength=strengthOf(ink,paper),core=new Uint8Array(n),mask=new Uint8Array(n);
 for(let i=0;i<n;i++)if(far(data,i*4,ink)<=strength*.55)core[i]=1;
 // The letters' soft edges go with them: `reach` pixels around the ink.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(!core[y*width+x])continue;for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){const u=x+dx,v=y+dy;if(u>=0&&v>=0&&u<width&&v<height&&dx*dx+dy*dy<=reach*reach+1)mask[v*width+u]=1;}}
 const under=Uint8ClampedArray.from(data as ArrayLike<number>);inpaint(under,width,height,mask);
 const alpha=new Float32Array(n),flat=new Uint8ClampedArray(n*4);
 for(let i=0;i<n;i++){
  const o=i*4;let a=0;
  if(mask[i]){
   // How far the pixel is from what lies under it, towards the ink.
   let dot=0,len=0;for(let c=0;c<3;c++){const axis=ink[c]-under[o+c];dot+=(data[o+c]-under[o+c])*axis;len+=axis*axis;}
   a=len>400?Math.max(0,Math.min(1,dot/len)):core[i];if(a<.04)a=0;
  }
  alpha[i]=a;for(let c=0;c<3;c++)flat[o+c]=paper[c]+(ink[c]-paper[c])*a;flat[o+3]=255;
 }
 return {under,alpha,flat};
}
