// Compare glyph shapes of OCR text against fonts rendered with the same text.
// Masks are cropped to their ink and scaled to a common height, keeping each
// one's natural width so wide/narrow fonts score differently.
export type Mask={data:Uint8Array;width:number;height:number};
export const MATCH_HEIGHT=28;

export function inkMask(pixels:ArrayLike<number>,width:number,height:number,background:readonly number[]):Mask{
 const contrast=new Float32Array(width*height);let peak=0;
 for(let i=0;i<contrast.length;i++){const p=i*4,v=Math.max(Math.abs(pixels[p]-background[0]),Math.abs(pixels[p+1]-background[1]),Math.abs(pixels[p+2]-background[2]))*(pixels[p+3]/255);contrast[i]=v;if(v>peak)peak=v;}
 const data=new Uint8Array(width*height);if(peak>=35)for(let i=0;i<data.length;i++)data[i]=contrast[i]>=peak*.5?1:0;
 return {data,width,height};
}

// Crop to the ink bounding box and resample (area average) to MATCH_HEIGHT rows,
// at the natural aspect ratio or stretched to a given width.
export function normalizeMask(mask:Mask,target=MATCH_HEIGHT,targetWidth?:number):Mask|undefined{
 let x0=mask.width,y0=mask.height,x1=-1,y1=-1;
 for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(mask.data[y*mask.width+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 if(x1<0)return undefined;
 const w=x1-x0+1,h=y1-y0+1,scale=target/h,width=targetWidth??Math.max(1,Math.round(w*scale)),scaleX=width/w,data=new Uint8Array(width*target);
 for(let ty=0;ty<target;ty++)for(let tx=0;tx<width;tx++){
  const sx0=x0+tx/scaleX,sx1=x0+(tx+1)/scaleX,sy0=y0+ty/scale,sy1=y0+(ty+1)/scale;let sum=0,n=0;
  for(let y=Math.floor(sy0);y<Math.max(Math.floor(sy0)+1,Math.ceil(sy1));y++)for(let x=Math.floor(sx0);x<Math.max(Math.floor(sx0)+1,Math.ceil(sx1));x++){if(x<=x1&&y<=y1){sum+=mask.data[y*mask.width+x];n++;}}
  data[ty*width+tx]=n&&sum/n>=.5?1:0;
 }
 return {data,width,height:target};
}

// Intersection over union of two normalized masks, left-aligned.
export function maskIoU(a:Mask,b:Mask){
 const width=Math.max(a.width,b.width);let inter=0,union=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<width;x++){const p=x<a.width?a.data[y*a.width+x]:0,q=x<b.width?b.data[y*b.width+x]:0;inter+=p&q;union+=p|q;}
 return union?inter/union:0;
}

// Shape similarity with the candidate stretched to the source width (so glyphs
// line up), discounted by how far their natural widths differ.
export function shapeScore(source:Mask,candidate:Mask){
 const fitted=normalizeMask(candidate,source.height,source.width);if(!fitted)return 0;
 return maskIoU(source,fitted)*Math.exp(-3*Math.abs(Math.log(candidate.width/source.width)));
}
