import {FabricImage,Group,type Canvas,type FabricObject} from 'fabric';
import type {Page} from './model';
import {renderPdfArea} from './browser/engine';
import {recognizeImage,type OcrOptions} from './browser/ocr';
import {selectionRasterPlan,type SelectionArea} from './selection-ocr-geometry';

export const sameReadablePage=(current:Page|undefined,original:Page)=>!!current&&current.id===original.id&&current.canvas===original.canvas&&current.source===original.source&&current.index===original.index&&current.width===original.width&&current.height===original.height&&current.color===original.color&&current.forms===original.forms;

// Inspect the actual image-to-page transform, including parent groups. A
// downscaled picture retains its own pixels rather than the page preview's.
function imageDetail(c:Canvas,area:{left:number;top:number;width:number;height:number}){
 let detail=1;
 const walk=(objects:FabricObject[])=>{for(const object of objects){
  if(!object.visible||object.opacity<=0)continue;
  if(object instanceof Group){walk(object.getObjects());continue;}
  if(!(object instanceof FabricImage))continue;
  const b=object.getBoundingRect();if(b.left+b.width<=area.left||b.top+b.height<=area.top||b.left>=area.left+area.width||b.top>=area.top+area.height)continue;
  const [a,bx,cx,d]=object.calcTransformMatrix(),sum=a*a+bx*bx+cx*cx+d*d,det=a*d-bx*cx;
  const minimum=Math.sqrt(Math.max(0,(sum-Math.sqrt(Math.max(0,sum*sum-4*det*det)))/2));
  if(Number.isFinite(minimum)&&minimum>0)detail=Math.max(detail,1/minimum);
 }};
 walk(c.getObjects());return detail;
}

export async function renderSelectionRaster(c:Canvas,page:Page,area:SelectionArea,{signal}:{signal?:AbortSignal}={}){
 signal?.throwIfAborted();
 const bounds=selectionRasterPlan(page.width,page.height,area,1),requested=page.source?300/72:imageDetail(c,{left:bounds.left,top:bounds.top,width:bounds.width/bounds.scale,height:bounds.height/bounds.scale});
 const plan=selectionRasterPlan(page.width,page.height,area,requested),right=plan.left+plan.width/plan.scale,bottom=plan.top+plan.height/plan.scale;
 if(page.forms?.some(field=>field.left<right&&field.left+field.width>plan.left&&field.top<bottom&&field.top+field.height>plan.top))throw new Error('This area contains an editable form field. Choose an area without form fields to read text.');
 let pdfImage:FabricImage|undefined,raster:HTMLCanvasElement|undefined;
 try{
  if(page.source){
   const crop=await renderPdfArea(page.source,page.index,area,requested,{width:page.width,height:page.height});signal?.throwIfAborted();
   const url=URL.createObjectURL(new Blob([crop.png],{type:'image/png'})),image=new Image();
   try{image.src=url;await image.decode();signal?.throwIfAborted();}finally{URL.revokeObjectURL(url);}
   pdfImage=new FabricImage(image,{left:crop.left,top:crop.top,scaleX:1/crop.scale,scaleY:1/crop.scale,originX:'left',originY:'top',objectCaching:false});
  }
  // Render only this rectangle. The PDF and visible overlays are drawn over
  // the real page colour in one pass, avoiding an extra alpha blend.
  const background=c.backgroundColor,backgroundImage=c.backgroundImage,backgroundVpt=c.backgroundVpt,zoom=c.getZoom(),vp=c.viewportTransform,width=c.width,height=c.height,retina=c.enableRetinaScaling,skipControls=(c as unknown as {skipControlsDrawing:boolean}).skipControlsDrawing;
  try{
   c.backgroundColor=page.color==='transparent'?'':page.color;
   c.backgroundImage=pdfImage??backgroundImage;c.backgroundVpt=true;
   raster=c.toCanvasElement(plan.scale/zoom,{left:plan.left*zoom+vp[4],top:plan.top*zoom+vp[5],width:plan.width/plan.scale*zoom,height:plan.height/plan.scale*zoom});
  }finally{c.backgroundColor=background;c.backgroundImage=backgroundImage;c.backgroundVpt=backgroundVpt;c.viewportTransform=vp;c.width=width;c.height=height;c.enableRetinaScaling=retina;(c as unknown as {skipControlsDrawing:boolean}).skipControlsDrawing=skipControls;c.calcViewportBoundaries();}
  signal?.throwIfAborted();
  const g=raster.getContext('2d',{willReadFrequently:true})!;
  if(!area.mask){
   g.save();g.globalCompositeOperation='destination-in';g.fillStyle='#fff';g.beginPath();area.points.forEach((point,i)=>{const x=(point.x-plan.left)*plan.scale,y=(point.y-plan.top)*plan.scale;i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();g.fill();g.restore();
  }
  g.save();g.globalCompositeOperation='destination-over';g.fillStyle='#fff';g.fillRect(0,0,raster.width,raster.height);g.restore();
  if(area.mask){
   const mask=area.mask,pixels=g.getImageData(0,0,raster.width,raster.height),data=pixels.data;
   for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++){
    const mx=Math.floor(plan.left+(x+.5)/plan.scale),my=Math.floor(plan.top+(y+.5)/plan.scale),alpha=mx<0||my<0||mx>=mask.width||my>=mask.height?0:mask.data[my*mask.width+mx]/255,at=(y*raster.width+x)*4;
    for(let channel=0;channel<3;channel++)data[at+channel]=Math.round(255+(data[at+channel]-255)*alpha);
   }
   g.putImageData(pixels,0,0);
  }
  return raster;
 }catch(error){if(raster)raster.width=raster.height=1;throw error;}
 finally{pdfImage?.dispose();}
}

export async function readSelectedText(c:Canvas,page:Page,area:SelectionArea,options:OcrOptions={}){
 const raster=await renderSelectionRaster(c,page,area,options),release=()=>{raster.width=raster.height=1;};
 options.signal?.addEventListener('abort',release,{once:true});
 try{
  options.signal?.throwIfAborted();
  const regions=await recognizeImage(raster,options);options.signal?.throwIfAborted();
  return regions.map(region=>region.text.trim()).filter(Boolean).join('\n');
 }finally{options.signal?.removeEventListener('abort',release);release();}
}
