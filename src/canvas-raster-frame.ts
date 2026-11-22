import type {Canvas,TToCanvasElementOptions} from 'fabric';

// Render page coordinates independently of the editor's zoom and pan.
// Dividing by a view zoom and multiplying it back can leave a fractional
// native scale (or one fewer output pixel), resampling an otherwise crisp image.
export function renderPageFrame(c:Canvas,width:number,height:number,scale=1,filter?:TToCanvasElementOptions['filter']){
 const viewport=c.viewportTransform,bounds=c.vptCoords,canvasWidth=c.width,canvasHeight=c.height,retina=c.enableRetinaScaling;
 const controls=c as unknown as {skipControlsDrawing:boolean},skipControls=controls.skipControlsDrawing;
 try{
  c.viewportTransform=[1,0,0,1,0,0];
  return c.toCanvasElement(scale,{width,height,filter});
 }finally{
  c.viewportTransform=viewport;c.vptCoords=bounds;c.width=canvasWidth;c.height=canvasHeight;
  c.enableRetinaScaling=retina;controls.skipControlsDrawing=skipControls;
 }
}
