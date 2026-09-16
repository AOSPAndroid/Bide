import {Canvas, PencilBrush, SprayBrush, CircleBrush, type FabricObject} from 'fabric';
import {markerColor} from './editor-tools';

export type BrushKind = 'round'|'square'|'spray'|'dots';
export const brushNames: Record<BrushKind,string> = {round:'Round',square:'Square',spray:'Spray',dots:'Dots'};
export const brushWidth = (value:number) => Math.min(200,Math.max(1,Number.isFinite(value)?value:1));
export function makeBrush(canvas:Canvas,kind:BrushKind,color:string,size:number,opacity:number) {
  const brush=kind==='spray'?new SprayBrush(canvas):kind==='dots'?new CircleBrush(canvas):new PencilBrush(canvas);
  brush.width=brushWidth(size);brush.color=markerColor(color,opacity);
  brush.strokeLineCap=kind==='square'?'square':'round';brush.strokeLineJoin=kind==='square'?'miter':'round';
  if(brush instanceof SprayBrush){brush.density=25;brush.dotWidth=2;brush.dotWidthVariance=1;}
  return brush;
}
export function makeEraserStroke(path:FabricObject) {
  path.set({stroke:'#000000',globalCompositeOperation:'destination-out',selectable:false,evented:false});
}
