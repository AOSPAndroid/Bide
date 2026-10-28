// Detecting page text (PDF text layer, else local OCR) and turning a detected
// region into an editable text layer with a background patch.
import {FabricImage,Rect,StaticCanvas,type Canvas,type FabricObject} from 'fabric';
import {growMask,maskBounds,type Mask} from './pixel-mask';
import {maskToCanvas} from './selection-canvas';
import {Textbox,clampTextSoftness} from './text-appearance';
import {detectPdfText,pagePreview} from './browser/engine';
import {pageRaster,rasterLayer} from './retouch-canvas';
import {repairTextBackground} from './text-replacement';
import {estimateOcrBold,glyphInk,wordInk,classifyWordWeights} from './ocr-weight';
import {darkenToInk,prepareOcrPixels,estimateLineHeight} from './ocr-image';
import {ensureFont,ensureEmbeddedFont} from './fonts';
import {fallbackFont,fitOcrText,type TextRegion} from './text-regions';
import {lineCells,planGlyphEdit,ownInk,lineMetrics,type LibraryGlyph} from './glyph-edit';
import {mixedWeights,attachNumberParts,recognitionKey,scaleRegions,unconvertedRegions,ocrPatchBounds,ocrScanStatus,isUncertain} from './ocr-regions';
import type {OcrGrouping} from './ocr-segmentation';
import {uid,type Page} from './model';
import {bundledOcrLanguages,languageLabel} from './ocr-languages';
import {scriptLabels,type OcrScript} from './ai-image';

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

// Text lines for a searchable PDF: OCR of the page's pictures (a scanned PDF
// page, or the image layers of a design page), in page units. Pages whose PDF
// already has real text, and pages without pictures, get none.
export async function searchableText(p:Page,{engine,languages,signal,known,script,accurate}:{engine:'tesseract'|'paddle';languages:string[];signal?:AbortSignal;known?:TextRegion[];script?:OcrScript|'auto';accurate?:boolean}){
 // Pages with real text, or a scanner's own OCR layer, are already searchable.
 if(p.source){const detected=await detectPdfText(p.source,p.index);if(detected.regions.length||detected.ocrLayer)return [];}
 const c=new StaticCanvas(undefined,{width:p.width,height:p.height});
 try{
  await c.loadFromJSON(p.canvas);
  if(!hasScannableContent(p,c as unknown as Canvas))return [];
  let regions=known?.filter(r=>r.kind==='ocr');
  if(!regions?.length){
   const raster=await ocrRaster(p,c as unknown as Canvas),{recognizeImage}=await import('./browser/ocr');
   regions=scaleRegions(await recognizeImage(raster,{signal,grouping:'lines',languages,engine,script,accurate}),p.width/raster.width,p.height/raster.height);
  }
  return regions.filter(r=>r.text.trim()).map(r=>({text:r.text,left:r.left,top:r.top,width:r.width,height:r.height}));
 }finally{await c.dispose();}
}

export function hasScannableContent(p:Page,c:Canvas){return !!p.source||c.getObjects().some(o=>o instanceof FabricImage);}

// "AI OCR (Latin languages)", or the alphabets the page was read in.
function aiOcrLabel(regions:TextRegion[]){
 const scripts=[...new Set(regions.map(r=>r.script).filter((s):s is OcrScript=>!!s))];
 return scripts.length?`AI OCR (${scripts.map(s=>scriptLabels[s]).join(' + ')})`:'AI OCR (Latin languages)';
}
export async function scanPageText(p:Page,c:Canvas,{signal,grouping,thorough,languages,engine='tesseract',aiSharpen=false,script='auto',accurate=false,onStatus}:{signal:AbortSignal;grouping:OcrGrouping;thorough:boolean;languages:string[];engine?:'tesseract'|'paddle';aiSharpen?:boolean;script?:OcrScript|'auto';accurate?:boolean;onStatus:(status:string)=>void}):Promise<{regions:TextRegion[];all?:TextRegion[];status:string;suggestedFont?:string}>{
 onStatus('Detecting text…');
 let ocrLayer=false;
 if(p.source){const detected=await detectPdfText(p.source,p.index);signal.throwIfAborted();ocrLayer=!!detected.ocrLayer;if(detected.regions.length)return {regions:detected.regions,status:`${detected.regions.length} editable text regions${detected.skipped?' · rotated text kept unchanged':''}`};}
 onStatus(ocrLayer?'Scanned page: reading the image (its own text layer is invisible)…':'Recognizing image text locally…');
 let raster=await ocrRaster(p,c);signal.throwIfAborted();
 // AI sharpening (Real-ESRGAN, 2x) only pays off for small or soft text; it is
 // skipped for large rasters, where it would take minutes on a CPU.
 if(aiSharpen&&raster.width*raster.height<=2.5e6){
  const probe=raster.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,raster.width,raster.height);prepareOcrPixels(probe);const line=estimateLineHeight(probe);
  if(line!==undefined&&line<20){const {upscaleCanvas}=await import('./browser/ai-tools');raster=await upscaleCanvas(raster,2,f=>onStatus(`Sharpening with AI… ${Math.round(f*100)}%`),signal);}
 }
 const {recognizeImage}=await import('./browser/ocr');const detected=await recognizeImage(raster,{signal,grouping,thorough,languages,engine,script,accurate,onProgress:(fraction,label)=>onStatus(`${label}… ${Math.round(fraction*100)}%`)});signal.throwIfAborted();
 const layers=c.getObjects().map(o=>({recognizedKey:(o as Tagged).recognizedKey,bounds:o.getBoundingRect()}));
 const all=scaleRegions(detected,p.width/raster.width,p.height/raster.height),regions=unconvertedRegions(all,layers);
 let suggestedFont:string|undefined;
 if(regions.length){onStatus('Matching font…');try{suggestedFont=await suggestFont(raster,detected);}catch{}signal.throwIfAborted();}
 return {regions,all,suggestedFont,status:ocrScanStatus(regions.length,engine==='paddle'?aiOcrLabel(detected):languageLabel(languages,await bundledOcrLanguages()),layers.some(l=>l.recognizedKey),regions.filter(isUncertain).length)+(suggestedFont?` · closest font: ${suggestedFont}`:'')};
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
export async function detectedTextbox(region:TextRegion,{ocrFont,ocrStyle,matchBlur=false,pageInk}:{ocrFont:string;ocrStyle:string;matchBlur?:boolean;pageInk?:PageInk}){
 let family=region.kind==='ocr'?ocrFont:fallbackFont(region.fontName),embedded=false;
 if(region.fontData&&region.fontId){try{await ensureEmbeddedFont(region.fontId,region.fontData);family=region.fontId;embedded=true;}catch{}}
 await ensureFont(family);
 const italic=region.kind==='ocr'?ocrStyle.includes('italic'):region.italic,words=region.words;
 // Auto weight is estimated per word so mixed bold/regular lines keep both.
 const auto=region.kind==='ocr'&&ocrStyle==='auto',measurable=(t:string)=>/[\p{L}\p{N}\p{Sc}%&@#]/u.test(t);
 const inkOf=(w:{text:string;inkMass?:number;width?:number})=>{if(!measurable(w.text)||!w.inkMass||!w.width)return undefined;const regular=glyphInk(w.text,family,'normal'),heavy=glyphInk(w.text,family,'bold');return regular&&heavy?wordInk(w.text,w.inkMass,w.width,regular,heavy):undefined;};
 // Stroke-coverage vote, used when a whole line has a single weight.
 const vote=(list:{text:string;inkDensity?:number}[])=>{let b=0,r=0;for(const w of list){if(w.inkDensity===undefined||!measurable(w.text))continue;const n=Array.from(w.text).length;if(estimateOcrBold(w.text,family,region.height,w.inkDensity,region.blur))b+=n;else r+=n;}return b>r;};
 let weights:ReturnType<typeof mixedWeights>|undefined,inkLevel:number|undefined,ownBold:boolean|undefined;
 if(auto&&region.line&&region.line.words.every(w=>!measurable(w.text)||(w.inkMass!==undefined&&w.width))){
  // Judge weights across the full text line (blur-proof ink comparison), then
  // take this region's words: a lone word is compared with its neighbours.
  const {words:line,start,count}=region.line,result=classifyWordWeights(line.map(inkOf),vote(line),sameInk(region,pageInk)),own=attachNumberParts(line.map(w=>w.text),result.bold).slice(start,start+count);inkLevel=result.ink;
  if(words&&words.length>1&&words.length===own.length&&words.map(w=>w.text).join(' ')===region.text)weights=mixedWeights(words,own);
  else if(count===1)ownBold=own[0];
 }else if(auto&&words&&words.length>1&&words.map(w=>w.text).join(' ')===region.text){
  if(words.every(w=>!measurable(w.text)||(w.inkMass!==undefined&&w.width))){const result=classifyWordWeights(words.map(inkOf),vote(words),sameInk(region,pageInk));weights=mixedWeights(words,result.bold);inkLevel=result.ink;}
  else weights=mixedWeights(words,words.map(w=>w.inkDensity===undefined||!measurable(w.text)?undefined:estimateOcrBold(w.text,family,region.height,w.inkDensity,region.blur)));
 }
 const bold=weights?weights.base:ownBold??(region.kind==='ocr'?(auto?estimateOcrBold(region.text,family,region.height,region.inkDensity,region.blur):ocrStyle.includes('bold')):region.bold);
 let size=region.size,ocrAscent=region.height,charSpacing=0,boxWidth=Math.max(region.width+4,20);
 if(region.kind==='ocr'){
  const ctx=document.createElement('canvas').getContext('2d')!,font=(b:boolean)=>`${italic?'italic ':''}${b?'bold ':''}100px "${family}"`;ctx.font=font(bold);const metrics=ctx.measureText(region.text);
  // Ink width (not advance), to compare with the original's inked extent.
  let width=metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight;
  if(weights?.ranges.length){width=0;let offset=0;for(const w of words!){const own=weights.ranges.find(r=>offset>=r.start&&offset<r.end);ctx.font=font(own?own.bold:bold);width+=ctx.measureText(w.text).width;offset+=Array.from(w.text).length+1;}ctx.font=font(bold);width+=ctx.measureText(' ').width*(words!.length-1)-(metrics.width-(metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight));}
  const fit=fitOcrText(region,{width,actualBoundingBoxAscent:metrics.actualBoundingBoxAscent,actualBoundingBoxDescent:metrics.actualBoundingBoxDescent},Array.from(region.text).length);size=fit.size;ocrAscent=fit.ascent;charSpacing=fit.charSpacing;
  // Box wide enough for the fitted line, so Fabric never wraps it.
  boxWidth=Math.max(boxWidth,width*size/100+(Array.from(region.text).length-1)*charSpacing*size/1000+6);
 }
 const text=Object.assign(new Textbox(region.text,{left:region.left,top:region.top,width:boxWidth,fontSize:size,charSpacing,fontFamily:family,fontWeight:embedded?'normal':bold?'bold':'normal',fontStyle:embedded?'normal':italic?'italic':'normal',fill:region.kind==='ocr'?darkenToInk(region.color,region.background,inkLevel):region.color,lineHeight:1,splitByGrapheme:true,objectCaching:false}),{id:uid(),name:region.text.slice(0,40),pdfOriginalFont:region.fontName,pdfFontData:embedded?region.fontData:undefined,pdfFontFallback:fallbackFont(region.fontName),pdfFontBold:bold,pdfFontItalic:italic,recognizedKey:recognitionKey(region)});
 for(const r of weights?.ranges??[])text.setSelectionStyles({fontWeight:r.bold?'bold':'normal'},r.start,r.end);
 if(matchBlur&&region.kind==='ocr'&&(region.blur??0)>=.3)Object.assign(text,{textSoftness:clampTextSoftness(region.blur!)});
 // Fabric's top includes its ascender allowance; anchor the first baseline.
 text.top=region.kind==='pdf'?region.baseline-region.size*.93:region.top+ocrAscent-size*.93;
 return {text,embedded};
}

export async function matchedDetectedTextbox(region:TextRegion,c:Canvas,p:Page,regions:TextRegion[],options:{ocrFont:string;ocrStyle:string;matchBlur:boolean;autoFont:boolean;appearanceRegions?:TextRegion[]}){
 if(region.kind!=='ocr')return detectedTextbox(region,options);
 const all=regions.length?regions:[region],inkCache=new Map<string,Promise<PageInk|undefined>>();
 const ink=(family:string)=>{if(!inkCache.has(family))inkCache.set(family,options.ocrStyle==='auto'?pageInkLevel(all,family):Promise.resolve(undefined));return inkCache.get(family)!;};
 const makeText=async(r:TextRegion,family:string)=>(await detectedTextbox(r,{...options,ocrFont:family,matchBlur:false,pageInk:await ink(family)})).text;
 const {matchOcrAppearance,applyOcrAppearance,matchOcrSoftness}=await import('./browser/ocr-appearance');
 // A PDF page's units are points (72 dpi): small scanned letters look soft at
 // that scale however crisp the scan, and replacement text got a blur the
 // page does not have. Font, size and position are fitted at page scale; the
 // softness of a PDF page is measured on a render with ~32 px letters.
 const pdf=!!p.source,regionsAll=options.appearanceRegions??all;
 const raster=await pageComposite(c,p),fit=await matchOcrAppearance(raster,region,regionsAll,options.ocrFont,{autoFont:options.autoFont,matchBlur:options.matchBlur&&!pdf,makeText});
 if(!fit)return detectedTextbox(region,{...options,pageInk:await ink(options.ocrFont)});
 const text=await makeText(region,fit.family);applyOcrAppearance(text,region,fit);
 const k=pdf?Math.max(1,Math.min(4,32/Math.max(1,region.height),Math.sqrt(16e6/(p.width*p.height)))):1;
 if(pdf&&options.matchBlur){const fine=await previewCanvas(p.source!,p.index,k,Math.ceil(p.width*k),Math.ceil(p.height*k));text.textSoftness=matchOcrSoftness(fine,region,regionsAll,text,k);text.initDimensions();}
 return {text,embedded:false};
}

// Hide the original OCR text by clearing, repairing or patching the area under
// each region. Several regions are handled in one pass (Convert all), so each
// image layer is rasterized once. Mutates the serialized `objects` list of the page.
export async function coverOcrText(c:Canvas,p:Page,regions:TextRegion[],objects:unknown[],{mode,color,padding,others=[],onProgress}:{mode:ReplacementBackground;color:string;padding:number;others?:TextRegion[];onProgress?:(fraction:number)=>void}){
 const areas=regions.map(region=>({region,...ocrPatchBounds(region,padding,p,others.filter(o=>o!==region&&o.kind==='ocr'))}));
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

// Remove whatever is inside a selection mask (page-sized) with LaMa; returns
// new patch layers. The hole reaches 2px past the selection edge.
export async function aiRemoveSelection(c:Canvas,p:Page,selection:Mask,onProgress?:(fraction:number)=>void){
 const raster=await pageComposite(c,p),grown=growMask(selection,2),bounds=maskBounds(grown,9);
 if(!bounds||bounds.width<2||bounds.height<2)throw new Error('Draw a larger selection to remove.');
 const mask=document.createElement('canvas');mask.width=raster.width;mask.height=raster.height;
 const sx=raster.width/grown.width,sy=raster.height/grown.height;mask.getContext('2d')!.drawImage(maskToCanvas(grown,[0,0,0]),0,0,raster.width,raster.height);
 const hole={x:bounds.left*sx,y:bounds.top*sy,width:bounds.width*sx,height:bounds.height*sy};
 const {inpaintCanvas}=await import('./browser/ai-tools');
 return (await inpaintCanvas(raster,mask,[hole],onProgress)).map(patch=>Object.assign(new FabricImage(patch.canvas,{left:patch.x/sx,top:patch.y/sy,scaleX:1/sx,scaleY:1/sy}),{id:uid(),name:'AI-removed area'}));
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

// Ink level of the page's text, measured on lines that mix bold and regular
// (their split pins the level down). Used to settle single-weight lines on the
// same page when blur makes their own evidence ambiguous.
export type PageInk={ink:number;luma:number};
const luma=(hex:string)=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return .299*v[0]+.587*v[1]+.114*v[2];};
export async function pageInkLevel(regions:TextRegion[],family:string):Promise<PageInk|undefined>{
 await ensureFont(family);
 const seen=new Set<unknown>(),levels:{ink:number;luma:number}[]=[];
 for(const r of regions){
  if(r.kind!=='ocr'||!r.line||seen.has(r.line.words)||!/^#[0-9a-f]{6}$/i.test(r.color))continue;seen.add(r.line.words);
  const inks=r.line.words.map(w=>{if(!/[\p{L}\p{N}]/u.test(w.text)||!w.inkMass||!w.width)return undefined;const a=glyphInk(w.text,family,'normal'),b=glyphInk(w.text,family,'bold');return a&&b?wordInk(w.text,w.inkMass,w.width,a,b):undefined;});
  const result=classifyWordWeights(inks,false);
  if(result.ink!==undefined&&result.bold.includes(true)&&result.bold.includes(false))levels.push({ink:result.ink,luma:luma(r.color)});
 }
 if(!levels.length)return undefined;
 const mid=(v:number[])=>v.sort((a,b)=>a-b)[v.length>>1];
 return {ink:mid(levels.map(l=>l.ink)),luma:mid(levels.map(l=>l.luma))};
}
// Only text of a similar colour shares the page's ink level (a light grey
// caption must not be judged against black body text).
function sameInk(region:TextRegion,page:PageInk|undefined){return page&&/^#[0-9a-f]{6}$/i.test(region.color)&&luma(region.color)<=page.luma+90?page.ink:undefined;}

// Rebuild an edited OCR line from the image's own letters (see glyph-edit.ts):
// from the first changed character onward, this line's letters are erased and
// redrawn from their original pixels at their new positions. Ink is assigned to
// lines by connectivity: a blob reaching outside this line's rows belongs to a
// neighbouring line (lines can overlap by a pixel) and stays where it is.
// Letters missing from the line are borrowed from page regions of the same
// size. Returns undefined when a letter cannot be found (use font text then).
// Other pages a missing letter may be borrowed from (rendered only when needed).
export type LetterSource={page:Page;regions:TextRegion[]};

// Ink per row over a region's box in a raster (page units), for line metrics.
function rowInk(raster:HTMLCanvasElement,r:{left:number;top:number;width:number;height:number;background?:string}){
 const x0=Math.max(0,Math.floor(r.left)),y0=Math.max(0,Math.floor(r.top)),w=Math.max(1,Math.min(raster.width-x0,Math.ceil(r.width))),h=Math.max(1,Math.min(raster.height-y0,Math.ceil(r.height)));
 const data=raster.getContext('2d',{willReadFrequently:true})!.getImageData(x0,y0,w,h).data,bg=hexRgb(r.background||'#ffffff'),rows=new Float32Array(h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(Math.max(Math.abs(data[i]-bg[0]),Math.abs(data[i+1]-bg[1]),Math.abs(data[i+2]-bg[2]))>60)rows[y]++;}
 return {rows,y0};
}

// Another page's pictures at `scale` pixels per page unit (for borrowing letters from it).
async function offscreenComposite(p:Page,scale=1){
 if(p.source)return previewCanvas(p.source,p.index,scale,Math.ceil(p.width*scale),Math.ceil(p.height*scale));
 const c=new StaticCanvas(undefined,{width:p.width,height:p.height});
 try{await c.loadFromJSON(p.canvas);const raster=pageRaster(c as unknown as Canvas,p.width,p.height,c.getObjects().filter(o=>o instanceof FabricImage));return scale===1?raster:scaledCanvas(raster,scale);}finally{await c.dispose();}
}
function scaledCanvas(source:HTMLCanvasElement,scale:number){
 const out=document.createElement('canvas');out.width=Math.ceil(source.width*scale);out.height=Math.ceil(source.height*scale);
 const g=out.getContext('2d')!;g.imageSmoothingQuality='high';g.drawImage(source,0,0,out.width,out.height);return out;
}
// Pixels per page unit for cutting letters: a PDF page's units are points
// (72 dpi), and letters cut at that scale came out as a blurry bitmap over a
// page drawn sharp at screen resolution. PDF lines are cut from a render where
// they are about 32 px tall (a whole multiple, so letters stay on pixels).
export const letterScale=(region:TextRegion,p:Page)=>p.source?Math.max(1,Math.min(4,Math.round(32/Math.max(1,region.height)),Math.floor(Math.sqrt(16e6/(p.width*p.height))))):1;
const scaledRegion=(r:TextRegion,k:number):TextRegion=>k===1?r:{...r,left:r.left*k,top:r.top*k,width:r.width*k,height:r.height*k,glyphs:r.glyphs?.map(g=>({...g,x0:g.x0*k,x1:g.x1*k}))};

// Glyphs of `regions` whose x-height matches (within 12%), each with its line's
// baseline, so letters from lines with or without descenders line up.
function letterLibrary(raster:HTMLCanvasElement,regions:TextRegion[],xHeight:number,exclude:TextRegion,page?:string):LibraryGlyph[]{
 return regions.filter(r=>r!==exclude&&r.kind==='ocr'&&r.glyphs).flatMap(r=>{
  const {rows,y0}=rowInk(raster,r),m=lineMetrics(rows);if(!m||Math.abs(m.xHeight-xHeight)>Math.max(1,xHeight*.12))return [];
  const own=lineCells(r.text,r.glyphs!);return own?own.filter(g=>!g.space).map(g=>({...g,y0:r.top,y1:r.top+r.height,source:r.id,baseline:y0+m.baseline,page})):[];
 });
}

export async function glyphEditPatch(c:Canvas,p:Page,lineRegion:TextRegion,next:string,pageRegions:TextRegion[]=[],sources:LetterSource[]=[]){
 if(lineRegion.kind!=='ocr'||!lineRegion.glyphs)return undefined;
 // Everything below works in raster pixels, `k` per page unit.
 const k=letterScale(lineRegion,p),region=scaledRegion(lineRegion,k),page=pageRegions.map(r=>r===lineRegion?region:scaledRegion(r,k)),otherPages=sources.map(o=>({...o,regions:o.regions.map(r=>scaledRegion(r,k))}));
 const cells=lineCells(region.text,region.glyphs!);if(!cells)return undefined;
 const raster=k===1?await pageComposite(c,p):await previewCanvas(p.source!,p.index,k,Math.ceil(p.width*k),Math.ceil(p.height*k)),W=raster.width,H=raster.height;
 const target=rowInk(raster,region),metrics=lineMetrics(target.rows);if(!metrics)return undefined;
 const baseline=target.y0+metrics.baseline,rasters=new Map<string,HTMLCanvasElement>([[p.id,raster]]);
 let plan=planGlyphEdit(region.text,cells,next,letterLibrary(raster,page,metrics.xHeight,region,p.id));
 // A letter missing from this page: look for it on the other pages.
 for(const other of otherPages){
  if(plan||other.page.id===p.id)continue;
  if(!planGlyphEdit(region.text,cells,next,other.regions.flatMap(r=>r.glyphs?lineCells(r.text,r.glyphs)?.filter(g=>!g.space).map(g=>({...g,y0:0,y1:0,source:r.id}))??[]:[]))&&!plan)continue;
  const source=await offscreenComposite(other.page,k);rasters.set(other.page.id,source);
  plan=planGlyphEdit(region.text,cells,next,[...letterLibrary(raster,page,metrics.xHeight,region,p.id),...letterLibrary(source,other.regions,metrics.xHeight,region,other.page.id)]);
 }
 if(!plan)return undefined;
 const pieces=plan.pieces.map(q=>({...q,x0:Math.round(q.x0),x1:Math.round(q.x1)})),startX=Math.max(0,Math.round(plan.startX)),width=pieces.reduce((s,q)=>s+q.x1-q.x0,0);
 const top=Math.max(0,Math.floor(region.top)-k),bottom=Math.min(H,Math.ceil(region.top+region.height)+k),endX=Math.min(W,Math.ceil(Math.max(plan.oldEnd,startX+width))+k);
 // Analyse the whole line plus a margin of rows to see where blobs lead.
 const ax0=Math.max(0,Math.floor(Math.min(region.left,startX))-2*k),ax1=Math.min(W,Math.max(endX,Math.ceil(region.left+region.width)+2*k)),ay0=Math.max(0,top-8*k),ay1=Math.min(H,bottom+8*k);
 const ctx=raster.getContext('2d',{willReadFrequently:true})!,area=ctx.getImageData(ax0,ay0,ax1-ax0,ay1-ay0),bg=hexRgb(region.background||'#ffffff');
 const own=ownInk(area.data,area.width,area.height,bg,top-ay0,bottom-ay0);
 // Borrowed letters may reach below the line box (descenders): the patch grows to fit them.
 const reach=Math.max(0,...pieces.filter(q=>q.source!==undefined).map(q=>Math.ceil((q.y1??0)-(q.baseline??0))-(bottom-baseline)));
 const patchW=Math.max(1,endX-startX),patchH=Math.min(H,bottom+reach)-top,out=new ImageData(patchW,patchH);
 for(let y=0;y<patchH;y++)for(let x=0;x<patchW;x++){
  const o=(y*patchW+x)*4;if(y+top>=ay1)continue;
  const ai=((y+top-ay0)*area.width+(x+startX-ax0));
  if(own[ai]){out.data.set(bg,o);out.data[o+3]=255;}else{out.data.set(area.data.subarray(ai*4,ai*4+4),o);}
 }
 let x=0;
 for(const q of pieces){
  const w=q.x1-q.x0;if(w<=0)continue;
  if(q.source!==undefined){
   // Borrowed letter: copy its ink, moved so its baseline sits on this line's baseline.
   const from=rasters.get(q.page??p.id)??raster,dy=Math.round(baseline-(q.baseline??baseline)),sy=Math.max(0,top-dy),sh=Math.min(from.height,top-dy+patchH)-sy;
   if(sh>0){const src=from.getContext('2d',{willReadFrequently:true})!.getImageData(q.x0,sy,w,sh),offset=sy-(top-dy);
    for(let y=0;y<sh;y++)for(let dx=0;dx<w&&x+dx<patchW;dx++){const i=(y*w+dx)*4,dist=Math.max(...[0,1,2].map(k=>Math.abs(src.data[i+k]-bg[k])));if(dist>12&&y+offset<patchH)out.data.set(src.data.subarray(i,i+4),((y+offset)*patchW+x+dx)*4);}}
  }else if(!q.blank)for(let y=0;y<patchH&&y+top<ay1;y++)for(let dx=0;dx<w&&x+dx<patchW;dx++){
   const ai=((y+top-ay0)*area.width+(q.x0+dx-ax0));if(own[ai])out.data.set(area.data.subarray(ai*4,ai*4+4),(y*patchW+x+dx)*4);
  }
  x+=w;
 }
 const patch=document.createElement('canvas');patch.width=patchW;patch.height=patchH;patch.getContext('2d')!.putImageData(out,0,0);
 return Object.assign(new FabricImage(patch,{left:startX/k,top:top/k,scaleX:1/k,scaleY:1/k}),{id:uid(),name:`Edited text: ${next.slice(0,40)}`});
}
const hexRgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)||0);
