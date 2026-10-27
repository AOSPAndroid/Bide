// Finds a sheet of paper photographed on a darker surface: its four corners,
// so the sheet can be flattened to a rectangle before text recognition
// (perspective makes each line lean differently, which deskew cannot fix).
// Pure functions on RGBA buffers.
import type {XY} from './perspective';

// Corners clockwise from top left, in the buffer's pixels, or undefined when
// there is no clear sheet: too small, not four-sided, barely brighter than
// its surroundings, or already filling the image square on.
export function findSheet(rgba:ArrayLike<number>,width:number,height:number):XY[]|undefined{
 const n=width*height,luma=new Uint8Array(n),histogram=new Float64Array(256);
 for(let i=0;i<n;i++){luma[i]=(rgba[i*4]*299+rgba[i*4+1]*587+rgba[i*4+2]*114)/1000;histogram[luma[i]]++;}
 // Otsu's threshold between paper and surface.
 let total=0;for(let v=0;v<256;v++)total+=v*histogram[v];
 let below=0,belowSum=0,threshold=128,bestSpread=-1;
 for(let v=0;v<256;v++){below+=histogram[v];belowSum+=v*histogram[v];if(!below||below===n)continue;const m0=belowSum/below,m1=(total-belowSum)/(n-below),spread=below*(n-below)*(m1-m0)**2;if(spread>bestSpread){bestSpread=spread;threshold=v;}}
 // The largest bright region.
 const label=new Int32Array(n),stack:number[]=[];let largest:number[]=[];
 for(let start=0,next=0;start<n;start++){
  if(label[start]||luma[start]<=threshold)continue;
  label[start]=++next;stack.push(start);const pixels:number[]=[];
  while(stack.length){const p=stack.pop()!,x=p%width;pixels.push(p);for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,p-width,p+width])if(q>=0&&q<n&&!label[q]&&luma[q]>threshold){label[q]=next;stack.push(q);}}
  if(pixels.length>largest.length)largest=pixels;
 }
 if(largest.length<n*.2)return undefined;
 // Extreme points along the diagonals (in proportion to the image) are the corners.
 const ext=[{s:Infinity,p:0},{s:-Infinity,p:0},{s:-Infinity,p:0},{s:Infinity,p:0}];
 for(const p of largest){const x=p%width/width,y=Math.floor(p/width)/height;
  if(x+y<ext[0].s)ext[0]={s:x+y,p};if(x-y>ext[1].s)ext[1]={s:x-y,p};if(x+y>ext[2].s)ext[2]={s:x+y,p};if(x-y<ext[3].s)ext[3]={s:x-y,p};}
 const corners=ext.map(({p})=>({x:p%width+.5,y:Math.floor(p/width)+.5}));
 // Four-sided: convex, corners near right angles, and the region fills the quad.
 for(let i=0;i<4;i++){
  const a=corners[(i+3)%4],b=corners[i],c=corners[(i+1)%4],u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};
  const cross=u.x*v.y-u.y*v.x,angle=Math.acos((u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1))*180/Math.PI;
  if(cross>=0||angle<60||angle>120)return undefined;
 }
 const area=Math.abs(corners.reduce((s,p,i)=>{const q=corners[(i+1)%4];return s+p.x*q.y-q.x*p.y;},0))/2;
 if(area>n*.97||largest.length<area*.75)return undefined;
 // Each edge is a real border: paper just inside it, the surface just
 // outside (or the image's edge, for a sheet running off the photo).
 const sheet=label[largest[0]],inset=Math.max(2,Math.round(Math.min(width,height)*.01));
 const cx=corners.reduce((s,p)=>s+p.x,0)/4,cy=corners.reduce((s,p)=>s+p.y,0)/4;
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4],len=Math.hypot(b.x-a.x,b.y-a.y);let nx=(b.y-a.y)/len,ny=-(b.x-a.x)/len;
  if(nx*(cx-a.x)+ny*(cy-a.y)<0){nx=-nx;ny=-ny;}// towards the inside
  let inner=0,outer=0;const samples=40;
  for(let k=1;k<=samples;k++){const t=.1+.8*k/(samples+1),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
   const ix=Math.round(x+nx*inset),iy=Math.round(y+ny*inset),ox=Math.round(x-nx*inset),oy=Math.round(y-ny*inset);
   if(ix>=0&&iy>=0&&ix<width&&iy<height&&label[iy*width+ix]===sheet)inner++;
   if(ox<0||oy<0||ox>=width||oy>=height||label[oy*width+ox]!==sheet)outer++;}
  if(inner<samples*.85||outer<samples*.85)return undefined;
 }
 // Brighter than what surrounds it, and not an upright rectangle inside the
 // image (a white panel in a screenshot): those are read as they are.
 let inside=0,insideCount=0,outside=0,outsideCount=0;const inQuad=(x:number,y:number)=>corners.every((b,i)=>{const c=corners[(i+1)%4];return (c.x-b.x)*(y-b.y)-(c.y-b.y)*(x-b.x)>=0;});
 for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){if(inQuad(x+.5,y+.5)){inside+=luma[y*width+x];insideCount++;}else{outside+=luma[y*width+x];outsideCount++;}}
 if(!outsideCount||inside/insideCount-outside/outsideCount<50)return undefined;
 const lean=Math.max(Math.abs(corners[0].y-corners[1].y),Math.abs(corners[3].y-corners[2].y))/height+Math.max(Math.abs(corners[0].x-corners[3].x),Math.abs(corners[1].x-corners[2].x))/width;
 if(lean<.01)return undefined;
 return corners;
}

// Size of the flattened sheet: its longest top/bottom and left/right edges.
export function sheetSize(corners:XY[]){
 const d=(a:XY,b:XY)=>Math.hypot(a.x-b.x,a.y-b.y);
 return {width:Math.round(Math.max(d(corners[0],corners[1]),d(corners[3],corners[2]))),height:Math.round(Math.max(d(corners[0],corners[3]),d(corners[1],corners[2])))};
}
