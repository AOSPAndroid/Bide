// Detecting page text (PDF text layer, else local OCR) and turning a detected
// region into an editable text layer with a background patch.
import {FabricImage,Rect,type Canvas,type FabricObject} from 'fabric';
import {Textbox,clampTextSoftness} from './text-appearance';
import {detectPdfText,pagePreview} from './browser/engine';
import {pageRaster,rasterLayer} from './retouch-canvas';
import {repairTextBackground} from './text-replacement';
import {estimateOcrBold,glyphInk,wordInk,classifyWordWeights} from './ocr-weight';
import {darkenToInk,prepareOcrPixels,estimateLineHeight} from './ocr-image';
import {ensureFont,ensureEmbeddedFont} from './fonts';
import {fallbackFont,fitOcrText,type TextRegion} from './text-regions';
import {mixedWeights,recognitionKey,scaleRegions,unconvertedRegions,ocrPatchBounds,ocrScanStatus,isUncertain} from './ocr-regions';
import type {OcrGrouping} from './ocr-segmentation';
import {uid,type Page} from './model';
import {bundledOcrLanguages,languageLabel} from './ocr-languages';

type Tagged=FabricObject&{recognizedKey?:string;id?:string;name?:string};
export type ReplacementBackground='repair'|'ai'|'sampled'|'solid'|'transparent';

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

export async function scanPageText(p:Page,c:Canvas,{signal,grouping,thorough,languages,engine='tesseract',aiSharpen=false,onStatus}:{signal:AbortSignal;grouping:OcrGrouping;thorough:boolean;languages:string[];engine?:'tesseract'|'paddle';aiSharpen?:boolean;onStatus:(status:string)=>void}):Promise<{regions:TextRegion[];status:string;suggestedFont?:string}>{
 onStatus('Detecting text…');
 if(p.source){const detected=await detectPdfText(p.source,p.index);signal.throwIfAborted();if(detected.regions.length)return {regions:detected.regions,status:`${detected.regions.length} editable text regions${detected.skipped?' · rotated text kept unchanged':''}`};}
 onStatus('Recognizing image text locally…');
 let raster=await ocrRaster(p,c);signal.throwIfAborted();
 // AI sharpening (Real-ESRGAN, 2x) only pays off for small or soft text; it is
 // skipped for large rasters, where it would take minutes on a CPU.
 if(aiSharpen&&raster.width*raster.height<=2.5e6){
  const probe=raster.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,raster.width,raster.height);prepareOcrPixels(probe);const line=estimateLineHeight(probe);
  if(line!==undefined&&line<20){const {upscaleCanvas}=await import('./browser/ai-tools');raster=await upscaleCanvas(raster,2,f=>onStatus(`Sharpening with AI… ${Math.round(f*100)}%`),signal);}
 }
 const {recognizeImage}=await import('./browser/ocr');const detected=await recognizeImage(raster,{signal,grouping,thorough,languages,engine,onProgress:(fraction,label)=>onStatus(`${label}… ${Math.round(fraction*100)}%`)});signal.throwIfAborted();
 const layers=c.getObjects().map(o=>({recognizedKey:(o as Tagged).recognizedKey,bounds:o.getBoundingRect()}));
 const regions=unconvertedRegions(scaleRegions(detected,p.width/raster.width,p.height/raster.height),layers);
 let suggestedFont:string|undefined;
 if(regions.length){onStatus('Matching font…');try{suggestedFont=await suggestFont(raster,detected);}catch{}signal.throwIfAborted();}
 return {regions,suggestedFont,status:ocrScanStatus(regions.length,engine==='paddle'?'AI OCR (Latin languages)':languageLabel(languages,await bundledOcrLanguages()),layers.some(l=>l.recognizedKey),regions.filter(isUncertain).length)+(suggestedFont?` · closest font: ${suggestedFont}`:'')};
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
// matchBlur gives OCR text the measured softness of the original letters.
export async function detectedTextbox(region:TextRegion,{ocrFont,ocrStyle,matchBlur=false}:{ocrFont:string;ocrStyle:string;matchBlur?:boolean}){
 let family=region.kind==='ocr'?ocrFont:fallbackFont(region.fontName),embedded=false;
 if(region.fontData&&region.fontId){try{await ensureEmbeddedFont(region.fontId,region.fontData);family=region.fontId;embedded=true;}catch{}}
 await ensureFont(family);
 const italic=region.kind==='ocr'?ocrStyle.includes('italic'):region.italic,words=region.words;
 // Auto weight is estimated per word so mixed bold/regular lines keep both.
 const lineBold=region.kind==='ocr'&&ocrStyle==='auto'?estimateOcrBold(region.text,family,region.height,region.inkDensity,region.blur):false;
 let weights:ReturnType<typeof mixedWeights>|undefined,inkLevel:number|undefined;
 if(region.kind==='ocr'&&ocrStyle==='auto'&&words&&words.length>1&&words.map(w=>w.text).join(' ')===region.text){
  // Compare each word's total ink with regular and bold renderings (blur-proof);
  // fall back to per-word stroke coverage when ink was not measured.
  const measurable=(w:typeof words[number])=>/[\p{L}\p{N}\p{Sc}%&@#]/u.test(w.text);
  if(words.every(w=>!measurable(w)||(w.inkMass!==undefined&&w.width))){
   const inks=words.map(w=>{if(!measurable(w)||!w.inkMass||!w.width)return undefined;const regular=glyphInk(w.text,family,'normal'),heavy=glyphInk(w.text,family,'bold');return regular&&heavy?wordInk(w.text,w.inkMass,w.width,regular,heavy):undefined;});
   const result=classifyWordWeights(inks,lineBold);weights=mixedWeights(words,result.bold);inkLevel=result.ink;
  }else weights=mixedWeights(words,words.map(w=>w.inkDensity===undefined||!measurable(w)?undefined:estimateOcrBold(w.text,family,region.height,w.inkDensity,region.blur)));
 }
 const bold=weights?weights.base:region.kind==='ocr'?(ocrStyle==='auto'?lineBold:ocrStyle.includes('bold')):region.bold;
 let size=region.size,ocrAscent=region.height;
 if(region.kind==='ocr'){
  const ctx=document.createElement('canvas').getContext('2d')!,font=(b:boolean)=>`${italic?'italic ':''}${b?'bold ':''}100px "${family}"`;ctx.font=font(bold);const metrics=ctx.measureText(region.text);
  let width=metrics.width;
  if(weights?.ranges.length){width=0;let offset=0;for(const w of words!){const own=weights.ranges.find(r=>offset>=r.start&&offset<r.end);ctx.font=font(own?own.bold:bold);width+=ctx.measureText(w.text).width;offset+=Array.from(w.text).length+1;}ctx.font=font(bold);width+=ctx.measureText(' ').width*(words!.length-1);}
  const fit=fitOcrText(region,{width,actualBoundingBoxAscent:metrics.actualBoundingBoxAscent,actualBoundingBoxDescent:metrics.actualBoundingBoxDescent});size=fit.size;ocrAscent=fit.ascent;
 }
 const text=Object.assign(new Textbox(region.text,{left:region.left,top:region.top,width:Math.max(region.width+4,20),fontSize:size,fontFamily:family,fontWeight:embedded?'normal':bold?'bold':'normal',fontStyle:embedded?'normal':italic?'italic':'normal',fill:region.kind==='ocr'?darkenToInk(region.color,region.background,inkLevel):region.color,lineHeight:1,splitByGrapheme:true,objectCaching:false}),{id:uid(),name:region.text.slice(0,40),pdfOriginalFont:region.fontName,pdfFontData:embedded?region.fontData:undefined,pdfFontFallback:fallbackFont(region.fontName),pdfFontBold:bold,pdfFontItalic:italic,recognizedKey:recognitionKey(region)});
 for(const r of weights?.ranges??[])text.setSelectionStyles({fontWeight:r.bold?'bold':'normal'},r.start,r.end);
 if(matchBlur&&region.kind==='ocr'&&(region.blur??0)>=.3)Object.assign(text,{textSoftness:clampTextSoftness(region.blur!)});
 // Fabric's top includes its ascender allowance; anchor the first baseline.
 text.top=region.kind==='pdf'?region.baseline-region.size*.93:region.top+ocrAscent-size*.93;
 return {text,embedded};
}

// Hide the original OCR text by clearing, repairing or patching the area under
// each region. Several regions are handled in one pass (Convert all), so each
// image layer is rasterized once. Mutates the serialized `objects` list of the page.
export async function coverOcrText(c:Canvas,p:Page,regions:TextRegion[],objects:unknown[],{mode,color,padding,onProgress}:{mode:ReplacementBackground;color:string;padding:number;onProgress?:(fraction:number)=>void}){
 const areas=regions.map(region=>({region,...ocrPatchBounds(region,padding,p)}));
 if(mode==='transparent'){
  const overlaps=(o:FabricObject)=>{const b=o.getBoundingRect();return areas.some(a=>b.left<a.left+a.width&&b.top<a.top+a.height&&b.left+b.width>a.left&&b.top+b.height>a.top);};
  const images=c.getObjects().filter(o=>o instanceof FabricImage&&o.visible&&overlaps(o));
  if(!images.length)throw new Error('Select image text to clear its background.');
  if(images.some(o=>o.lockMovementX))throw new Error('Unlock the image layers beneath this text first.');
  for(const image of images){
   const blend=image.globalCompositeOperation;let raster:HTMLCanvasElement;try{image.globalCompositeOperation='source-over';raster=pageRaster(c,p.width,p.height,[image]);}finally{image.globalCompositeOperation=blend;}
   for(const a of areas)raster.getContext('2d')!.clearRect(a.left,a.top,a.width,a.height);
   const replacement=rasterLayer(raster,(image as Tagged).name||'Image',(image as Tagged).id!),index=objects.findIndex(o=>(o as Tagged).id===(image as Tagged).id);
   if(index>=0){if(replacement){replacement.globalCompositeOperation=blend;objects[index]=replacement.toObject();}else objects.splice(index,1);}
  }
 }else if(mode==='ai'){
  // LaMa reconstructs textures (photos, maps, gradients) behind the old text.
  const raster=await pageComposite(c,p),mask=document.createElement('canvas');mask.width=raster.width;mask.height=raster.height;const mctx=mask.getContext('2d')!;mctx.fillStyle='#000';
  for(const a of areas)mctx.fillRect(a.left,a.top,a.width,a.height);
  const {inpaintCanvas}=await import('./browser/ai-tools');
  for(const patch of await inpaintCanvas(raster,mask,areas.map(a=>({x:a.left,y:a.top,width:a.width,height:a.height})),onProgress))objects.push(Object.assign(new FabricImage(patch.canvas,{left:patch.x,top:patch.y}),{id:uid(),name:'AI-filled background'}).toObject());
 }else if(mode==='repair'){
  const raster=await pageComposite(c,p);
  const pixels=raster.getContext('2d')!.getImageData(0,0,raster.width,raster.height);
  for(const a of areas){
   const repaired=repairTextBackground(pixels,{left:a.left,top:a.top,width:a.width,height:a.height});
   const patchCanvas=document.createElement('canvas');patchCanvas.width=repaired.width;patchCanvas.height=repaired.height;const context=patchCanvas.getContext('2d')!,patch=context.createImageData(repaired.width,repaired.height);patch.data.set(repaired.data);context.putImageData(patch,0,0);
   objects.push(Object.assign(new FabricImage(patchCanvas,{left:repaired.left,top:repaired.top}),{id:uid(),name:'Repaired text background'}).toObject());
  }
 }else for(const a of areas)objects.push(Object.assign(new Rect({left:a.left,top:a.top,width:a.width,height:a.height,fill:mode==='solid'?color:a.region.background||'#ffffff',strokeWidth:0}),{id:uid(),name:'Text background patch'}).toObject());
}

// The page as shown under the editable layers, in page units: the PDF preview,
// or the visible image layers of a design page.
export async function pageComposite(c:Canvas,p:Page){
 return p.source?await previewCanvas(p.source,p.index,1,Math.ceil(p.width),Math.ceil(p.height)):pageRaster(c,p.width,p.height,c.getObjects().filter(o=>o instanceof FabricImage&&o.visible));
}

// Remove whatever is inside a selection polygon with LaMa; returns new patch layers.
export async function aiRemoveSelection(c:Canvas,p:Page,points:{x:number;y:number}[],onProgress?:(fraction:number)=>void){
 const raster=await pageComposite(c,p),mask=document.createElement('canvas');mask.width=raster.width;mask.height=raster.height;
 const ctx=mask.getContext('2d')!;ctx.fillStyle=ctx.strokeStyle='#000';ctx.lineWidth=4;ctx.lineJoin='round';ctx.beginPath();points.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.closePath();ctx.fill();ctx.stroke();
 const xs=points.map(pt=>pt.x),ys=points.map(pt=>pt.y),x=Math.max(0,Math.min(...xs)-3),y=Math.max(0,Math.min(...ys)-3);
 const hole={x,y,width:Math.min(raster.width,Math.max(...xs)+3)-x,height:Math.min(raster.height,Math.max(...ys)+3)-y};
 if(hole.width<2||hole.height<2)throw new Error('Draw a larger selection to remove.');
 const {inpaintCanvas}=await import('./browser/ai-tools');
 return (await inpaintCanvas(raster,mask,[hole],onProgress)).map(patch=>Object.assign(new FabricImage(patch.canvas,{left:patch.x,top:patch.y}),{id:uid(),name:'AI-removed area'}));
}

// Sharpen an image layer with Real-ESRGAN, keeping its size and position on the page.
export async function aiSharpenImage(image:FabricImage,onProgress?:(fraction:number)=>void){
 const element=image.getElement() as HTMLImageElement|HTMLCanvasElement,source=document.createElement('canvas');
 source.width=element instanceof HTMLImageElement?element.naturalWidth:element.width;source.height=element instanceof HTMLImageElement?element.naturalHeight:element.height;
 if(source.width*source.height>4e6)throw new Error('This image is already large (over 4 megapixels); AI sharpening is for small or blurry images.');
 source.getContext('2d')!.drawImage(element,0,0);
 const {upscaleCanvas}=await import('./browser/ai-tools');const sharp=await upscaleCanvas(source,2,onProgress);
 const crop=image.cropX||image.cropY?{cropX:(image.cropX??0)*2,cropY:(image.cropY??0)*2}:{};
 return {element:sharp,props:{...crop,width:(image.width??source.width)*2,height:(image.height??source.height)*2,scaleX:(image.scaleX??1)/2,scaleY:(image.scaleY??1)/2}};
}
