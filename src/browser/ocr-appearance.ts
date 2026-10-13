import {alphaCoverage,contrastCoverage,coverageFit,matchedInkColor,type Coverage} from '../ocr-appearance';
import {rankOcrFonts,type FontSample} from '../ocr-font';
import type {TextRegion} from '../text-regions';
import type {Textbox} from '../text-appearance';

type Sample={region:TextRegion;left:number;top:number;source:Coverage;font:FontSample};
type Fit={family:string;score:number;softness:number;ratio:number;dx:number;dy:number;gain:number};
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[values.length>>1];

// Prefer neighbouring words over the selected word: OCR may have misread the
// very letters the user is correcting (e.g. Daliil → Dalil).
function localSamples(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[]):Sample[]{
 const near=regions.filter(r=>r.kind==='ocr'&&r.id!==region.id&&(r.confidence??0)>=85&&r.text.replace(/[^\p{L}\p{N}]/gu,'').length>=4&&r.height>=6&&r.height/region.height>=.7&&r.height/region.height<=1.4&&Math.abs((r.top+r.height/2)-(region.top+region.height/2))<region.height*.6)
  .sort((a,b)=>Math.abs(a.left-region.left)-Math.abs(b.left-region.left)).slice(0,3);
 const ctx=raster.getContext('2d',{willReadFrequently:true})!;
 return (near.length?near:[region]).flatMap(r=>{
  if((r.confidence??0)<75||r.text.length<4||r.width>800)return [];
  let left=Math.max(0,Math.floor(r.left)-2),top=Math.max(0,Math.floor(r.top)-2),right=Math.min(raster.width,Math.ceil(r.left+r.width)+2),bottom=Math.min(raster.height,Math.ceil(r.top+r.height)+2);
  // Do not score unrelated letters in the padding around a word.
  for(const other of regions){if(other.id===r.id)continue;
   if(other.top<bottom&&other.top+other.height>top){if(other.left>=r.left+r.width)right=Math.min(right,Math.floor(other.left));if(other.left+other.width<=r.left)left=Math.max(left,Math.ceil(other.left+other.width));}
   if(other.left<right&&other.left+other.width>left){if(other.top>=r.top+r.height)bottom=Math.min(bottom,Math.floor(other.top));if(other.top+other.height<=r.top)top=Math.max(top,Math.ceil(other.top+other.height));}
  }
  const width=right-left,height=bottom-top;if(width<3||height<3||width*height>50000)return [];
  const pixels=ctx.getImageData(left,top,width,height),background=[1,3,5].map(i=>parseInt((r.background||'#ffffff').slice(i,i+2),16));
  return [{region:r,left,top,source:contrastCoverage(pixels.data,width,height,background),font:{text:r.text,pixels,background}}];
 });
}

// Render through the same editable Textbox used by the workspace, at native
// resolution. Fit fractional positioning without re-rendering every offset.
export async function matchOcrAppearance(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],family:string,{autoFont,matchBlur,makeText,onFit}:{autoFont:boolean;matchBlur:boolean;makeText:(region:TextRegion,family:string)=>Promise<Textbox>;onFit?:(fit:Fit)=>void}){
 const samples=localSamples(raster,region,regions);if(!samples.length)return undefined;
 const ranked=autoFont?await rankOcrFonts(samples.map(s=>s.font)):[];
 const families=[...new Set([family,...ranked.slice(0,3).map(r=>r.family)])];
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 const hi=document.createElement('canvas'),hiCtx=hi.getContext('2d')!;
 let best:Fit|undefined;
 for(const candidateFamily of families){
  const fits:Fit[]=[];
  for(const sample of samples){
   const text=await makeText(sample.region,candidateFamily),size=text.fontSize,ascent=text.top-sample.region.top+size*.93;
   canvas.width=sample.source.width;canvas.height=sample.source.height;hi.width=canvas.width*4;hi.height=canvas.height*4;text.set({fill:'#000000',objectCaching:false});
   const paint=()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(text.textSoftness){
     hiCtx.clearRect(0,0,hi.width,hi.height);hiCtx.save();hiCtx.scale(4,4);hiCtx.translate(-sample.left,-sample.top);text.render(hiCtx);hiCtx.restore();
     ctx.drawImage(hi,0,0,canvas.width,canvas.height);
    }else{ctx.save();ctx.translate(-sample.left,-sample.top);text.render(ctx);ctx.restore();}
    return alphaCoverage(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
   };
   let fit:Fit|undefined;
   for(const ratio of [.9,.925,.95,.975,1,1.025,1.05,1.075,1.1]){
    text.set({fontSize:size*ratio,left:sample.region.left,top:sample.region.top+ascent-size*ratio*.93});text.initDimensions();
    for(const softness of matchBlur?[0,.2,.4,.6,.8,1,1.4,2]:[0]){
     text.textSoftness=softness;const alpha=paint();
     for(const dx of [-2,-1,0,1,2])for(const dy of [-2,-1,0,1,2]){
      const result=coverageFit(sample.source,alpha,dx,dy);
      // Avoid unnecessary blur/resize when several candidates fit equally well.
      const score=result.score-softness*.003-Math.abs(1-ratio)*.02;
      if(!fit||score>fit.score)fit={family:candidateFamily,score,softness,ratio,dx,dy,gain:result.gain};
     }
    }
   }
   if(fit){
    // Bilinear shifts shortlist alignments cheaply. Recheck the winner with
    // actual fractional glyph placement so interpolation isn't mistaken for blur.
    const initial=fit;fit=undefined;
    text.set({fontSize:size*initial.ratio});text.initDimensions();
    for(const softness of matchBlur?[0,.2,.4,.6,.8,1,1.4,2]:[0])for(const dx of [initial.dx-.5,initial.dx-.25,initial.dx,initial.dx+.25,initial.dx+.5])for(const dy of [initial.dy-.5,initial.dy-.25,initial.dy,initial.dy+.25,initial.dy+.5]){
     text.set({left:sample.region.left+dx,top:sample.region.top+ascent-size*initial.ratio*.93+dy});text.textSoftness=softness;
     const result=coverageFit(sample.source,paint()),score=result.score-softness*.003-Math.abs(1-initial.ratio)*.02;
     if(!fit||score>fit.score)fit={family:candidateFamily,score,softness,ratio:initial.ratio,dx,dy,gain:result.gain};
    }
    if(fit){fits.push(fit);onFit?.(fit);}
   }
  }
  if(!fits.length)continue;
  const score=fits.reduce((sum,f)=>sum+f.score,0)/fits.length;
  if(!best||score>best.score)best={family:candidateFamily,score,softness:median(fits.map(f=>f.softness)),ratio:median(fits.map(f=>f.ratio)),dx:median(fits.map(f=>f.dx)),dy:median(fits.map(f=>f.dy)),gain:median(fits.map(f=>f.gain))};
 }
 // Low confidence or mismatched OCR should retain the existing estimate.
 return best&&best.score>=.55?best:undefined;
}

export function applyOcrAppearance(text:Textbox,region:TextRegion,fit:Fit){
 const size=text.fontSize,ascent=text.top-region.top+size*.93;
 text.set({fontSize:size*fit.ratio,left:region.left+fit.dx,top:region.top+ascent-size*fit.ratio*.93+fit.dy,
  fill:matchedInkColor(region.color,region.background||'#ffffff',fit.gain)});
 text.textSoftness=fit.softness;text.initDimensions();
}
