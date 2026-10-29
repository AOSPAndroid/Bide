import {alphaCoverage,contrastCoverage,coreGain,coverageFit,matchedInkColor,coverageEdgeWidth,type Coverage} from '../ocr-appearance';
import {rankOcrFonts,type FontSample} from '../ocr-font';
import type {TextRegion} from '../text-regions';
import type {Textbox} from '../text-appearance';

type Sample={region:TextRegion;left:number;top:number;source:Coverage;font:FontSample};
type Fit={family:string;score:number;softness:number;ratio:number;dx:number;dy:number;gain:number};
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[values.length>>1];

function samplePixels(raster:HTMLCanvasElement,r:TextRegion,regions:TextRegion[]):Sample|undefined{
 let left=Math.max(0,Math.floor(r.left)-2),top=Math.max(0,Math.floor(r.top)-2),right=Math.min(raster.width,Math.ceil(r.left+r.width)+2),bottom=Math.min(raster.height,Math.ceil(r.top+r.height)+2);
 // Do not score unrelated letters in the padding around a word.
 for(const other of regions){if(other.id===r.id)continue;
  if(other.top<bottom&&other.top+other.height>top){if(other.left>=r.left+r.width)right=Math.min(right,Math.floor(other.left));if(other.left+other.width<=r.left)left=Math.max(left,Math.ceil(other.left+other.width));}
  if(other.left<right&&other.left+other.width>left){if(other.top>=r.top+r.height)bottom=Math.min(bottom,Math.floor(other.top));if(other.top+other.height<=r.top)top=Math.max(top,Math.ceil(other.top+other.height));}
 }
 const width=right-left,height=bottom-top;if(width<3||height<3||width*height>50000)return undefined;
 const pixels=raster.getContext('2d',{willReadFrequently:true})!.getImageData(left,top,width,height),background=[1,3,5].map(i=>parseInt((r.background||'#ffffff').slice(i,i+2),16));
 return {region:r,left,top,source:contrastCoverage(pixels.data,width,height,background),font:{text:r.text,pixels,background}};
}

// Prefer neighbouring words over the selected word: OCR may have misread the
// very letters the user is correcting (e.g. Daliil → Dalil).
function localSamples(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[]):Sample[]{
 const near=regions.filter(r=>r.kind==='ocr'&&r.id!==region.id&&(r.confidence??0)>=85&&r.text.replace(/[^\p{L}\p{N}]/gu,'').length>=4&&r.height>=6&&r.height/region.height>=.7&&r.height/region.height<=1.4&&Math.abs((r.top+r.height/2)-(region.top+region.height/2))<region.height*.6)
  .sort((a,b)=>Math.abs(a.left-region.left)-Math.abs(b.left-region.left)).slice(0,3);
 return (near.length?near:[region]).flatMap(r=>{
  if((r.confidence??0)<75||r.text.length<4||r.width>800)return [];
  const sample=samplePixels(raster,r,regions);return sample?[sample]:[];
 });
}

function coverageRenderer(sample:Sample,scale=1){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!,hi=document.createElement('canvas'),hiCtx=hi.getContext('2d')!;
 canvas.width=sample.source.width;canvas.height=sample.source.height;hi.width=canvas.width*4;hi.height=canvas.height*4;
 return (text:Textbox)=>{
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(text.textSoftness){
   hiCtx.clearRect(0,0,hi.width,hi.height);hiCtx.save();hiCtx.translate(-sample.left*4,-sample.top*4);hiCtx.scale(4*scale,4*scale);text.render(hiCtx);hiCtx.restore();ctx.drawImage(hi,0,0,canvas.width,canvas.height);
  }else{ctx.save();ctx.translate(-sample.left,-sample.top);ctx.scale(scale,scale);text.render(ctx);ctx.restore();}
  return alphaCoverage(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
 };
}

// Render through the same editable Textbox used by the workspace, at native
// resolution. Fit fractional positioning without re-rendering every offset.
export async function matchOcrAppearance(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],family:string,{autoFont,matchBlur,makeText,onFit}:{autoFont:boolean;matchBlur:boolean;makeText:(region:TextRegion,family:string)=>Promise<Textbox>;onFit?:(fit:Fit)=>void}){
 const samples=localSamples(raster,region,regions);if(!samples.length)return undefined;
 // Font/size can use reliable neighbouring words, but edge clarity belongs
 // to the selected letters. Compare actual native pixels, not a blur-radius
 // estimate, which varies with the font's stroke thickness.
 const selected=samplePixels(raster,region,regions),selectedEdges=selected&&coverageEdgeWidth(selected.source),paintSelected=selected&&coverageRenderer(selected);
 const softnessValues=matchBlur?[0,.1,.2,.3,.4,.6,.8,1,1.4,2]:[0];
 const ranked=autoFont?await rankOcrFonts(samples.map(s=>s.font)):[];
 const families=[...new Set([family,...ranked.slice(0,3).map(r=>r.family)])];
 let best:Fit|undefined;
 for(const candidateFamily of families){
  const selectedText=await makeText(region,candidateFamily),selectedSize=selectedText.fontSize,selectedAscent=selectedText.top-region.top+selectedSize*.93;
  selectedText.set({fill:'#000000',objectCaching:false});
  // Edge-clarity checks are memoized per placement and softness: each one
  // renders the selected letters again, which dominates the matching time.
  const allowedCache=new Map<string,boolean>();
  const allows=(ratio:number,softness:number,dx=0,dy=0)=>{
   if(!softness||selectedEdges===undefined||!paintSelected)return true;
   const key=`${ratio}/${dx}/${dy}/${softness}`,cached=allowedCache.get(key);if(cached!==undefined)return cached;
   selectedText.set({fontSize:selectedSize*ratio,left:region.left+dx,top:region.top+selectedAscent-selectedSize*ratio*.93+dy});selectedText.initDimensions();
   selectedText.textSoftness=softness;const edges=coverageEdgeWidth(paintSelected(selectedText)),allowed=edges!==undefined&&edges<=selectedEdges+.1;
   allowedCache.set(key,allowed);return allowed;
  };
  const allowedSoftness=(ratio:number,dx=0,dy=0)=>softnessValues.filter(softness=>allows(ratio,softness,dx,dy));
  const ratios=[.9,.925,.95,.975,1,1.025,1.05,1.075,1.1];
  const fits:Fit[]=[];
  for(const sample of samples){
   const text=await makeText(sample.region,candidateFamily),size=text.fontSize,ascent=text.top-sample.region.top+size*.93;
   text.set({fill:'#000000',objectCaching:false});const render=coverageRenderer(sample),paint=()=>render(text);
   let fit:Fit|undefined;
   const tryShifts=(ratio:number,softness:number)=>{
    text.set({fontSize:size*ratio,left:sample.region.left,top:sample.region.top+ascent-size*ratio*.93});text.initDimensions();
    text.textSoftness=softness;const alpha=paint();
    for(const dx of [-2,-1,0,1,2])for(const dy of [-2,-1,0,1,2]){
     const result=coverageFit(sample.source,alpha,dx,dy);
     // Avoid unnecessary blur/resize when several candidates fit equally well.
     const score=result.score-softness*.003-Math.abs(1-ratio)*.02;
     if(!fit||score>fit.score)fit={family:candidateFamily,score,softness,ratio,dx,dy,gain:result.gain};
    }
   };
   // Coarse to fine: size and position on crisp renders, then softness only
   // around the best size (blurred renders are by far the slowest to paint).
   for(const ratio of ratios)tryShifts(ratio,0);
   // Softness cannot rescue a font whose crisp fit trails the best font this far.
   if(best&&(!fit||(fit as Fit).score<best.score-.15)){fits.length=0;break;}
   if(fit&&softnessValues.length>1){
    const at=ratios.indexOf(fit.ratio);
    for(const ratio of ratios.slice(Math.max(0,at-1),at+2))for(const softness of allowedSoftness(ratio))if(softness)tryShifts(ratio,softness);
   }
   if(fit){
    // Bilinear shifts shortlist alignments cheaply. Recheck the winner with
    // actual fractional glyph placement so interpolation isn't mistaken for blur:
    // position first at the shortlisted softness, then the neighbouring softness values.
    const initial:Fit=fit;fit=undefined;
    text.set({fontSize:size*initial.ratio});text.initDimensions();
    const place=(softness:number,dx:number,dy:number)=>{
     if(!allows(initial.ratio,softness,dx,dy))return;
     text.set({left:sample.region.left+dx,top:sample.region.top+ascent-size*initial.ratio*.93+dy});text.textSoftness=softness;
     const result=coverageFit(sample.source,paint()),score=result.score-softness*.003-Math.abs(1-initial.ratio)*.02;
     if(!fit||score>fit.score)fit={family:candidateFamily,score,softness,ratio:initial.ratio,dx,dy,gain:result.gain};
    };
    for(const dx of [-.5,-.25,0,.25,.5])for(const dy of [-.5,-.25,0,.25,.5])place(initial.softness,initial.dx+dx,initial.dy+dy);
    // Walk the softness values each way from there while the fit improves,
    // letting the placement settle a little for each.
    const placed=fit as Fit|undefined,step=softnessValues.indexOf(initial.softness);
    if(placed)for(const direction of [-1,1])for(let i=step+direction;i>=0&&i<softnessValues.length;i+=direction){const before=(fit as Fit|undefined)?.score??-Infinity;for(const dx of [-.25,0,.25])for(const dy of [-.25,0,.25])place(softnessValues[i],placed.dx+dx,placed.dy+dy);if(((fit as Fit|undefined)?.score??-Infinity)<=before)break;}
    if(fit){
     // Colour from the stroke cores at the chosen placement, not the fit's gain.
     const f=fit as Fit;text.set({fontSize:size*f.ratio,left:sample.region.left+f.dx,top:sample.region.top+ascent-size*f.ratio*.93+f.dy});text.textSoftness=f.softness;text.initDimensions();
     f.gain=coreGain(sample.source,paint());fits.push(f);onFit?.(f);
    }
   }
  }
  if(!fits.length)continue;
  const score=fits.reduce((sum,f)=>sum+f.score,0)/fits.length;
  const aggregate={family:candidateFamily,score,softness:median(fits.map(f=>f.softness)),ratio:median(fits.map(f=>f.ratio)),dx:median(fits.map(f=>f.dx)),dy:median(fits.map(f=>f.dy)),gain:median(fits.map(f=>f.gain))};
  // Combining separate medians can create a placement we never evaluated.
  // Keep an actual fitted tuple when that combination would soften the edges.
  const result=allows(aggregate.ratio,aggregate.softness,aggregate.dx,aggregate.dy)?aggregate:{...fits.reduce((a,b)=>a.score>b.score?a:b),score};
  if(!best||score>best.score)best=result;
 }
 // Low confidence or mismatched OCR should retain the existing estimate.
 if(!best||best.score<.55)return undefined;
 // Neighbours can guide the font and placement, but their ink can differ
 // from the selected line. Measure its own cores at the final fitted tuple.
 if(selected&&paintSelected){
  const text=await makeText(region,best.family);applyOcrAppearance(text,region,best);
  text.set({fill:'#000000',objectCaching:false});best.gain=coreGain(selected.source,paintSelected(text));
 }
 return best;
}

// Softness alone, for a text already fitted in place: rendered over the
// selected letters of a finer raster (`scale` raster pixels per page unit),
// with the blur whose edge width matches the original's. Returns page units.
export function matchOcrSoftness(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],text:Textbox,scale:number){
 const up=(r:TextRegion)=>({...r,left:r.left*scale,top:r.top*scale,width:r.width*scale,height:r.height*scale});
 const selected=samplePixels(raster,up(region),regions.map(up));if(!selected)return 0;
 const target=coverageEdgeWidth(selected.source);if(target===undefined)return 0;
 // Scale the render, keeping the text and its softness in page units. Scaling
 // the blur value itself hits Textbox's 2 pt limit before the fine raster fits.
 const paint=coverageRenderer(selected,scale),saved=text.textSoftness;
 let best=0,error=Infinity;
 try{
  for(const pixels of [0,.15,.3,.45,.6,.8,1,1.3,1.7,2.2,3,4,5,6,8]){
   const softness=pixels/scale;if(softness>2)continue;
   text.textSoftness=softness;const edges=coverageEdgeWidth(paint(text));if(edges===undefined)continue;
   // Prefer the crisper value unless a softer one is clearly closer.
   const e=Math.abs(edges-target);if(e<error-.03){error=e;best=softness;}
  }
 }finally{text.textSoftness=saved;}
 return best;
}

export function applyOcrAppearance(text:Textbox,region:TextRegion,fit:Fit){
 const size=text.fontSize,ascent=text.top-region.top+size*.93;
 text.set({fontSize:size*fit.ratio,left:region.left+fit.dx,top:region.top+ascent-size*fit.ratio*.93+fit.dy,
  fill:matchedInkColor(region.color,region.background||'#ffffff',fit.gain)});
 text.textSoftness=fit.softness;text.initDimensions();
}
