// Detecting page text (PDF text layer, else local OCR) and turning a detected
// region into an editable text layer with a background patch.
import {FabricImage,Rect,StaticCanvas,Group,type Canvas,type FabricObject} from 'fabric';
import {growMask,maskBounds,type Mask} from './pixel-mask';
import {maskToCanvas} from './selection-canvas';
import {Textbox,clampTextSoftness,rasterizedText} from './text-appearance';
import {needsRasterExport} from './layer-style-render';
import {hasBlending} from './browser/layer-utils';
import {detectPdfText,pagePreview,pdfScanScale} from './browser/engine';
import {pageRaster,rasterLayer} from './retouch-canvas';
import {repairTextBackground} from './text-replacement';
import {estimateOcrBold,glyphInk,wordInk,classifyWordWeights,lineWeight} from './ocr-weight';
import {darkenToInk,prepareOcrPixels,estimateLineHeight} from './ocr-image';
import {ensureFont,ensureEmbeddedFont,ensureDocumentFonts} from './fonts';
import {bundledFonts} from './font-catalog';
import {matchedInkColor,alphaCoverage,blurCoverage} from './ocr-appearance';
import {weightFamilies} from './font-weights';
import {rasterSearchWords} from './searchable-text';
import {fallbackFont,fallbackCharSpacing,fitOcrText,type TextRegion} from './text-regions';
import {lineCells,planGlyphEdit,missingLetters,withUnread,ownInk,lineMetrics,fusedCells,UNREAD,type LibraryGlyph} from './glyph-edit';
import {letterCover,sameLettering,overBackground,telling,LETTERING,type Cover} from './letter-match';
import {markDoubts} from './ocr-checks';
import {mixedWeights,attachNumberParts,recognitionKey,scaleRegions,unconvertedRegions,ocrPatchBounds,ocrScanStatus,isUncertain,frameOf,turn,turnedBounds,inFrame,type Frame} from './ocr-regions';
import type {OcrGrouping} from './ocr-segmentation';
import {uid,type Page} from './model';
import {letterRasterScale} from './render-budget';
import {bundledOcrLanguages,languageLabel} from './ocr-languages';
import {scriptLabels,type OcrScript} from './ai-image';

type Tagged=FabricObject&{recognizedKey?:string;id?:string;name?:string};
const originalFieldBounds=(r:TextRegion)=>turnedBounds(frameOf(r),{left:r.left,top:r.top,width:r.width,height:r.height});
export type ReplacementBackground='repair'|'ai'|'sampled'|'solid'|'transparent';

async function previewCanvas(source:string,index:number,scale:number,width?:number,height?:number){
 const image=new Image();image.src=await pagePreview(source,index,scale);await image.decode();
 const canvas=document.createElement('canvas');canvas.width=width??image.width;canvas.height=height??image.height;canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}

// A tilted line (TextRegion.angle) is worked on level, as OCR read it: the
// raster turned back about the line's centre (`k` pixels per page unit).
function levelRaster(raster:HTMLCanvasElement,f:Frame,k:number,fill:string){
 if(!f.angle)return raster;
 const out=document.createElement('canvas');out.width=raster.width;out.height=raster.height;const g=out.getContext('2d',{willReadFrequently:true})!;
 g.fillStyle=fill;g.fillRect(0,0,out.width,out.height);g.translate(f.cx*k,f.cy*k);g.rotate(-f.angle*Math.PI/180);g.translate(-f.cx*k,-f.cy*k);g.drawImage(raster,0,0);return out;
}
// The page's lines in a frame (lines tilted otherwise are left out; `near`
// lets in those within 3°, placed by their centre, to find neighbours).
const framed=(f:Frame,regions:TextRegion[],near=false)=>regions.flatMap(r=>{const m=inFrame(f,r,near?3:undefined);return m?[m]:[];});
// A layer made in a tilted line's level frame, turned onto the page with it
// (layers turn about their top left corner).
function turnLayer<T extends FabricObject>(o:T,region:TextRegion){
 const f=frameOf(region);if(!f.angle)return o;
 const at=turn(f,o.left,o.top);o.set({left:at.x,top:at.y,angle:f.angle});o.setCoords();return o;
}
// Paint in a tilted line's frame on a page-unit canvas.
function inLineFrame(g:CanvasRenderingContext2D,f:Frame,paint:()=>void){
 if(!f.angle)return paint();
 g.save();g.translate(f.cx,f.cy);g.rotate(f.angle*Math.PI/180);g.translate(-f.cx,-f.cy);paint();g.restore();
}

// Page raster for OCR, flattened onto the page colour and capped at 3600px
// (photos are read at up to 3600px too: small print reads better at full size).
async function ocrRaster(p:Page,c:Canvas){
 const pdfScale=Math.min(4,3600/Math.max(p.width,p.height));
 const source=p.source?await previewCanvas(p.source,p.index,pdfScale):pageRaster(c,p.width,p.height,c.getObjects().filter(o=>o instanceof FabricImage),3600);
 // Edits drawn over a PDF page are read too: a rescan after an edit used to read the old digits again.
 const edits=p.source?c.getObjects().filter(o=>o instanceof FabricImage&&o.visible):[];
 if(edits.length){const z=c.getZoom(),background=c.backgroundColor;c.backgroundColor='';try{source.getContext('2d')!.drawImage(c.toCanvasElement(pdfScale/z,{width:p.width*z,height:p.height*z,filter:o=>edits.includes(o as FabricObject)}),0,0,source.width,source.height);}finally{c.backgroundColor=background;}}
 const ratio=Math.min(1,3600/Math.max(source.width,source.height)),reduced=document.createElement('canvas');reduced.width=Math.round(source.width*ratio);reduced.height=Math.round(source.height*ratio);
 const ctx=reduced.getContext('2d')!;ctx.fillStyle=p.color==='transparent'?'#ffffff':p.color;ctx.fillRect(0,0,reduced.width,reduced.height);ctx.drawImage(source,0,0,reduced.width,reduced.height);return reduced;
}

// Export always reads the current visible composite. The first OCR scan is
// an appearance/letter reference, never a valid snapshot of edited content.
export async function searchableText(p:Page,{engine,languages,signal,script,accurate}:{engine:'tesseract'|'paddle';languages:string[];signal?:AbortSignal;script?:OcrScript|'auto';accurate?:boolean}){
  signal?.throwIfAborted();
  const detected=p.source?await detectPdfText(p.source,p.index):undefined;
  // The scanner already supplied searchable text; never add a duplicate layer.
  if(detected?.ocrLayer)return [];
  const native=detected?.regions??[];
 const c=new StaticCanvas(undefined,{width:p.width,height:p.height});
 try{
   await ensureDocumentFonts(p.canvas);
  await c.loadFromJSON(p.canvas);
   const scale=Math.min(3,3600/Math.max(p.width,p.height)),raster=document.createElement('canvas');
   raster.width=Math.max(1,Math.ceil(p.width*scale));raster.height=Math.max(1,Math.ceil(p.height*scale));
   const ctx=raster.getContext('2d')!;ctx.fillStyle=p.color==='transparent'?'#fff':p.color;ctx.fillRect(0,0,raster.width,raster.height);
   if(p.source)ctx.drawImage(await previewCanvas(p.source,p.index,scale),0,0,raster.width,raster.height);
   ctx.drawImage(c.toCanvasElement(scale),0,0,raster.width,raster.height);
   const {recognizeImage}=await import('./browser/ocr');
   const regions=scaleRegions(await recognizeImage(raster,{signal,grouping:'words',languages,engine,script,accurate}),p.width/raster.width,p.height/raster.height);
   const textBounds:{text:string;left:number;top:number;width:number;height:number}[]=[...native];
   const nativeText=(o:FabricObject)=>{
    if(!o.visible||o.opacity<=0||needsRasterExport(o))return;
    if(o instanceof Textbox&&!rasterizedText(o)&&o.text.trim())textBounds.push({...o.getBoundingRect(),text:o.text});
    else if(o instanceof Group)o.getObjects().forEach(nativeText);
   };
   if(!hasBlending(c.getObjects()))c.getObjects().forEach(nativeText);
   return rasterSearchWords(regions,textBounds).map(r=>({text:r.text,left:r.left,top:r.top,width:r.width,height:r.height}));
 }finally{await c.dispose();}
}

export function hasScannableContent(p:Page,c:Canvas){return !!p.source||c.getObjects().some(o=>o instanceof FabricImage);}

// "AI OCR (Latin languages)", or the alphabets the page was read in.
function aiOcrLabel(regions:TextRegion[]){
 const scripts=[...new Set(regions.map(r=>r.script).filter((s):s is OcrScript=>!!s))];
 return scripts.length?`AI OCR (${scripts.map(s=>scriptLabels[s]).join(' + ')})`:'AI OCR (Latin languages)';
}
let scannedDocument='';
export async function scanPageText(p:Page,c:Canvas,{signal,grouping,thorough,languages,engine='tesseract',aiSharpen=false,script='auto',accurate=false,onStatus,onRegions}:{signal:AbortSignal;grouping:OcrGrouping;thorough:boolean;languages:string[];engine?:'tesseract'|'paddle';aiSharpen?:boolean;script?:OcrScript|'auto';accurate?:boolean;onStatus:(status:string)=>void;onRegions?:(regions:TextRegion[])=>void}):Promise<{regions:TextRegion[];all?:TextRegion[];status:string;suggestedFont?:string}>{
 // Another document: the faces matched on the last one no longer apply.
 {const key=p.source??p.id;if(key!==scannedDocument){scannedDocument=key;try{(await import('./browser/ocr-appearance')).forgetPageFaces();}catch{}}}
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
 const {recognizeImage}=await import('./browser/ocr');let detected=await recognizeImage(raster,{signal,grouping,thorough,languages,engine,script,accurate,onProgress:(fraction,label)=>onStatus(`${label}… ${Math.round(fraction*100)}%`)});signal.throwIfAborted();
 // Look-alike characters (0 and O, 1 and l…) settled by drawing them in the line's own face (ocr-redraw.ts).
 try{detected=await (await import('./browser/ocr-redraw')).redrawCheck(raster,detected);}catch{}signal.throwIfAborted();
 const layers=c.getObjects().map(o=>({recognizedKey:(o as Tagged).recognizedKey,bounds:o.getBoundingRect()}));
 const all=scaleRegions(detected,p.width/raster.width,p.height/raster.height),regions=markDoubts(unconvertedRegions(all,layers),{ai:engine==='paddle'});
 let suggestedFont:string|undefined;
 // The fields can be tapped while the font is matched (1.5 to 3 s).
 if(regions.length){onRegions?.(regions);onStatus(`${regions.length} OCR regions · matching the font…`);try{suggestedFont=await suggestFont(raster,detected);}catch{}signal.throwIfAborted();}
 return {regions,all,suggestedFont,status:ocrScanStatus(regions.length,engine==='paddle'?aiOcrLabel(detected):languageLabel(languages,await bundledOcrLanguages()),layers.some(l=>l.recognizedKey),regions.filter(isUncertain).length)+(suggestedFont?` · closest font: ${suggestedFont}`:'')};
}

// Compare the clearest recognized words against bundled fonts. Only confident
// regions are used: a misread character skews the shape comparison. A tilted
// page's words are compared level, on the raster turned back as OCR read it.
async function suggestFont(raster:HTMLCanvasElement,regions:TextRegion[]){
 const picked=regions.filter(r=>(r.confidence??0)>=85&&r.text.replace(/\s/g,'').length>=4&&r.height>=8).sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,6),f=picked.length?frameOf(picked[0]):undefined;
 const ctx=(f?levelRaster(raster,f,1,picked[0].background||'#ffffff'):raster).getContext('2d',{willReadFrequently:true})!;
 const samples=(f?framed(f,picked,true):picked).map(r=>{
  const left=Math.max(0,Math.floor(r.left-2)),top=Math.max(0,Math.floor(r.top-2)),width=Math.min(raster.width-left,Math.ceil(r.width+4)),height=Math.min(raster.height-top,Math.ceil(r.height+4));
  const hex=r.background||'#ffffff';return {text:r.text,pixels:ctx.getImageData(left,top,width,height),background:[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))};
 });
 if(!samples.length)return undefined;
 const {suggestOcrFont}=await import('./ocr-font');return (await suggestOcrFont(samples))?.family;
}

// A field's new value stays on its line: a longer value widens the box
// instead of wrapping (by letter) onto the line below.
export function fitOneLine(text:Textbox){
 if(text.text.includes('\n'))return;
 const width=text.width;text.set({width:1e4});text.initDimensions();
 let w=Math.max(width,Math.ceil(text.calcTextWidth())+2);text.set({width:w});text.initDimensions();
 // Fabric wraps by its own word widths, a little wider than the line it
 // measures: "Tuile - Ardoise - Zinc" fitted to 547 px wrapped its "c" onto a
 // second line, which the edit then cut off. Widen until it is one line.
 for(let i=0;i<40&&text.textLines.length>1;i++){w+=Math.max(1,text.fontSize*.1);text.set({width:w});text.initDimensions();}
}
// A scanned line's wide gaps kept when it is set in a font: "REF 5521-0934
// COLIS 1/2" printed with two spaces before COLIS was laid out with one, its
// letters stretched across the line to make up for it. A gap about N times
// the line's narrowest word space (N of 2 or more) becomes N spaces, in the
// text as read and in an edit of it that keeps the same number of words.
export function spacedText(region:TextRegion,text=region.text){
 if(region.kind!=='ocr'||!region.glyphs)return text;
 const cells=lineCells(region.text,region.glyphs);if(!cells)return text;
 const gaps=cells.filter(c=>c.space).map(c=>c.x1-c.x0);if(gaps.length<2)return text;
 const base=Math.min(...gaps);if(!(base>=region.height*.12))return text;
 const counts=gaps.map(g=>g>1.7*base?Math.min(8,Math.round(g/base)):1);if(counts.every(n=>n===1))return text;
 const parts=text.split(' ');if(parts.length!==counts.length+1)return text;
 return parts.map((w,i)=>i?' '.repeat(counts[i-1])+w:w).join('');
}
// Editable text positioned so its first baseline matches the detected text.
// matchBlur gives OCR text the measured softness of the original letters.
// A tilted line's text is turned with it, unless `level` (for fitting in its frame).
export async function detectedTextbox(region:TextRegion,{ocrFont,ocrStyle,matchBlur=false,pageInk,level=false}:{ocrFont:string;ocrStyle:string;matchBlur?:boolean;pageInk?:PageInk;level?:boolean}){
 let family=region.kind==='ocr'?ocrFont:fallbackFont(region.fontName,bundledFonts.map(f=>f.family)),embedded=false;
 if(region.fontData&&region.fontId){try{await ensureEmbeddedFont(region.fontId,region.fontData);family=region.fontId;embedded=true;}catch{}}
 await ensureFont(family);
 const italic=region.kind==='ocr'?ocrStyle.includes('italic'):region.italic,words=region.words;
 // Auto weight is estimated per word so mixed bold/regular lines keep both.
 const auto=region.kind==='ocr'&&ocrStyle==='auto',measurable=(t:string)=>/[\p{L}\p{N}\p{Sc}%&@#]/u.test(t);
 const inks=new Map<object,ReturnType<typeof wordInk>|undefined>(),inkOf=(w:{text:string;inkMass?:number;width?:number})=>{if(!measurable(w.text)||!w.inkMass||!w.width)return undefined;if(!inks.has(w)){const regular=glyphInk(w.text,family,'normal'),heavy=glyphInk(w.text,family,'bold');inks.set(w,regular&&heavy?wordInk(w.text,w.inkMass,w.width,regular,heavy):undefined);}return inks.get(w);};
 // The weight of a region set in one weight, from the shape of its strokes
 // (lineWeight): its words' cores against the face drawn in both weights at
 // the scan's blur. Scan measures are in scan pixels (`scale` per page unit).
 const scale=pageInk?.scale??1,rgb=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)||0),peak=/^#[0-9a-f]{6}$/i.test(region.color)?Math.max(...rgb(region.color).map((v,i)=>Math.abs(v-rgb(region.background||'#ffffff')[i])))/255:undefined;
 const single=(own:{text:string;inkDensity?:number;inkMass?:number;width?:number}[])=>{
  const list=own.filter(w=>measurable(w.text)).map(w=>({text:w.text,density:w.inkDensity,ink:inkOf(w)})),regular=list.some(w=>w.ink)?undefined:glyphInk(region.text,family,'normal'),heavy=regular&&glyphInk(region.text,family,'bold');
  return lineWeight(list,family,(region.blur??0)*scale,peak,regular&&heavy?[64*region.width*scale/regular.width,64*region.width*scale/heavy.width]:undefined)??{bold:false,sure:false};
 };
 // Ink levels only settle a line whose own strokes leave it open.
 const classify=(list:{text:string;inkDensity?:number;inkMass?:number;width?:number}[],own:typeof list)=>{const w=single(own);return classifyWordWeights(list.map(inkOf),w.bold,sameInk(region,pageInk),w.sure);};
 let weights:ReturnType<typeof mixedWeights>|undefined,inkLevel:number|undefined,ownBold:boolean|undefined;
 if(auto&&region.line&&region.line.words.every(w=>!measurable(w.text)||(w.inkMass!==undefined&&w.width))){
  // Judge weights across the full text line (blur-proof ink comparison), then
  // take this region's words: a lone word is compared with its neighbours.
  const {words:line,start,count}=region.line,result=classify(line,line.slice(start,start+count)),own=attachNumberParts(line.map(w=>w.text),result.bold).slice(start,start+count);inkLevel=result.ink;
  if(words&&words.length>1&&words.length===own.length&&words.map(w=>w.text).join(' ')===region.text)weights=mixedWeights(words,own);
  else if(count===1)ownBold=own[0];
 }else if(auto&&words&&words.length>1&&words.map(w=>w.text).join(' ')===region.text){
  if(words.every(w=>!measurable(w.text)||(w.inkMass!==undefined&&w.width))){const result=classify(words,words);weights=mixedWeights(words,result.bold);inkLevel=result.ink;}
  else weights=mixedWeights(words,words.map(w=>w.inkDensity===undefined||!measurable(w.text)?undefined:estimateOcrBold(w.text,family,region.height,w.inkDensity,region.blur)));
 }
 let bold=weights?weights.base:ownBold??(region.kind==='ocr'?(auto?single(words??[{text:region.text,inkDensity:region.inkDensity}]).bold:ocrStyle.includes('bold')):region.bold&&!weightFamilies.has(family));
 // A face that is a weight of its own (Raleway Light, Nunito ExtraBold) is never made bold on top.
 if(weightFamilies.has(family)){weights=undefined;bold=false;}
 let size=region.size,ocrAscent=region.height,charSpacing=region.kind==='pdf'&&!embedded?fallbackCharSpacing(family):0,boxWidth=Math.max(region.width+4,20);
 // (Not on a line with words in two weights: their ranges are character offsets in the text as read.)
 const shown=weights?.ranges.length?region.text:spacedText(region);
 if(region.kind==='ocr'){
  const ctx=document.createElement('canvas').getContext('2d')!,font=(b:boolean)=>`${italic?'italic ':''}${b?'bold ':''}100px "${family}"`;ctx.font=font(bold);const metrics=ctx.measureText(shown);
  // Ink width (not advance), to compare with the original's inked extent.
  let width=metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight;
  if(weights?.ranges.length){width=0;let offset=0;for(const w of words!){const own=weights.ranges.find(r=>offset>=r.start&&offset<r.end);ctx.font=font(own?own.bold:bold);width+=ctx.measureText(w.text).width;offset+=Array.from(w.text).length+1;}ctx.font=font(bold);width+=ctx.measureText(' ').width*(words!.length-1)-(metrics.width-(metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight));}
  const fit=fitOcrText(region,{width,actualBoundingBoxAscent:metrics.actualBoundingBoxAscent,actualBoundingBoxDescent:metrics.actualBoundingBoxDescent},Array.from(shown).length);size=fit.size;ocrAscent=fit.ascent;charSpacing=fit.charSpacing;
  // Box wide enough for the fitted line, so Fabric never wraps it.
  boxWidth=Math.max(boxWidth,width*size/100+(Array.from(shown).length-1)*charSpacing*size/1000+6);
 }
 const text=Object.assign(new Textbox(shown,{left:region.left,top:region.top,width:boxWidth,fontSize:size,charSpacing,fontFamily:family,fontWeight:embedded?'normal':bold?'bold':'normal',fontStyle:embedded?'normal':italic?'italic':'normal',fill:region.kind==='ocr'?darkenToInk(region.color,region.background,inkLevel):region.color,lineHeight:1,splitByGrapheme:true,objectCaching:false}),{id:uid(),name:region.text.slice(0,40),pdfOriginalFont:region.fontName,pdfFontData:embedded?region.fontData:undefined,pdfFontFallback:fallbackFont(region.fontName),pdfFontBold:bold,pdfFontItalic:italic,recognizedKey:recognitionKey(region),...(region.kind==='ocr'?{ocrOriginalBounds:originalFieldBounds(region)}:{})});
 for(const r of weights?.ranges??[])text.setSelectionStyles({fontWeight:r.bold?'bold':'normal'},r.start,r.end);
 fitOneLine(text);
 if(matchBlur&&region.kind==='ocr'&&(region.blur??0)>=.3)Object.assign(text,{textSoftness:clampTextSoftness(region.blur!)});
 // Fabric's top includes its ascender allowance; anchor the first baseline.
 // A PDF line goes exactly on its pen position and baseline: Fabric draws the
 // first baseline 1.13 × (1 − 0.222) em below the text's top, and the text sits
 // half a stroke width inside the box that left/top place (0.93 em left a
 // 26 pt line 0.7 pt high and 0.5 pt right).
 if(region.kind==='pdf'){const inset=text.strokeWidth/2;text.left=region.left-inset;text.top=region.baseline-text.fontSize*text._fontSizeMult*(1-text._fontSizeFraction)-inset;}
 else text.top=region.top+ocrAscent-size*.93;
 if(!level)turnLayer(text,region);
 return {text,embedded};
}

export async function matchedDetectedTextbox(region:TextRegion,c:Canvas,p:Page,regions:TextRegion[],options:{ocrFont:string;ocrStyle:string;matchBlur:boolean;autoFont:boolean;appearanceRegions?:TextRegion[]}){
 if(region.kind!=='ocr')return detectedTextbox(region,options);
 const all=regions.length?regions:[region],inkCache=new Map<string,Promise<PageInk|undefined>>();
 const ink=(family:string)=>{if(!inkCache.has(family))inkCache.set(family,options.ocrStyle==='auto'?pageInkLevel(all,family):Promise.resolve(undefined));return inkCache.get(family)!;};
 const makeText=async(r:TextRegion,family:string)=>(await detectedTextbox(r,{...options,ocrFont:family,matchBlur:false,pageInk:await ink(family),level:true})).text;
 const {matchOcrAppearance,applyOcrAppearance,matchOcrSoftness,matchOcrInk}=await import('./browser/ocr-appearance');
 // A PDF page's units are points (72 dpi): scanned letters are a few pixels
 // at that scale, where the font ranking, size, place and softness all came
 // out coarse (a bold Arial total set in Inter, text a third of a point off,
 // a blur the scan does not have). A scanned page is fitted on a render at the
 // scan's own resolution when the render budget reaches it, else with about
 // 32 px letters; the fit is brought back to page units.
 // A tilted line is fitted level, on the page turned back about its centre.
 const pdf=!!p.source,f=frameOf(region),fill=region.background||'#ffffff',regionsAll=framed(f,options.appearanceRegions??all,true);
 const native=pdf?await pdfScanScale(p.source!,p.index):undefined,k=pdf?native!==undefined&&native<=letterRasterScale(p.width,p.height,true)?native:Math.max(1,Math.min(4,32/Math.max(1,region.height),Math.sqrt(16e6/(p.width*p.height)))):1;
 const raster=levelRaster(pdf?await previewCanvas(p.source!,p.index,k,Math.ceil(p.width*k),Math.ceil(p.height*k)):await pageComposite(c,p),f,k,fill);
 const fine=(list:TextRegion[])=>k===1?list:scaleRegions(list,k,k),fineRegion=fine([region])[0],fineAll=fine(regionsAll);
 const fitted=await matchOcrAppearance(raster,fineRegion,fineAll,options.ocrFont,{autoFont:options.autoFont,matchBlur:options.matchBlur,makeText,alike:alikeLines(raster,fineAll,fineRegion)});
 if(!fitted)return detectedTextbox(region,{...options,pageInk:await ink(options.ocrFont)});
 const text=await makeText(region,fitted.family);applyOcrAppearance(text,region,{...fitted,dx:fitted.dx/k,dy:fitted.dy/k,softness:fitted.softness/k});
 if(pdf){
  // The shape fit settles on a crisper softness than a soft scan has, and ink
  // measured against it came out pale (grey #555 lines set 18% too light):
  // softness by edge width, then the line's own ink at that softness.
  if(options.matchBlur){text.textSoftness=matchOcrSoftness(raster,region,regionsAll,text,k);text.initDimensions();}
  const gain=matchOcrInk(raster,region,regionsAll,text,k);if(gain!==undefined)text.set({fill:fitted.ink&&fitted.inkGain!==undefined&&gain<=fitted.inkGain&&fitted.inkGain-gain<=.08?fitted.ink:matchedInkColor(region.color,region.background||'#ffffff',gain)});
  // Exported as it was fitted: pixels at this scale, not vector text over the scan.
  text.rasterScale=k;
 }
 return {text:turnLayer(text,region),embedded:false,score:fitted.score};
}

// Hide the original OCR text by clearing, repairing or patching the area under
// each region. Several regions are handled in one pass (Convert all), so each
// image layer is rasterized once. Mutates the serialized `objects` list of the page.
// A tilted line's area is a box in its level frame, turned with it.
export async function coverOcrText(c:Canvas,p:Page,regions:TextRegion[],objects:unknown[],{mode,color,padding,others=[],onProgress}:{mode:ReplacementBackground;color:string;padding:number;others?:TextRegion[];onProgress?:(fraction:number)=>void}){
 const areas=regions.map(region=>{const f=frameOf(region);return {region,f,...ocrPatchBounds(region,padding,p,framed(f,others.filter(o=>o!==region&&o.kind==='ocr'),true))};});
 if(mode==='transparent'){
  const overlaps=(o:FabricObject)=>{const b=o.getBoundingRect();return areas.some(area=>{const a=turnedBounds(area.f,area);return b.left<a.left+a.width&&b.top<a.top+a.height&&b.left+b.width>a.left&&b.top+b.height>a.top;});};
  const images=c.getObjects().filter(o=>o instanceof FabricImage&&o.visible&&overlaps(o));
  if(!images.length)throw new Error('Select image text to clear its background.');
  if(images.some(o=>o.lockMovementX))throw new Error('Unlock the image layers beneath this text first.');
  for(const image of images){
   const blend=image.globalCompositeOperation;let raster:HTMLCanvasElement;try{image.globalCompositeOperation='source-over';raster=pageRaster(c,p.width,p.height,[image]);}finally{image.globalCompositeOperation=blend;}
   const g=raster.getContext('2d')!;for(const a of areas)inLineFrame(g,a.f,()=>g.clearRect(a.left,a.top,a.width,a.height));
   const replacement=rasterLayer(raster,(image as Tagged).name||'Image',(image as Tagged).id!),index=objects.findIndex(o=>(o as Tagged).id===(image as Tagged).id);
   if(index>=0){if(replacement){replacement.globalCompositeOperation=blend;objects[index]=replacement.toObject();}else objects.splice(index,1);}
  }
 }else if(mode==='ai'){
  // LaMa reconstructs textures (photos, maps, gradients) behind the old text.
  const raster=await pageComposite(c,p),mask=document.createElement('canvas');mask.width=raster.width;mask.height=raster.height;const mctx=mask.getContext('2d')!;mctx.fillStyle='#000';
  for(const a of areas)inLineFrame(mctx,a.f,()=>mctx.fillRect(a.left,a.top,a.width,a.height));
  const {inpaintCanvas}=await import('./browser/ai-tools');
  for(const patch of await inpaintCanvas(raster,mask,areas.map(area=>{const a=turnedBounds(area.f,area);return {x:a.left,y:a.top,width:a.width,height:a.height};}),onProgress))objects.push(Object.assign(new FabricImage(patch.canvas,{left:patch.x,top:patch.y}),{id:uid(),name:'AI-filled background'}).toObject());
 }else if(mode==='repair'){
  const raster=await pageComposite(c,p);
  const pixels=raster.getContext('2d')!.getImageData(0,0,raster.width,raster.height);
  for(const a of areas){
   // A tilted line is repaired on the page levelled about its centre.
   const level=a.f.angle?levelRaster(raster,a.f,1,a.region.background||'#ffffff'):undefined,source=level?level.getContext('2d')!.getImageData(0,0,level.width,level.height):pixels;
   const repaired=repairTextBackground(source,{left:a.left,top:a.top,width:a.width,height:a.height});
   const patchCanvas=document.createElement('canvas');patchCanvas.width=repaired.width;patchCanvas.height=repaired.height;const context=patchCanvas.getContext('2d')!,patch=context.createImageData(repaired.width,repaired.height);patch.data.set(repaired.data);context.putImageData(patch,0,0);
   objects.push(Object.assign(turnLayer(new FabricImage(patchCanvas,{left:repaired.left,top:repaired.top}),a.region),{id:uid(),name:'Repaired text background'}).toObject());
  }
 }else for(const a of areas)objects.push(Object.assign(turnLayer(new Rect({left:a.left,top:a.top,width:a.width,height:a.height,fill:mode==='solid'?color:a.region.background||'#ffffff',strokeWidth:0}),a.region),{id:uid(),name:'Text background patch'}).toObject());
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

// What a page's lines share. `ink`: ink level of the page's text, measured on
// lines that mix bold and regular (their split pins the level down), used to
// settle single-weight lines on the same page when blur makes their own
// evidence ambiguous. `scale`: scan pixels per page unit (a scanned PDF is
// read on a larger raster): a region's box is in page units, its words' ink
// and blur were measured in scan pixels.
export type PageInk={scale:number;ink?:number;luma?:number};
const luma=(hex:string)=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return .299*v[0]+.587*v[1]+.114*v[2];};
export async function pageInkLevel(regions:TextRegion[],family:string):Promise<PageInk|undefined>{
 await ensureFont(family);
 const seen=new Set<unknown>(),levels:{ink:number;luma:number}[]=[],scales:number[]=[],ctx=document.createElement('canvas').getContext('2d')!;
 ctx.font=`64px "${family}"`;const span=(t:string)=>{const m=ctx.measureText(t);return m.actualBoundingBoxLeft+m.actualBoundingBoxRight;};
 for(const r of regions){
  if(r.kind!=='ocr'||!r.line)continue;
  // The region's text at the size that fits its words' scan widths, against its width on the page.
  const own=r.line.words.slice(r.line.start,r.line.start+r.line.count).filter(w=>w.width&&span(w.text)>0),drawn=own.reduce((s,w)=>s+span(w.text),0);
  if(drawn>0&&r.width>0)scales.push(span(r.text)*own.reduce((s,w)=>s+w.width!,0)/drawn/r.width);
  if(seen.has(r.line.words)||!/^#[0-9a-f]{6}$/i.test(r.color))continue;seen.add(r.line.words);
  const inks=r.line.words.map(w=>{if(!/[\p{L}\p{N}]/u.test(w.text)||!w.inkMass||!w.width)return undefined;const a=glyphInk(w.text,family,'normal'),b=glyphInk(w.text,family,'bold');return a&&b?wordInk(w.text,w.inkMass,w.width,a,b):undefined;});
  const result=classifyWordWeights(inks,false);
  if(result.ink!==undefined&&result.bold.includes(true)&&result.bold.includes(false))levels.push({ink:result.ink,luma:luma(r.color)});
 }
 const mid=(v:number[])=>v.sort((a,b)=>a-b)[v.length>>1];
 return {scale:scales.length?mid(scales):1,...levels.length?{ink:mid(levels.map(l=>l.ink)),luma:mid(levels.map(l=>l.luma))}:{}};
}
// Only text of a similar colour shares the page's ink level (a light grey
// caption must not be judged against black body text).
function sameInk(region:TextRegion,page:PageInk|undefined){return page?.ink!==undefined&&page.luma!==undefined&&/^#[0-9a-f]{6}$/i.test(region.color)&&luma(region.color)<=page.luma+90?page.ink:undefined;}

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
// PDF units are points (72 dpi). Preserve the finest bounded raster for all
// letter sizes: large text otherwise became a 72 dpi patch over a sharp scan.
export const letterScale=(_region:TextRegion,p:Page)=>letterRasterScale(p.width,p.height,!!p.source);
const scaledRegion=(r:TextRegion,k:number):TextRegion=>k===1?r:{...r,left:r.left*k,top:r.top*k,width:r.width*k,height:r.height*k,glyphs:r.glyphs?.map(g=>({...g,x0:g.x0*k,x1:g.x1*k}))};

// Glyphs of `regions` whose x-height matches (within 12%), each with its line's
// baseline, so letters from lines with or without descenders line up.
function letterLibrary(raster:HTMLCanvasElement,regions:TextRegion[],xHeight:number,exclude:TextRegion,page?:string):LibraryGlyph[]{
 return regions.filter(r=>r!==exclude&&r.kind==='ocr'&&r.glyphs).flatMap(r=>{
  const {rows,y0}=rowInk(raster,r),m=lineMetrics(rows);if(!m||Math.abs(m.xHeight-xHeight)>Math.max(1,xHeight*.12))return [];
  const own=lineCells(r.text,r.glyphs!);return own?own.filter(g=>!g.space&&g.ch!==UNREAD).map(g=>({...g,y0:r.top,y1:r.top+r.height,source:r.id,baseline:y0+m.baseline,page})):[];
 });
}

// The middle of each letter's ink across (its centroid over the line's rows)
// and where that ink starts and ends, to put one letter where another stood.
// Undefined for spaces and empty cells.
function inkMiddles(ctx:CanvasRenderingContext2D,r:{top:number;height:number},paper:number[],cells:{x0:number;x1:number;space?:boolean}[]){
 const inked=cells.filter(c=>!c.space);if(!inked.length)return cells.map(()=>undefined);
 const x0=Math.max(0,Math.floor(Math.min(...inked.map(c=>c.x0)))),x1=Math.min(ctx.canvas.width,Math.ceil(Math.max(...inked.map(c=>c.x1)))),y0=Math.max(0,Math.floor(r.top)),h=Math.max(1,Math.min(ctx.canvas.height-y0,Math.ceil(r.height))),w=x1-x0;
 if(w<1)return cells.map(()=>undefined);
 const d=ctx.getImageData(x0,y0,w,h).data,col=new Float32Array(w);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(Math.max(Math.abs(d[i]-paper[0]),Math.abs(d[i+1]-paper[1]),Math.abs(d[i+2]-paper[2]))>60)col[x]++;}
 return cells.map(c=>{if(c.space)return undefined;let m=0,sum=0,i0=Infinity,i1=-Infinity;for(let x=Math.max(x0,Math.floor(c.x0));x<Math.min(x1,Math.ceil(c.x1));x++){const v=col[x-x0];if(!v)continue;m+=v;sum+=v*(x+.5);i0=Math.min(i0,x);i1=Math.max(i1,x+1);}return m?{m:sum/m,i0,i1}:undefined;});
}
// A line is right-aligned when its right edge lines up with other lines of
// its column (amounts in a table) more than its left edge does; a tie goes
// right for amounts. Boxes are trimmed to ink, hence the tolerance.
export function rightAligned(region:TextRegion,others:TextRegion[]){
 const tol=Math.max(2,region.height*.08),right=region.left+region.width,column=others.filter(o=>Math.min(o.top+o.height,region.top+region.height)-Math.max(o.top,region.top)<.5*Math.min(o.height,region.height));
 const rights=column.filter(o=>Math.abs(o.left+o.width-right)<tol).length,lefts=column.filter(o=>Math.abs(o.left-region.left)<tol).length;
 const digits=region.text.replace(/\D/g,'').length,letters=region.text.replace(/[^\p{L}]/gu,'').length;
 return rights>lefts||rights>0&&rights===lefts&&digits>letters;
}
// The paper under a line: the median colour of its box's pixels near the
// detected background (a banded table row is not the page's white).
function paperOf(ctx:CanvasRenderingContext2D,r:{left:number;top:number;width:number;height:number;background?:string}){
 const guess=hexRgb(r.background||'#ffffff'),x=Math.max(0,Math.floor(r.left)-1),y=Math.max(0,Math.floor(r.top)-1),w=Math.max(1,Math.min(ctx.canvas.width-x,Math.ceil(r.width)+2)),h=Math.max(1,Math.min(ctx.canvas.height-y,Math.ceil(r.height)+2));
 const d=ctx.getImageData(x,y,w,h).data,near:number[][]=[[],[],[]];
 for(let i=0;i<d.length;i+=4)if(Math.max(Math.abs(d[i]-guess[0]),Math.abs(d[i+1]-guess[1]),Math.abs(d[i+2]-guess[2]))<48)for(let n=0;n<3;n++)near[n].push(d[i+n]);
 return near[0].length<8?guess:near.map(v=>v.sort((p,q)=>p-q)[v.length>>1]);
}
// The colour of a line's ink: the mean of its strongest tenth of pixels.
function inkOf(ctx:CanvasRenderingContext2D,r:{left:number;top:number;width:number;height:number},paper:number[]){
 const x=Math.max(0,Math.floor(r.left)),y=Math.max(0,Math.floor(r.top)),w=Math.max(1,Math.min(ctx.canvas.width-x,Math.ceil(r.width))),h=Math.max(1,Math.min(ctx.canvas.height-y,Math.ceil(r.height)));
 const d=ctx.getImageData(x,y,w,h).data,px:{v:number;i:number}[]=[];
 for(let i=0;i<d.length;i+=4){const v=Math.max(Math.abs(d[i]-paper[0]),Math.abs(d[i+1]-paper[1]),Math.abs(d[i+2]-paper[2]));if(v>40)px.push({v,i});}
 if(px.length<8)return undefined;px.sort((a,b)=>b.v-a.v);const n=Math.max(1,Math.ceil(px.length*.1)),sum=[0,0,0];
 for(let k=0;k<n;k++)for(let c=0;c<3;c++)sum[c]+=d[px[k].i+c];
 return sum.map(v=>v/n);
}
// Letters the edited line lacks, from other lines of the page verified to be
// in its lettering (letter-match.ts): the characters the two lines share are
// alike in shape and ink. Nearest lines first; a line under an earlier edit
// (`blocked`) no longer shows what was read there. Each letter comes with its
// line's baseline as the shared letters place it against this line's.
// The lettering of one line, to judge other lines of the page by their own
// pixels (letter-match.ts): `judge` compares a measured line's letters with
// it, `line` measures another line (undefined when its ink colour differs).
function lettering(raster:HTMLCanvasElement,region:TextRegion,cells:{ch:string;x0:number;x1:number;space?:boolean}[],baseline:number){
 const ctx=raster.getContext('2d',{willReadFrequently:true})!,bg=paperOf(ctx,region),up=Math.ceil(baseline-region.top)+1,down=Math.ceil(region.top+region.height-baseline)+1;
 // The line's ink contrast: its strongest pixels (the 95th percentile of the inked ones).
 const box=ctx.getImageData(Math.max(0,Math.floor(region.left)),Math.max(0,Math.floor(region.top)),Math.max(1,Math.ceil(region.width)),Math.max(1,Math.ceil(region.height))).data,inked:number[]=[];
 for(let i=0;i<box.length;i+=4){const v=Math.max(Math.abs(box[i]-bg[0]),Math.abs(box[i+1]-bg[1]),Math.abs(box[i+2]-bg[2]));if(v>40)inked.push(v);}
 if(inked.length<8)return undefined;inked.sort((a,b)=>a-b);const contrast=inked[Math.floor((inked.length-1)*.95)];
 const cover=(g:{x0:number;x1:number},base:number,paper:number[]):Cover|undefined=>{const x=Math.floor(g.x0),w=Math.ceil(g.x1)-x,y=Math.round(base)-up;if(w<1||x<0||y<0||x+w>raster.width||y+up+down>raster.height)return undefined;return letterCover(ctx.getImageData(x,y,w,up+down).data,w,up+down,paper,contrast);};
 // Up to two instances of each telling character, none cut from a blot (fusedCells).
 const covers=(list:{ch:string;x0:number;x1:number;space?:boolean}[],base:number,paper:number[],only?:Set<string>,fused?:boolean[])=>{const m=new Map<string,Cover[]>();for(const [i,g] of list.entries()){if(g.space||fused?.[i]||!telling(g.ch)||only&&!only.has(g.ch)||(m.get(g.ch)?.length??0)>=2)continue;const c=cover(g,base,paper);if(c)m.set(g.ch,[...m.get(g.ch)??[],c]);}return m;};
 // Judged on letters standing clear; where too few do (soft digits touch), on all of them.
 const mineFused=fusedCells(cells),mine=covers(cells,baseline,bg,undefined,mineFused),mineAll=covers(cells,baseline,bg),ink=inkOf(ctx,region,bg);if(!mineAll.size||!ink)return undefined;
 const judge=(list:{ch:string;x0:number;x1:number;space?:boolean}[],base:number,paper:number[],fused:boolean[])=>{const clear=sameLettering(mine,covers(list,base,paper,new Set(mine.keys()),fused));return clear.shared>=2?clear:sameLettering(mineAll,covers(list,base,paper,new Set(mineAll.keys())));};
 const line=(r:TextRegion)=>{const {rows,y0}=rowInk(raster,r),m=lineMetrics(rows),own=lineCells(r.text,r.glyphs!);if(!m||!own)return undefined;const paper=paperOf(ctx,r),theirs=inkOf(ctx,r,paper);if(!theirs||theirs.some((v,n)=>Math.abs(v-ink[n])>30))return undefined;const middles=inkMiddles(ctx,r,paper,own);return {r,own,base:y0+m.baseline,paper,middles,fused:fusedCells(own.map((g,i)=>({...g,...middles[i]})))};};
 return {ctx,bg,ink,mine,mineAll,covers,judge,line};
}
// Lines of the page proven to be in the same lettering as this one (sharing
// two telling letters or more, alike in shape and ink): an edit set in a font
// is matched on all of them, so the lines of one list get one face and weight.
export function alikeLines(raster:HTMLCanvasElement,regions:TextRegion[],region:TextRegion){
 if(!region.glyphs)return [];
 const cells=lineCells(region.text,region.glyphs);if(!cells)return [];
 const target=rowInk(raster,region),metrics=lineMetrics(target.rows);if(!metrics)return [];
 const ctx=raster.getContext('2d',{willReadFrequently:true})!,middles=inkMiddles(ctx,region,paperOf(ctx,region),cells);cells.forEach((cell,i)=>Object.assign(cell,middles[i]));
 const L=lettering(raster,region,cells,target.y0+metrics.baseline);if(!L)return [];
 const shares=(r:TextRegion)=>new Set([...r.text].filter(ch=>L.mineAll.has(ch))).size;
 return regions.filter(r=>r.id!==region.id&&r.kind==='ocr'&&r.glyphs&&!r.angle===!region.angle&&shares(r)>=2).flatMap(r=>{const line=L.line(r);if(!line)return [];const verdict=L.judge(line.own,line.base,line.paper,line.fused);return verdict.ok&&verdict.shared>=2?[r]:[];});
}
function verifiedLibrary(raster:HTMLCanvasElement,regions:TextRegion[],region:TextRegion,cells:{ch:string;x0:number;x1:number;space?:boolean}[],baseline:number,needed:string[],blocked:{left:number;top:number;width:number;height:number}[],page?:string):LibraryGlyph[]{
 const wanted=needed.filter(ch=>/\S/.test(ch));if(!wanted.length)return [];
 const L=lettering(raster,region,cells,baseline);if(!L)return [];
 const {ctx,ink,mine,mineAll,covers,judge}=L;
 const centre=(r:{left:number;top:number;width:number;height:number})=>[r.left+r.width/2,r.top+r.height/2],[cx,cy]=centre(region);
 const candidates=regions.filter(r=>r.id!==region.id&&r.kind==='ocr'&&r.glyphs&&wanted.some(ch=>r.text.includes(ch))&&[...mineAll.keys()].some(ch=>r.text.includes(ch))&&!blocked.some(b=>b.left<r.left+r.width&&b.left+b.width>r.left&&b.top<r.top+r.height&&b.top+b.height>r.top))
  .sort((a,b)=>Math.abs(centre(a)[1]-cy)+Math.abs(centre(a)[0]-cx)*.25-Math.abs(centre(b)[1]-cy)-Math.abs(centre(b)[0]-cx)*.25).slice(0,16);
 const out:LibraryGlyph[]=[],left=new Set(wanted);
 for(const r of candidates){
  if(!left.size)break;if(!wanted.some(ch=>left.has(ch)&&r.text.includes(ch)))continue;
  const {rows,y0}=rowInk(raster,r),m=lineMetrics(rows),own=lineCells(r.text,r.glyphs!);if(!m||!own)continue;
  const base=y0+m.baseline,paper=paperOf(ctx,r),theirs=inkOf(ctx,r,paper);
  // The same ink colour (black digits must not stand in a grey or green line).
  if(!theirs||theirs.some((v,n)=>Math.abs(v-ink[n])>30))continue;
  const middles=inkMiddles(ctx,r,paper,own),fused=fusedCells(own.map((g,i)=>({...g,...middles[i]})));
  const verdict=judge(own,base,paper,fused);
  if(!verdict.ok)continue;
  own.forEach((g,i)=>{if(g.space||g.ch===UNREAD||!left.has(g.ch))return;out.push({...g,y0:r.top,y1:r.top+r.height,source:r.id,baseline:base+verdict.dy,page,...middles[i],fused:fused[i]});});
  // A letter only found cut from a blot is kept, but a clearer one is still looked for.
  for(const ch of wanted)if(own.some((g,i)=>g.ch===ch&&!fused[i]))left.delete(ch);
 }
 // Through one other line: a line holding a missing letter but sharing none
 // with the edited line is compared with a line verified against it on two
 // letters or more (in a table, "1 205" with "1 482" for the cell "4,8"). The
 // ink of both steps together stays within the same 8%, so a slightly heavier
 // face cannot pass in two halves; a line that shares letters with the edited
 // one is only ever judged directly, above.
 if(left.size){
  const unblocked=(r:TextRegion)=>!blocked.some(b=>b.left<r.left+r.width&&b.left+b.width>r.left&&b.top<r.top+r.height&&b.top+b.height>r.top);
  const shares=(r:TextRegion)=>new Set([...r.text].filter(ch=>mineAll.has(ch))).size;
  const pool=regions.filter(r=>r.id!==region.id&&r.kind==='ocr'&&r.glyphs&&unblocked(r)).sort((a,b)=>Math.abs(centre(a)[1]-cy)+Math.abs(centre(a)[0]-cx)*.25-Math.abs(centre(b)[1]-cy)-Math.abs(centre(b)[0]-cx)*.25);
  const measured=(r:TextRegion)=>{const {rows,y0}=rowInk(raster,r),m=lineMetrics(rows),own=lineCells(r.text,r.glyphs!);if(!m||!own)return undefined;const paper=paperOf(ctx,r),theirs=inkOf(ctx,r,paper);if(!theirs||theirs.some((v,n)=>Math.abs(v-ink[n])>30))return undefined;const middles=inkMiddles(ctx,r,paper,own);return {r,own,base:y0+m.baseline,paper,middles,fused:fusedCells(own.map((g,i)=>({...g,...middles[i]})))};};
  const links:{covers:Map<string,Cover[]>;dy:number;mass:number}[]=[];
  for(const r of pool.filter(r=>shares(r)>=2).slice(0,8)){
   const line=measured(r);if(!line)continue;const verdict=judge(line.own,line.base,line.paper,line.fused);
   if(verdict.ok&&verdict.shared>=2)links.push({covers:covers(line.own,line.base,line.paper,undefined,line.fused),dy:verdict.dy,mass:verdict.mass});
  }
  for(const r of pool.filter(r=>!shares(r)&&[...left].some(ch=>r.text.includes(ch))).slice(0,12)){
   if(!links.length||!left.size)break;
   const line=measured(r);if(!line)continue;
   for(const link of links){
    const verdict=sameLettering(link.covers,covers(line.own,line.base,line.paper,new Set(link.covers.keys()),line.fused)),mass=link.mass*verdict.mass;
    if(!verdict.ok||verdict.shared<2||mass>LETTERING.mass||mass<1/LETTERING.mass)continue;
    const {middles,fused}=line;
    line.own.forEach((g,i)=>{if(g.space||g.ch===UNREAD||!left.has(g.ch))return;out.push({...g,y0:r.top,y1:r.top+r.height,source:r.id,baseline:line.base+verdict.dy+link.dy,page,...middles[i],fused:fused[i]});});
    for(const ch of [...left])if(line.own.some((g,i)=>g.ch===ch&&!fused[i]))left.delete(ch);
    break;
   }
  }
 }
 return out;
}

// A tilted line is edited in its level frame, on the page turned back about
// its centre as OCR read it (lines tilted the same way only shift into that
// frame); the patch is turned back onto the line, so it changes only pixels
// inside the line's own turned box.
// Why an edit with the line's own letters is impossible, in the user's words.
export function letterEditBlocker(region:TextRegion,next:string){
 if(region.kind!=='ocr'||!region.glyphs)return 'this line was read without the positions of its letters, so they cannot be reused.';
 const cells=lineCells(region.text,region.glyphs);if(!cells)return "the recognized text does not line up with this line's letters.";
 const missing=missingLetters(cells.map(c=>c.ch).join(''),cells,withUnread(region.text,cells,next)).map(c=>c===' '?'a space':`“${c}”`);
 if(missing.length)return `${missing.length===1?'':'the characters '}${missing.join(', ')} ${missing.length===1?'does':'do'} not appear in this line, nor in another line of the page verified to be in the same lettering.`;
 return 'this line could not be measured precisely enough to rebuild it.';
}
// The face a line was matched with (matchedDetectedTextbox), to draw the
// letters an edit needs and the page does not have. Sizes in page units.
export type LetterFace={family:string;weight:string|number;style:string;size:number;fill:string;softness:number;charSpacing?:number;score?:number};
// Where the ink of each character of `text` starts and ends when set in
// `face`, `k` raster pixels per page unit (none for a space): the face's own
// advances, kerning and letter spacing.
function faceRuler(text:string,face:LetterFace,k:number){
 const up=4,px=face.size*k,g=document.createElement('canvas').getContext('2d')!;g.font=`${face.style} ${face.weight} ${px*up}px "${face.family}"`;
 const chars=Array.from(text),spacing=(face.charSpacing??0)/1000*px;let prefix='';
 return chars.map((ch,j)=>{
  prefix+=ch;if(/\s/.test(ch))return undefined;
  const m=g.measureText(ch),pen=(g.measureText(prefix).width-m.width)/up+j*spacing;
  return m.actualBoundingBoxLeft+m.actualBoundingBoxRight>0?{i0:pen-m.actualBoundingBoxLeft/up,i1:pen+m.actualBoundingBoxRight/up}:undefined;
 });
}
// Characters drawn in `face` at `k` raster pixels per page unit over `paper`,
// side by side on a strip, as letters to lend: each with its ink, its
// baseline and the blank the face gives it on each side. Drawn four times
// finer and reduced, softened by the line's own softness (computed, not the
// canvas blur filter, which some browsers lack).
function drawnLetters(chars:string[],face:LetterFace,k:number,paper:number[],page:string):{raster:HTMLCanvasElement;glyphs:LibraryGlyph[]}|undefined{
 const px=face.size*k,sigma=Math.max(0,face.softness)*k,pad=Math.ceil(sigma*3)+4,up=4,font=`${face.style} ${face.weight} ${px*up}px "${face.family}"`;
 const measure=document.createElement('canvas').getContext('2d')!;measure.font=font;
 const boxes=chars.map(ch=>{const m=measure.measureText(ch);return {ch,advance:m.width/up,left:m.actualBoundingBoxLeft/up,right:m.actualBoundingBoxRight/up};}).filter(b=>b.right+b.left>0);
 if(boxes.length!==chars.length||!/^#[0-9a-f]{6}$/i.test(face.fill))return undefined;
 const base=Math.ceil(px*1.25)+pad,height=base+Math.ceil(px*.45)+pad;let x=pad;
 const cells=boxes.map(b=>{const w=Math.ceil(b.left+b.right)+2*pad,cell={...b,x0:x,x1:x+w,pen:x+pad+b.left};x+=w+pad;return cell;}),width=x;
 if(width*up>16000||height*up>4000)return undefined;
 const hi=document.createElement('canvas');hi.width=width*up;hi.height=height*up;const g=hi.getContext('2d',{willReadFrequently:true})!;g.font=font;g.fillStyle='#000';g.textBaseline='alphabetic';
 for(const cell of cells)g.fillText(cell.ch,cell.pen*up,base*up);
 const soft=blurCoverage(alphaCoverage(g.getImageData(0,0,hi.width,hi.height).data,hi.width,hi.height),sigma*up);
 const raster=document.createElement('canvas');raster.width=width;raster.height=height;const out=new ImageData(width,height),ink=hexRgb(face.fill);
 for(let y=0;y<height;y++)for(let u=0;u<width;u++){let a=0;for(let dy=0;dy<up;dy++)for(let dx=0;dx<up;dx++)a+=soft.data[(y*up+dy)*hi.width+u*up+dx];a/=up*up;const o=(y*width+u)*4;for(let n=0;n<3;n++)out.data[o+n]=paper[n]+(ink[n]-paper[n])*a;out.data[o+3]=255;}
 const ctx=raster.getContext('2d',{willReadFrequently:true})!;ctx.putImageData(out,0,0);
 const middles=inkMiddles(ctx,{top:0,height},paper,cells),glyphs:LibraryGlyph[]=[];
 for(const [i,cell] of cells.entries()){
  const m=middles[i];if(!m)return undefined;
  let top=height,bottom=0;for(let y=0;y<height;y++)for(let u=m.i0;u<m.i1;u++){const o=(y*width+u)*4;if(Math.max(Math.abs(out.data[o]-paper[0]),Math.abs(out.data[o+1]-paper[1]),Math.abs(out.data[o+2]-paper[2]))>60){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}}
  glyphs.push({ch:cell.ch,x0:cell.x0,x1:cell.x1,y0:top,y1:bottom,source:'font',baseline:base,page,...m,l:Math.max(0,m.i0-(cell.pen-cell.left)),r:Math.max(0,cell.pen-cell.left+cell.advance-m.i1)});
 }
 return {raster,glyphs};
}
// `face`: letters the page cannot lend are drawn in it (the caller chose a
// font for this edit); the returned layer lists them in `drawn`.
export async function glyphEditPatch(c:Canvas,p:Page,lineRegion:TextRegion,next:string,pageRegions:TextRegion[]=[],sources:LetterSource[]=[],face?:LetterFace){
 if(lineRegion.kind!=='ocr'||!lineRegion.glyphs)return undefined;
 // Everything below works in raster pixels, `k` per page unit.
 // A scanned PDF is cut at the scan's own resolution when the render budget
 // reaches it (letters are then the scan's pixels, not a resampling of them).
 const budget=letterScale(lineRegion,p),native=p.source?await pdfScanScale(p.source,p.index):undefined,k=native!==undefined&&native<=budget?native:budget,f=frameOf(lineRegion),fill=lineRegion.background||'#ffffff',region=scaledRegion(lineRegion,k),page=pageRegions.flatMap(r=>r.id===lineRegion.id?[]:framed(f,[r]).map(m=>scaledRegion(m,k)));
 // Another page's letters are cut in the frame of one of its lines.
 const otherPages=sources.map(o=>{const of=frameOf(o.regions.find(r=>r.glyphs)??lineRegion);return {...o,frame:of,regions:framed(of,o.regions).map(r=>scaledRegion(r,k))};});
 // Placeholder cells (ink the recognizer did not read) are planned as
 // characters of their own, kept where the edit leaves them alone.
 const cells=lineCells(region.text,region.glyphs!);if(!cells)return undefined;
 const read=cells.map(c=>c.ch).join(''),wanted=withUnread(region.text,cells,next);
 const raster=levelRaster(k===1?await pageComposite(c,p):await previewCanvas(p.source!,p.index,k,Math.ceil(p.width*k),Math.ceil(p.height*k)),f,k,fill),W=raster.width,H=raster.height;
 const target=rowInk(raster,region),metrics=lineMetrics(target.rows);if(!metrics)return undefined;
 const rctx=raster.getContext('2d',{willReadFrequently:true})!,middles=inkMiddles(rctx,region,paperOf(rctx,region),cells);cells.forEach((cell,i)=>Object.assign(cell,middles[i]));
 const layout={right:rightAligned(region,page)};
 const baseline=target.y0+metrics.baseline,rasters=new Map<string,HTMLCanvasElement>([[p.id,raster]]);
 // Earlier edits drawn on a picture page changed what their lines show.
 const blocked=p.source?[]:c.getObjects().filter(o=>typeof (o as Tagged&{editedText?:string}).editedText==='string'||o instanceof Textbox).map(o=>o.getBoundingRect());
 // Letters to look for on the page's other lines: those this line lacks, and
 // those it only has cut from a blot (fusedCells) when the edit adds one.
 const fused=fusedCells(cells),cutOnly=[...new Set(Array.from(wanted))].filter(ch=>telling(ch)&&cells.some(c=>c.ch===ch)&&cells.every((c,i)=>c.ch!==ch||fused[i]));
 const library=page.length?verifiedLibrary(raster,page,region,cells,baseline,[...missingLetters(read,cells,wanted),...cutOnly],blocked,p.id):[];
 let plan=planGlyphEdit(read,cells,wanted,library,layout);
 // A letter missing from this page: look for it on the other pages.
 for(const other of otherPages){
  if(plan||other.page.id===p.id)continue;
  if(!planGlyphEdit(read,cells,wanted,other.regions.flatMap(r=>r.glyphs?lineCells(r.text,r.glyphs)?.filter(g=>!g.space&&g.ch!==UNREAD).map(g=>({...g,y0:0,y1:0,source:r.id}))??[]:[]),layout)&&!plan)continue;
  const source=levelRaster(await offscreenComposite(other.page,k),other.frame,k,fill);rasters.set(other.page.id,source);
  plan=planGlyphEdit(read,cells,wanted,[...library,...letterLibrary(source,other.regions,metrics.xHeight,region,other.page.id)],layout);
 }
 // Letters found nowhere, when a font was chosen: drawn in the matched face.
 // The line keeps every letter it has; only those are new.
 let drawn:string[]=[];
 if(!plan&&face){
  const lacking=[...new Set(Array.from(wanted))].filter(ch=>/\S/.test(ch)&&ch!==UNREAD&&!cells.some(cell=>cell.ch===ch)&&!library.some(l=>l.ch===ch));
  const made=lacking.length?drawnLetters(lacking,face,k,paperOf(rctx,region),'font:'+region.id):undefined;
  // The face also rules where the letters go, when its ruler describes the
  // line as it is: set against the ink of the line's own letters (a straight
  // fit of their middles), it is stretched to them (an approximate face, or
  // a size a percent off, runs a few pixels long by the end of a line), and
  // left aside when the letters stray from it by more than 6% of their size.
  let ruler:ReturnType<typeof faceRuler>|undefined,rulerFrom:number|undefined;
  if(!wanted.includes(UNREAD)&&!f.angle){
   const old=faceRuler(read,face,k),pairs=cells.flatMap((cell,i)=>!cell.space&&cell.i0!==undefined&&cell.i1!==undefined&&old[i]?[{x:(old[i]!.i0+old[i]!.i1)/2,y:(cell.i0+cell.i1)/2}]:[]);
   if(pairs.length>=4){
    const n=pairs.length,mx=pairs.reduce((a,q)=>a+q.x,0)/n,my=pairs.reduce((a,q)=>a+q.y,0)/n,sxx=pairs.reduce((a,q)=>a+(q.x-mx)**2,0),slope=sxx>0?pairs.reduce((a,q)=>a+(q.x-mx)*(q.y-my),0)/sxx:1;
    const off=Math.sqrt(pairs.reduce((a,q)=>a+(my+slope*(q.x-mx)-q.y)**2,0)/n);
    if(slope>.85&&slope<1.15&&off<=face.size*k*.06){ruler=faceRuler(wanted,face,k).map(r=>r&&{i0:r.i0*slope,i1:r.i1*slope});rulerFrom=old.find(Boolean)!.i0*slope;}
   }
  }
  if(made){rasters.set('font:'+region.id,made.raster);plan=planGlyphEdit(read,cells,wanted,[...library,...made.glyphs],{...layout,ruler,rulerFrom});if(plan)drawn=lacking;}
  else if(!lacking.length&&ruler)plan=planGlyphEdit(read,cells,wanted,library,{...layout,ruler,rulerFrom});
 }
 if(!plan)return undefined;
 // Whole pixels: a placed piece moves by a whole number of them from where it was cut.
 const startX=Math.max(0,Math.round(plan.startX)),pieces=plan.pieces.map(q=>({...q,x0:Math.round(q.x0),x1:Math.round(q.x1),at:q.to===undefined?undefined:Math.round(q.x0)+Math.round(q.to-q.x0)-startX})),width=pieces.reduce((s,q)=>s+q.x1-q.x0,0);
 // The 300 dpi source scale is fractional in PDF points. Raster bounds and
 // array indices must still be integers; divide by k only for page placement.
 const pad=Math.ceil(k),sidePad=Math.ceil(2*k),rowPad=Math.ceil(8*k);
 const top=Math.max(0,Math.floor(region.top)-pad),bottom=Math.min(H,Math.ceil(region.top+region.height)+pad),endX=Math.min(W,Math.ceil(Math.max(plan.oldEnd,plan.end,...pieces.map(q=>q.at===undefined?0:startX+q.at+q.x1-q.x0),pieces.some(q=>q.at===undefined)?startX+width:0))+pad);
 // Analyse the whole line plus a margin of rows to see where blobs lead.
 const ax0=Math.max(0,Math.floor(Math.min(region.left,startX))-sidePad),ax1=Math.min(W,Math.max(endX,Math.ceil(region.left+region.width)+sidePad)),ay0=Math.max(0,top-rowPad),ay1=Math.min(H,bottom+rowPad);
 const ctx=raster.getContext('2d',{willReadFrequently:true})!,area=ctx.getImageData(ax0,ay0,ax1-ax0,ay1-ay0),bg=paperOf(ctx,region);
 const own=ownInk(area.data,area.width,area.height,bg,top-ay0,bottom-ay0);
 // Soft letters fade below the ink threshold over a pixel or two. That fringe
 // (pixels within two of this line's ink, not ink themselves) goes with its
 // letter: left behind it outlines the old letters, left out it sharpens the
 // new ones. Where letters leave, the paper is the scan's own, noise included:
 // pixels of this line's band away from any ink, not one flat colour (a
 // smooth patch shows on a noisy scan once zoomed in).
 const aw=area.width,ah=area.height,away=(i:number)=>Math.max(Math.abs(area.data[i*4]-bg[0]),Math.abs(area.data[i*4+1]-bg[1]),Math.abs(area.data[i*4+2]-bg[2]));
 const fringe=new Uint8Array(aw*ah),nearInk=new Uint8Array(aw*ah);
 for(let y=0;y<ah;y++)for(let x=0;x<aw;x++){
  const i=y*aw+x;if(away(i)<=16)continue;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=aw||ny>=ah)continue;const j=ny*aw+nx;nearInk[j]=1;if(own[i]&&Math.abs(dx)<=2&&Math.abs(dy)<=2&&away(j)<=16)fringe[j]=1;}
 }
 const grain:number[]=[];for(let y=Math.max(0,top-ay0);y<Math.min(ah,bottom-ay0);y++)for(let x=0;x<aw;x++){const i=y*aw+x;if(!nearInk[i]&&away(i)<=8)grain.push(i);}
 // The paper's own colour where a letter left, column by column: from the
 // rows just above and below the line (each a median of five pixels across),
 // blended down the line, so a gradient or a picture behind the text carries
 // on (one colour for the whole line left a lighter smudge on a pink-to-
 // purple card). The scan's grain is added as each grain pixel's departure
 // from that local colour, never as a colour from elsewhere on the line.
 const r0=Math.max(0,top-1-ay0),r1=Math.min(ah-1,bottom-ay0),edge=(row:number)=>Array.from({length:aw},(_,x)=>[0,1,2].map(c=>{const v:number[]=[];for(let dx=-2;dx<=2;dx++){const xx=Math.max(0,Math.min(aw-1,x+dx));v.push(area.data[(row*aw+xx)*4+c]);}return v.sort((a,b)=>a-b)[2];}));
 const above=edge(r0),below=edge(r1),local=(x:number,y:number,c:number)=>{const f=r1>r0?Math.max(0,Math.min(1,(y-r0)/(r1-r0))):0;return above[x][c]*(1-f)+below[x][c]*f;};
 const paperAt=(x:number,y:number,o:number)=>{
  const ax=Math.max(0,Math.min(aw-1,x-ax0)),ay=y-ay0;
  if(grain.length<64){for(let c=0;c<3;c++)out.data[o+c]=local(ax,ay,c);}
  else{const g=grain[((Math.imul(x,73856093)^Math.imul(y,19349663))>>>0)%grain.length],gx=g%aw,gy=(g-gx)/aw;for(let c=0;c<3;c++)out.data[o+c]=local(ax,ay,c)+area.data[g*4+c]-local(gx,gy,c);}
  out.data[o+3]=255;
 };
 // Borrowed letters may reach below the line box (descenders): the patch grows to fit them.
 const reach=Math.max(0,...pieces.filter(q=>q.source!==undefined).map(q=>Math.ceil((q.y1??0)-(q.baseline??0))-(bottom-baseline)));
 const patchW=Math.max(1,endX-startX),patchH=Math.min(H,bottom+reach)-top,out=new ImageData(patchW,patchH);
 for(let y=0;y<patchH;y++)for(let x=0;x<patchW;x++){
  const o=(y*patchW+x)*4;if(y+top>=ay1)continue;
  const ai=((y+top-ay0)*area.width+(x+startX-ax0));
  if(own[ai]||fringe[ai])paperAt(x+startX,y+top,o);else out.data.set(area.data.subarray(ai*4,ai*4+4),o);
 }
 let x=0;
 for(const q of pieces){
  const w=q.x1-q.x0;if(w<=0)continue;
  if(q.at!==undefined)x=q.at;
  if(q.source!==undefined){
   // Borrowed letter: copy its ink, moved so its baseline sits on this line's baseline.
   const from=rasters.get(q.page??p.id)??raster,dy=Math.round(baseline-(q.baseline??baseline)),sy=Math.max(0,top-dy),sh=Math.min(from.height,top-dy+patchH)-sy;
   // Its paper may differ from this line's (banded table rows): the ink is kept, the paper exchanged.
   const lender=page.find(r=>r.id===q.source),paper=lender?paperOf(from.getContext('2d',{willReadFrequently:true})!,lender):bg,strength=Math.max(40,...[0,1,2].map(n=>Math.abs(hexRgb(region.color||'#000000')[n]-paper[n])));
   if(sh>0){const src=from.getContext('2d',{willReadFrequently:true})!.getImageData(q.x0,sy,w,sh),offset=sy-(top-dy);
    for(let y=0;y<sh;y++)for(let dx=Math.max(0,-x);dx<w&&x+dx<patchW;dx++){const i=(y*w+dx)*4,dist=Math.max(...[0,1,2].map(n=>Math.abs(src.data[i+n]-paper[n])));if(dist>6&&y+offset<patchH){const o=((y+offset)*patchW+x+dx)*4,cover=Math.min(1,dist/strength);for(let n=0;n<3;n++)out.data[o+n]=overBackground(src.data[i+n],cover,paper[n],bg[n]);out.data[o+3]=255;}}}
  }else if(!q.blank)for(let y=0;y<patchH&&y+top<ay1;y++)for(let dx=Math.max(0,-x);dx<w&&x+dx<patchW;dx++){
   const ai=((y+top-ay0)*area.width+(q.x0+dx-ax0));if(own[ai]||fringe[ai])out.data.set(area.data.subarray(ai*4,ai*4+4),(y*patchW+x+dx)*4);
  }
  x+=w;
 }
 // A turned patch leaves the pixels it did not change to the page: turned
 // twice they would only come back softer.
 if(f.angle)for(let y=0;y<patchH&&y+top<ay1;y++)for(let u=0;u<patchW;u++){const o=(y*patchW+u)*4,ai=((y+top-ay0)*area.width+(u+startX-ax0))*4;if(out.data[o]===area.data[ai]&&out.data[o+1]===area.data[ai+1]&&out.data[o+2]===area.data[ai+2]&&out.data[o+3]===area.data[ai+3])out.data[o+3]=0;}
 const patch=document.createElement('canvas');patch.width=patchW;patch.height=patchH;patch.getContext('2d')!.putImageData(out,0,0);
 return Object.assign(turnLayer(new FabricImage(patch,{left:startX/k,top:top/k,scaleX:1/k,scaleY:1/k}),lineRegion),{id:uid(),name:`Edited text: ${next.slice(0,40)}`,editedText:next,ocrOriginalBounds:originalFieldBounds(lineRegion),borrowed:plan.pieces.some(q=>q.source!==undefined&&q.source!=='font'),drawn});
}
const hexRgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)||0);
