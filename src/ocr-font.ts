// Suggest the bundled font that best matches OCR text, by rendering each
// sample's text in every candidate face and comparing ink shapes.
import {ensureFont} from './fonts';
import {inkMask,normalizeMask,shapeScore,type Mask} from './font-match';

// Common document/UI faces and their metric-compatible bundled stand-ins.
export const fontCandidates=['Liberation Sans','Liberation Serif','Liberation Mono','Carlito','Caladea','Roboto','Open Sans','Inter','Lato','PT Sans','PT Serif','Montserrat'];
// System fonts screenshots often use (iPhone, Windows, Office). Only those
// installed on this computer are compared; others can't be rendered.
export const systemCandidates=['SF Pro Text','SF Pro Display','Segoe UI','Arial','Calibri','Aptos','Cambria','Tahoma','Verdana','Georgia','Times New Roman'];
const installed=new Map<string,Promise<boolean>>();
function isInstalled(family:string){if(!installed.has(family))installed.set(family,new FontFace(`bide-probe-${family}`,`local("${family}")`).load().then(()=>true,()=>false));return installed.get(family)!;}
export type FontSample={text:string;pixels:ImageData;background:readonly number[]};

function rendered(text:string,family:string,weight:string):Mask|undefined{
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!,font=`${weight} 64px "${family}"`;
 ctx.font=font;const m=ctx.measureText(text),w=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight)+4,h=Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)+4;
 if(w<2||h<2||w*h>4e6)return undefined;
 canvas.width=w;canvas.height=h;ctx.font=font;ctx.fillStyle='#000';ctx.fillText(text,m.actualBoundingBoxLeft+2,m.actualBoundingBoxAscent+2);
 return normalizeMask(inkMask(ctx.getImageData(0,0,w,h).data,w,h,[255,255,255]));
}

export async function suggestOcrFont(samples:FontSample[],candidates=[...fontCandidates,...systemCandidates]):Promise<{family:string;score:number}|undefined>{
 const sources=samples.map(s=>({text:s.text,mask:normalizeMask(inkMask(s.pixels.data,s.pixels.width,s.pixels.height,s.background))})).filter((s):s is {text:string;mask:Mask}=>!!s.mask);
 if(!sources.length)return undefined;
 let best:{family:string;score:number}|undefined;
 for(const family of candidates){
  if(systemCandidates.includes(family)&&!await isInstalled(family))continue;
  try{await ensureFont(family);}catch{continue;}
  let total=0;
  for(const s of sources)total+=Math.max(...['normal','bold'].map(weight=>{const mask=rendered(s.text,family,weight);return mask?shapeScore(s.mask,mask):0;}));
  const score=total/sources.length;if(!best||score>best.score)best={family,score};
 }
 return best;
}
