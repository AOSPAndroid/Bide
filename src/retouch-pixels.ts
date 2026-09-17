export type PixelImage={width:number;height:number;data:Uint8ClampedArray};
export type XY={x:number;y:number};
export function featherAlpha(distance:number,radius:number,softness:number) {
  if(distance>=radius)return 0;
  const edge=Math.min(radius,Math.max(0,softness)),inner=radius-edge;
  if(!edge||distance<=inner)return 1;
  const t=(radius-distance)/edge;return t*t*(3-2*t);
}
export function stampPixels(target:PixelImage,source:PixelImage,backdrop:PixelImage,at:XY,sample:XY,size:number,softness:number,opacity:number,mode:'clone'|'heal'|'erase') {
  const r=Math.max(.5,size/2),x0=Math.max(0,Math.floor(at.x-r)),x1=Math.min(target.width,Math.ceil(at.x+r)),y0=Math.max(0,Math.floor(at.y-r)),y1=Math.min(target.height,Math.ceil(at.y+r));
  const offset=[0,0,0];
  if(mode==='heal') {
    // Match local color while preserving high-frequency texture from the source.
    const src=[0,0,0],dst=[0,0,0];let count=0;
    for(let y=-r;y<=r;y+=Math.max(1,r/5))for(let x=-r;x<=r;x+=Math.max(1,r/5)) {
      const sx=Math.round(sample.x+x),sy=Math.round(sample.y+y),dx=Math.round(at.x+x),dy=Math.round(at.y+y);
      if(sx<0||sy<0||sx>=source.width||sy>=source.height||dx<0||dy<0||dx>=backdrop.width||dy>=backdrop.height)continue;
      const si=(sy*source.width+sx)*4,di=(dy*backdrop.width+dx)*4;if(source.data[si+3]<200||backdrop.data[di+3]<200)continue;
      for(let k=0;k<3;k++){src[k]+=source.data[si+k];dst[k]+=backdrop.data[di+k];}count++;
    }
    if(count)for(let k=0;k<3;k++)offset[k]=(dst[k]-src[k])/count;
  }
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
    const a=featherAlpha(Math.hypot(x+.5-at.x,y+.5-at.y),r,softness)*Math.min(1,Math.max(0,opacity));if(!a)continue;
    const i=(y*target.width+x)*4;
    if(mode==='erase'){target.data[i+3]*=1-a;continue;}
    const sx=Math.round(sample.x+x+.5-at.x),sy=Math.round(sample.y+y+.5-at.y);
    if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue;
    const si=(sy*source.width+sx)*4,sa=a*source.data[si+3]/255,da=target.data[i+3]/255,oa=sa+da*(1-sa);
    if(!oa)continue;
    for(let k=0;k<3;k++)target.data[i+k]=(Math.min(255,Math.max(0,source.data[si+k]+offset[k]))*sa+target.data[i+k]*da*(1-sa))/oa;
    target.data[i+3]=oa*255;
  }
}
export function strokePoints(from:XY,to:XY,size:number):XY[] {
  const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/Math.max(1,size/5)));
  return Array.from({length:n},(_,i)=>({x:from.x+(to.x-from.x)*(i+1)/n,y:from.y+(to.y-from.y)*(i+1)/n}));
}
export function barycentric(p:XY,a:XY,b:XY,c:XY):[number,number,number]|null {
  const d=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(d)<1e-6)return null;
  const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/d,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/d;
  return [u,v,1-u-v];
}
export function warpPixels(source:PixelImage,points:XY[]):PixelImage {
  const {width,height}=source,output={width,height,data:new Uint8ClampedArray(width*height*4)};
  if(points.length!==9)throw new Error('Warp needs nine control points.');
  const original=points.map((_,i)=>({x:(i%3)*(width-1)/2,y:Math.floor(i/3)*(height-1)/2}));
  for(let row=0;row<2;row++)for(let col=0;col<2;col++) {
    const a=row*3+col;
    for(const ids of [[a,a+1,a+4],[a,a+4,a+3]]) {
      const [p,q,r]=ids.map(i=>points[i]);
      const minX=Math.max(0,Math.floor(Math.min(p.x,q.x,r.x))),maxX=Math.min(width-1,Math.ceil(Math.max(p.x,q.x,r.x))),minY=Math.max(0,Math.floor(Math.min(p.y,q.y,r.y))),maxY=Math.min(height-1,Math.ceil(Math.max(p.y,q.y,r.y)));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
        const w=barycentric({x,y},p,q,r);if(!w||w.some(v=>v<-.00001))continue;
        const sx=Math.min(width-1,Math.max(0,w.reduce((v,t,i)=>v+t*original[ids[i]].x,0))),sy=Math.min(height-1,Math.max(0,w.reduce((v,t,i)=>v+t*original[ids[i]].y,0)));
        const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
        let alpha=0;const rgb=[0,0,0];
        for(const [xx,yy,weight] of [[x0,y0,(1-fx)*(1-fy)],[Math.min(width-1,x0+1),y0,fx*(1-fy)],[x0,Math.min(height-1,y0+1),(1-fx)*fy],[Math.min(width-1,x0+1),Math.min(height-1,y0+1),fx*fy]]) {
          const j=(yy*width+xx)*4,aw=source.data[j+3]/255*weight;alpha+=aw;for(let k=0;k<3;k++)rgb[k]+=source.data[j+k]*aw;
        }
        const i=(y*width+x)*4;if(alpha)for(let k=0;k<3;k++)output.data[i+k]=rgb[k]/alpha;output.data[i+3]=alpha*255;
      }
    }
  }
  return output;
}
