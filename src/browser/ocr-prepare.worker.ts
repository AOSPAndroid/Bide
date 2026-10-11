// Upscales and normalizes an OCR input off the main thread; replies with a PNG.
import {prepareOcrPixels} from '../ocr-image';
self.onmessage=async(event:MessageEvent<{bitmap:ImageBitmap;width:number;height:number}>)=>{
 const {bitmap,width,height}=event.data;
 try{
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,width,height);bitmap.close();
  const pixels=ctx.getImageData(0,0,width,height);prepareOcrPixels(pixels);ctx.putImageData(pixels,0,0);
  self.postMessage({blob:await canvas.convertToBlob({type:'image/png'})});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
};
