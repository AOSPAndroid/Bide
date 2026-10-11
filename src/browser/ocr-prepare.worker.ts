// Prepares an OCR input off the main thread; replies with a PNG and its size.
import {prepareOcrImage} from './ocr-prepare';
self.onmessage=async(event:MessageEvent<{bitmap:ImageBitmap}>)=>{
 try{const {canvas,width,height}=prepareOcrImage(event.data.bitmap,(w,h)=>new OffscreenCanvas(w,h));event.data.bitmap.close();self.postMessage({blob:await (canvas as OffscreenCanvas).convertToBlob({type:'image/png'}),width,height});}
 catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
};
