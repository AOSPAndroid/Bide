import {inkDensity} from '../ocr-weight';
import {segmentOcrLine,missingLines,type OcrGrouping} from '../ocr-segmentation';
import {sampleBackground,estimateTextColor,toHex,edgeWidth,blurFromEdgeWidth,inkMass} from '../ocr-image';
import {prepareOcrImage} from './ocr-prepare';
import {createWorker,PSM,type Worker as OcrEngine,type LoggerMessage} from 'tesseract.js';
import type {TextRegion} from '../text-regions';
import type {OcrScript} from '../ai-image';

export type OcrProgress=(fraction:number,label:string)=>void;
export type OcrReader='tesseract'|'paddle';
export type OcrOptions={signal?:AbortSignal;grouping?:OcrGrouping;languages?:string[];engine?:OcrReader;onProgress?:OcrProgress;thorough?:boolean;script?:OcrScript|'auto';accurate?:boolean};

let worker:Promise<OcrEngine>|undefined,workerLanguages='',queue=Promise.resolve(),report:((m:LoggerMessage)=>void)|undefined;
// One shared engine; switching languages re-initializes it instead of starting another.
async function getWorker(languages:string){
 if(worker&&workerLanguages!==languages){const engine=await worker;await engine.reinitialize(languages,1);workerLanguages=languages;}
 if(!worker)workerLanguages=languages;
 return worker??=createWorker(languages,1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/core/',document.baseURI).href,langPath:new URL('ocr/lang/',document.baseURI).href,workerBlobURL:false,logger:m=>report?.(m)}).catch(e=>{worker=undefined;throw e;});
}

// Prepared copy for recognition (see ocr-prepare.ts). Done in a worker when
// OffscreenCanvas exists so large pages don't block the editor.
async function prepare(image:HTMLCanvasElement,signal?:AbortSignal):Promise<{input:HTMLCanvasElement|Blob;width:number;height:number}>{
 if(typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap!=='undefined'){
  const bitmap=await createImageBitmap(image),prep=new Worker(new URL('./ocr-prepare.worker.ts',import.meta.url),{type:'module'});
  try{
   const reply=await new Promise<{blob?:Blob;width?:number;height?:number;error?:string}>((resolve,reject)=>{prep.onmessage=e=>resolve(e.data);prep.onerror=e=>reject(new Error(e.message||'OCR image preparation failed.'));signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});prep.postMessage({bitmap},[bitmap]);});
   if(reply.blob&&reply.width&&reply.height)return {input:reply.blob,width:reply.width,height:reply.height};
  }catch(e){if(signal?.aborted)throw e;}finally{prep.terminate();}
 }
 const {canvas,width,height}=prepareOcrImage(image,(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}));
 return {input:canvas as HTMLCanvasElement,width,height};
}

export async function recognizeImage(image:HTMLCanvasElement,{signal,grouping='smart',languages=['eng','fra'],engine:ocrEngine='tesseract',onProgress,thorough=false,script='auto',accurate=false}:OcrOptions={}):Promise<TextRegion[]>{
 let resolve!:(v:TextRegion[])=>void,reject!:(e:unknown)=>void;const result=new Promise<TextRegion[]>((yes,no)=>{resolve=yes;reject=no;});
 queue=queue.then(async()=>{try{
  signal?.throwIfAborted();
  let lines:{script?:OcrScript;text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number};words?:{text:string;confidence?:number;bbox:{x0:number;y0:number;x1:number;y1:number};chars?:{ch:string;x0:number;x1:number;p?:number}[]}[]}[],sx=1,sy=1;
  if(ocrEngine==='paddle'){
   // PaddleOCR (bundled AI models) reads the original pixels; its Latin model
   // covers all bundled languages at once, other alphabets have their own.
   onProgress?.(0,'Loading AI OCR');const {paddleOcr}=await import('./ai-tools');
   lines=(await paddleOcr(image,f=>onProgress?.(f,'Recognizing text (AI)'),signal,{script,accurate})).filter(l=>l.confidence>=35);
  }else{
  onProgress?.(0,'Preparing image');
  let pass=0;const passes=thorough?2:1;
  report=m=>{if(signal?.aborted)return;if(m.status==='recognizing text')onProgress?.(.1+(pass+m.progress)/passes*.9,thorough&&pass?'Thorough pass':'Recognizing text');else if(/load|initializ/i.test(m.status))onProgress?.(0,'Loading OCR engine');};
  const [engine,prepared]=await Promise.all([getWorker(languages.join('+')),prepare(image,signal)]);signal?.throwIfAborted();
  const recognize=async(mode:PSM)=>{await engine.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:'1',user_defined_dpi:'300'});const {data}=await engine.recognize(prepared.input,{}, {blocks:true,text:true});signal?.throwIfAborted();return (data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines)).filter(l=>l.text.trim()&&l.confidence>=35).map(l=>({...l,words:l.words.map(w=>({...w,chars:w.symbols?.map(sym=>({ch:sym.text,x0:sym.bbox.x0,x1:sym.bbox.x1,p:sym.confidence/100}))}))}));};
  lines=await recognize(PSM.AUTO);
  // Sparse-text mode finds isolated labels (buttons, badges) that page layout analysis can skip.
  if(thorough){pass=1;lines.push(...missingLines(lines,await recognize(PSM.SPARSE_TEXT)));}
  sx=image.width/prepared.width;sy=image.height/prepared.height;
  }
  const ctx=image.getContext('2d')!,original=ctx.getImageData(0,0,image.width,image.height),regions:TextRegion[]=[];
  const scaleBox=(bb:{x0:number;y0:number;x1:number;y1:number})=>({x0:Math.max(0,Math.floor(bb.x0*sx)),y0:Math.max(0,Math.floor(bb.y0*sy)),x1:Math.min(image.width,Math.ceil(bb.x1*sx)),y1:Math.min(image.height,Math.ceil(bb.y1*sy))});
  for(const line of lines){
   // Every word of the full line is measured once, so weights can be judged
   // against the rest of the line even when a region holds a single word.
   const lineWords=segmentOcrLine(line,'words'),lineBox=scaleBox(line.bbox),lineBg=sampleBackground(original,lineBox),lineEdge=edgeWidth(original,lineBox,lineBg),pad=Math.min(3,Math.ceil((lineEdge===undefined?0:blurFromEdgeWidth(lineEdge))*2));
   const measured=lineWords.map(g=>{const box=scaleBox(g.bbox);return {text:g.text,width:box.x1-box.x0,inkMass:inkMass(original,box,lineBg,pad),inkDensity:box.x1>box.x0&&box.y1>box.y0?inkDensity(ctx.getImageData(box.x0,box.y0,box.x1-box.x0,box.y1-box.y0).data,lineBg):undefined};});
   for(const part of segmentOcrLine(line,grouping)){
    const start=part.words.length?lineWords.findIndex(g=>g.bbox.x0===part.words[0].bbox.x0&&g.bbox.y0===part.words[0].bbox.y0):-1;
    const lineContext=measured.length>1&&start>=0?{words:measured,start,count:part.words.length}:undefined;
    const b={x0:Math.max(0,Math.floor(part.bbox.x0*sx)),y0:Math.max(0,Math.floor(part.bbox.y0*sy)),x1:Math.min(image.width,Math.ceil(part.bbox.x1*sx)),y1:Math.min(image.height,Math.ceil(part.bbox.y1*sy))},w=b.x1-b.x0,h=b.y1-b.y0;if(w<1||h<1)continue;
    const rgb=sampleBackground(original,b),light=rgb[0]+rgb[1]+rgb[2]>384,ink=estimateTextColor(original,b,rgb);
    const edge=edgeWidth(original,b,rgb),blur=edge===undefined?undefined:blurFromEdgeWidth(edge);
    // Per-word ink lets a bold label and regular value share one line (see ocr-weight.ts).
    const words=part.words.length>1?part.words.map(word=>{const x0=Math.max(0,Math.floor(word.bbox.x0*sx)),y0=Math.max(0,Math.floor(word.bbox.y0*sy)),x1=Math.min(image.width,Math.ceil(word.bbox.x1*sx)),y1=Math.min(image.height,Math.ceil(word.bbox.y1*sy)),box={x0,y0,x1,y1};return {text:word.text.trim(),width:x1-x0,inkMass:inkMass(original,box,rgb,Math.min(3,Math.ceil((blur??0)*2))),inkDensity:x1>x0&&y1>y0?inkDensity(ctx.getImageData(x0,y0,x1-x0,y1-y0).data,rgb):undefined};}):undefined;
    regions.push({id:'ocr-'+regions.length,...line.script&&line.script!=='latin'?{script:line.script}:{},text:part.text,left:b.x0,top:b.y0,width:w,height:h,size:h/.75,baseline:b.y1,fontName:'Image text (font unknown)',bold:false,italic:false,color:ink?toHex(ink):light?'#151515':'#ffffff',kind:'ocr',confidence:part.confidence??line.confidence,background:toHex(rgb),inkDensity:inkDensity(ctx.getImageData(b.x0,b.y0,w,h).data,rgb),words,blur,line:lineContext,glyphs:part.words.length&&part.words.every(w=>w.chars?.length)?part.words.flatMap(w=>w.chars!.map(g=>({ch:g.ch,x0:g.x0*sx,x1:g.x1*sx,p:g.p}))):undefined});
   }
  }
  resolve(regions.slice(0,2000));
 }catch(e){reject(e);}finally{report=undefined;}});return result;
}
