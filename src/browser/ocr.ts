import {inkDensity} from '../ocr-weight';
import {segmentOcrLine,missingLines,splitAtBackgrounds,type OcrGrouping} from '../ocr-segmentation';
import {sampleBackground,estimateTextColor,toHex,edgeWidth,blurFromEdgeWidth,inkMass,prepareOcrPixels,estimateLineHeight,growToInk} from '../ocr-image';
import {prepareOcrImage} from './ocr-prepare';
import {createWorker,PSM,type Worker as OcrEngine,type LoggerMessage} from 'tesseract.js';
import type {TextRegion} from '../text-regions';
import type {OcrScript} from '../ai-image';
import {inkMap,estimateSkew} from '../deskew';
import {findSheet,sheetSize} from '../page-quad';
import {unwarpPixels,mapSquare,type XY} from '../perspective';
import {settleMarks} from '../glyph-edit';
import {frameOf,turn} from '../ocr-regions';
import {typesetRegions} from '../ocr-typography';

export type OcrProgress=(fraction:number,label:string)=>void;
export type OcrReader='tesseract'|'paddle';
export type OcrOptions={signal?:AbortSignal;grouping?:OcrGrouping;languages?:string[];engine?:OcrReader;onProgress?:OcrProgress;thorough?:boolean;script?:OcrScript|'auto';accurate?:boolean;deskew?:boolean;flatten?:boolean};

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

// A tilted page is read straightened: the AI recognizer cuts each line out
// as a level rectangle, so even 1.2° of tilt made it miss three words in
// four. Each region keeps its level box and letter cells, moved to where its
// centre lies on the original, and the tilt as its angle: turned by it, the
// box covers the line's ink (a level box missed 9-14% of it) and letters can
// be edited on a copy levelled the same way (detected-text.ts). The levelled
// copy is softer than the photo: boxes first grow over their letters' faint
// rows and columns (on an invented invoice photo they covered 89% of the
// ink, 98% after), and commas and full stops get back the columns a
// neighbouring letter's cell took from them.
export async function recognizeImage(image:HTMLCanvasElement,options:OcrOptions={}):Promise<TextRegion[]>{
 options.signal?.throwIfAborted();
 const sheet=options.flatten===false||options.deskew===false?undefined:pageSheet(image);
 if(sheet)return readSheet(image,sheet,options);
 const tilt=options.deskew===false?undefined:pageTilt(image);
 if(!tilt)return recognizeLevel(image,options);
 const {canvas,toOriginal}=levelled(image,tilt),pixels=canvas.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,canvas.width,canvas.height);
 return (await recognizeLevel(canvas,options)).map(r=>{
  const bg=[1,3,5].map(i=>parseInt((r.background||'#ffffff').slice(i,i+2),16)),b=growToInk(pixels,{x0:r.left,y0:r.top,x1:r.left+r.width,y1:r.top+r.height},bg),width=b.x1-b.x0,height=b.y1-b.y0;
  const c=toOriginal(b.x0+width/2,b.y0+height/2),dx=c.x-(b.x0+width/2),dy=c.y-(b.y0+height/2),glyphs=r.glyphs&&markCells(pixels,r,bg);
  return {...r,left:b.x0+dx,top:b.y0+dy,width,height,baseline:r.baseline+dy,angle:tilt,...(glyphs?{glyphs:glyphs.map(g=>({...g,x0:g.x0+dx,x1:g.x1+dx}))}:{})};
 }).filter(r=>r.left+r.width>0&&r.top+r.height>0&&r.left<image.width&&r.top<image.height);
}
// Letter cells with commas and full stops settled (glyph-edit.ts): ink per
// column of the region's box, above and below 60% of its height.
function markCells(img:ImageData,r:TextRegion,bg:number[]){
 if(!r.glyphs!.some(g=>g.ch===','||g.ch==='.'))return r.glyphs;
 const {data,width}=img,x0=Math.max(0,Math.floor(r.left)),x1=Math.min(width,Math.ceil(r.left+r.width)),y0=Math.max(0,Math.floor(r.top)),y1=Math.min(img.height,Math.ceil(r.top+r.height)),split=Math.round(y0+(y1-y0)*.6);
 const contrast=(x:number,y:number)=>{const i=(y*width+x)*4;return Math.max(Math.abs(data[i]-bg[0]),Math.abs(data[i+1]-bg[1]),Math.abs(data[i+2]-bg[2]));};
 let peak=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)peak=Math.max(peak,contrast(x,y));
 const t=Math.max(40,peak*.45),upper=new Float32Array(x1-x0),lower=new Float32Array(x1-x0);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(contrast(x,y)>t)(y<split?upper:lower)[x-x0]++;
 return settleMarks(r.glyphs!,upper,lower,x0);
}
// A sheet photographed at an angle on a darker surface (page-quad.ts), found
// on a copy at most 600 px across; corners in the image's pixels.
export function pageSheet(image:HTMLCanvasElement){
 const k=Math.min(1,600/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*k)),h=Math.max(1,Math.round(image.height*k));
 const small=Object.assign(document.createElement('canvas'),{width:w,height:h}),g=small.getContext('2d',{willReadFrequently:true})!;
 g.drawImage(image,0,0,w,h);
 return findSheet(g.getImageData(0,0,w,h).data,w,h)?.map(p=>({x:p.x/k,y:p.y/k}));
}
// Perspective bends each line differently, so a photographed sheet is read
// flattened to a rectangle, then every region is carried back onto the photo
// through the same mapping. Along one line perspective is close to a turn:
// a region becomes the level box, turned along its mapped line, that holds
// its mapped box, with its letter cells mapped along the line, so its letters
// can be edited like a tilted page's. On a level flattened sheet boxes grow
// over faint ink and marks settle first, as on a levelled copy.
async function readSheet(image:HTMLCanvasElement,corners:XY[],options:OcrOptions){
 let {width,height}=sheetSize(corners);const k=Math.min(1,4000/Math.max(width,height));width=Math.max(1,Math.round(width*k));height=Math.max(1,Math.round(height*k));
 const src=image.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,image.width,image.height);
 const flat=Object.assign(document.createElement('canvas'),{width,height}),pixels=new ImageData(unwarpPixels(src,corners,width,height),width,height);
 flat.getContext('2d',{willReadFrequently:true})!.putImageData(pixels,0,0);
 const at=(x:number,y:number)=>mapSquare(corners,x/width,y/height);
 return (await recognizeImage(flat,{...options,flatten:false})).map(r=>{
  const bg=[1,3,5].map(i=>parseInt((r.background||'#ffffff').slice(i,i+2),16)),b=r.angle?{x0:r.left,y0:r.top,x1:r.left+r.width,y1:r.top+r.height}:growToInk(pixels,{x0:r.left,y0:r.top,x1:r.left+r.width,y1:r.top+r.height},bg),cells=r.glyphs&&!r.angle?markCells(pixels,r,bg):r.glyphs;
  // Flattened (possibly tilted) frame -> photo -> the line's turned frame.
  const f=frameOf(r),onPhoto=(x:number,y:number)=>{const p=turn(f,x,y);return at(p.x,p.y);},middle=(b.y0+b.y1)/2,start=onPhoto(b.x0,middle),end=onPhoto(b.x1,middle),centre=onPhoto((b.x0+b.x1)/2,middle);
  const line={angle:Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI,cx:centre.x,cy:centre.y},local=(x:number,y:number)=>{const p=onPhoto(x,y);return turn(line,p.x,p.y,true);};
  const q=[local(b.x0,b.y0),local(b.x1,b.y0),local(b.x1,b.y1),local(b.x0,b.y1)],x0=Math.min(...q.map(p=>p.x)),x1=Math.max(...q.map(p=>p.x)),y0=Math.min(...q.map(p=>p.y)),y1=Math.max(...q.map(p=>p.y));
  // The box's own centre is its turning point.
  const mid=turn(line,(x0+x1)/2,(y0+y1)/2),dx=mid.x-(x0+x1)/2,dy=mid.y-(y0+y1)/2;
  const across=Math.hypot(end.x-start.x,end.y-start.y)/Math.max(1,b.x1-b.x0),down=(y1-y0)/Math.max(1,b.y1-b.y0);
  const {glyphs:_,angle:_angle,...rest}=r;
  return {...rest,left:x0+dx,top:y0+dy,width:x1-x0,height:y1-y0,angle:line.angle,size:r.size*down,baseline:local((b.x0+b.x1)/2,r.baseline).y+dy,
   ...(cells?{glyphs:cells.map(g=>({...g,x0:local(g.x0,middle).x+dx,x1:local(g.x1,middle).x+dx}))}:{}),
   ...(r.words?{words:r.words.map(w=>w.width===undefined?w:{...w,width:w.width*across})}:{}),
   ...(r.line?{line:{...r.line,words:r.line.words.map(w=>w.width===undefined?w:{...w,width:w.width*across})}}:{})};
 });
}
// Clockwise tilt of the page's text in degrees, when clear enough to correct.
export function pageTilt(image:HTMLCanvasElement){
 const k=Math.min(1,1000/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*k)),h=Math.max(1,Math.round(image.height*k));
 const small=Object.assign(document.createElement('canvas'),{width:w,height:h}),g=small.getContext('2d',{willReadFrequently:true})!;
 g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(image,0,0,w,h);
 const result=estimateSkew(inkMap(g.getImageData(0,0,w,h).data,w,h),w,h);
 // Below 0.5° a page is straightened only when its lines drift by 6 px or more
 // across its width: at 0.4° a long scanned line drifts half its height and is misread.
 if(!result||result.confidence<1.3)return undefined;
 const angle=Math.abs(result.angle);
 return angle>=.5||angle>=.2&&image.width*Math.tan(angle*Math.PI/180)>=6?result.angle:undefined;
}
// The image turned back by `tilt` on a canvas large enough for its corners,
// filled with the page's own background colour.
function levelled(image:HTMLCanvasElement,tilt:number){
 const t=-tilt*Math.PI/180,cos=Math.abs(Math.cos(t)),sin=Math.abs(Math.sin(t));
 const W=Math.ceil(image.width*cos+image.height*sin),H=Math.ceil(image.width*sin+image.height*cos);
 const canvas=Object.assign(document.createElement('canvas'),{width:W,height:H}),g=canvas.getContext('2d',{willReadFrequently:true})!;
 const corner=image.getContext('2d')!.getImageData(0,0,1,1).data;
 g.fillStyle=`rgb(${corner[0]},${corner[1]},${corner[2]})`;g.fillRect(0,0,W,H);
 g.translate(W/2,H/2);g.rotate(t);g.drawImage(image,-image.width/2,-image.height/2);
 const back=-t;
 return {canvas,toOriginal:(x:number,y:number)=>{const px=x-W/2,py=y-H/2;return {x:px*Math.cos(back)-py*Math.sin(back)+image.width/2,y:px*Math.sin(back)+py*Math.cos(back)+image.height/2};}};
}

// The background around a word, and whether the word sits on a badge: the
// ring around it is one flat colour (three in four of its pixels within 16
// of the median) and not the colour a line height above and below it (a
// stripe or a road crossing the line goes on there, a badge stops).
function wordBackground(img:ImageData,b:{x0:number;y0:number;x1:number;y1:number}){
 const rgb=sampleBackground(img,b),d=Math.max(4,Math.round((b.y1-b.y0)*.9)),outer=sampleBackground(img,{x0:b.x0,y0:b.y0-d,x1:b.x1,y1:b.y1+d},2);
 const {data,width,height}=img,near=(i:number,c:readonly number[])=>Math.max(Math.abs(data[i]-c[0]),Math.abs(data[i+1]-c[1]),Math.abs(data[i+2]-c[2]))<=16;let flat=0,all=0;
 for(let y=Math.max(0,b.y0-3);y<Math.min(height,b.y1+3);y++)for(let x=Math.max(0,b.x0-3);x<Math.min(width,b.x1+3);x++){if(x>=b.x0-1&&x<b.x1+1&&y>=b.y0-1&&y<b.y1+1)continue;all++;if(near((y*width+x)*4,rgb))flat++;}
 return {rgb,badge:flat>=all*.75&&Math.max(...[0,1,2].map(c=>Math.abs(outer[c]-rgb[c])))>=16};
}

async function recognizeLevel(image:HTMLCanvasElement,{signal,grouping='smart',languages=['eng','fra'],engine:ocrEngine='tesseract',onProgress,thorough=false,script='auto',accurate=false}:OcrOptions={}):Promise<TextRegion[]>{
 let resolve!:(v:TextRegion[])=>void,reject!:(e:unknown)=>void;const result=new Promise<TextRegion[]>((yes,no)=>{resolve=yes;reject=no;});
 queue=queue.then(async()=>{try{
  signal?.throwIfAborted();
  let lines:{script?:OcrScript;text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number};words?:{text:string;confidence?:number;bbox:{x0:number;y0:number;x1:number;y1:number};chars?:{ch:string;x0:number;x1:number;p?:number;c?:number}[]}[]}[],sx=1,sy=1;
  if(ocrEngine==='paddle'){
   // PaddleOCR (bundled AI models) reads the original pixels; its Latin model
   // covers all bundled languages at once, other alphabets have their own.
   // Small text is enlarged first: 1.5x for ordinary page text (inked rows
   // under 22 px), up to 3x for tiny print (5 px or less). On the benchmark
   // (scripts/ocr-bench.mjs) 1.5x lifted words read on a phone photo from 77%
   // to 88% and on small print from 92% to 100%; more than that lost word
   // spaces, except on the tiniest print, which went from 51% to 76% at 3x.
   onProgress?.(0,'Loading AI OCR models');const {paddleOcr}=await import('./ai-tools');
   const probe=image.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,image.width,image.height);prepareOcrPixels(probe);
   const lineHeight=estimateLineHeight(probe),k=lineHeight&&lineHeight<22?Math.max(1,Math.min(lineHeight<=5?3:1.5,28/lineHeight,Math.sqrt(12e6/(image.width*image.height)))):1;
   let input=image;
   if(k>1.05){input=Object.assign(document.createElement('canvas'),{width:Math.round(image.width*k),height:Math.round(image.height*k)});const g=input.getContext('2d',{willReadFrequently:true})!;g.imageSmoothingQuality='high';g.drawImage(image,0,0,input.width,input.height);}
   lines=(await paddleOcr(input,(f,label)=>onProgress?.(f,label||'Recognizing text (AI)'),signal,{script,accurate})).filter(l=>l.confidence>=35);
   sx=image.width/input.width;sy=image.height/input.height;
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
   // A badge next to a label is a field of its own (left-to-right lines).
   const parts=segmentOcrLine(line,grouping).flatMap(part=>grouping==='words'||line.script==='arabic'?[part]:splitAtBackgrounds(part,part.words.map(w=>wordBackground(original,scaleBox(w.bbox)))));
   for(const part of parts){
    const start=part.words.length?lineWords.findIndex(g=>g.bbox.x0===part.words[0].bbox.x0&&g.bbox.y0===part.words[0].bbox.y0):-1;
    const lineContext=measured.length>1&&start>=0?{words:measured,start,count:part.words.length}:undefined;
    const b={x0:Math.max(0,Math.floor(part.bbox.x0*sx)),y0:Math.max(0,Math.floor(part.bbox.y0*sy)),x1:Math.min(image.width,Math.ceil(part.bbox.x1*sx)),y1:Math.min(image.height,Math.ceil(part.bbox.y1*sy))},w=b.x1-b.x0,h=b.y1-b.y0;if(w<1||h<1)continue;
    const rgb=sampleBackground(original,b),light=rgb[0]+rgb[1]+rgb[2]>384,ink=estimateTextColor(original,b,rgb);
    const edge=edgeWidth(original,b,rgb),blur=edge===undefined?undefined:blurFromEdgeWidth(edge);
    // Per-word ink lets a bold label and regular value share one line (see ocr-weight.ts).
    const words=part.words.length>1?part.words.map(word=>{const x0=Math.max(0,Math.floor(word.bbox.x0*sx)),y0=Math.max(0,Math.floor(word.bbox.y0*sy)),x1=Math.min(image.width,Math.ceil(word.bbox.x1*sx)),y1=Math.min(image.height,Math.ceil(word.bbox.y1*sy)),box={x0,y0,x1,y1};return {text:word.text.trim(),width:x1-x0,inkMass:inkMass(original,box,rgb,Math.min(3,Math.ceil((blur??0)*2))),inkDensity:x1>x0&&y1>y0?inkDensity(ctx.getImageData(x0,y0,x1-x0,y1-y0).data,rgb):undefined};}):undefined;
    regions.push({id:'ocr-'+regions.length,...line.script&&line.script!=='latin'?{script:line.script}:{},text:part.text,left:b.x0,top:b.y0,width:w,height:h,size:h/.75,baseline:b.y1,fontName:'Image text (font unknown)',bold:false,italic:false,color:ink?toHex(ink):light?'#151515':'#ffffff',kind:'ocr',confidence:part.confidence??line.confidence,background:toHex(rgb),inkDensity:inkDensity(ctx.getImageData(b.x0,b.y0,w,h).data,rgb),words,blur,line:lineContext,glyphs:part.words.length&&part.words.every(w=>w.chars?.length)?part.words.flatMap(w=>w.chars!.map(g=>({ch:g.ch,x0:g.x0*sx,x1:g.x1*sx,p:g.p,...g.c===undefined?{}:{c:g.c*sx}}))):undefined});
   }
  }
  // Typographic marks and unread symbols, from each cell's ink (ocr-typography.ts).
  resolve(typesetRegions(regions.slice(0,2000),original));
 }catch(e){reject(e);}finally{report=undefined;}});return result;
}
