// Burns redactions into the page's layers: a layer under a box is replaced by
// a raster of itself with the box painted black, so nothing underneath
// survives (text, vector paths, image pixels, styles). Layers entirely inside
// a box are deleted. Hidden layers are redacted too.
import {FabricImage,type Canvas,type FabricObject} from 'fabric';
import {overlaps,inside,type Rect} from './redaction';

type Tagged=FabricObject&{id?:string;name?:string;layerStyle?:unknown};
const maxPixels=16e6;

function rasterize(c:Canvas,o:Tagged,b:Rect,density:number){
 const zoom=c.getZoom(),visible=o.visible,blend=o.globalCompositeOperation,background=c.backgroundColor;
 try{
  o.visible=true;o.globalCompositeOperation='source-over';c.backgroundColor='';
  return c.toCanvasElement(density/zoom,{left:b.left*zoom,top:b.top*zoom,width:b.width*zoom,height:b.height*zoom,filter:x=>x===o});
 }finally{o.visible=visible;o.globalCompositeOperation=blend;c.backgroundColor=background;}
}

export function burnRedactions(c:Canvas,rects:Rect[]){
 let removed=0,burned=0;
 for(const o of [...c.getObjects()] as Tagged[]){
  const raw=o.getBoundingRect(),b={left:Math.floor(raw.left),top:Math.floor(raw.top),width:Math.ceil(raw.left+raw.width)-Math.floor(raw.left),height:Math.ceil(raw.top+raw.height)-Math.floor(raw.top)};
  const hits=rects.filter(r=>overlaps(r,b));if(!hits.length||b.width<1||b.height<1)continue;
  if(hits.some(r=>inside(b,r))){c.remove(o);removed++;continue;}
  // Keep an image's own resolution (up to 4x the page) so the rest stays sharp.
  const native=o instanceof FabricImage?1/Math.min(o.scaleX||1,o.scaleY||1):2;
  const density=Math.max(1,Math.min(4,native,Math.sqrt(maxPixels/(b.width*b.height))));
  const raster=rasterize(c,o,b,density),ctx=raster.getContext('2d')!;
  ctx.fillStyle='#000';for(const r of hits)ctx.fillRect((r.left-b.left)*density,(r.top-b.top)*density,r.width*density,r.height*density);
  const next=Object.assign(new FabricImage(raster,{left:b.left,top:b.top,scaleX:1/density,scaleY:1/density,visible:o.visible,globalCompositeOperation:o.globalCompositeOperation,
   lockMovementX:o.lockMovementX,lockMovementY:o.lockMovementY,lockScalingX:o.lockScalingX,lockScalingY:o.lockScalingY,lockRotation:o.lockRotation}),{id:o.id,name:`${o.name||'Layer'} (redacted)`});
  const index=c.getObjects().indexOf(o);c.remove(o);c.insertAt(index,next);burned++;
 }
 c.requestRenderAll();
 return {removed,burned};
}
