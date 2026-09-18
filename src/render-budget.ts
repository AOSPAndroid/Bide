// Limit preview work independently of source size or editor zoom.
export function thumbnailScale(width:number,height:number){return Math.min(1,200/Math.max(1,width,height));}
// Rasterize PDF previews at screen density, in stable steps while zooming.
export function editorPreviewScale(zoom:number,pixelRatio=1){
 const requested=Math.max(.5,zoom*Math.max(1,pixelRatio));
 return [.5,1,1.5,2,3,300/72].find(scale=>scale>=requested)??300/72;
}
// Keep 300 DPI available for normal pages without allocating huge canvases.
export function pdfRasterScale(width:number,height:number,requested:number){
 const w=Math.max(1,width),h=Math.max(1,height);
 return Math.min(300/72,Math.max(.1,Number.isFinite(requested)?requested:1),8192/Math.max(w,h),Math.sqrt(16000000/(w*h)));
}
