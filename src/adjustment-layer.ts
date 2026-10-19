// An adjustment layer: a page-sized, click-through layer that re-processes the
// pixels already drawn beneath it (Levels, Curves, Hue/Saturation) each time
// the page renders, so the layers below stay editable. Opacity blends the
// adjusted and original pixels. SVG and PDF export flatten the page to pixels
// (see hasBlending in browser/layer-utils.ts).
import {Rect,classRegistry,util,type TOptions,type RectProps} from 'fabric';
import {applyAdjustment,isIdentity,adjustmentDefaults,type Adjustment} from './adjustments';

export class AdjustmentLayer extends Rect {
 static type='AdjustmentLayer';
 declare adjustment:Adjustment;
 constructor(options:TOptions<RectProps>&{adjustment?:Adjustment}={}){
  // Click-through (never moved on the canvas); not locked, which in bide
  // would block editing its settings.
  super({fill:'transparent',strokeWidth:0,hasControls:false,...options,objectCaching:false,evented:false});
  this.adjustment=options.adjustment??adjustmentDefaults.levels;
 }
 // Fabric isolates objects with a clipPath in their own transparent cache.
 // Adjustments must always read the already-rendered backdrop instead, then
 // use the mask to mix the adjusted pixels back into it. Bypassing the base
 // render also prevents layer-style rendering from isolating this layer.
 render(ctx:CanvasRenderingContext2D){
  if(this.isNotVisible()||isIdentity(this.adjustment))return;
  ctx.save();
  try{this.transform(ctx);this._setOpacity(ctx);this._render(ctx);}
  finally{ctx.restore();}
 }
 _render(ctx:CanvasRenderingContext2D){
  if(isIdentity(this.adjustment))return;
  // This layer's box in device pixels, within the canvas being drawn.
  const m=ctx.getTransform(),w=this.width/2,h=this.height/2,xs:number[]=[],ys:number[]=[];
  for(const [x,y] of [[-w,-h],[w,-h],[w,h],[-w,h]]){xs.push(m.a*x+m.c*y+m.e);ys.push(m.b*x+m.d*y+m.f);}
  const x0=Math.max(0,Math.floor(Math.min(...xs))),y0=Math.max(0,Math.floor(Math.min(...ys))),x1=Math.min(ctx.canvas.width,Math.ceil(Math.max(...xs))),y1=Math.min(ctx.canvas.height,Math.ceil(Math.max(...ys)));
  if(x1<=x0||y1<=y0)return;
  const mask=this.clipPath;
  let alpha:Uint8ClampedArray|undefined;
  if(mask){
   const bitmap=util.createCanvasElement();bitmap.width=x1-x0;bitmap.height=y1-y0;
   const g=bitmap.getContext('2d',{willReadFrequently:true})!;
   g.setTransform(m.a,m.b,m.c,m.d,m.e-x0,m.f-y0);
   if(mask.absolutePositioned){const inv=util.invertTransform(this.calcTransformMatrix());g.transform(...inv);}
   mask.render(g);alpha=g.getImageData(0,0,bitmap.width,bitmap.height).data;
  }
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  try{
   const pixels=ctx.getImageData(x0,y0,x1-x0,y1-y0),before=alpha?pixels.data.slice():undefined;
   applyAdjustment(pixels.data,this.adjustment,ctx.globalAlpha);
   if(alpha&&before)for(let i=0;i<pixels.data.length;i+=4){const a=mask!.inverted?1-alpha[i+3]/255:alpha[i+3]/255;for(let c=0;c<3;c++)pixels.data[i+c]=before[i+c]+(pixels.data[i+c]-before[i+c])*a;}
   ctx.putImageData(pixels,x0,y0);
  }
  finally{ctx.restore();}
 }
 toSVG(){return '';}
}
AdjustmentLayer.customProperties=['id','name','adjustment'];
AdjustmentLayer.cacheProperties=[...Rect.cacheProperties,'adjustment'];
classRegistry.setClass(AdjustmentLayer,'AdjustmentLayer');

// The type remains stable when a project is enlivened or a dev module reloads.
export const isAdjustment=(o:unknown):o is AdjustmentLayer=>o instanceof Rect&&o.type.toLowerCase()==='adjustmentlayer';
