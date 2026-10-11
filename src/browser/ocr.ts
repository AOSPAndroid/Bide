import {inkDensity} from '../ocr-weight';
import {segmentOcrLine,type OcrGrouping} from '../ocr-segmentation';
import {ocrScale,prepareOcrPixels,sampleBackground,estimateTextColor,toHex} from '../ocr-image';
import {createWorker,PSM,type Worker as OcrEngine,type LoggerMessage} from 'tesseract.js';
import type {TextRegion} from '../text-regions';

export type OcrProgress=(fraction:number,label:string)=>void;
export type OcrOptions={signal?:AbortSignal;grouping?:OcrGrouping;onProgress?:OcrProgress};

let worker:Promise<OcrEngine>|undefined,queue=Promise.resolve(),report:((m:LoggerMessage)=>void)|undefined;
function getWorker(){return worker??=createWorker('fra+eng',1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/core/',document.baseURI).href,langPath:new URL('ocr/lang/',document.baseURI).href,workerBlobURL:false,logger:m=>report?.(m)}).catch(e=>{worker=undefined;throw e;});}

// Upscaled, contrast-normalized grayscale copy for recognition. Prepared in a
// worker when OffscreenCanvas exists so large pages don't block the editor.
async function prepare(image:HTMLCanvasElement,signal?:AbortSignal):Promise<{input:HTMLCanvasElement|Blob;width:number;height:number}>{
 const scale=ocrScale(image.width,image.height),width=Math.round(image.width*scale),height=Math.round(image.height*scale);
 if(typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap!=='undefined'){
  const bitmap=await createImageBitmap(image),prep=new Worker(new URL('./ocr-prepare.worker.ts',import.meta.url),{type:'module'});
  try{
   const reply=await new Promise<{blob?:Blob;error?:string}>((resolve,reject)=>{prep.onmessage=e=>resolve(e.data);prep.onerror=e=>reject(new Error(e.message||'OCR image preparation failed.'));signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});prep.postMessage({bitmap,width,height},[bitmap]);});
   if(reply.blob)return {input:reply.blob,width,height};
  }catch(e){if(signal?.aborted)throw e;}finally{prep.terminate();}
 }
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,width,height);
 const pixels=ctx.getImageData(0,0,width,height);prepareOcrPixels(pixels);ctx.putImageData(pixels,0,0);
 return {input:canvas,width,height};
}

export async function recognizeImage(image:HTMLCanvasElement,{signal,grouping='smart',onProgress}:OcrOptions={}):Promise<TextRegion[]>{
 let resolve!:(v:TextRegion[])=>void,reject!:(e:unknown)=>void;const result=new Promise<TextRegion[]>((yes,no)=>{resolve=yes;reject=no;});
 queue=queue.then(async()=>{try{
  signal?.throwIfAborted();onProgress?.(0,'Preparing image');
  report=m=>{if(signal?.aborted)return;if(m.status==='recognizing text')onProgress?.(.1+m.progress*.9,'Recognizing text');else if(/load|initializ/i.test(m.status))onProgress?.(0,'Loading OCR engine');};
  const [engine,prepared]=await Promise.all([getWorker(),prepare(image,signal)]);signal?.throwIfAborted();
  await engine.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const {data}=await engine.recognize(prepared.input,{}, {blocks:true,text:true});signal?.throwIfAborted();
  const sx=image.width/prepared.width,sy=image.height/prepared.height,ctx=image.getContext('2d')!,original=ctx.getImageData(0,0,image.width,image.height),regions:TextRegion[]=[];
  for(const block of data.blocks||[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){
   if(!line.text.trim()||line.confidence<35)continue;
   for(const part of segmentOcrLine(line,grouping)){
    const b={x0:Math.max(0,Math.floor(part.bbox.x0*sx)),y0:Math.max(0,Math.floor(part.bbox.y0*sy)),x1:Math.min(image.width,Math.ceil(part.bbox.x1*sx)),y1:Math.min(image.height,Math.ceil(part.bbox.y1*sy))},w=b.x1-b.x0,h=b.y1-b.y0;if(w<1||h<1)continue;
    const rgb=sampleBackground(original,b),light=rgb[0]+rgb[1]+rgb[2]>384,ink=estimateTextColor(original,b,rgb);
    regions.push({id:'ocr-'+regions.length,text:part.text,left:b.x0,top:b.y0,width:w,height:h,size:h/.75,baseline:b.y1,fontName:'Image text (font unknown)',bold:false,italic:false,color:ink?toHex(ink):light?'#151515':'#ffffff',kind:'ocr',confidence:line.confidence,background:toHex(rgb),inkDensity:inkDensity(ctx.getImageData(b.x0,b.y0,w,h).data,rgb)});
   }
  }
  resolve(regions.slice(0,2000));
 }catch(e){reject(e);}finally{report=undefined;}});return result;
}
