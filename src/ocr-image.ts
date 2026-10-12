// Pixel helpers for OCR: preprocessing before Tesseract and colour sampling after.
export type Pixels={data:Uint8ClampedArray;width:number;height:number};
type Box={x0:number;y0:number;x1:number;y1:number};
const luma=(d:ArrayLike<number>,i:number)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];

// Typical text line height (ascender to descender, in pixels) of a prepared
// (dark-on-light) image: median height of inked row runs in vertical strips,
// so side-by-side columns with offset baselines don't merge into one run.
export function estimateLineHeight(img:Pixels,strips=4):number|undefined{
 const {data,width,height}=img,runs:number[]=[];
 for(let s=0;s<strips;s++){
  const x0=Math.floor(width*s/strips),x1=Math.floor(width*(s+1)/strips);let run=0;
  for(let y=0;y<=height;y++){
   let ink=0;if(y<height)for(let x=x0;x<x1&&ink<2;x++)if(data[(y*width+x)*4]<128)ink++;
   if(ink>=2)run++;else{if(run>=4)runs.push(run);run=0;}
  }
 }
 if(!runs.length)return undefined;runs.sort((a,b)=>a-b);return runs[runs.length>>1];
}

// Upscale small text towards ~24px lines (x-height ~12px), at most 3x and
// within a pixel budget. Text that is already larger is left alone: enlarging
// it, like stretching contrast, measurably hurt accuracy (thin diacritics, ß).
export function ocrScale(width:number,height:number,lineHeight?:number,maxSide=4800,maxPixels=12e6){
 const side=Math.max(width,height);if(side<1)return 1;
 const want=lineHeight?24/lineHeight:side<1200?2:1;
 return Math.max(1,Math.min(3,want,maxSide/side,Math.sqrt(maxPixels/(width*height))));
}

// Grayscale and turn light-on-dark images (dark mode, chat UIs) into
// dark-on-light, which Tesseract recognizes more reliably.
export function prepareOcrPixels(img:Pixels):{inverted:boolean}{
 const d=img.data,histogram=new Uint32Array(256);
 for(let i=0;i<d.length;i+=4){const a=d[i+3]/255,v=Math.round(luma(d,i)*a+255*(1-a));d[i]=v;histogram[v]++;}
 let seen=0,median=255;for(let v=0;v<256;v++){seen+=histogram[v];if(seen>=d.length/8){median=v;break;}}
 const inverted=median<110;
 for(let i=0;i<d.length;i+=4){const v=inverted?255-d[i]:d[i];d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
 return {inverted};
}

// Median colour of a thin ring just outside the text box. A single corner pixel
// often lands on an anti-aliased edge, border or neighbouring glyph.
export function sampleBackground(img:Pixels,box:Box,ring=3):[number,number,number]{
 const {data,width,height}=img,channels:number[][]=[[],[],[]];
 const x0=Math.max(0,Math.floor(box.x0)-ring),y0=Math.max(0,Math.floor(box.y0)-ring),x1=Math.min(width,Math.ceil(box.x1)+ring),y1=Math.min(height,Math.ceil(box.y1)+ring);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  if(x>=box.x0-1&&x<box.x1+1&&y>=box.y0-1&&y<box.y1+1)continue;
  const i=(y*width+x)*4;for(let c=0;c<3;c++)channels[c].push(data[i+c]);
 }
 if(!channels[0].length){const i=(Math.min(height-1,Math.max(0,Math.floor(box.y0)))*width+Math.min(width-1,Math.max(0,Math.floor(box.x0))))*4;return [data[i],data[i+1],data[i+2]];}
 return channels.map(values=>{values.sort((a,b)=>a-b);return values[values.length>>1];}) as [number,number,number];
}

// Glyph colour: average of the pixels that contrast most with the background,
// ignoring the fringe that blends the two. Only the strongest few percent are
// used: on soft or blurred text most ink pixels never reach the true colour.
export function estimateTextColor(img:Pixels,box:Box,background:readonly number[]):[number,number,number]|undefined{
 const {data,width,height}=img,samples:{contrast:number;i:number}[]=[];
 for(let y=Math.max(0,Math.floor(box.y0));y<Math.min(height,Math.ceil(box.y1));y++)for(let x=Math.max(0,Math.floor(box.x0));x<Math.min(width,Math.ceil(box.x1));x++){
  const i=(y*width+x)*4,contrast=Math.max(...[0,1,2].map(c=>Math.abs(data[i+c]-background[c])));
  if(contrast>40)samples.push({contrast,i});
 }
 if(samples.length<4)return undefined;
 samples.sort((a,b)=>b.contrast-a.contrast);
 const core=samples.slice(0,Math.max(2,Math.ceil(samples.length*.08))),sum=[0,0,0];
 for(const {i} of core)for(let c=0;c<3;c++)sum[c]+=data[i+c];
 return sum.map(v=>Math.round(v/core.length)) as [number,number,number];
}
export const toHex=(rgb:readonly number[])=>'#'+rgb.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');

// Width of the glyph edges in pixels: partly-inked pixels (20-80% of full
// contrast) per outline pixel of the half-contrast mask. Grows with blur;
// crisp anti-aliased text measures about 1.
// Blur radius (px) implied by an edge width, calibrated in Chromium against
// canvas/CSS blur: crisp text measures 0.5-1.1, each px of blur adds ~2.3.
export const blurFromEdgeWidth=(edge:number)=>Math.max(0,(edge-1.1)/2.3);

export function edgeWidth(img:Pixels,box:Box,background:readonly number[]):number|undefined{
 const {data,width}=img,x0=Math.max(0,Math.floor(box.x0)),y0=Math.max(0,Math.floor(box.y0)),x1=Math.min(width,Math.ceil(box.x1)),y1=Math.min(img.height,Math.ceil(box.y1)),w=x1-x0,h=y1-y0;
 if(w<3||h<3)return undefined;
 const c=new Float32Array(w*h);let peak=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((y0+y)*width+x0+x)*4,v=Math.max(Math.abs(data[i]-background[0]),Math.abs(data[i+1]-background[1]),Math.abs(data[i+2]-background[2]));c[y*w+x]=v;if(v>peak)peak=v;}
 if(peak<40)return undefined;
 let partial=0,outline=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=c[y*w+x]/peak;if(v>=.2&&v<=.8)partial++;
  if(v>=.5&&x>0&&y>0&&x<w-1&&y<h-1&&(c[y*w+x-1]<peak*.5||c[y*w+x+1]<peak*.5||c[(y-1)*w+x]<peak*.5||c[(y+1)*w+x]<peak*.5))outline++;}
 return outline>=10?partial/outline:undefined;
}

// Total ink of a box, in fully-inked pixel equivalents: contrast with the
// background summed over the box grown by `pad` px. Blur moves ink around but
// keeps this total, unlike peak darkness or stroke coverage.
export function inkMass(img:Pixels,box:Box,background:readonly number[],pad=0):number{
 const {data,width,height}=img;let sum=0;
 for(let y=Math.max(0,Math.floor(box.y0-pad));y<Math.min(height,Math.ceil(box.y1+pad));y++)for(let x=Math.max(0,Math.floor(box.x0-pad));x<Math.min(width,Math.ceil(box.x1+pad));x++){
  const i=(y*width+x)*4,v=Math.max(Math.abs(data[i]-background[0]),Math.abs(data[i+1]-background[1]),Math.abs(data[i+2]-background[2]));if(v>12)sum+=v/255;
 }
 return sum;
}

// On soft text the darkest pixels never reach the real ink. When the measured
// ink level (0-1 of full contrast, from ink mass) is stronger than the sampled
// colour, move the colour further from the background along the same direction.
export function darkenToInk(color:string,background:string|undefined,level:number|undefined):string{
 if(level===undefined||!background||!/^#[0-9a-f]{6}$/i.test(color)||!/^#[0-9a-f]{6}$/i.test(background))return color;
 const rgb=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),c=rgb(color),b=rgb(background);
 const contrast=Math.max(...c.map((v,i)=>Math.abs(v-b[i])))/255;if(contrast<.05||level<=contrast)return color;
 const k=Math.min(level,1)/contrast;
 return toHex(c.map((v,i)=>Math.max(0,Math.min(255,b[i]+(v-b[i])*k))));
}
