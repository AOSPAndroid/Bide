// Real-ESRGAN upscaling, LaMa inpainting and PaddleOCR recognition on canvases.
import {runModel} from './ai';
import {segmentGlyphs,type Glyph} from '../glyph-edit';
import {tilePlan,toPlanar,dbBoxes,ctcDecode,ctcWords,trimToInk,growToInk,inkBand,inpaintWindows,resizeBilinear,snapToGap,rtlReorder,separateLetters,ocrScripts,pickMask,mergeLineBoxes,type Rect,type OcrScript} from '../ai-image';

type Progress=(fraction:number)=>void;
const canvas=(width:number,height:number)=>Object.assign(document.createElement('canvas'),{width,height});
const context=(c:HTMLCanvasElement)=>c.getContext('2d',{willReadFrequently:true})!;
function scaled(source:CanvasImageSource,sx:number,sy:number,sw:number,sh:number,width:number,height:number,quality:ImageSmoothingQuality='high'){
 const out=canvas(width,height),ctx=context(out);ctx.imageSmoothingQuality=quality;ctx.drawImage(source,sx,sy,sw,sh,0,0,width,height);return out;
}

// Real-ESRGAN (general x4v3) on 128px tiles. factor 2 renders at 4x and halves,
// which is sharper than a native 2x pass with this model. Transparency is kept
// by upscaling the alpha channel conventionally.
export async function upscaleCanvas(source:HTMLCanvasElement,factor:2|4=2,onProgress?:Progress,signal?:AbortSignal){
 const {width,height}=source,src=context(source).getImageData(0,0,width,height),out=canvas(width*4,height*4),octx=context(out),tiles=tilePlan(width,height);
 let done=0;
 for(const {read,inner} of tiles){
  const rgba=new Uint8ClampedArray(read.width*read.height*4);
  for(let y=0;y<read.height;y++)rgba.set(src.data.subarray(((read.y+y)*width+read.x)*4,((read.y+y)*width+read.x+read.width)*4),y*read.width*4);
  const result=(await runModel('realesr-general-x4v3',{input:{data:toPlanar(rgba,read.width,read.height),dims:[1,3,read.height,read.width]}},signal)).output;
  const ow=read.width*4,oh=read.height*4,n=ow*oh,tile=new ImageData(inner.width*4,inner.height*4),ox=(inner.x-read.x)*4,oy=(inner.y-read.y)*4;
  for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){const i=(oy+y)*ow+ox+x,o=(y*tile.width+x)*4;for(let c=0;c<3;c++)tile.data[o+c]=Math.max(0,Math.min(255,result.data[c*n+i]*255));tile.data[o+3]=255;}
  octx.putImageData(tile,inner.x*4,inner.y*4);onProgress?.(++done/tiles.length);
 }
 if(src.data.some((v,i)=>i%4===3&&v<255)){octx.globalCompositeOperation='destination-in';octx.imageSmoothingQuality='high';octx.drawImage(source,0,0,out.width,out.height);octx.globalCompositeOperation='source-over';}
 return factor===4?out:scaled(out,0,0,out.width,out.height,width*2,height*2);
}

// LaMa fills `mask` (alpha > 0 = hole) in `source`. Holes are grouped into
// 512px windows with surrounding context; each result is returned as a patch
// covering its holes (with original pixels around them), ready to add as a layer.
export async function inpaintCanvas(source:HTMLCanvasElement,mask:HTMLCanvasElement,holes:Rect[],onProgress?:Progress,signal?:AbortSignal){
 const patches:{canvas:HTMLCanvasElement;x:number;y:number}[]=[],windows=inpaintWindows(holes,source.width,source.height);let done=0;
 for(const {rects,crop} of windows){
  const image=context(scaled(source,crop.x,crop.y,crop.width,crop.height,512,512)).getImageData(0,0,512,512);
  const holeMask=context(scaled(mask,crop.x,crop.y,crop.width,crop.height,512,512)).getImageData(0,0,512,512),m=new Float32Array(512*512);
  for(let i=0;i<m.length;i++)m[i]=holeMask.data[i*4+3]>8?1:0;
  const filled=(await runModel('lama',{image:{data:toPlanar(image.data,512,512),dims:[1,3,512,512]},mask:{data:m,dims:[1,1,512,512]}},signal)).output;
  const result=new ImageData(512,512),n=512*512;
  for(let i=0;i<n;i++){for(let c=0;c<3;c++)result.data[i*4+c]=Math.max(0,Math.min(255,filled.data[c*n+i]));result.data[i*4+3]=255;}
  const filled512=canvas(512,512);context(filled512).putImageData(result,0,0);
  const back=scaled(filled512,0,0,512,512,crop.width,crop.height);
  // Keep only the holes (slightly feathered by the mask's own edges).
  const x0=Math.max(crop.x,Math.floor(Math.min(...rects.map(r=>r.x))-2)),y0=Math.max(crop.y,Math.floor(Math.min(...rects.map(r=>r.y))-2));
  const x1=Math.min(crop.x+crop.width,Math.ceil(Math.max(...rects.map(r=>r.x+r.width))+2)),y1=Math.min(crop.y+crop.height,Math.ceil(Math.max(...rects.map(r=>r.y+r.height))+2));
  const patch=canvas(x1-x0,y1-y0),pctx=context(patch);
  pctx.drawImage(mask,x0,y0,patch.width,patch.height,0,0,patch.width,patch.height);pctx.globalCompositeOperation='source-in';pctx.drawImage(back,x0-crop.x,y0-crop.y,patch.width,patch.height,0,0,patch.width,patch.height);
  patches.push({canvas:patch,x:x0,y:y0});onProgress?.(++done/windows.length);
 }
 return patches;
}

export type AiOcrLine={script:OcrScript;text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number};words:{text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number};chars?:Glyph[]}[]};
const dictionaries=new Map<OcrScript,Promise<string[]>>();
const dictionary=(script:OcrScript)=>{
 let d=dictionaries.get(script);
 if(!d){d=fetch(new URL(`ai/models/ppocr-${script}-dict.json`,document.baseURI)).then(r=>{if(!r.ok)throw new Error('PaddleOCR dictionary is not bundled with this build.');return r.json();});d.catch(()=>dictionaries.delete(script));dictionaries.set(script,d);}
 return d;
};
// A line the Latin model reads with less confidence than this is also tried
// with the other alphabets when the script is automatic.
const sureRead=.8;
// Lines read with less confidence than this get a second look.
const retryBelow=.93;

// PaddleOCR PP-OCRv5: DB text detection (mobile, or the larger server model
// for high accuracy), then recognition per line with word boxes recovered
// from CTC time steps and trimmed to the inked columns. With `script` 'auto'
// the first unsure lines are tried with every alphabet, and the page's
// alphabet, once found, is tried first for the rest.
export async function paddleOcr(source:HTMLCanvasElement,onProgress?:Progress,signal?:AbortSignal,{script='auto',accurate=false}:{script?:OcrScript|'auto';accurate?:boolean}={}):Promise<AiOcrLine[]>{
 const {width,height}=source,src=context(source).getImageData(0,0,width,height);
 const scale=Math.min(1,1600/Math.max(width,height)),dw=Math.max(32,Math.round(width*scale/32)*32),dh=Math.max(32,Math.round(height*scale/32)*32);
 const detInput={data:resizeBilinear(src.data,width,height,dw,dh)};
 const prob=(await runModel(accurate?'ppocr-det-server':'ppocr-det',{x:{data:toPlanar(detInput.data,dw,dh,{mean:[.485,.456,.406],std:[.229,.224,.225],bgr:true}),dims:[1,3,dh,dw]}},signal));
 const boxes=mergeLineBoxes(dbBoxes(Object.values(prob)[0].data,dw,dh)),lines:AiOcrLine[]=[];onProgress?.(.1);
 let pageScript:OcrScript|undefined=script==='auto'?undefined:script,probes=0;
 for(const [k,b] of boxes.entries()){
   // Widen the crop a little: on soft or textured backgrounds the detector can
  // start a line just inside its first letter.
  const margin=(b.y1-b.y0)*height/dh*.25;
  const x0=Math.max(0,Math.floor(b.x0*width/dw-margin)),y0=Math.max(0,Math.floor(b.y0*height/dh)),x1=Math.min(width,Math.ceil(b.x1*width/dw+margin)),y1=Math.min(height,Math.ceil(b.y1*height/dh)),w=x1-x0,h=y1-y0;
  if(w<4||h<4)continue;
  // The recognizer's input: rows [top, bottom) of the line's columns, 48 px
  // high, optionally `stretch`ed wider.
  const crop=(top:number,bottom:number,stretch=1)=>{
   const ch=bottom-top,rw=Math.max(16,Math.min(3200,Math.round(w*48/ch*stretch))),region=new Uint8ClampedArray(w*ch*4);
   for(let y=0;y<ch;y++)region.set(src.data.subarray(((top+y)*width+x0)*4,((top+y)*width+x1)*4),y*w*4);
   return {rw,data:toPlanar(resizeBilinear(region,w,ch,rw,48),rw,48,{mean:[.5,.5,.5],std:[.5,.5,.5],bgr:true})};
  };
  let input=crop(y0,y1);
  const read=async(s:OcrScript,from=input)=>{
   const dict=await dictionary(s),out=Object.values(await runModel(`ppocr-${s}-rec`,{x:{data:from.data.slice(),dims:[1,3,48,from.rw]}},signal))[0];
   const [,steps,classes]=out.dims;return {script:s,steps,rw:from.rw,...ctcDecode(out.data,steps,classes,dict)};
  };
  let best=await read(pageScript??'latin');
  // An unsure line is read again 15% wider, which separates cramped small
  // letters; the clearly surer reading is kept. On the benchmark this lifted
  // words found in tiny print from 76% to 85% (extra room above and below
  // the line was also tried, and lowered the phone photo's score).
  if(best.text&&best.confidence<retryBelow){
   const wide=crop(y0,y1,1.15),next=await read(best.script,wide);
   if(next.text&&next.confidence>best.confidence+.02){best=next;input=wide;}
  }
  // An empty read (only spaces) is unsure too, however confident, and so is
  // one with non-Latin letters (the Latin model knows Greek for formulas). A
  // single look-alike letter (a circle read as Ο) is not enough to switch.
  if(script==='auto'&&(!best.text||best.confidence<sureRead||(best.text.match(/(?!\p{Script=Latin})\p{L}/gu)?.length??0)>=2)){
   const others=pageScript?['latin' as const]:probes++<4?ocrScripts.filter(s=>s!=='latin'):[];
   for(const s of others){const next=await read(s);if(next.text&&(!best.text||next.confidence>best.confidence+.05))best=next;}
   if(!pageScript&&best.script!=='latin'&&best.confidence>=sureRead&&(best.text.match(/\p{L}/gu)?.length??0)>=3)pageScript=best.script;
  }
  // Digits and punctuation read by another alphabet's model are still Latin text.
  if(best.script!=='latin'&&!/(?!\p{Script=Latin})\p{L}/u.test(best.text))best={...best,script:'latin'};
  const decoded=best,steps=best.steps,rw=best.rw,rtl=best.script==='arabic';
  if(decoded.text){
   // Column ink inside the line (contrast with the line's corner colour) to tighten word boxes.
   // The detector pads its boxes; trim lines and words to inked rows/columns
   // (contrast with the box corner, which lies in the padding) so text sizing
   // and background patches follow the letters.
   const corner=(y0*width+x0)*4,bg=[src.data[corner],src.data[corner+1],src.data[corner+2]],columns=new Float32Array(w),rows=new Float32Array(h);
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*width+x)*4,ink=Math.max(Math.abs(src.data[i]-bg[0]),Math.abs(src.data[i+1]-bg[1]),Math.abs(src.data[i+2]-bg[2]))>60?1:0;columns[x-x0]+=ink;rows[y-y0]+=ink;}
   const vertical=inkBand(rows,((b.y0+b.y1)/2)*height/dh-y0),top=y0+vertical.x0,bottom=y0+vertical.x1;
   // Word edges: snap boundaries to the blank gap between words, trim to ink,
   // then give each word its own inked rows (a word without descenders must
   // not inherit the line's full height, or its replacement is sized too big).
   // Columns over the line's own rows only, so a neighbouring line inside the
   // padded box does not fill the blank columns between letters.
   const bandColumns=new Float32Array(w);for(let y=top;y<bottom;y++)for(let x=x0;x<x1;x++){const p=(y*width+x)*4;bandColumns[x-x0]+=Math.max(Math.abs(src.data[p]-bg[0]),Math.abs(src.data[p+1]-bg[1]),Math.abs(src.data[p+2]-bg[2]))>60?1:0;}
   const lineHeight=bottom-top,gap=Math.max(2,Math.round(lineHeight*.15)),raw=ctcWords(decoded.chars,rw/steps,rw).map(w=>rtl?{...w,text:rtlReorder(w.text)}:w);
   const edges=raw.map((word,i)=>({x0:i?snapToGap(columns,word.x0*w/rw,gap,lineHeight):growToInk(columns,word.x0*w/rw,-1,lineHeight/2),x1:i<raw.length-1?snapToGap(columns,word.x1*w/rw,gap,lineHeight):growToInk(columns,word.x1*w/rw,1,lineHeight/2)}));
   const words=raw.map((word,i)=>{
    const t=trimToInk(columns,edges[i].x0,edges[i].x1),wordRows=new Float32Array(h);
    for(let y=top;y<bottom;y++)for(let x=x0+t.x0;x<x0+t.x1;x++){const p=(y*width+x)*4;wordRows[y-y0]+=Math.max(Math.abs(src.data[p]-bg[0]),Math.abs(src.data[p+1]-bg[1]),Math.abs(src.data[p+2]-bg[2]))>60?1:0;}
    const v=trimToInk(wordRows,top-y0,bottom-y0);
    // Character cells, for editing with the image's own letters (glyph-edit.ts).
    // Each letter keeps the recognizer's probability, to flag doubtful ones.
    const chars=separateLetters(best.script)?segmentGlyphs(word.text,word.centers.map(c=>c*w/rw),t.x0,t.x1,bandColumns)?.map((g,k)=>({...g,x0:x0+g.x0,x1:x0+g.x1,p:word.probs[k]})):undefined;
    return {text:word.text,confidence:word.confidence,bbox:{x0:x0+t.x0,y0:y0+v.x0,x1:x0+t.x1,y1:y0+v.x1},chars};
   });
   lines.push({script:best.script,text:rtl?rtlReorder(decoded.text):decoded.text,confidence:decoded.confidence*100,bbox:{x0:words.length?Math.min(...words.map(w=>w.bbox.x0)):x0,y0:top,x1:words.length?Math.max(...words.map(w=>w.bbox.x1)):x1,y1:bottom},words});
  }
  onProgress?.(.1+.9*(k+1)/boxes.length);
 }
 return lines;
}

// ISNet (general use, int8) finds the main subject. Returns a 1024×1024 map
// (0-255, higher = subject) for `source`, stretched to its aspect when used.
// Transparent areas are judged against white.
export async function segmentSubject(source:HTMLCanvasElement,signal?:AbortSignal){
 const S=1024,flat=canvas(source.width,source.height),f=context(flat);f.fillStyle='#fff';f.fillRect(0,0,flat.width,flat.height);f.drawImage(source,0,0);
 const small=resizeBilinear(f.getImageData(0,0,flat.width,flat.height).data,flat.width,flat.height,S,S);
 const out=(await runModel('isnet',{input_image:{data:toPlanar(small,S,S,{mean:[.5,.5,.5]}),dims:[1,3,S,S]}},signal)).output_image.data;
 let lo=Infinity,hi=-Infinity;for(const v of out){if(v<lo)lo=v;if(v>hi)hi=v;}
 const values=new Uint8ClampedArray(S*S),range=hi-lo||1;for(let i=0;i<values.length;i++)values[i]=(out[i]-lo)/range*255;
 return {values,width:S,height:S};
}

// PP-LCNet document orientation: how far the page content is turned clockwise
// (0, 90, 180 or 270 degrees) and the model's probability for it. The model
// sees a 224 px centre crop of the page with its short side at 256 px.
export async function detectOrientation(source:HTMLCanvasElement,signal?:AbortSignal){
 const k=256/Math.min(source.width,source.height),w=Math.max(224,Math.round(source.width*k)),h=Math.max(224,Math.round(source.height*k));
 const flat=canvas(w,h),f=context(flat);f.fillStyle='#fff';f.fillRect(0,0,w,h);f.imageSmoothingQuality='high';f.drawImage(source,0,0,w,h);
 const crop=f.getImageData(Math.floor((w-224)/2),Math.floor((h-224)/2),224,224).data;
 const out=Object.values(await runModel('doc-ori',{x:{data:toPlanar(crop,224,224,{mean:[.485,.456,.406],std:[.229,.224,.225]}),dims:[1,3,224,224]}},signal))[0].data;
 let best=0;for(let i=1;i<4;i++)if(out[i]>out[best])best=i;
 return {turn:([0,90,180,270] as const)[best],confidence:out[best]};
}

// UVDoc flattens a photographed page (perspective, curl and tilt) to fill the
// frame. Large photos are processed at up to 2400 px on the long side.
export async function flattenPage(source:HTMLCanvasElement,signal?:AbortSignal){
 const k=Math.min(1,2400/Math.max(source.width,source.height)),w=Math.round(source.width*k),h=Math.round(source.height*k);
 const flat=canvas(w,h),f=context(flat);f.fillStyle='#fff';f.fillRect(0,0,w,h);f.imageSmoothingQuality='high';f.drawImage(source,0,0,w,h);
 const rgba=f.getImageData(0,0,w,h);
 const out=Object.values(await runModel('uvdoc',{image:{data:toPlanar(rgba.data,w,h),dims:[1,3,h,w]}},signal))[0],n=w*h;
 for(let i=0;i<n;i++){for(let c=0;c<3;c++)rgba.data[i*4+c]=Math.max(0,Math.min(255,out.data[c*n+i]*255));rgba.data[i*4+3]=255;}
 f.putImageData(rgba,0,0);return flat;
}

// SlimSAM (Segment Anything, int8): the image is encoded once (a few seconds
// on a CPU), then each click is decoded in a fraction of a second.
export type ObjectEmbedding={image:Float32Array;positional:Float32Array;scale:number;width:number;height:number};
export async function embedForObjects(source:HTMLCanvasElement,signal?:AbortSignal):Promise<ObjectEmbedding>{
 const S=1024,scale=S/Math.max(source.width,source.height),w=Math.round(source.width*scale),h=Math.round(source.height*scale);
 const c=canvas(w,h),g=context(c);g.fillStyle='#fff';g.fillRect(0,0,w,h);g.imageSmoothingQuality='high';g.drawImage(source,0,0,w,h);
 const rgba=g.getImageData(0,0,w,h).data,mean=[.485,.456,.406],std=[.229,.224,.225],input=new Float32Array(3*S*S);// padding stays 0
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;for(let k=0;k<3;k++)input[k*S*S+y*S+x]=(rgba[i+k]/255-mean[k])/std[k];}
 const out=await runModel('sam-encoder',{pixel_values:{data:input,dims:[1,3,S,S]}},signal);
 return {image:out.image_embeddings.data,positional:out.image_positional_embeddings.data,scale,width:source.width,height:source.height};
}
// The object under `points` (source pixels; positive adds, negative excludes)
// as a 0/255 map covering the source at a quarter of the 1024 px model scale.
export async function objectMask(e:ObjectEmbedding,points:{x:number;y:number;positive:boolean}[],signal?:AbortSignal){
 const out=await runModel('sam-decoder',{
  input_points:{data:new Float32Array(points.flatMap(p=>[p.x*e.scale,p.y*e.scale])),dims:[1,1,points.length,2]},
  input_labels:{data:new BigInt64Array(points.map(p=>p.positive?1n:0n)),dims:[1,1,points.length]},
  image_embeddings:{data:e.image.slice(),dims:[1,256,64,64]},image_positional_embeddings:{data:e.positional.slice(),dims:[1,256,64,64]},
 },signal);
 const logits=out.pred_masks.data,scores=Array.from(out.iou_scores.data),M=256,mw=Math.min(M,Math.ceil(e.width*e.scale/4)),mh=Math.min(M,Math.ceil(e.height*e.scale/4));
 const areas=scores.map((_,k)=>{let a=0;for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)if(logits[k*M*M+y*M+x]>0)a++;return a;});
 const k=pickMask(scores,areas),values=new Uint8ClampedArray(mw*mh);
 // SAM's own threshold; scaling the map up to the page smooths its edges.
 for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)values[y*mw+x]=logits[k*M*M+y*M+x]>0?255:0;
 return {values,width:mw,height:mh};
}
