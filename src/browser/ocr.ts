import {segmentOcrLine,type OcrGrouping} from '../ocr-segmentation';
import {createWorker,PSM,type Worker} from 'tesseract.js';
import type {TextRegion} from '../text-regions';
let worker:Promise<Worker>|undefined,queue=Promise.resolve();
function getWorker(){return worker??=createWorker('fra+eng',1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/core/',document.baseURI).href,langPath:new URL('ocr/lang/',document.baseURI).href,workerBlobURL:false}).catch(e=>{worker=undefined;throw e;});}
export async function recognizeImage(image:HTMLCanvasElement,signal?:AbortSignal,grouping:OcrGrouping='smart'):Promise<TextRegion[]>{
 let resolve!:(v:TextRegion[])=>void,reject!:(e:unknown)=>void;const result=new Promise<TextRegion[]>((yes,no)=>{resolve=yes;reject=no;});
 queue=queue.then(async()=>{try{signal?.throwIfAborted();const engine=await getWorker();signal?.throwIfAborted();await engine.setParameters({tessedit_pageseg_mode:PSM.AUTO});const {data}=await engine.recognize(image,{}, {blocks:true,text:true});signal?.throwIfAborted();const ctx=image.getContext('2d')!;const regions:TextRegion[]=[];
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){if(!line.text.trim()||line.confidence<35)continue;for(const part of segmentOcrLine(line,grouping)){const b=part.bbox,w=b.x1-b.x0,h=b.y1-b.y0;if(w<1||h<1)continue;const rgb=ctx.getImageData(Math.max(0,b.x0-2),Math.max(0,b.y0-2),1,1).data;const background='#'+[...rgb.slice(0,3)].map(v=>v.toString(16).padStart(2,'0')).join('');const light=rgb[0]+rgb[1]+rgb[2]>384;regions.push({id:'ocr-'+regions.length,text:part.text,left:b.x0,top:b.y0,width:w,height:h,size:h/.75,baseline:b.y1,fontName:'Image text (font unknown)',bold:false,italic:false,color:light?'#151515':'#ffffff',kind:'ocr',confidence:line.confidence,background});}}
 resolve(regions.slice(0,2000));}catch(e){reject(e);}});return result;
}
