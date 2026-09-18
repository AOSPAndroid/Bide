import {sampleTextColors} from '../text-replacement';
import {createWorker,PSM,type Worker} from 'tesseract.js';
import type {TextRegion} from '../text-regions';
let worker:Promise<Worker>|undefined,queue=Promise.resolve();
function getWorker(){return worker??=createWorker('fra+eng',1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/core/',document.baseURI).href,langPath:new URL('ocr/lang/',document.baseURI).href,workerBlobURL:false}).catch(e=>{worker=undefined;throw e;});}
export async function recognizeImage(image:HTMLCanvasElement,signal?:AbortSignal):Promise<TextRegion[]>{
 let resolve!:(v:TextRegion[])=>void,reject!:(e:unknown)=>void;const result=new Promise<TextRegion[]>((yes,no)=>{resolve=yes;reject=no;});
 queue=queue.then(async()=>{try{signal?.throwIfAborted();const engine=await getWorker();signal?.throwIfAborted();await engine.setParameters({tessedit_pageseg_mode:PSM.AUTO});const {data}=await engine.recognize(image,{}, {blocks:true,text:true});signal?.throwIfAborted();const ctx=image.getContext('2d')!;const regions:TextRegion[]=[];const pixels=ctx.getImageData(0,0,image.width,image.height);
 for(const block of data.blocks||[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){if(!line.text.trim()||line.confidence<35)continue;const b=line.bbox,w=b.x1-b.x0,h=b.y1-b.y0;if(w<1||h<1)continue;const {background,color}=sampleTextColors(pixels,{left:b.x0,top:b.y0,width:w,height:h});regions.push({id:'ocr-'+regions.length,text:line.text.trim(),left:b.x0,top:b.y0,width:w,height:h,size:h/.75,baseline:b.y1,fontName:'Image text (font unknown)',bold:false,italic:false,color,kind:'ocr',confidence:line.confidence,background});}
 resolve(regions.slice(0,2000));}catch(e){reject(e);}});return result;
}
