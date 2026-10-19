// An adjustment layer: a page-sized, click-through layer that re-processes the
// pixels already drawn beneath it (Levels, Curves, Hue/Saturation) each time
// the page renders, so the layers below stay editable. Opacity blends the
// adjusted and original pixels. SVG and PDF export flatten the page to pixels
// (see hasBlending in browser/layer-utils.ts).
import {Rect,classRegistry,type TOptions,type RectProps} from 'fabric';
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
 _render(ctx:CanvasRenderingContext2D){
  if(isIdentity(this.adjustment))return;
  // This layer's box in device pixels, within the canvas being drawn.
  const m=ctx.getTransform(),w=this.width/2,h=this.height/2,xs:number[]=[],ys:number[]=[];
  for(const [x,y] of [[-w,-h],[w,-h],[w,h],[-w,h]]){xs.push(m.a*x+m.c*y+m.e);ys.push(m.b*x+m.d*y+m.f);}
  const x0=Math.max(0,Math.floor(Math.min(...xs))),y0=Math.max(0,Math.floor(Math.min(...ys))),x1=Math.min(ctx.canvas.width,Math.ceil(Math.max(...xs))),y1=Math.min(ctx.canvas.height,Math.ceil(Math.max(...ys)));
  if(x1<=x0||y1<=y0)return;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  try{const pixels=ctx.getImageData(x0,y0,x1-x0,y1-y0);applyAdjustment(pixels.data,this.adjustment,ctx.globalAlpha);ctx.putImageData(pixels,x0,y0);}
  finally{ctx.restore();}
 }
 toSVG(){return '';}
}
AdjustmentLayer.customProperties=['id','name','adjustment'];
classRegistry.setClass(AdjustmentLayer,'AdjustmentLayer');

export const isAdjustment=(o:unknown):o is AdjustmentLayer=>o instanceof AdjustmentLayer;
