// Gradient tool, paint bucket and mask brush. Each result is its own layer
// (or a change to a layer mask), so Undo and the Layers panel cover it.
import {FabricImage,Gradient,Rect,type FabricObject} from 'fabric';
import {combineMasks,floodSelect,maskBounds,type Mask} from './pixel-mask';
import {blankLayerMask,hasLayerMask,layerMaskFromPage,maskFill,paintLayerMask,type LayerMask,type PageSize} from './selection-canvas';
import {hexRgb} from './layer-effects';

export type GradientSettings={type:'linear'|'radial';from:string;to:string;toTransparent:boolean;opacity:number};
type XY={x:number;y:number};

// A gradient layer from a drag: an editable vector fill over the page, or over
// the selection (masked to it) when there is one.
export function gradientLayer(page:PageSize,start:XY,end:XY,settings:GradientSettings,selection?:Mask):FabricObject{
 const area=selection?maskBounds(selection)??{left:0,top:0,width:page.width,height:page.height}:{left:0,top:0,width:page.width,height:page.height};
 const [r,g,b]=hexRgb(settings.to),stopEnd=settings.toTransparent?`rgba(${hexRgb(settings.from).join(',')},0)`:`rgb(${r},${g},${b})`;
 const local=(p:XY)=>({x:p.x-area.left,y:p.y-area.top}),s=local(start),e=local(end);
 const stops=[{offset:0,color:settings.from},{offset:1,color:stopEnd}];
 const fill=settings.type==='radial'
  ?new Gradient<'radial'>({type:'radial',gradientUnits:'pixels',coords:{x1:s.x,y1:s.y,r1:0,x2:s.x,y2:s.y,r2:Math.max(1,Math.hypot(e.x-s.x,e.y-s.y))},colorStops:stops})
  :new Gradient<'linear'>({type:'linear',gradientUnits:'pixels',coords:{x1:s.x,y1:s.y,x2:e.x,y2:e.y},colorStops:stops});
 const rect=new Rect({left:area.left,top:area.top,width:area.width,height:area.height,fill,strokeWidth:0,opacity:settings.opacity/100});
 if(selection)rect.set({clipPath:layerMaskFromPage(rect,selection)});
 return rect;
}

// Paint bucket: fill the clicked colour region (within the selection, if any)
// with `color`, as a new raster layer. Undefined when nothing would be filled.
export function bucketFill(sample:ImageData,point:XY,color:string,{tolerance,contiguous,antiAlias,opacity}:{tolerance:number;contiguous:boolean;antiAlias:boolean;opacity:number},selection?:Mask){
 let area=floodSelect(sample.data,sample.width,sample.height,point.x,point.y,{tolerance,contiguous,antiAlias});
 if(selection)area=combineMasks(selection,area,'intersect');
 const fill=maskFill(area,hexRgb(color),opacity/100);if(!fill)return undefined;
 return new FabricImage(fill.canvas,{left:fill.left,top:fill.top});
}

// Mask brush: paints a layer's mask along a stroke. The mask is created
// (showing everything) on the first dab if the layer has none. A `cancellable`
// stroke (a touch, which a pinch may take over) can put the layer and its mask
// back exactly as they were.
export function createMaskBrush(object:FabricObject,{size,softness,opacity,reveal}:{size:number;softness:number;opacity:number;reveal:boolean},cancellable=false){
 // Painting turns a mask image into a canvas, so an image is simply kept; a canvas is copied.
 const prior=object.clipPath,source=hasLayerMask(object)?object.clipPath.getElement():undefined;
 let copy:HTMLCanvasElement|undefined;
 if(cancellable&&source instanceof HTMLCanvasElement){copy=Object.assign(document.createElement('canvas'),{width:source.width,height:source.height});copy.getContext('2d')!.drawImage(source,0,0);}
 if(!source)object.set({clipPath:blankLayerMask(object,true)});
 const mask=object.clipPath as LayerMask;let last:XY|undefined;
 return {
  cancel(){
   if(!source)object.set({clipPath:prior});
   else if(!(source instanceof HTMLCanvasElement))mask.setElement(source);
   else if(copy){const g=source.getContext('2d')!;g.save();g.globalCompositeOperation='copy';g.drawImage(copy,0,0);g.restore();}
   mask.set('dirty',true);object.set('dirty',true);object.canvas?.requestRenderAll();
  },
  to(point:XY){
   // Dabs every quarter brush width so strokes stay continuous.
   const step=Math.max(1,size/4),from=last??point,d=Math.hypot(point.x-from.x,point.y-from.y),n=Math.max(1,Math.ceil(d/step));
   for(let i=last?1:0;i<=n;i++)paintLayerMask(object,mask,{x:from.x+(point.x-from.x)*i/n,y:from.y+(point.y-from.y)*i/n},size,softness,reveal,opacity/100);
   last=point;object.canvas?.requestRenderAll();
  },
 };
}
