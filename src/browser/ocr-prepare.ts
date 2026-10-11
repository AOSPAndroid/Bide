import {ocrScale,prepareOcrPixels,estimateLineHeight} from '../ocr-image';
type AnyCanvas=HTMLCanvasElement|OffscreenCanvas;
type Source=CanvasImageSource&{width:number;height:number};
// Grayscale/invert at native size, measure the text's line height, then upscale
// small text. Works with DOM canvases (fallback) and OffscreenCanvas (worker).
export function prepareOcrImage(source:Source,make:(w:number,h:number)=>AnyCanvas){
 const native=make(source.width,source.height),nctx=native.getContext('2d',{willReadFrequently:true}) as CanvasRenderingContext2D;
 nctx.drawImage(source,0,0);const pixels=nctx.getImageData(0,0,source.width,source.height);prepareOcrPixels(pixels);nctx.putImageData(pixels,0,0);
 const scale=ocrScale(source.width,source.height,estimateLineHeight(pixels));if(scale===1)return {canvas:native,width:source.width,height:source.height};
 const width=Math.round(source.width*scale),height=Math.round(source.height*scale),canvas=make(width,height),ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
 ctx.imageSmoothingQuality='high';ctx.drawImage(native as CanvasImageSource,0,0,width,height);return {canvas,width,height};
}
