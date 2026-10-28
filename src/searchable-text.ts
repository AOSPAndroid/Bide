type Box={left:number;top:number;width:number;height:number};
type Region=Box&{text:string};

// OCR words overlapping native text are already searchable through the PDF
// source or editable text layer. Keep only visible raster words, once.
export function rasterSearchWords<T extends Region>(regions:T[],native:(Box&{text?:string})[]):T[]{
  const token=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  return regions.filter(r=>r.text.trim()&&r.width>0&&r.height>0&&!native.some(b=>{
    // Textbox boxes include blank padding. Never suppress an unrelated image
    // word merely because it falls inside that unused layout width.
    if(b.text!==undefined&&(!b.text.trim()||!b.text.split(/\s+/).some(w=>token(w)===token(r.text))))return false;
    const w=Math.max(0,Math.min(r.left+r.width,b.left+b.width)-Math.max(r.left,b.left));
    const h=Math.max(0,Math.min(r.top+r.height,b.top+b.height)-Math.max(r.top,b.top));
    return w*h>=r.width*r.height*.5;
  }));
}
