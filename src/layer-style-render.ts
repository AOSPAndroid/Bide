// Draws layer styles (layer-effects.ts) in the editor and in every raster
// export. A styled layer is rendered alone into an offscreen canvas at screen
// resolution, its effects are computed from those pixels, and the result is
// drawn in its place. Results are cached until the layer changes; moving a
// layer reuses them.
import {FabricImage,FabricObject,Group} from 'fabric';
import {applyLayerStyle,effectExtent,hasEffects,type LayerStyle} from './layer-effects';

type Styled=FabricObject&{layerStyle?:LayerStyle;_styleCache?:{key:string;canvas:HTMLCanvasElement;x:number;y:number}};
const elementIds=new WeakMap<object,number>();let nextId=0;
const elementId=(o:object|undefined)=>{if(!o)return 0;let id=elementIds.get(o);if(!id){id=++nextId;elementIds.set(o,id);}return id;};
const MAX_PIXELS=12_000_000;

const baseRender=FabricObject.prototype.render;
let installed=false;
export function installLayerStyles(){
 if(installed)return;installed=true;
 FabricObject.prototype.render=function(this:Styled,ctx:CanvasRenderingContext2D){
  const style=this.layerStyle;
  if(!hasEffects(style)||this.isNotVisible())return baseRender.call(this,ctx);
  // Device matrix of the layer, exactly as fabric applies it.
  ctx.save();this.transform(ctx);const m=ctx.getTransform();ctx.restore();
  const outer=ctx.getTransform(),scale=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))||1;
  const dims=this._getNonTransformedDimensions(),hw=dims.x/2,hh=dims.y/2,pad=effectExtent(style)*scale+2;
  const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
  let x0=Math.floor(Math.min(...corners.map(p=>p.x))-pad),y0=Math.floor(Math.min(...corners.map(p=>p.y))-pad);
  let x1=Math.ceil(Math.max(...corners.map(p=>p.x))+pad),y1=Math.ceil(Math.max(...corners.map(p=>p.y))+pad);
  // Only what can be seen on this canvas (with room for effects reaching in).
  const cw=ctx.canvas.width,ch=ctx.canvas.height;x0=Math.max(x0,-Math.ceil(pad));y0=Math.max(y0,-Math.ceil(pad));x1=Math.min(x1,cw+Math.ceil(pad));y1=Math.min(y1,ch+Math.ceil(pad));
  const w=x1-x0,h=y1-y0;if(w<1||h<1)return;
  if(w*h>MAX_PIXELS)return baseRender.call(this,ctx);
  // Reusable while only the position changes by whole pixels.
  const fx=m.e-Math.floor(m.e),fy=m.f-Math.floor(m.f);
  const key=[m.a,m.b,m.c,m.d,fx,fy,x0-Math.floor(m.e),y0-Math.floor(m.f),w,h].map(v=>Math.round(v*1000)/1000).join(',')+'|'+JSON.stringify(style)+'|'+((this as {text?:string}).text??'')+'|'+(this instanceof FabricImage?elementId(this.getElement())+JSON.stringify(this.filters??[]):'');
  let cache=this._styleCache;
  if(!cache||cache.key!==key||this.dirty){
   const off=Object.assign(document.createElement('canvas'),{width:w,height:h}),octx=off.getContext('2d',{willReadFrequently:true})!;
   octx.setTransform(outer.a,outer.b,outer.c,outer.d,outer.e-x0,outer.f-y0);
   const {opacity,globalCompositeOperation}=this;
   try{this.opacity=1;this.globalCompositeOperation='source-over';baseRender.call(this,octx);}
   finally{this.opacity=opacity;this.globalCompositeOperation=globalCompositeOperation;}
   const image=octx.getImageData(0,0,w,h);
   image.data.set(applyLayerStyle(image.data,w,h,style,scale));
   octx.setTransform(1,0,0,1,0,0);octx.putImageData(image,0,0);
   cache=this._styleCache={key,canvas:off,x:x0-Math.floor(m.e),y:y0-Math.floor(m.f)};this.dirty=false;
  }
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha*=this.opacity;ctx.globalCompositeOperation=this.globalCompositeOperation;
  ctx.drawImage(cache.canvas,Math.floor(m.e)+cache.x,Math.floor(m.f)+cache.y);
  ctx.restore();
 };
}

// A group's SVG also needs pixels when any descendant has a layer style or
// painted mask: SVG serialization does not call the canvas render hook above.
export const needsRasterExport=(o:FabricObject):boolean=>hasEffects((o as Styled).layerStyle)||!!(o.clipPath as {layerMask?:boolean}|undefined)?.layerMask||(o instanceof Group&&o.getObjects().some(needsRasterExport));

// Include effects on descendants as well as the group's own geometry. Fabric's
// group bounds omit a child's shadow/glow, and effects scale with the layer.
export function rasterExportBounds(o:FabricObject):{left:number;top:number;width:number;height:number}{
 const b=o.getBoundingRect(),m=o.calcTransformMatrix(),scale=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
 const reach=effectExtent((o as Styled).layerStyle??{})*scale;
 let left=b.left-reach,top=b.top-reach,right=b.left+b.width+reach,bottom=b.top+b.height+reach;
 if(o instanceof Group)for(const child of o.getObjects()){
  const c=rasterExportBounds(child);left=Math.min(left,c.left);top=Math.min(top,c.top);right=Math.max(right,c.left+c.width);bottom=Math.max(bottom,c.top+c.height);
 }
 return {left,top,width:right-left,height:bottom-top};
}
