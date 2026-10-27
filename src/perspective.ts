// Perspective distort: map a rectangular image onto any four corners.
export type XY={x:number;y:number};

// Homography taking the unit square corners (0,0),(1,0),(1,1),(0,1) to `q`.
function squareToQuad(q:XY[]){
 const [p0,p1,p2,p3]=q,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y;
 const sx=p0.x-p1.x+p2.x-p3.x,sy=p0.y-p1.y+p2.y-p3.y,den=dx1*dy2-dx2*dy1||1e-12;
 const g=(sx*dy2-dx2*sy)/den,h=(dx1*sy-sx*dy1)/den;
 return [p1.x-p0.x+g*p1.x,p3.x-p0.x+h*p3.x,p0.x,p1.y-p0.y+g*p1.y,p3.y-p0.y+h*p3.y,p0.y,g,h,1];
}
function invert3(m:number[]){
 const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C||1e-12;
 return [A/det,-(b*i-c*h)/det,(b*f-c*e)/det,B/det,(a*i-c*g)/det,-(a*f-c*d)/det,C/det,-(a*h-b*g)/det,(a*e-b*d)/det];
}
const apply=(m:number[],x:number,y:number)=>{const w=m[6]*x+m[7]*y+m[8];return {x:(m[0]*x+m[1]*y+m[2])/w,y:(m[3]*x+m[4]*y+m[5])/w};};

// Output covering the corners' bounding box (offset by left/top from the
// source's origin); each output pixel samples the source bilinearly.
export function perspectivePixels(src:{width:number;height:number;data:ArrayLike<number>},corners:XY[]){
 const left=Math.floor(Math.min(...corners.map(p=>p.x))),top=Math.floor(Math.min(...corners.map(p=>p.y)));
 const width=Math.max(1,Math.ceil(Math.max(...corners.map(p=>p.x)))-left),height=Math.max(1,Math.ceil(Math.max(...corners.map(p=>p.y)))-top);
 const inverse=invert3(squareToQuad(corners)),out=new Uint8ClampedArray(width*height*4),W=src.width,H=src.height,d=src.data;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const uv=apply(inverse,left+x+.5,top+y+.5);
  if(!(uv.x>=0&&uv.x<=1&&uv.y>=0&&uv.y<=1))continue;
  const fx=Math.min(W-1,Math.max(0,uv.x*W-.5)),fy=Math.min(H-1,Math.max(0,uv.y*H-.5)),x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),ax=fx-x0,ay=fy-y0;
  for(let c=0;c<4;c++){
   const v=(d[(y0*W+x0)*4+c]*(1-ax)+d[(y0*W+x1)*4+c]*ax)*(1-ay)+(d[(y1*W+x0)*4+c]*(1-ax)+d[(y1*W+x1)*4+c]*ax)*ay;
   out[(y*width+x)*4+c]=v;
  }
 }
 return {data:out,width,height,left,top};
}
export const mapSquare=(corners:XY[],u:number,v:number)=>apply(squareToQuad(corners),u,v);

// The inverse: the quad `corners` of `src` pulled out to a width×height
// rectangle (a photographed page flattened).
export function unwarpPixels(src:{width:number;height:number;data:ArrayLike<number>},corners:XY[],width:number,height:number){
 const m=squareToQuad(corners),out=new Uint8ClampedArray(width*height*4),W=src.width,H=src.height,d=src.data;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=apply(m,(x+.5)/width,(y+.5)/height),fx=Math.min(W-1,Math.max(0,p.x-.5)),fy=Math.min(H-1,Math.max(0,p.y-.5)),x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),ax=fx-x0,ay=fy-y0;
  for(let c=0;c<4;c++)out[(y*width+x)*4+c]=(d[(y0*W+x0)*4+c]*(1-ax)+d[(y0*W+x1)*4+c]*ax)*(1-ay)+(d[(y1*W+x0)*4+c]*(1-ax)+d[(y1*W+x1)*4+c]*ax)*ay;
 }
 return out;
}
