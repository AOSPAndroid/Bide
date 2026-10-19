// Detects whether a page image is turned (90/180/270°, AI) or tilted by a
// few degrees (text-line projection, no AI), so it can be straightened
// before text recognition.
import {inkMap,estimateSkew} from '../deskew';

export type Tilt={turn:0|90|180|270;skew:number};

const canvas=(width:number,height:number)=>Object.assign(document.createElement('canvas'),{width,height});

// The raster drawn on white at up to `max` px on its long side, turned
// counterclockwise by `turn` degrees.
function upright(source:HTMLCanvasElement,turn:number,max=1000){
 const k=Math.min(1,max/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*k)),h=Math.max(1,Math.round(source.height*k));
 const out=turn%180?canvas(h,w):canvas(w,h),ctx=out.getContext('2d',{willReadFrequently:true})!;
 ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.imageSmoothingQuality='high';
 ctx.translate(out.width/2,out.height/2);ctx.rotate(-turn*Math.PI/180);ctx.drawImage(source,-w/2,-h/2,w,h);
 return out;
}

// Below these the page is left alone: a fraction of a degree is invisible
// and does not affect recognition, and uncertain turns are not worth a guess.
export const minSkew=.3,minTurnConfidence=.8;

export async function detectTilt(raster:HTMLCanvasElement,{ai,signal}:{ai:boolean;signal?:AbortSignal}):Promise<Tilt|undefined>{
 let turn:Tilt['turn']=0;
 if(ai){
  const {detectOrientation}=await import('./ai-tools'),result=await detectOrientation(raster,signal);
  if(result.confidence>=minTurnConfidence)turn=result.turn;
 }
 signal?.throwIfAborted();
 const page=upright(raster,turn),ctx=page.getContext('2d',{willReadFrequently:true})!,pixels=ctx.getImageData(0,0,page.width,page.height).data;
 const result=estimateSkew(inkMap(pixels,page.width,page.height),page.width,page.height);
 const skew=result&&result.confidence>=1.3&&Math.abs(result.angle)>=minSkew?result.angle:0;
 return turn||skew?{turn,skew}:undefined;
}

export function tiltLabel(t:Tilt){
 const turned=t.turn===180?'upside down':t.turn?`turned ${t.turn===90?'right':'left'}`:'';
 const tilted=t.skew?`tilted ${Math.abs(t.skew).toFixed(1)}°`:'';
 return [turned,tilted].filter(Boolean).join(' and ');
}
