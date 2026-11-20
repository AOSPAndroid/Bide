// Limit preview work independently of source size or editor zoom.
export function thumbnailScale(width:number,height:number){return Math.min(1,200/Math.max(1,width,height));}
// Rasterize PDF previews at screen density, in stable steps while zooming.
export function editorPreviewScale(zoom:number,pixelRatio=1){
 const requested=Math.max(.5,zoom*Math.max(1,pixelRatio));
 return [.5,1,1.5,2,3,300/72].find(scale=>scale>=requested)??300/72;
}
// Editor canvas backing pixels per CSS pixel: the screen density, lowered (even below 1)
// so the canvas stays within `budget` pixels and 16384 px a side, where browsers still draw it.
export function canvasBackingScale(width:number,height:number,ratio:number,budget:number){
 return Math.min(ratio,Math.sqrt(budget/Math.max(1,width*height)),16384/Math.max(1,width,height));
}
// Keep 300 DPI available for normal pages without allocating huge canvases.
export function pdfRasterScale(width:number,height:number,requested:number){
 const w=Math.max(1,width),h=Math.max(1,height);
 return Math.min(300/72,Math.max(.1,Number.isFinite(requested)?requested:1),8192/Math.max(w,h),Math.sqrt(16000000/(w*h)));
}
// Reused PDF letters need the finest bounded source raster even when the
// letters themselves are large. A target character height downsampled large
// scanned text to 72/144 dpi while its surrounding page stayed sharp.
export function letterRasterScale(width:number,height:number,pdf:boolean){
 return pdf?pdfRasterScale(width,height,300/72):1;
}
