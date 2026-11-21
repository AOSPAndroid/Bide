import {corporateFonts} from './corporate-fonts';
import {Textbox as FabricTextbox,classRegistry,util} from 'fabric';

export function clampTextSoftness(value:number){return Number.isFinite(value)?Math.min(2,Math.max(0,value)):0;}
export const rasterizedText=(o:{textSoftness?:number;rasterScale?:number;fontFamily:string})=>!!clampTextSoftness(o.textSoftness??0)||!!o.rasterScale||corporateFonts.includes(o.fontFamily);

// Keep text editable. Apply softness in output pixels, accounting for zoom/DPR.
export class Textbox extends FabricTextbox {
 static type='Textbox';
 declare textSoftness?:number;
 // Text set over a scan is exported as pixels at the scan's own resolution
 // (pixels per page unit), as it was fitted: vector text over a scan is
 // rendered by each viewer in its own way and stays sharp where the scan is not.
 declare rasterScale?:number;
 private softRaster(requestedScale:number){
  const softness=clampTextSoftness(this.textSoftness??0);
  const pad=Math.ceil(softness*4+this.strokeWidth+this.fontSize*.3),width=this.width+pad*2,height=this.height+pad*2;
  // At least four times finer than the page: the canvas blur steps in whole
  // pixels (at 1x nothing under 0.8 px, then a 3 px box), so a soft line
  // drawn at a picture's own size came out sharp or too soft and pale.
  const scale=Math.min(Math.max(4,requestedScale),300/72,8192/Math.max(width,height),Math.sqrt(16000000/(width*height)));
  const bitmap=util.createCanvasElement();bitmap.width=Math.ceil(width*scale);bitmap.height=Math.ceil(height*scale);
  const context=bitmap.getContext('2d')!;context.scale(scale,scale);context.translate(width/2,height/2);
  context.filter=`blur(${softness*scale}px)`;super._render(context);
  return {bitmap,x:-width/2,y:-height/2,width:bitmap.width/scale,height:bitmap.height/scale};
 }
 _render(ctx:CanvasRenderingContext2D){
  if(!clampTextSoftness(this.textSoftness??0)){super._render(ctx);return;}
  const matrix=ctx.getTransform(),scale=Math.sqrt(Math.abs(matrix.a*matrix.d-matrix.b*matrix.c));
  const raster=this.softRaster(scale),quality=ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality='high';ctx.drawImage(raster.bitmap,raster.x,raster.y,raster.width,raster.height);ctx.imageSmoothingQuality=quality;
 }
 _toSVG():string[]{
  if(!rasterizedText(this))return super._toSVG();
  // Rasterize this text layer only; other page content stays vector-based.
  const raster=this.softRaster(this.rasterScale??4);
  return [`<image `,'COMMON_PARTS',`x="${raster.x}" y="${raster.y}" width="${raster.width}" height="${raster.height}" opacity="${this.opacity}" visibility="${this.visible?'visible':'hidden'}" xlink:href="${raster.bitmap.toDataURL('image/png')}"/>`];
 }
}
Textbox.customProperties=['id','name','pdfFontData','pdfOriginalFont','pdfFontFallback','pdfFontBold','pdfFontItalic','recognizedKey','ocrOriginalBounds','objectCaching','textSoftness','rasterScale','layerMask','layerStyle'];
Textbox.cacheProperties=[...FabricTextbox.cacheProperties,'textSoftness'];
classRegistry.setClass(Textbox,'Textbox');
classRegistry.setClass(Textbox,'textbox');
