// Pixel helpers for OCR: preprocessing before Tesseract and colour sampling after.
export type Pixels={data:Uint8ClampedArray;width:number;height:number};
type Box={x0:number;y0:number;x1:number;y1:number};
const luma=(d:ArrayLike<number>,i:number)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];

// Tesseract's LSTM models read best when x-height is ~20-30px. Screenshots and
// reduced PDF previews are often far smaller, so upscale them within a pixel budget.
export function ocrScale(width:number,height:number,maxSide=4800,maxPixels=12e6){
 const side=Math.max(width,height);if(side<1)return 1;
 const want=side<1200?3:side<2600?2:1;
 return Math.max(1,Math.min(want,maxSide/side,Math.sqrt(maxPixels/(width*height))));
}

// Grayscale, stretch contrast and turn light-on-dark pages (dark mode, chat UIs)
// into dark-on-light, which Tesseract recognizes far more reliably.
export function prepareOcrPixels(img:Pixels):{inverted:boolean}{
 const d=img.data,histogram=new Uint32Array(256);
 for(let i=0;i<d.length;i+=4){const a=d[i+3]/255,v=Math.round(luma(d,i)*a+255*(1-a));d[i]=v;histogram[v]++;}
 const total=d.length/4,pick=(q:number)=>{let n=0;for(let v=0;v<256;v++){n+=histogram[v];if(n>=total*q)return v;}return 255;};
 const median=pick(.5),inverted=median<110,lo=pick(.005),hi=pick(.995),range=Math.max(1,hi-lo);
 for(let i=0;i<d.length;i+=4){let v=hi-lo<32?d[i]:Math.max(0,Math.min(255,(d[i]-lo)*255/range));if(inverted)v=255-v;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
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
// ignoring the anti-aliased fringe that blends the two.
export function estimateTextColor(img:Pixels,box:Box,background:readonly number[]):[number,number,number]|undefined{
 const {data,width,height}=img,samples:{contrast:number;i:number}[]=[];
 for(let y=Math.max(0,Math.floor(box.y0));y<Math.min(height,Math.ceil(box.y1));y++)for(let x=Math.max(0,Math.floor(box.x0));x<Math.min(width,Math.ceil(box.x1));x++){
  const i=(y*width+x)*4,contrast=Math.max(...[0,1,2].map(c=>Math.abs(data[i+c]-background[c])));
  if(contrast>40)samples.push({contrast,i});
 }
 if(samples.length<4)return undefined;
 samples.sort((a,b)=>b.contrast-a.contrast);
 const core=samples.slice(0,Math.max(2,Math.ceil(samples.length*.3))),sum=[0,0,0];
 for(const {i} of core)for(let c=0;c<3;c++)sum[c]+=data[i+c];
 return sum.map(v=>Math.round(v/core.length)) as [number,number,number];
}
export const toHex=(rgb:readonly number[])=>'#'+rgb.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
