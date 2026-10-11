// Pure geometry and bookkeeping for detected text regions (no DOM, no fabric).
import type {TextRegion} from './text-regions';
type Bounds={left:number;top:number;width:number;height:number};

export function recognitionKey(r:TextRegion){return `${r.kind}:${Math.round(r.left)}:${Math.round(r.top)}:${r.text}`;}

// OCR runs on a reduced raster; map its pixel boxes back to page units.
export function scaleRegions(regions:TextRegion[],sx:number,sy:number):TextRegion[]{
 return regions.map(r=>({...r,left:r.left*sx,top:r.top*sy,width:r.width*sx,height:r.height*sy,size:r.size*sy,baseline:r.baseline*sy}));
}

// Hide regions that already became editable text: same key, or an OCR text
// layer covering the region's centre (it may have been moved or retyped).
export function unconvertedRegions(regions:TextRegion[],layers:{recognizedKey?:string;bounds:Bounds}[]){
 return regions.filter(r=>!layers.some(({recognizedKey:key,bounds:b})=>{
  if(key===recognitionKey(r))return true;if(!key?.startsWith('ocr:'))return false;
  const x=r.left+r.width/2,y=r.top+r.height/2;return x>=b.left&&x<=b.left+b.width&&y>=b.top&&y<=b.top+b.height;
 }));
}

// Area cleared or patched under replaced OCR text; padding < 0 means automatic.
export function ocrPatchBounds(region:Bounds,padding:number,page:{width:number;height:number}):Bounds{
 const pad=padding<0?Math.max(2,region.height*.1):padding,left=Math.max(0,region.left-pad),top=Math.max(0,region.top-pad);
 return {left,top,width:Math.min(page.width,region.left+region.width+pad)-left,height:Math.min(page.height,region.top+region.height+pad)-top};
}

export function ocrScanStatus(count:number,languages:string,converted:boolean){
 return count?`${count} OCR regions · ${languages} · choose a matching font`:converted?'Original text converted. Double-click the text layer to edit.':'No text detected. Use Text to add your own.';
}
