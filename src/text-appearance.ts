import {corporateFonts} from './corporate-fonts';
import {isExtraFont} from './extra-fonts';
import {Textbox as FabricTextbox,classRegistry,util} from 'fabric';

export function clampTextSoftness(value:number){return Number.isFinite(value)?Math.min(2,Math.max(0,value)):0;}
export const rasterizedText=(o:{textSoftness?:number;rasterScale?:number;fontFamily:string})=>!!clampTextSoftness(o.textSoftness??0)||!!o.rasterScale||corporateFonts.includes(o.fontFamily)||isExtraFont(o.fontFamily);

// Letter groups a face may draw as one glyph (Calibri and Carlito join "ti"
// and "tt", most faces "fi" and "ff"): a line typeset with them is narrower
// than its letters drawn one by one, and matches no face drawn that way (the
// true face fitted its own line 0.66 on a flyer, and a look-alike was taken).
const LIGATURES=['ffi','ffl','ff','fi','fl','fj','ft','tt','ti','Th'];
const ligated=new Map<string,string[]>();
// Those the face joins (or kerns: either way the pair is best drawn in one
// call): their width differs when a zero-width non-joiner keeps them apart.
function ligaturesOf(style:string,weight:string|number,family:string){
 const font=`${style} ${weight} 100px "${family}"`,known=ligated.get(font);if(known)return known;
 if(typeof document==='undefined')return [];
 const g=util.createCanvasElement().getContext('2d');if(!g)return [];
 g.font=font;const found=LIGATURES.filter(s=>Math.abs(g.measureText(s).width-g.measureText(Array.from(s).join('\u200c')).width)>.4);
 // (Not remembered while the face is still loading: the fallback face was measured.)
 try{if(document.fonts.check(font))ligated.set(font,found);}catch{}
 return found;
}

// Keep text editable. Apply softness in output pixels, accounting for zoom/DPR.
export class Textbox extends FabricTextbox {
 static type='Textbox';
 declare textSoftness?:number;
 private plainLetters=false;
 declare recognizedKey?:string;
 // A group the face joins is one unit of the line: measured and drawn in one
 // call, so the ligature is drawn. On text set over a scan, which is drawn
 // by the canvas wherever it goes (vector text in a PDF is laid out letter by
 // letter by the exporter). Not while the text is being typed (the caret
 // moves letter by letter), nor on a line with styled ranges (their
 // positions count letters).
 graphemeSplit(text:string){
  const letters=super.graphemeSplit(text);
  if(!this.recognizedKey?.startsWith?.('ocr:')||this.isEditing||this.plainLetters||this.path||this.styles&&Object.keys(this.styles).length||!/[fT]|t[ti]/.test(text))return letters;
  const joined=ligaturesOf(this.fontStyle,this.fontWeight,this.fontFamily);if(!joined.length)return letters;
  const out:string[]=[];
  for(let i=0;i<letters.length;i++){const hit=joined.find(s=>letters.slice(i,i+s.length).join('')===s);if(hit){out.push(hit);i+=hit.length-1;}else out.push(letters[i]);}
  return out;
 }
 enterEditing(...args:Parameters<FabricTextbox['enterEditing']>){
  if(!this.isEditing){this.plainLetters=true;this.initDimensions();}
  const result=super.enterEditing(...args);
  if(!this.isEditing){this.plainLetters=false;this.initDimensions();}
  return result;
 }
 exitEditing(){
  const result=super.exitEditing();
  if(this.plainLetters){this.plainLetters=false;this.initDimensions();this.setCoords();}
  return result;
 }
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
