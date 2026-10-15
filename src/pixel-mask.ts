// Pixel selections: one byte per page pixel, 0 outside and 255 inside, with
// soft edges in between. Pure functions, so they run in tests and workers.
export type Mask={width:number;height:number;data:Uint8ClampedArray};
export type MaskOp='replace'|'add'|'subtract'|'intersect';

export const createMask=(width:number,height:number,fill=0):Mask=>({width,height,data:new Uint8ClampedArray(width*height).fill(fill)});

// Shift adds, Alt subtracts, both intersect (as in Photoshop and Photopea).
export const maskOpFor=(shift:boolean,alt:boolean):MaskOp=>shift&&alt?'intersect':shift?'add':alt?'subtract':'replace';

export function combineMasks(base:Mask|null|undefined,next:Mask,op:MaskOp):Mask{
 if(!base||op==='replace'||base.width!==next.width||base.height!==next.height)return next;
 const out=createMask(next.width,next.height),a=base.data,b=next.data,o=out.data;
 for(let i=0;i<o.length;i++)o[i]=op==='add'?Math.max(a[i],b[i]):op==='subtract'?a[i]*(255-b[i])/255:Math.min(a[i],b[i]);
 return out;
}

export function invertMask(m:Mask):Mask{
 const out=createMask(m.width,m.height);for(let i=0;i<m.data.length;i++)out.data[i]=255-m.data[i];return out;
}

// Bounding box of pixels at or above `threshold`; undefined when empty.
export function maskBounds(m:Mask,threshold=1){
 let left=m.width,top=m.height,right=-1,bottom=-1;
 for(let y=0;y<m.height;y++){const row=y*m.width;for(let x=0;x<m.width;x++)if(m.data[row+x]>=threshold){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;}}
 return right<0?undefined:{left,top,width:right-left+1,height:bottom-top+1};
}

// Three box-blur passes in each direction approximate a Gaussian with this radius.
export function blurAlpha(data:ArrayLike<number>,width:number,height:number,radius:number):Uint8ClampedArray{
 const out=new Uint8ClampedArray(data.length);
 if(radius<=0){out.set(data as ArrayLike<number>);return out;}
 // Box half-width per pass for a Gaussian of sigma ≈ radius/2.
 const sigma=Math.max(.3,radius/2),box=Math.max(1,Math.round((Math.sqrt(12*sigma*sigma/3+1)-1)/2));
 let a=Float32Array.from(data as ArrayLike<number>),b=new Float32Array(data.length);
 const pass=(src:Float32Array,dst:Float32Array,horizontal:boolean)=>{
  const n=horizontal?width:height,lines=horizontal?height:width,stride=horizontal?1:width,step=horizontal?width:1,span=2*box+1;
  for(let l=0;l<lines;l++){
   const base=l*step;let sum=0;
   for(let k=-box;k<=box;k++)sum+=src[base+Math.min(n-1,Math.max(0,k))*stride];
   for(let i=0;i<n;i++){dst[base+i*stride]=sum/span;sum+=src[base+Math.min(n-1,i+box+1)*stride]-src[base+Math.max(0,i-box)*stride];}
  }
 };
 for(let k=0;k<3;k++){pass(a,b,true);pass(b,a,false);}
 for(let i=0;i<out.length;i++)out[i]=Math.round(a[i]);
 return out;
}
export const featherMask=(m:Mask,radius:number):Mask=>({width:m.width,height:m.height,data:blurAlpha(m.data,m.width,m.height,radius)});

// Exact Euclidean distance (Felzenszwalb–Huttenlocher) from every pixel to
// the nearest pixel where `seed` is set; 0 on seeds, Infinity with no seeds.
export function distanceTo(seed:ArrayLike<number|boolean>,width:number,height:number):Float32Array{
 const INF=1e20,f=new Float64Array(Math.max(width,height)),d=new Float64Array(f.length),v=new Int32Array(f.length),z=new Float64Array(f.length+1);
 const grid=new Float64Array(width*height);for(let i=0;i<grid.length;i++)grid[i]=seed[i]?0:INF;
 const line=(n:number)=>{
  let k=0;v[0]=0;z[0]=-INF;z[1]=INF;
  for(let q=1;q<n;q++){
   let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);
   while(s<=z[k]){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);}
   k++;v[k]=q;z[k]=s;z[k+1]=INF;
  }
  k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])*(q-v[k])+f[v[k]];}
 };
 for(let x=0;x<width;x++){for(let y=0;y<height;y++)f[y]=grid[y*width+x];line(height);for(let y=0;y<height;y++)grid[y*width+x]=d[y];}
 for(let y=0;y<height;y++){for(let x=0;x<width;x++)f[x]=grid[y*width+x];line(width);for(let x=0;x<width;x++)grid[y*width+x]=d[x];}
 const out=new Float32Array(grid.length);for(let i=0;i<out.length;i++)out[i]=grid[i]>=INF/2?Infinity:Math.sqrt(grid[i]);return out;
}

// Expand (px > 0) or contract (px < 0) the selection edge, keeping it smooth.
export function growMask(m:Mask,px:number):Mask{
 if(!px)return m;
 const out=createMask(m.width,m.height);
 if(px>0){const inside=m.data.map(v=>v>=128?1:0),d=distanceTo(inside,m.width,m.height);for(let i=0;i<d.length;i++)out.data[i]=Math.max(m.data[i],Math.min(255,Math.max(0,(px+1-d[i])*255)));}
 else{const outside=m.data.map(v=>v<128?1:0),d=distanceTo(outside,m.width,m.height),r=-px;for(let i=0;i<d.length;i++)out.data[i]=d[i]===Infinity?255:Math.min(m.data[i],Math.max(0,(d[i]-r)*255));}
 return out;
}

// Round off jagged corners and small specks: blur, then a steep ramp around 50%.
export function smoothMask(m:Mask,radius:number):Mask{
 const soft=blurAlpha(m.data,m.width,m.height,radius),out=createMask(m.width,m.height);
 for(let i=0;i<soft.length;i++)out.data[i]=(soft[i]-128)*4+128;
 return out;
}

const colorDistance=(rgba:ArrayLike<number>,i:number,r:number,g:number,b:number,a:number)=>Math.max(Math.abs(rgba[i]-r),Math.abs(rgba[i+1]-g),Math.abs(rgba[i+2]-b),Math.abs(rgba[i+3]-a));

// Magic wand: pixels within `tolerance` (0-255, per channel) of the clicked
// colour; only those connected to it unless `contiguous` is false.
export function floodSelect(rgba:ArrayLike<number>,width:number,height:number,x:number,y:number,{tolerance=32,contiguous=true,antiAlias=true}:{tolerance?:number;contiguous?:boolean;antiAlias?:boolean}={}):Mask{
 const out=createMask(width,height);x=Math.floor(x);y=Math.floor(y);
 if(x<0||y<0||x>=width||y>=height)return out;
 const s=(y*width+x)*4,r=rgba[s],g=rgba[s+1],b=rgba[s+2],a=rgba[s+3],match=(p:number)=>colorDistance(rgba,p*4,r,g,b,a)<=tolerance;
 if(!contiguous){for(let p=0;p<width*height;p++)if(match(p))out.data[p]=255;}
 else{
  // Scanline fill: fill a run left and right, then queue the rows above and below.
  const stack=[x,y];
  while(stack.length){
   const sy=stack.pop()!,sx=stack.pop()!;let l=sx,rr=sx;const row=sy*width;
   if(out.data[row+sx]||!match(row+sx))continue;
   while(l>0&&!out.data[row+l-1]&&match(row+l-1))l--;
   while(rr<width-1&&!out.data[row+rr+1]&&match(row+rr+1))rr++;
   for(let i=l;i<=rr;i++)out.data[row+i]=255;
   for(const ny of [sy-1,sy+1]){if(ny<0||ny>=height)continue;const nrow=ny*width;let inRun=false;for(let i=l;i<=rr;i++){const ok=!out.data[nrow+i]&&match(nrow+i);if(ok&&!inRun){stack.push(i,ny);inRun=true;}else if(!ok)inRun=false;}}
  }
 }
 if(antiAlias){
  // Soften only the edge: pixels that differ from a neighbour take the 3×3 average.
  const d=out.data,soft=new Uint8ClampedArray(d);
  for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
   const i=yy*width+xx,v=d[i];let sum=0,n=0,edge=false;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=xx+dx,ny=yy+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const w=d[ny*width+nx];sum+=w;n++;if(w!==v)edge=true;}
   if(edge)soft[i]=v?Math.max(128,sum/n):Math.min(127,sum/n);
  }
  out.data.set(soft);
 }
 return out;
}

// Colour range: everywhere in the image, full selection within half the
// fuzziness of `color`, fading out to nothing at the full fuzziness.
export function colorRangeMask(rgba:ArrayLike<number>,width:number,height:number,color:readonly number[],fuzziness:number):Mask{
 const out=createMask(width,height),[r,g,b]=color,f=Math.max(1,fuzziness);
 for(let p=0;p<width*height;p++){
  if(rgba[p*4+3]===0)continue;
  const d=Math.max(Math.abs(rgba[p*4]-r),Math.abs(rgba[p*4+1]-g),Math.abs(rgba[p*4+2]-b));
  out.data[p]=d<=f/2?255:d>=f?0:255*(f-d)/(f/2);
 }
 return out;
}

// Selection outline ("marching ants") as an SVG path along pixel edges at the
// 50% level. Large masks are traced on a reduced grid; the outline is for display.
export function maskOutline(m:Mask,maxCells=1_500_000):string{
 const step=Math.max(1,Math.ceil(Math.sqrt(m.width*m.height/maxCells))),w=Math.ceil(m.width/step),h=Math.ceil(m.height/step);
 const inside=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)inside[y*w+x]=m.data[Math.min(m.height-1,y*step)*m.width+Math.min(m.width-1,x*step)]>=128?1:0;
 const at=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&inside[y*w+x]===1;
 // Directed edges with the selection on the right, two slots per grid vertex.
 const V=(w+1)*(h+1),out1=new Int32Array(V).fill(-1),out2=new Int32Array(V).fill(-1),vid=(x:number,y:number)=>y*(w+1)+x;
 const add=(a:number,b:number)=>{if(out1[a]<0)out1[a]=b;else out2[a]=b;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!inside[y*w+x])continue;
  if(!at(x,y-1))add(vid(x,y),vid(x+1,y));
  if(!at(x+1,y))add(vid(x+1,y),vid(x+1,y+1));
  if(!at(x,y+1))add(vid(x+1,y+1),vid(x,y+1));
  if(!at(x-1,y))add(vid(x,y+1),vid(x,y));
 }
 const parts:string[]=[];
 for(let start=0;start<V;start++){
  while(out1[start]>=0||out2[start]>=0){
   const pts:number[]=[];let v=start,prevDir=-1;
   do{
    let next=out1[v];if(next>=0)out1[v]=-1;else{next=out2[v];out2[v]=-1;}
    if(next<0)break;
    const dir=next-v;if(dir!==prevDir)pts.push(v);prevDir=dir;v=next;
   }while(v!==start);
   if(pts.length>2)parts.push('M'+pts.map(p=>`${(p%(w+1))*step} ${Math.floor(p/(w+1))*step}`).join('L')+'Z');
  }
 }
 return parts.join('');
}

// Rough count of selected pixels (alpha-weighted).
export function maskArea(m:Mask){let s=0;for(let i=0;i<m.data.length;i++)s+=m.data[i];return s/255;}
