import {maskBounds,type Mask} from './pixel-mask';
import type {SelectionPoint} from './selection-mask';

export type SelectionArea={points:SelectionPoint[];mask?:Mask};
export type SelectionRasterPlan={left:number;top:number;width:number;height:number;scale:number;pixelBounds:[number,number,number,number]};

// Bound only the selected rectangle. A small line on a large sheet must not
// inherit the whole page's raster budget or allocate a page-sized bitmap.
export function selectionRasterPlan(pageWidth:number,pageHeight:number,area:SelectionArea,requestedScale=300/72):SelectionRasterPlan{
 if(![pageWidth,pageHeight,requestedScale].every(Number.isFinite)||pageWidth<=0||pageHeight<=0||requestedScale<=0)throw new Error('The page or reading resolution is invalid.');
 let bounds:{left:number;top:number;width:number;height:number}|undefined;
 if(area.mask){
  const m=area.mask;if(!Number.isSafeInteger(m.width)||!Number.isSafeInteger(m.height)||m.width<=0||m.height<=0||m.data.length!==m.width*m.height)throw new Error('The selected pixel mask is invalid.');
  bounds=maskBounds(m);
 }else{
  if(area.points.length<3||area.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('Draw an area around the text first.');
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of area.points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
  bounds={left:x0,top:y0,width:x1-x0,height:y1-y0};
 }
 if(!bounds)throw new Error('The selected area is empty.');
 const left=Math.max(0,bounds.left),top=Math.max(0,bounds.top),right=Math.min(pageWidth,bounds.left+bounds.width),bottom=Math.min(pageHeight,bounds.top+bounds.height),w=right-left,h=bottom-top;
 if(!(w>0&&h>0&&Number.isFinite(w*h)))throw new Error('Choose an area inside the page.');
 // floor/ceil can add two pixels per axis. Include that margin when solving
 // the memory limit, so the actual integer pixmap stays within both caps.
 const pixels=16000000-4,b=2*(w+h),budget=2*pixels/(b+Math.sqrt(b*b+4*w*h*pixels));
 const scale=Math.min(requestedScale,300/72,8190/w,8190/h,budget);
 const pixelBounds:[number,number,number,number]=[Math.floor(left*scale),Math.floor(top*scale),Math.ceil(right*scale),Math.ceil(bottom*scale)];
 const width=pixelBounds[2]-pixelBounds[0],height=pixelBounds[3]-pixelBounds[1];
 if(!Number.isFinite(scale)||scale<=0||width<=0||height<=0||width>8192||height>8192||width*height>16000000)throw new Error('This selected area cannot be rendered within the reading limits.');
 return {left:pixelBounds[0]/scale,top:pixelBounds[1]/scale,width,height,scale,pixelBounds};
}
