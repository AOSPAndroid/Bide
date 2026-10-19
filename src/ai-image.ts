// Pure pre/post-processing for the bundled ONNX models (no DOM, no runtime).
export type Rect={x:number;y:number;width:number;height:number};
type Box={x0:number;y0:number;x1:number;y1:number};

// Real-ESRGAN runs on small tiles to bound memory and report progress. Each tile
// reads `pad` extra pixels of context on every side; only `inner` is kept, so
// seams fall where both neighbours had context.
export function tilePlan(width:number,height:number,tile=128,pad=8){
 const tiles:{read:Rect;inner:Rect}[]=[];
 for(let y=0;y<height;y+=tile)for(let x=0;x<width;x+=tile){
  const inner={x,y,width:Math.min(tile,width-x),height:Math.min(tile,height-y)};
  const x0=Math.max(0,x-pad),y0=Math.max(0,y-pad),x1=Math.min(width,inner.x+inner.width+pad),y1=Math.min(height,inner.y+inner.height+pad);
  tiles.push({read:{x:x0,y:y0,width:x1-x0,height:y1-y0},inner});
 }
 return tiles;
}

// RGBA bytes -> planar float tensor data. `mean`/`std` per channel (after /255);
// `bgr` swaps channel order as PaddleOCR models expect.
export function toPlanar(rgba:ArrayLike<number>,width:number,height:number,{mean=[0,0,0],std=[1,1,1],bgr=false}:{mean?:number[];std?:number[];bgr?:boolean}={}){
 const out=new Float32Array(3*width*height),n=width*height;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const src=bgr?2-c:c;out[c*n+i]=(rgba[i*4+src]/255-mean[c])/std[c];}
 return out;
}

// PaddleOCR DB detector output -> text boxes: threshold the probability map,
// take 4-connected components, keep confident ones, and grow each box by
// area*unclip/perimeter (the DB "unclip" step, here for axis-aligned boxes).
export function dbBoxes(prob:ArrayLike<number>,width:number,height:number,{thresh=.3,boxThresh=.6,unclip=1.5,minSize=3}:{thresh?:number;boxThresh?:number;unclip?:number;minSize?:number}={}):(Box&{score:number})[]{
 const label=new Int32Array(width*height),boxes:(Box&{score:number})[]=[],stack:number[]=[];let next=0;
 for(let start=0;start<label.length;start++){
  if(label[start]||prob[start]<=thresh)continue;
  next++;label[start]=next;stack.push(start);let x0=width,y0=height,x1=-1,y1=-1,sum=0,count=0;
  while(stack.length){
   const p=stack.pop()!,x=p%width,y=(p-x)/width;sum+=prob[p];count++;
   if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(q>=0&&!label[q]&&prob[q]>thresh){label[q]=next;stack.push(q);}
  }
  const w=x1-x0+1,h=y1-y0+1;if(Math.min(w,h)<minSize||sum/count<boxThresh)continue;
  const d=w*h*unclip/(2*(w+h));
  boxes.push({x0:Math.max(0,x0-d),y0:Math.max(0,y0-d),x1:Math.min(width,x1+1+d),y1:Math.min(height,y1+1+d),score:sum/count});
 }
 return boxes.sort((a,b)=>a.y0-b.y0||a.x0-b.x0);
}

// CTC greedy decoding of a recognizer output [T, C]. Class 0 is blank, 1..N are
// `dict`, and N+1 is a space. Returns text, mean confidence and the time step of
// each emitted character, so word positions can be recovered.
export function ctcDecode(data:ArrayLike<number>,steps:number,classes:number,dict:string[]){
 const chars:{ch:string;t:number;p:number}[]=[];let last=0;
 for(let t=0;t<steps;t++){
  let best=0,p=data[t*classes];for(let c=1;c<classes;c++)if(data[t*classes+c]>p){p=data[t*classes+c];best=c;}
  if(best&&best!==last)chars.push({ch:best<=dict.length?dict[best-1]:' ',t,p});
  last=best;
 }
 const text=chars.map(c=>c.ch).join('').replace(/\s+/g,' ').trim();
 return {text,confidence:chars.length?chars.reduce((s,c)=>s+c.p,0)/chars.length:0,chars};
}

// Words of a decoded line with horizontal extents in input pixels: boundaries
// sit midway between the last character of one word and the first of the next.
// `stepWidth` is input width / time steps.
export function ctcWords(chars:{ch:string;t:number;p:number}[],stepWidth:number,lineWidth:number){
 const words:{text:string;first:number;last:number;p:number[];t:number[]}[]=[];let current:typeof words[number]|undefined;
 for(const c of chars){if(/\s/.test(c.ch)){current=undefined;continue;}if(!current){current={text:'',first:c.t,last:c.t,p:[],t:[]};words.push(current);}current.text+=c.ch;current.last=c.t;current.p.push(c.p);current.t.push(c.t);}
 return words.map((w,i)=>{
  const prev=words[i-1],next=words[i+1];
  const x0=prev?(prev.last+w.first+1)/2*stepWidth:Math.max(0,(w.first-1)*stepWidth),x1=next?(w.last+next.first+1)/2*stepWidth:Math.min(lineWidth,(w.last+2)*stepWidth);
  return {text:w.text,x0,x1,confidence:100*w.p.reduce((s,p)=>s+p,0)/w.p.length,centers:w.t.map(t=>(t+.5)*stepWidth),probs:w.p};
 });
}

// Shrink [x0,x1) to the columns that carry ink (column ink totals per x).
export function trimToInk(columns:ArrayLike<number>,x0:number,x1:number,min=.5){
 let a=Math.max(0,Math.floor(x0)),b=Math.min(columns.length,Math.ceil(x1));
 while(a<b&&columns[a]<min)a++;while(b>a&&columns[b-1]<min)b--;
 return b>a?{x0:a,x1:b}:{x0,x1};
}

// LaMa works on fixed 512x512 inputs. Group masked rectangles into crop windows
// that each include context around the holes; windows are at least `size`
// wide where the image allows (more context, native resolution) and larger
// only when a group of holes needs it (then the crop is downscaled to `size`).
export function inpaintWindows(rects:Rect[],width:number,height:number,size=512,margin=32){
 const windows:{rects:Rect[];box:Box}[]=[];
 const grow=(r:Rect):Box=>({x0:r.x-Math.max(margin,r.height*.5),y0:r.y-Math.max(margin,r.height*.5),x1:r.x+r.width+Math.max(margin,r.height*.5),y1:r.y+r.height+Math.max(margin,r.height*.5)});
 for(const r of [...rects].sort((a,b)=>a.y-b.y||a.x-b.x)){
  const g=grow(r),fit=windows.find(w=>{const u={x0:Math.min(w.box.x0,g.x0),y0:Math.min(w.box.y0,g.y0),x1:Math.max(w.box.x1,g.x1),y1:Math.max(w.box.y1,g.y1)};return u.x1-u.x0<=size&&u.y1-u.y0<=size;});
  if(fit){fit.rects.push(r);fit.box={x0:Math.min(fit.box.x0,g.x0),y0:Math.min(fit.box.y0,g.y0),x1:Math.max(fit.box.x1,g.x1),y1:Math.max(fit.box.y1,g.y1)};}
  else windows.push({rects:[r],box:g});
 }
 return windows.map(({rects,box})=>{
  const side=Math.max(size,box.x1-box.x0,box.y1-box.y0),w=Math.min(width,side),h=Math.min(height,side);
  const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
  const x=Math.round(Math.max(0,Math.min(width-w,cx-w/2))),y=Math.round(Math.max(0,Math.min(height-h,cy-h/2)));
  return {rects,crop:{x,y,width:Math.round(w),height:Math.round(h)}};
 });
}

// The inked band of rows around `center` (row ink totals), bridging gaps of up
// to `maxGap` empty rows (accents, i-dots). Neighbouring lines inside a padded
// detector box are separated by a wider gap and left out.
export function inkBand(rows:ArrayLike<number>,center:number,maxGap=2,min=.5){
 const has=(y:number)=>y>=0&&y<rows.length&&rows[y]>=min;let c=Math.round(center);
 if(!has(c)){let d=1;while(d<rows.length&&!has(c-d)&&!has(c+d))d++;c=has(c-d)?c-d:c+d;if(!has(c))return {x0:0,x1:rows.length};}
 let a=c,b=c;
 for(let gap=0,y=c-1;y>=0&&gap<=maxGap;y--){if(has(y)){a=y;gap=0;}else gap++;}
 for(let gap=0,y=c+1;y<rows.length&&gap<=maxGap;y++){if(has(y)){b=y;gap=0;}else gap++;}
 return {x0:a,x1:b+1};
}

// Bilinear resize of RGBA pixels with pixel-centre alignment. Used instead of
// canvas scaling for model inputs: browsers' smoothing filters differ and soften
// thin strokes, which made the recognizer read "ii" as "i".
export function resizeBilinear(src:ArrayLike<number>,sw:number,sh:number,dw:number,dh:number){
 const out=new Uint8ClampedArray(dw*dh*4);
 for(let y=0;y<dh;y++){
  const fy=Math.min(sh-1,Math.max(0,(y+.5)*sh/dh-.5)),y0=Math.floor(fy),y1=Math.min(sh-1,y0+1),ay=fy-y0;
  for(let x=0;x<dw;x++){
   const fx=Math.min(sw-1,Math.max(0,(x+.5)*sw/dw-.5)),x0=Math.floor(fx),x1=Math.min(sw-1,x0+1),ax=fx-x0,o=(y*dw+x)*4;
   for(let c=0;c<4;c++){const a=src[(y0*sw+x0)*4+c],b=src[(y0*sw+x1)*4+c],d=src[(y1*sw+x0)*4+c],e=src[(y1*sw+x1)*4+c];out[o+c]=(a*(1-ax)+b*ax)*(1-ay)+(d*(1-ax)+e*ax)*ay;}
  }
 }
 return out;
}

// Move a word boundary from the recognizer's timing estimate to the centre of
// the nearest blank column run of at least `minGap` (the real space between
// words); a boundary inside a letter would clip it when the old word is covered.
export function snapToGap(columns:ArrayLike<number>,x:number,minGap:number,maxDistance:number,min=.5){
 let best:number|undefined,bestDistance=Infinity,run=0;
 for(let i=0;i<=columns.length;i++){
  if(i<columns.length&&columns[i]<min){run++;continue;}
  if(run>=minGap){const centre=i-run/2,distance=Math.abs(centre-x);if(distance<=maxDistance&&distance<bestDistance){best=centre;bestDistance=distance;}}
  run=0;
 }
 return best??x;
}

// Scripts with a bundled PP-OCRv5 recognizer. Letter cells (glyph-edit.ts)
// only work for alphabets written left to right with separate letters.
export const ocrScripts=['latin','cyrillic','greek','arabic','korean','cjk'] as const;
export type OcrScript=typeof ocrScripts[number];
export const scriptLabels:Record<OcrScript,string>={latin:'Latin',cyrillic:'Cyrillic',greek:'Greek',arabic:'Arabic',korean:'Korean',cjk:'Chinese & Japanese'};
export const separateLetters=(script:OcrScript)=>script==='latin'||script==='cyrillic'||script==='greek';

// The recognizer reads right-to-left text in visual (left-to-right) order.
// Reverse it to reading order, keeping runs of Latin letters, digits and
// common symbols the way they read (PaddleOCR's pred_reverse, with spaces
// kept between runs rather than inside them).
export function rtlReorder(text:string){
 const parts:string[]=[];let run='';
 for(const c of text){if(/[a-zA-Z0-9:*./%+-]/.test(c))run+=c;else{if(run)parts.push(run);parts.push(c);run='';}}
 if(run)parts.push(run);
 return parts.reverse().join('');
}
