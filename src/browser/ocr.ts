import {inkDensity} from '../ocr-weight';
import {segmentOcrLine,type OcrGrouping} from '../ocr-segmentation';
import {ocrScale,prepareOcrPixels,sampleBackground,estimateTextColor,toHex} from '../ocr-image';
import {createWorker,PSM,type Worker} from 'tesseract.js';
import type {TextRegion} from '../text-regions';
let worker:Promise<Worker>|undefined,queue=Promise.resolve();
function getWorker(){return worker??=createWorker('fra+eng',1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/core/',document.baseURI).href,langPath:new URL('ocr/lang/',document.baseURI).href,workerBlobURL:false}).catch(e=>{worker=undefined;throw e;});}
// Recognize on an upscaled, contrast-normalized grayscale copy; sample colours from the original.
function prepare(image:HTMLCanvasElement){
 const scale=ocrScale(image.width,image.height),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);prepareOcrPixels(pixels);ctx.putImageData(pixels,0,0);
 return {canvas,sx:image.width/canvas.width,sy:image.height/canvas.height};
}
export async function recognizeImage(image:HTMLCanvasElement,signal?:AbortSignal,grouping:OcrGrouping='smart'):Promise<TextRegion[]>{
 let resolve!:(v:TextRegion[])=>void,reject!:(e:unknown)=>void;const result=new Promise<TextRegion[]>((yes,no)=>{resolve=yes;reject=no;});
 queue=queue.then(async()=>{try{signal?.throwIfAborted();const engine=await getWorker();signal?.throwIfAborted();const prepared=prepare(image);await engine.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1',user_defined_dpi:'300'});const {data}=await engine.recognize(prepared.canvas,{}, {blocks:true,text:true});signal?.throwIfAborted();const ctx=image.getContext('2d')!,original=ctx.getImageData(0,0,image.width,image.height),regions:TextRegion[]=[];
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){if(!line.text.trim()||line.confidence<35)continue;for(const part of segmentOcrLine(line,grouping)){const b={x0:Math.max(0,Math.floor(part.bbox.x0*prepared.sx)),y0:Math.max(0,Math.floor(part.bbox.y0*prepared.sy)),x1:Math.min(image.width,Math.ceil(part.bbox.x1*prepared.sx)),y1:Math.min(image.height,Math.ceil(part.bbox.y1*prepared.sy))},w=b.x1-b.x0,h=b.y1-b.y0;if(w<1||h<1)continue;const rgb=sampleBackground(original,b),light=rgb[0]+rgb[1]+rgb[2]>384,ink=estimateTextColor(original,b,rgb);regions.push({id:'ocr-'+regions.length,text:part.text,left:b.x0,top:b.y0,width:w,height:h,size:h/.75,baseline:b.y1,fontName:'Image text (font unknown)',bold:false,italic:false,color:ink?toHex(ink):light?'#151515':'#ffffff',kind:'ocr',confidence:line.confidence,background:toHex(rgb),inkDensity:inkDensity(ctx.getImageData(b.x0,b.y0,w,h).data,rgb)});}}
 resolve(regions.slice(0,2000));}catch(e){reject(e);}});return result;
}
