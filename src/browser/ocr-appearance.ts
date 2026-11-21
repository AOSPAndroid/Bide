import {alphaCoverage,blurCoverage,contrastCoverage,coreGain,coverageFit,matchedInkColor,coverageEdgeWidth,type Coverage} from '../ocr-appearance';
import {clampTextSoftness} from '../text-appearance';
import {rankOcrFonts,fontCandidates,systemCandidates,type FontSample} from '../ocr-font';
import {extendedFonts} from '../font-library';
import {familyWeights,baseFamily} from '../font-weights';
import type {TextRegion} from '../text-regions';
import type {Textbox} from '../text-appearance';

type Sample={region:TextRegion;left:number;top:number;source:Coverage;font:FontSample};
const FAMILY_MARGIN=.04;
type Fit={family:string;score:number;softness:number;ratio:number;dx:number;dy:number;gain:number;mass?:number;masses?:number[];bold?:boolean};
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[values.length>>1];

function samplePixels(raster:HTMLCanvasElement,r:TextRegion,regions:TextRegion[],maxArea=120000):Sample|undefined{
 let left=Math.max(0,Math.floor(r.left)-2),top=Math.max(0,Math.floor(r.top)-2),right=Math.min(raster.width,Math.ceil(r.left+r.width)+2),bottom=Math.min(raster.height,Math.ceil(r.top+r.height)+2);
 // Do not score unrelated letters in the padding around a word.
 for(const other of regions){if(other.id===r.id)continue;
  if(other.top<bottom&&other.top+other.height>top){if(other.left>=r.left+r.width)right=Math.min(right,Math.floor(other.left));if(other.left+other.width<=r.left)left=Math.max(left,Math.ceil(other.left+other.width));}
  if(other.left<right&&other.left+other.width>left){if(other.top>=r.top+r.height)bottom=Math.min(bottom,Math.floor(other.top));if(other.top+other.height<=r.top)top=Math.max(top,Math.ceil(other.top+other.height));}
 }
 const width=right-left,height=bottom-top;if(width<3||height<3||width*height>maxArea)return undefined;
 const pixels=raster.getContext('2d',{willReadFrequently:true})!.getImageData(left,top,width,height),background=[1,3,5].map(i=>parseInt((r.background||'#ffffff').slice(i,i+2),16));
 return {region:r,left,top,source:contrastCoverage(pixels.data,width,height,background),font:{text:r.text,pixels,background}};
}

// Prefer neighbouring words over the selected word: OCR may have misread the
// very letters the user is correcting (e.g. Daliil → Dalil).
// `alike`: lines proven to be in the same lettering (alikeLines), wherever on
// the page: the lines of one list are matched together, and get one face.
function localSamples(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],alike:TextRegion[]=[]):Sample[]{
 const usable=(r:TextRegion)=>r.kind==='ocr'&&r.id!==region.id&&(r.confidence??0)>=85&&r.text.replace(/[^\p{L}\p{N}]/gu,'').length>=4&&r.height>=6&&r.height/region.height>=.7&&r.height/region.height<=1.4;
 const row=regions.filter(r=>usable(r)&&Math.abs((r.top+r.height/2)-(region.top+region.height/2))<region.height*.6).sort((a,b)=>Math.abs(a.left-region.left)-Math.abs(b.left-region.left)).slice(0,3);
 const same=alike.filter(r=>usable(r)&&!row.includes(r)).sort((a,b)=>Math.abs(a.top-region.top)-Math.abs(b.top-region.top)).slice(0,Math.max(0,4-row.length));
 const near=[...row,...same];
 return (near.length?near:[region]).flatMap(r=>{
  if((r.confidence??0)<75||r.text.length<4||r.width>2000)return [];
  const sample=samplePixels(raster,r,regions);return sample?[sample]:[];
 });
}

// The text's ink over a sample. Soft text is drawn sharp, four times finer,
// and its coverage blurred here by a Gaussian of its softness: a canvas blur
// filter per try took 96% of a font match (26 s for one line of a letter,
// 100 s on a 300 dpi PDF). Measured on the edit benchmark, matches with this
// blur were as close or closer (68% → 71% of font edits without a visible
// difference) and 6 times faster (median 1.6 s → 0.27 s, slowest 100 s → 1.1 s).
function coverageRenderer(sample:Sample,scale=1){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!,hi=document.createElement('canvas'),hiCtx=hi.getContext('2d')!;
 canvas.width=sample.source.width;canvas.height=sample.source.height;hi.width=canvas.width*4;hi.height=canvas.height*4;
 return (text:Textbox)=>{
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const softness=text.textSoftness??0;
  if(softness){
   text.textSoftness=0;
   try{hiCtx.clearRect(0,0,hi.width,hi.height);hiCtx.save();hiCtx.translate(-sample.left*4,-sample.top*4);hiCtx.scale(4*scale,4*scale);text.render(hiCtx);hiCtx.restore();ctx.drawImage(hi,0,0,canvas.width,canvas.height);}
   finally{text.textSoftness=softness;}
   return blurCoverage(alphaCoverage(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),clampTextSoftness(softness)*scale);
  }
  ctx.save();ctx.translate(-sample.left,-sample.top);ctx.scale(scale,scale);text.render(ctx);ctx.restore();
  return alphaCoverage(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
 };
}

// Render through the same editable Textbox used by the workspace, at native
// resolution. Fit fractional positioning without re-rendering every offset.
export async function matchOcrAppearance(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],family:string,{autoFont,matchBlur,makeText,onFit,own=false,weights=autoFont,floor,alike,refine=true}:{autoFont:boolean;matchBlur:boolean;makeText:(region:TextRegion,family:string)=>Promise<Textbox>;onFit?:(fit:Fit)=>void;own?:boolean;weights?:boolean;floor?:number;alike?:TextRegion[];refine?:boolean}):Promise<Fit|undefined>{
 // `own`: the selected line's letters alone, when its neighbours fit badly
 // (a sharp name beside a label blurred far more than the name allows).
 const samples=own?[samplePixels(raster,region,regions)].filter((s):s is Sample=>!!s):localSamples(raster,region,regions,alike);if(!samples.length)return undefined;
 // Font/size can use reliable neighbouring words, but edge clarity belongs
 // to the selected letters. Compare actual native pixels, not a blur-radius
 // estimate, which varies with the font's stroke thickness.
 const selected=samplePixels(raster,region,regions),selectedEdges=selected&&coverageEdgeWidth(selected.source),paintSelected=selected&&coverageRenderer(selected);
 const softnessValues=matchBlur?[0,.1,.2,.3,.4,.6,.8,1,1.4,2]:[0];
 // Ranked against every bundled text face (63 families), not only the usual
 // dozen: a face outside the list was approximated by whichever fitted least
 // badly (Manrope dates were set in Lora, a serif). Handwriting and
 // decorative display faces are left out: their shapes won near ties.
 const ranked=autoFont?await rankOcrFonts(samples.map(s=>s.font),[...new Set([...fontCandidates,...extendedFonts.filter(f=>f.category==='sans'||f.category==='serif'||f.category==='mono').map(f=>f.family),...systemCandidates])]):[];
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
     const painted=paint();f.gain=coreGain(sample.source,painted);f.mass=inkRatio(sample.source,painted,f.gain);fits.push(f);onFit?.(f);
    }
   }
  }
  if(!fits.length)continue;
  const score=fits.reduce((sum,f)=>sum+f.score,0)/fits.length;
  const masses=fits.flatMap(f=>f.mass===undefined?[]:[f.mass]);
  const aggregate={family:candidateFamily,score,softness:median(fits.map(f=>f.softness)),ratio:median(fits.map(f=>f.ratio)),dx:median(fits.map(f=>f.dx)),dy:median(fits.map(f=>f.dy)),gain:median(fits.map(f=>f.gain)),masses};
  // Combining separate medians can create a placement we never evaluated.
  // Keep an actual fitted tuple when that combination would soften the edges.
  const result=allows(aggregate.ratio,aggregate.softness,aggregate.dx,aggregate.dy)?aggregate:{...fits.reduce((a,b)=>a.score>b.score?a:b),score};
  // The page's font stays unless another fits these letters clearly better
  // (faces of one kind score within a few hundredths of each other, and a
  // near tie on one soft line used to turn Arial into Roboto or Open Sans).
  if(!best||score>best.score+(best.family===family?FAMILY_MARGIN:0))best=result;
 }
 // Low confidence or mismatched OCR should retain the existing estimate. On
 // the line's own letters a lower score still beats no match: a ligature the
 // text box does not draw ("ff" in Raleway) costs a tenth of the score, and
 // the default left a light Raleway line in the page's heavy face.
 const alone=own||samples.every(s=>s.region.id===region.id);
 if(!best||best.score<(floor??(alone?.45:.55)))return alone||floor!==undefined?undefined:matchOcrAppearance(raster,region,regions,family,{autoFont,matchBlur,makeText,onFit,own:true,weights,alike,refine});
 // Neighbours can guide the font and placement, but their ink can differ
 // from the selected line. Measure its own cores at the final fitted tuple.
 if(selected&&paintSelected){
  const text=await makeText(region,best.family);applyOcrAppearance(text,region,best);
  text.set({fill:'#000000',objectCaching:false});
  // Neighbours set the font, size and softness, but each word's box sits a
  // pixel or two differently: the placement comes from the selected letters.
  const own=ownPlacement(selected.source,paintSelected,text);best.dx+=own.dx;best.dy+=own.dy;
  const painted=paintSelected(text);best.gain=coreGain(selected.source,painted);best.bold=text.fontWeight==='bold'||Number(text.fontWeight)>=600;
  // Ink of the original letters over the ink of the text as fitted: 1 when
  // the weight is right, whatever the blur (blur moves ink, it keeps its mass).
  // The weight is judged on every line matched (the lines of one list in
  // the same lettering) and this one: the median of their ink ratios.
  const mine=inkRatio(selected.source,painted,best.gain),all=[...best.masses??[],...mine===undefined?[]:[mine]];
  if(all.length)best.mass=median(all);
 }
 // Choose the weight before fine size/position probing: those small geometry
 // changes must not make a correctly heavy line switch to a lighter face.
 if(weights&&best.mass!==undefined)best=await heaviness(raster,region,regions,best,{autoFont,matchBlur,makeText,onFit,alike});
 // Refine only the chosen face, using the same crisp-only bounded search.
 // Weight trials request the unrefined fit so their ink comparison is stable.
 if(refine&&best.softness<=.15&&selected&&paintSelected){
  const text=await makeText(region,best.family);applyOcrAppearance(text,region,best);
  const probe=await makeText(region,best.family),size0=probe.fontSize,ascent=probe.top-region.top+size0*.93;
  probe.set({fill:'#000000',objectCaching:false});probe.textSoftness=best.softness;
  const at=(r:number,dx:number,dy:number)=>{probe.set({fontSize:size0*r,left:region.left+dx,top:region.top+ascent-size0*r*.93+dy});probe.initDimensions();return coverageFit(selected.source,paintSelected(probe)).score;};
  let cur={r:best.ratio,dx:best.dx,dy:best.dy},score=at(cur.r,cur.dx,cur.dy);
  for(const [dr,d] of [[.01,.5],[.005,.25],[.0025,.25]] as const)for(let round=0;round<4;round++){
   let moved=false;
   for(const next of [{...cur,r:cur.r-dr},{...cur,r:cur.r+dr},{...cur,dx:cur.dx-d},{...cur,dx:cur.dx+d},{...cur,dy:cur.dy-d},{...cur,dy:cur.dy+d},{r:cur.r+dr,dx:cur.dx-d,dy:cur.dy},{r:cur.r-dr,dx:cur.dx+d,dy:cur.dy}]){
    if(Math.abs(next.r-best.ratio)>.015||Math.abs(next.dx-best.dx)>2||Math.abs(next.dy-best.dy)>1.5)continue;
    const v=at(next.r,next.dx,next.dy);if(v>score+.001){score=v;cur=next;moved=true;}
   }
   if(!moved)break;
  }
  best.ratio=cur.r;best.dx=cur.dx;best.dy=cur.dy;applyOcrAppearance(text,region,best);text.set({fill:'#000000',objectCaching:false});
  const painted=paintSelected(text);best.gain=coreGain(selected.source,painted);best.bold=text.fontWeight==='bold'||Number(text.fontWeight)>=600;
  const mine=inkRatio(selected.source,painted,best.gain),all=[...best.masses??[],...mine===undefined?[]:[mine]];
  if(all.length)best.mass=median(all);
 }
 return best;
}

// Ink of the original letters over the ink of the text as fitted, at its
// gain: 1 when the weight is right, whatever the blur (blur moves ink, it
// keeps its mass). A textured background (a photo under a gradient, scanner
// noise) reads as faint ink everywhere: its level where no letter is drawn
// is taken off first.
function inkRatio(source:Coverage,painted:Coverage,gain:number){
 let floor=0,clear=0;for(let i=0;i<painted.data.length;i++)if(painted.data[i]===0){floor+=source.data[i];clear++;}
 floor=clear?floor/clear:0;
 let ink=0,drawn=0;for(const v of source.data)ink+=Math.max(0,v-floor);for(const v of painted.data)drawn+=v;
 return drawn>0&&gain>0?ink/(drawn*gain):undefined;
}

// The family's other bundled weights (Raleway Light, Nunito ExtraBold…): a
// light title set in the regular face has a third more ink, a heavy one in
// bold a fifth less. Measured on invented pages: Raleway Light lines 1.03-1.07
// of the original's ink in Light against 0.78-0.81 in Regular; Nunito
// ExtraBold 1.03-1.05 against 1.14-1.21 in Bold; a Roboto Light title 0.99
// against 0.67. Weights share their letter shapes, and the shape score
// favours heavier faces on thin text (a hair stroke a fraction of a pixel off
// loses most of its overlap: that title scored 0.46 in Light, 0.68 in
// Regular), so the ink decides: a weight is taken when its ink is clearly
// closer, unless its shapes fit far worse.
async function heaviness(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],fit:Fit,options:{autoFont:boolean;matchBlur:boolean;makeText:(region:TextRegion,family:string)=>Promise<Textbox>;onFit?:(fit:Fit)=>void;alike?:TextRegion[]}){
 // Only the weights on the side the ink points to (lighter when the match has
 // too much ink, heavier when too little), nearest first: ink grows with the
 // weight, so the walk stops once two weights in a row move away from the
 // original's (the regular face drawn bold sits between SemiBold and ExtraBold).
 // (Regular may be set bold, so it is on both sides.)
 const base=baseFamily(fit.family),value=(f:string)=>familyWeights(base).find(w=>w.family===f)?.value??400,current=fit.family===base&&fit.bold?700:value(fit.family);
 const faces=[base,...familyWeights(base).map(w=>w.family)].filter(f=>f!==fit.family&&(fit.mass!<1?value(f)<=500:value(f)>=500||f===base)).sort((a,b)=>Math.abs(value(a)-current)-Math.abs(value(b)-current));
 if(!faces.length)return fit;
 const off=(f:Fit)=>Math.abs(Math.log(f.mass!));let best=fit,bestOff=off(fit),misses=0;
 for(const face of faces){
  const other=await matchOcrAppearance(raster,region,regions,face,{...options,autoFont:false,weights:false,refine:false,floor:.3});
  if(!other?.mass||other.score<fit.score-.25)continue;
  const o=off(other);if(o<bestOff){best=other;bestOff=o;misses=0;}else if(o>bestOff+.02&&++misses>=2)break;
 }
 return bestOff<off(fit)-.08?best:fit;
}

// The text moved over its own letters, whole pixels then quarters, within
// two pixels; it stays unless a place fits them better. Leaves it there.
function ownPlacement(source:Coverage,paint:(text:Textbox)=>Coverage,text:Textbox){
 const left=text.left,top=text.top,at=(dx:number,dy:number)=>{text.set({left:left+dx,top:top+dy});text.initDimensions();return coverageFit(source,paint(text)).score;};
 let best={dx:0,dy:0,score:at(0,0)};const alpha=paint(text);
 for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){const score=coverageFit(source,alpha,dx,dy).score;if(score>best.score+.002)best={dx,dy,score};}
 const whole={...best};
 for(const dx of [-.5,-.25,0,.25,.5])for(const dy of [-.5,-.25,0,.25,.5]){if(!dx&&!dy)continue;const score=at(whole.dx+dx,whole.dy+dy);if(score>best.score)best={dx:whole.dx+dx,dy:whole.dy+dy,score};}
 text.set({left:left+best.dx,top:top+best.dy});text.initDimensions();
 return {dx:best.dx,dy:best.dy};
}

// Lines sampled on a finer raster (a scanned PDF page at the scan's scale) are larger in pixels.
const FINE_AREA=400000;
// Size and place alone, for a text already fitted at the page's own scale
// (72 dpi for a PDF, where a letter is a few pixels and the fit lands within
// a third of a point): refined on a finer raster, `scale` pixels per page
// unit, one dimension at a time around the fitted values. The baseline stays
// where the size change leaves it.
export function matchOcrPlacement(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],text:Textbox,scale:number){
 const up=(r:TextRegion)=>({...r,left:r.left*scale,top:r.top*scale,width:r.width*scale,height:r.height*scale});
 const selected=samplePixels(raster,up(region),regions.map(up),FINE_AREA);if(!selected)return;
 const paint=coverageRenderer(selected,scale),base={left:text.left,top:text.top,size:text.fontSize,fill:text.fill},step=1/scale;
 let best={dx:0,dy:0,ratio:1},score=-Infinity;
 const place=(dx:number,dy:number,ratio:number)=>{text.set({fontSize:base.size*ratio,left:base.left+dx,top:base.top+base.size*.93*(1-ratio)+dy});text.initDimensions();};
 const tried=(dx:number,dy:number,ratio:number)=>{place(dx,dy,ratio);const s=coverageFit(selected.source,paint(text)).score-Math.abs(1-ratio)*.02;if(s>score){score=s;best={dx,dy,ratio};}};
 text.set({fill:'#000000'});
 try{
  tried(0,0,1);
  // Twice round: up and down, across, then the size (quarter-pixel steps of the fine raster).
  for(let pass=0;pass<2;pass++){
   const at={...best};
   for(let n=-4;n<=4;n++)if(n)tried(at.dx,at.dy+n*step/2*(pass?.5:1),at.ratio);
   const row={...best};
   for(let n=-4;n<=4;n++)if(n)tried(row.dx+n*step/2*(pass?.5:1),row.dy,row.ratio);
   const sized={...best};
   for(const r of pass?[-.005,.005]:[-.03,-.02,-.01,.01,.02,.03])tried(sized.dx,sized.dy,sized.ratio+r);
  }
 }finally{place(best.dx,best.dy,best.ratio);text.set({fill:base.fill});}
}

// Softness alone, for a text already fitted in place: rendered over the
// selected letters of a finer raster (`scale` raster pixels per page unit),
// with the blur whose edge width matches the original's. Returns page units.
export function matchOcrSoftness(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],text:Textbox,scale:number){
 const up=(r:TextRegion)=>({...r,left:r.left*scale,top:r.top*scale,width:r.width*scale,height:r.height*scale});
 const selected=samplePixels(raster,up(region),regions.map(up),FINE_AREA);if(!selected)return 0;
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
  // Edge widths are noisy on a short line (six small characters of a crisp
  // low-resolution scan read as 0.45 px of blur: the amount came out soft,
  // pale and heavy). The letters themselves must agree: a measured softness
  // above the one the shape match found is kept only if the text drawn with
  // it fits them as well. (A crisper measure is kept: the shape match adds a
  // little blur to make up for placement.)
  const fitted=clampTextSoftness(saved??0);
  if(best>fitted+1e-6){
   const score=(softness:number)=>{text.textSoftness=softness;return coverageFit(selected.source,paint(text)).score;};
   if(score(best)<score(fitted)-.01)best=fitted;
  }
 }finally{text.textSoftness=saved;}
 return best;
}

// Ink strength, measured like the softness on a finer raster with the text as
// fitted: at a PDF page's own scale (72 dpi) thin strokes never reach their
// ink, and the fill came out far lighter (#1d1d1f set as #606061).
export function matchOcrInk(raster:HTMLCanvasElement,region:TextRegion,regions:TextRegion[],text:Textbox,scale:number){
 const up=(r:TextRegion)=>({...r,left:r.left*scale,top:r.top*scale,width:r.width*scale,height:r.height*scale});
 const selected=samplePixels(raster,up(region),regions.map(up),FINE_AREA);if(!selected)return undefined;
 const fill=text.fill;text.set({fill:'#000000'});
 try{const gain=coreGain(selected.source,coverageRenderer(selected,scale)(text));return gain>0?gain:undefined;}finally{text.set({fill});}
}

export function applyOcrAppearance(text:Textbox,region:TextRegion,fit:Fit){
 const size=text.fontSize,ascent=text.top-region.top+size*.93;
 text.set({fontSize:size*fit.ratio,left:region.left+fit.dx,top:region.top+ascent-size*fit.ratio*.93+fit.dy,
  fill:matchedInkColor(region.color,region.background||'#ffffff',fit.gain)});
 text.textSoftness=fit.softness;text.initDimensions();
}
