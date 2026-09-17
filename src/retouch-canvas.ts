import {Canvas,FabricImage,type FabricObject} from 'fabric';
import type {XY} from './retouch-pixels';
export function pageRaster(c:Canvas,width:number,height:number,objects?:FabricObject[]) {
  if(width*height>16000000)throw new Error('Retouching supports up to 16 megapixels. Resize this page first.');
  const background=c.backgroundColor;
  try {if(objects)c.backgroundColor='';return c.toCanvasElement(1/c.getZoom(),{width:width*c.getZoom(),height:height*c.getZoom(),filter:objects?o=>objects.some(object=>object===o):undefined});}
  finally {c.backgroundColor=background;}
}
export function cutout(source:HTMLCanvasElement,points:XY[]) {
  const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));
  const right=Math.min(source.width,Math.ceil(Math.max(...points.map(p=>p.x)))),bottom=Math.min(source.height,Math.ceil(Math.max(...points.map(p=>p.y))));
  if(points.length<3||right-left<1||bottom-top<1)throw new Error('Draw a selection inside the page first.');
  const canvas=document.createElement('canvas');canvas.width=right-left;canvas.height=bottom-top;const ctx=canvas.getContext('2d')!;
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x-left,p.y-top):ctx.moveTo(p.x-left,p.y-top));ctx.closePath();ctx.clip();ctx.drawImage(source,-left,-top);return {canvas,left,top};
}
export function trimRaster(source:HTMLCanvasElement) {
  const {width,height}=source,data=source.getContext('2d')!.getImageData(0,0,width,height).data;let l=width,t=height,r=-1,b=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
  if(r<0)return {canvas:document.createElement('canvas'),left:0,top:0,empty:true};
  const canvas=document.createElement('canvas');canvas.width=r-l+1;canvas.height=b-t+1;canvas.getContext('2d')!.drawImage(source,-l,-t);return {canvas,left:l,top:t,empty:false};
}
export function rasterLayer(source:HTMLCanvasElement,name:string,id:string) {
  const trimmed=trimRaster(source);if(trimmed.empty)return null;
  return Object.assign(new FabricImage(trimmed.canvas,{left:trimmed.left,top:trimmed.top}),{id,name});
}
