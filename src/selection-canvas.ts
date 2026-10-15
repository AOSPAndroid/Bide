// Canvas side of pixel selections: rasterizing polygons and paths into masks,
// sampling the page, cutting out pixels and turning a selection into a layer
// mask that follows the layer when it moves, scales or rotates.
import {FabricImage,Path,util,type Canvas,type FabricObject} from 'fabric';
import {createMask,maskBounds,type Mask} from './pixel-mask';
import {pageRaster} from './retouch-canvas';
import type {SelectionPoint} from './selection-mask';

export type PageSize={width:number;height:number};
const canvasOf=(width:number,height:number)=>Object.assign(document.createElement('canvas'),{width,height});
const ctx2d=(c:HTMLCanvasElement)=>c.getContext('2d',{willReadFrequently:true})!;

// Masks cover the page at one pixel per page unit.
export const maskSize=(page:PageSize)=>({width:Math.max(1,Math.ceil(page.width)),height:Math.max(1,Math.ceil(page.height))});

function alphaOf(c:HTMLCanvasElement):Mask{
 const data=ctx2d(c).getImageData(0,0,c.width,c.height).data,m=createMask(c.width,c.height);
 for(let i=0;i<m.data.length;i++)m.data[i]=data[i*4+3];return m;
}

export function polygonMask(points:SelectionPoint[],page:PageSize):Mask{
 const {width,height}=maskSize(page),c=canvasOf(width,height),g=ctx2d(c);
 g.fillStyle='#fff';g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();
 return alphaOf(c);
}

// A path layer's filled area (pen tool shapes become selections this way).
export function pathMask(path:Path,page:PageSize):Mask{
 const {width,height}=maskSize(page),c=canvasOf(width,height),g=ctx2d(c);
 const m=path.calcTransformMatrix();g.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);g.translate(-path.pathOffset.x,-path.pathOffset.y);
 g.fillStyle='#fff';g.fill(new Path2D(util.joinPath(path.path)));
 return alphaOf(c);
}

// The mask as an image: `color` with the mask as its alpha.
export function maskToCanvas(m:Mask,color:readonly number[]=[255,255,255]):HTMLCanvasElement{
 const c=canvasOf(m.width,m.height),image=new ImageData(m.width,m.height);
 for(let i=0;i<m.data.length;i++){image.data[i*4]=color[0];image.data[i*4+1]=color[1];image.data[i*4+2]=color[2];image.data[i*4+3]=m.data[i];}
 ctx2d(c).putImageData(image,0,0);return c;
}

// A raster resampled to mask size (page rasters can differ by a pixel).
function toMaskSize(source:HTMLCanvasElement,page:PageSize){
 const {width,height}=maskSize(page);if(source.width===width&&source.height===height)return source;
 const c=canvasOf(width,height);ctx2d(c).drawImage(source,0,0,width,height);return c;
}

// Pixels the selection tools sample: the whole page, or only some layers.
export function samplePage(c:Canvas,page:PageSize,objects?:FabricObject[]):ImageData{
 const raster=toMaskSize(pageRaster(c,page.width,page.height,objects),page);
 return ctx2d(raster).getImageData(0,0,raster.width,raster.height);
}

// Selection from a layer's own pixels (its transparency).
export const layerPixelsMask=(c:Canvas,page:PageSize,object:FabricObject)=>alphaOf(toMaskSize(pageRaster(c,page.width,page.height,[object]),page));

// Probability map (any size, 0-255) stretched over the page, or over `area` of it.
export function scaledMask(values:Uint8ClampedArray,width:number,height:number,page:PageSize,area?:{left:number;top:number;width:number;height:number}):Mask{
 const small=maskToCanvas({width,height,data:values}),{width:w,height:h}=maskSize(page),c=canvasOf(w,h),g=ctx2d(c);
 g.imageSmoothingQuality='high';g.drawImage(small,area?.left??0,area?.top??0,area?.width??w,area?.height??h);return alphaOf(c);
}

// Selected pixels of a page-sized raster, trimmed to the selection.
export function maskedCutout(source:HTMLCanvasElement,m:Mask,page:PageSize){
 const bounds=maskBounds(m);if(!bounds)throw new Error('The selection is empty. Select an area first.');
 const raster=toMaskSize(source,page),c=canvasOf(bounds.width,bounds.height),g=ctx2d(c);
 g.drawImage(maskToCanvas(m),-bounds.left,-bounds.top);g.globalCompositeOperation='source-in';g.drawImage(raster,-bounds.left,-bounds.top);
 return {canvas:c,left:bounds.left,top:bounds.top};
}

// A solid fill of the selection (paint bucket), trimmed.
export function maskFill(m:Mask,color:readonly number[],opacity=1){
 const bounds=maskBounds(m);if(!bounds)return undefined;
 const c=canvasOf(bounds.width,bounds.height),g=ctx2d(c);g.globalAlpha=opacity;g.drawImage(maskToCanvas(m,color),-bounds.left,-bounds.top);
 return {canvas:c,left:bounds.left,top:bounds.top};
}

// Layer masks are an image clip path in the layer's own coordinates, at about
// the layer's on-page resolution, so painting on them later stays sharp.
export type LayerMask=FabricImage&{layerMask?:boolean};
export const hasLayerMask=(o:FabricObject|null|undefined):o is FabricObject&{clipPath:LayerMask}=>!!(o?.clipPath as LayerMask|undefined)?.layerMask;

export function layerMaskFrame(object:FabricObject){
 const w=Math.max(1,object.width),h=Math.max(1,object.height),scale=Math.min(Math.max(Math.abs(object.scaleX),Math.abs(object.scaleY),.05),4096/Math.max(w,h),2);
 return {w,h,scale,width:Math.max(1,Math.ceil(w*scale)),height:Math.max(1,Math.ceil(h*scale))};
}

export function layerMaskFromPage(object:FabricObject,m:Mask):LayerMask{
 const f=layerMaskFrame(object),c=canvasOf(f.width,f.height),g=ctx2d(c);
 // mask pixel = scale·(local + size/2); local = inverse(layer matrix)·page.
 const inv=util.invertTransform(object.calcTransformMatrix());
 g.setTransform(f.scale,0,0,f.scale,f.scale*f.w/2,f.scale*f.h/2);g.transform(inv[0],inv[1],inv[2],inv[3],inv[4],inv[5]);
 g.imageSmoothingQuality='high';g.drawImage(maskToCanvas(m),0,0);
 return layerMaskImage(object,c);
}

// A mask showing everything (white) or nothing.
export function blankLayerMask(object:FabricObject,reveal=true):LayerMask{
 const f=layerMaskFrame(object),c=canvasOf(f.width,f.height);
 if(reveal){const g=ctx2d(c);g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);}
 return layerMaskImage(object,c);
}

export function layerMaskImage(object:FabricObject,c:HTMLCanvasElement):LayerMask{
 const f=layerMaskFrame(object);
 return Object.assign(new FabricImage(c,{left:-f.w/2,top:-f.h/2,originX:'left',originY:'top',scaleX:f.w/c.width,scaleY:f.h/c.height}),{layerMask:true});
}

// The mask's pixels as an editable canvas (masks restored from a project are images).
export function editableMask(mask:LayerMask):HTMLCanvasElement{
 const element=mask.getElement() as HTMLCanvasElement|HTMLImageElement;
 if(element instanceof HTMLCanvasElement)return element;
 const c=canvasOf(element.naturalWidth||element.width,element.naturalHeight||element.height);ctx2d(c).drawImage(element,0,0);
 mask.setElement(c);return c;
}

export function invertLayerMask(mask:LayerMask){
 const c=editableMask(mask),g=ctx2d(c),image=g.getImageData(0,0,c.width,c.height);
 for(let i=3;i<image.data.length;i+=4)image.data[i]=255-image.data[i];
 g.putImageData(image,0,0);
}

// Paint one soft round dab into a layer mask at a page point; `reveal` paints
// the layer back in, otherwise it is hidden.
export function paintLayerMask(object:FabricObject,mask:LayerMask,point:{x:number;y:number},size:number,softness:number,reveal:boolean,opacity=1){
 const c=editableMask(mask),g=ctx2d(c),inv=util.invertTransform(object.calcTransformMatrix());
 const local=util.transformPoint(point as never,inv),f=layerMaskFrame(object),sx=c.width/f.w,sy=c.height/f.h;
 const x=(local.x+f.w/2)*sx,y=(local.y+f.h/2)*sy,layerScale=Math.max(1e-3,Math.abs(object.scaleX));
 const r=Math.max(.5,size/2/layerScale*sx),hard=Math.max(0,Math.min(1,1-softness/100));
 const grad=g.createRadialGradient(x,y,r*hard,x,y,r);grad.addColorStop(0,`rgba(255,255,255,${opacity})`);grad.addColorStop(1,'rgba(255,255,255,0)');
 g.save();g.globalCompositeOperation=reveal?'source-over':'destination-out';g.fillStyle=grad;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();g.restore();
 object.set('dirty',true);
}
