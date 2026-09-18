type Pixels={width:number;height:number;data:Uint8ClampedArray};
export type TextBounds={left:number;top:number;width:number;height:number};
const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]??0;
const hex=(rgb:number[])=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
export function sampleTextColors(image:Pixels,box:TextBounds){
 const {width:w,height:h,data}=image,edges:number[][]=[],ink:number[][]=[];
 const pixel=(x:number,y:number)=>{const i=(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4;return [...data.slice(i,i+3)];};
 const l=Math.floor(box.left),t=Math.floor(box.top),r=Math.ceil(box.left+box.width),b=Math.ceil(box.top+box.height);
 const step=Math.max(1,Math.ceil(Math.max(box.width,box.height)/256));
 for(let x=l;x<r;x+=step){edges.push(pixel(x,t-2),pixel(x,b+2));}
 for(let y=t;y<b;y+=step){edges.push(pixel(l-2,y),pixel(r+2,y));}
 const bg=[0,1,2].map(c=>median(edges.map(p=>p[c])));
 const distance=(p:number[])=>p.reduce((sum,v,c)=>sum+(v-bg[c])**2,0);
 const stride=Math.max(1,Math.ceil(Math.sqrt(box.width*box.height/20000)));
 for(let y=Math.max(0,t);y<Math.min(h,b);y+=stride)for(let x=Math.max(0,l);x<Math.min(w,r);x+=stride){const p=pixel(x,y);if(distance(p)>900)ink.push(p);}
 ink.sort((a,b)=>distance(b)-distance(a));
 // Strongest foreground samples avoid antialiased edge pixels and background noise.
 const core=ink.slice(0,Math.max(1,Math.ceil(ink.length*.35)));
 return {background:hex(bg),color:core.length?hex([0,1,2].map(c=>median(core.map(p=>p[c])))):bg.reduce((a,b)=>a+b,0)>384?'#151515':'#ffffff'};
}

// Reconstruct a smooth field from the top and bottom border. Median sampling
// rejects isolated nearby lettering; this is a gradient repair, not inpainting.
export function repairTextBackground(image:Pixels,box:TextBounds){
 const {width:w,height:h,data}=image;
 const left=Math.max(0,Math.floor(box.left)),top=Math.max(0,Math.floor(box.top));
 const right=Math.min(w,Math.ceil(box.left+box.width)),bottom=Math.min(h,Math.ceil(box.top+box.height));
 const width=right-left,height=bottom-top;
 if(width<1||height<1)throw new Error('The text area is outside the image.');
 if(top===0&&bottom===h)throw new Error('Leave some background above or below the text to repair it.');
 const output=new Uint8ClampedArray(width*height*4);
 const sample=(x:number,y:number,c:number)=>{const values:number[]=[];for(let dx=-2;dx<=2;dx++){const i=(y*w+Math.max(0,Math.min(w-1,x+dx)))*4;values.push(data[i+c]);}return median(values);};
 for(let x=0;x<width;x++){
  const upper=[0,1,2,3].map(c=>sample(left+x,top>0?top-1:bottom,c));
  const lower=[0,1,2,3].map(c=>sample(left+x,bottom<h?bottom:top-1,c));
  for(let y=0;y<height;y++){const f=(y+1)/(height+1),i=(y*width+x)*4;for(let c=0;c<4;c++)output[i+c]=upper[c]*(1-f)+lower[c]*f;}
 }
 return {data:output,width,height,left,top};
}
