import {Textbox as FabricTextbox,classRegistry,util} from 'fabric';

export function clampTextSoftness(value:number){return Number.isFinite(value)?Math.min(2,Math.max(0,value)):0;}

// Keep text editable. Apply softness in output pixels, accounting for zoom/DPR.
export class Textbox extends FabricTextbox {
 static type='Textbox';
 declare textSoftness?:number;
 _render(ctx:CanvasRenderingContext2D){
  const softness=clampTextSoftness(this.textSoftness??0);
  if(!softness){super._render(ctx);return;}
  const matrix=ctx.getTransform(),scale=Math.sqrt(Math.abs(matrix.a*matrix.d-matrix.b*matrix.c));
  ctx.save();try{ctx.filter=`blur(${softness*scale}px)`;super._render(ctx);}finally{ctx.restore();}
 }
 _toSVG():string[]{
  const softness=clampTextSoftness(this.textSoftness??0);
  if(!softness)return super._toSVG();
  // PDF's SVG renderer does not implement blur filters. Embed just this text
  // layer as transparent PNG; other text and PDF page content stay vectors.
  const pad=Math.ceil(softness*4+this.strokeWidth+this.fontSize*.3),width=this.width+pad*2,height=this.height+pad*2;
  const scale=Math.min(4,8192/Math.max(width,height),Math.sqrt(16000000/(width*height)));
  const canvas=util.createCanvasElement();canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.translate(width/2,height/2);this._render(ctx);
  return [`<image `,'COMMON_PARTS',`x="${-width/2}" y="${-height/2}" width="${canvas.width/scale}" height="${canvas.height/scale}" opacity="${this.opacity}" visibility="${this.visible?'visible':'hidden'}" xlink:href="${canvas.toDataURL('image/png')}"/>`];
 }
}
Textbox.customProperties=[...FabricTextbox.customProperties,'textSoftness'];
Textbox.cacheProperties=[...FabricTextbox.cacheProperties,'textSoftness'];
classRegistry.setClass(Textbox,'Textbox');
classRegistry.setClass(Textbox,'textbox');
