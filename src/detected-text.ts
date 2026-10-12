// Detecting page text (PDF text layer, else local OCR) and turning a detected
// region into an editable text layer with a background patch.
import {FabricImage,Rect,type Canvas,type FabricObject} from 'fabric';
import {Textbox} from './text-appearance';
import {detectPdfText,pagePreview} from './browser/engine';
import {pageRaster,rasterLayer} from './retouch-canvas';
import {repairTextBackground} from './text-replacement';
import {estimateOcrBold} from './ocr-weight';
import {ensureFont,ensureEmbeddedFont} from './fonts';
import {fallbackFont,fitOcrText,type TextRegion} from './text-regions';
import {mixedWeights,recognitionKey,scaleRegions,unconvertedRegions,ocrPatchBounds,ocrScanStatus,isUncertain} from './ocr-regions';
import type {OcrGrouping} from './ocr-segmentation';
import {uid,type Page} from './model';
import {bundledOcrLanguages,languageLabel} from './ocr-languages';

type Tagged=FabricObject&{recognizedKey?:string;id?:string;name?:string};
export type ReplacementBackground='repair'|'sampled'|'solid'|'transparent';

async function previewCanvas(source:string,index:number,scale:number,width?:number,height?:number){
 const image=new Image();image.src=await pagePreview(source,index,scale);await image.decode();
 const canvas=document.createElement('canvas');canvas.width=width??image.width;canvas.height=height??image.height;canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}

// Page raster for OCR, flattened onto the page colour and capped at 3600px.
async function ocrRaster(p:Page,c:Canvas){
 const source=p.source?await previewCanvas(p.source,p.index,Math.min(4,3600/Math.max(p.width,p.height))):pageRaster(c,p.width,p.height,c.getObjects().filter(o=>o instanceof FabricImage),2400);
 const ratio=Math.min(1,3600/Math.max(source.width,source.height)),reduced=document.createElement('canvas');reduced.width=Math.round(source.width*ratio);reduced.height=Math.round(source.height*ratio);
 const ctx=reduced.getContext('2d')!;ctx.fillStyle=p.color==='transparent'?'#ffffff':p.color;ctx.fillRect(0,0,reduced.width,reduced.height);ctx.drawImage(source,0,0,reduced.width,reduced.height);return reduced;
}

export function hasScannableContent(p:Page,c:Canvas){return !!p.source||c.getObjects().some(o=>o instanceof FabricImage);}

export async function scanPageText(p:Page,c:Canvas,{signal,grouping,thorough,languages,onStatus}:{signal:AbortSignal;grouping:OcrGrouping;thorough:boolean;languages:string[];onStatus:(status:string)=>void}):Promise<{regions:TextRegion[];status:string;suggestedFont?:string}>{
 onStatus('Detecting text…');
 if(p.source){const detected=await detectPdfText(p.source,p.index);signal.throwIfAborted();if(detected.regions.length)return {regions:detected.regions,status:`${detected.regions.length} editable text regions${detected.skipped?' · rotated text kept unchanged':''}`};}
 onStatus('Recognizing image text locally…');
 const raster=await ocrRaster(p,c);signal.throwIfAborted();
 const {recognizeImage}=await import('./browser/ocr');const detected=await recognizeImage(raster,{signal,grouping,thorough,languages,onProgress:(fraction,label)=>onStatus(`${label}… ${Math.round(fraction*100)}%`)});signal.throwIfAborted();
 const layers=c.getObjects().map(o=>({recognizedKey:(o as Tagged).recognizedKey,bounds:o.getBoundingRect()}));
 const regions=unconvertedRegions(scaleRegions(detected,p.width/raster.width,p.height/raster.height),layers);
 let suggestedFont:string|undefined;
 if(regions.length){onStatus('Matching font…');try{suggestedFont=await suggestFont(raster,detected);}catch{}signal.throwIfAborted();}
 return {regions,suggestedFont,status:ocrScanStatus(regions.length,languageLabel(languages,await bundledOcrLanguages()),layers.some(l=>l.recognizedKey),regions.filter(isUncertain).length)+(suggestedFont?` · closest font: ${suggestedFont}`:'')};
}

// Compare the clearest recognized words against bundled fonts. Only confident
// regions are used: a misread character skews the shape comparison.
async function suggestFont(raster:HTMLCanvasElement,regions:TextRegion[]){
 const ctx=raster.getContext('2d',{willReadFrequently:true})!;
 const samples=regions.filter(r=>(r.confidence??0)>=85&&r.text.replace(/\s/g,'').length>=4&&r.height>=8).sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,6).map(r=>{
  const left=Math.max(0,Math.floor(r.left-2)),top=Math.max(0,Math.floor(r.top-2)),width=Math.min(raster.width-left,Math.ceil(r.width+4)),height=Math.min(raster.height-top,Math.ceil(r.height+4));
  const hex=r.background||'#ffffff';return {text:r.text,pixels:ctx.getImageData(left,top,width,height),background:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))};
 });
 if(!samples.length)return undefined;
 const {suggestOcrFont}=await import('./ocr-font');return (await suggestOcrFont(samples))?.family;
}

// Editable text positioned so its first baseline matches the detected text.
export async function detectedTextbox(region:TextRegion,{ocrFont,ocrStyle}:{ocrFont:string;ocrStyle:string}){
 let family=region.kind==='ocr'?ocrFont:fallbackFont(region.fontName),embedded=false;
 if(region.fontData&&region.fontId){try{await ensureEmbeddedFont(region.fontId,region.fontData);family=region.fontId;embedded=true;}catch{}}
 await ensureFont(family);
 const italic=region.kind==='ocr'?ocrStyle.includes('italic'):region.italic,words=region.words;
 // Auto weight is estimated per word so mixed bold/regular lines keep both.
 const weights=region.kind==='ocr'&&ocrStyle==='auto'&&words&&words.length>1&&words.map(w=>w.text).join(' ')===region.text?mixedWeights(words,words.map(w=>w.inkDensity===undefined||!/[\p{L}\p{N}]/u.test(w.text)?undefined:estimateOcrBold(w.text,family,region.height,w.inkDensity))):undefined;
 const bold=weights?weights.base:region.kind==='ocr'?(ocrStyle==='auto'?estimateOcrBold(region.text,family,region.height,region.inkDensity):ocrStyle.includes('bold')):region.bold;
 let size=region.size,ocrAscent=region.height;
 if(region.kind==='ocr'){
  const ctx=document.createElement('canvas').getContext('2d')!,font=(b:boolean)=>`${italic?'italic ':''}${b?'bold ':''}100px "${family}"`;ctx.font=font(bold);const metrics=ctx.measureText(region.text);
  let width=metrics.width;
  if(weights?.ranges.length){width=0;let offset=0;for(const w of words!){const own=weights.ranges.find(r=>offset>=r.start&&offset<r.end);ctx.font=font(own?own.bold:bold);width+=ctx.measureText(w.text).width;offset+=Array.from(w.text).length+1;}ctx.font=font(bold);width+=ctx.measureText(' ').width*(words!.length-1);}
  const fit=fitOcrText(region,{width,actualBoundingBoxAscent:metrics.actualBoundingBoxAscent,actualBoundingBoxDescent:metrics.actualBoundingBoxDescent});size=fit.size;ocrAscent=fit.ascent;
 }
 const text=Object.assign(new Textbox(region.text,{left:region.left,top:region.top,width:Math.max(region.width+4,20),fontSize:size,fontFamily:family,fontWeight:embedded?'normal':bold?'bold':'normal',fontStyle:embedded?'normal':italic?'italic':'normal',fill:region.color,lineHeight:1,splitByGrapheme:true,objectCaching:false}),{id:uid(),name:region.text.slice(0,40),pdfOriginalFont:region.fontName,pdfFontData:embedded?region.fontData:undefined,pdfFontFallback:fallbackFont(region.fontName),pdfFontBold:bold,pdfFontItalic:italic,recognizedKey:recognitionKey(region)});
 for(const r of weights?.ranges??[])text.setSelectionStyles({fontWeight:r.bold?'bold':'normal'},r.start,r.end);
 // Fabric's top includes its ascender allowance; anchor the first baseline.
 text.top=region.kind==='pdf'?region.baseline-region.size*.93:region.top+ocrAscent-size*.93;
 return {text,embedded};
}

// Hide the original OCR text by clearing, repairing or patching the area under it.
// Mutates the serialized `objects` list of the page.
export async function coverOcrText(c:Canvas,p:Page,region:TextRegion,objects:unknown[],{mode,color,padding}:{mode:ReplacementBackground;color:string;padding:number}){
 const {left,top,width,height}=ocrPatchBounds(region,padding,p);
 if(mode==='transparent'){
  const images=c.getObjects().filter(o=>o instanceof FabricImage&&o.visible&&(()=>{const b=o.getBoundingRect();return b.left<left+width&&b.top<top+height&&b.left+b.width>left&&b.top+b.height>top;})());
  if(!images.length)throw new Error('Select image text to clear its background.');
  if(images.some(o=>o.lockMovementX))throw new Error('Unlock the image layers beneath this text first.');
  for(const image of images){
   const blend=image.globalCompositeOperation;let raster:HTMLCanvasElement;try{image.globalCompositeOperation='source-over';raster=pageRaster(c,p.width,p.height,[image]);}finally{image.globalCompositeOperation=blend;}raster.getContext('2d')!.clearRect(left,top,width,height);
   const replacement=rasterLayer(raster,(image as Tagged).name||'Image',(image as Tagged).id!),index=objects.findIndex(o=>(o as Tagged).id===(image as Tagged).id);
   if(index>=0){if(replacement){replacement.globalCompositeOperation=blend;objects[index]=replacement.toObject();}else objects.splice(index,1);}
  }
 }else if(mode==='repair'){
  const raster=p.source?await previewCanvas(p.source,p.index,1,Math.ceil(p.width),Math.ceil(p.height)):pageRaster(c,p.width,p.height,c.getObjects().filter(o=>o instanceof FabricImage));
  const repaired=repairTextBackground(raster.getContext('2d')!.getImageData(0,0,raster.width,raster.height),{left,top,width,height});
  const patchCanvas=document.createElement('canvas');patchCanvas.width=repaired.width;patchCanvas.height=repaired.height;const context=patchCanvas.getContext('2d')!,pixels=context.createImageData(repaired.width,repaired.height);pixels.data.set(repaired.data);context.putImageData(pixels,0,0);
  objects.push(Object.assign(new FabricImage(patchCanvas,{left:repaired.left,top:repaired.top}),{id:uid(),name:'Repaired text background'}).toObject());
 }else objects.push(Object.assign(new Rect({left,top,width,height,fill:mode==='solid'?color:region.background||'#ffffff',strokeWidth:0}),{id:uid(),name:'Text background patch'}).toObject());
}
