// Adjustment layers: Levels, Curves and Hue/Saturation applied to every pixel
// beneath them, the way Photoshop and Photopea do. Pure functions on RGBA
// buffers; the layer object is in adjustment-layer.ts.
export type Levels={kind:'levels';inBlack:number;inWhite:number;gamma:number;outBlack:number;outWhite:number};
// Curve points (x, y) in 0-255 for the composite RGB curve; the ends are
// included and x increases.
export type Curves={kind:'curves';points:[number,number][]};
export type HueSaturation={kind:'hueSaturation';hue:number;saturation:number;lightness:number};
export type Adjustment=Levels|Curves|HueSaturation;

export const adjustmentDefaults:{[K in Adjustment['kind']]:Extract<Adjustment,{kind:K}>}={
 levels:{kind:'levels',inBlack:0,inWhite:255,gamma:1,outBlack:0,outWhite:255},
 curves:{kind:'curves',points:[[0,0],[64,64],[128,128],[192,192],[255,255]]},
 hueSaturation:{kind:'hueSaturation',hue:0,saturation:0,lightness:0},
};
export const adjustmentLabels:Record<Adjustment['kind'],string>={levels:'Levels',curves:'Curves',hueSaturation:'Hue/Saturation'};

const clamp=(v:number)=>v<0?0:v>255?255:v;

export function levelsLut({inBlack,inWhite,gamma,outBlack,outWhite}:Levels){
 const lut=new Uint8ClampedArray(256),span=Math.max(1,inWhite-inBlack),g=Math.max(.01,gamma);
 for(let v=0;v<256;v++){const t=Math.min(1,Math.max(0,(v-inBlack)/span));lut[v]=Math.round(outBlack+(outWhite-outBlack)*t**(1/g));}
 return lut;
}

// Monotone cubic (Fritsch-Carlson) through the points, so the curve never
// overshoots between them and stays a function.
export function curvesLut({points}:Curves){
 const p=[...points].sort((a,b)=>a[0]-b[0]).filter((q,i,a)=>!i||q[0]>a[i-1][0]),n=p.length,lut=new Uint8ClampedArray(256);
 if(n<2){for(let v=0;v<256;v++)lut[v]=v;return lut;}
 const d=p.slice(0,-1).map((q,i)=>(p[i+1][1]-q[1])/(p[i+1][0]-q[0]));
 const m=p.map((_,i)=>i===0?d[0]:i===n-1?d[n-2]:d[i-1]*d[i]<=0?0:(d[i-1]+d[i])/2);
 for(let i=0;i<n-1;i++){if(d[i]===0){m[i]=m[i+1]=0;continue;}const a=m[i]/d[i],b=m[i+1]/d[i],s=a*a+b*b;if(s>9){const t=3/Math.sqrt(s);m[i]=t*a*d[i];m[i+1]=t*b*d[i];}}
 for(let v=0;v<256;v++){
  if(v<=p[0][0]){lut[v]=Math.round(p[0][1]);continue;}if(v>=p[n-1][0]){lut[v]=Math.round(p[n-1][1]);continue;}
  let i=0;while(v>p[i+1][0])i++;
  const h=p[i+1][0]-p[i][0],t=(v-p[i][0])/h,t2=t*t,t3=t2*t;
  lut[v]=Math.round(clamp((2*t3-3*t2+1)*p[i][1]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*p[i+1][1]+(t3-t2)*h*m[i+1]));
 }
 return lut;
}

// Hue rotation in degrees, saturation and lightness in -100..100 (HSL model,
// like Photoshop's Hue/Saturation "Master").
function hueSaturation(data:Uint8ClampedArray,{hue,saturation,lightness}:HueSaturation,mix:number){
 const sat=saturation/100,light=lightness/100,shift=((hue%360)+360)%360/360;
 for(let i=0;i<data.length;i+=4){
  if(!data[i+3])continue;
  const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,c=max-min;
  let h=0,s=0;
  if(c){s=c/(1-Math.abs(2*l-1));h=max===r?((g-b)/c+6)%6:max===g?(b-r)/c+2:(r-g)/c+4;h/=6;}
  h=(h+shift)%1;s=Math.min(1,Math.max(0,sat>0?s+(1-s)*sat:s*(1+sat)));
  let L=light>0?l+(1-l)*light:l*(1+light);L=Math.min(1,Math.max(0,L));
  const C=(1-Math.abs(2*L-1))*s,X=C*(1-Math.abs((h*6)%2-1)),m=L-C/2,k=Math.floor(h*6)%6;
  const [R,G,B]=k===0?[C,X,0]:k===1?[X,C,0]:k===2?[0,C,X]:k===3?[0,X,C]:k===4?[X,0,C]:[C,0,X];
  data[i]=data[i]+((R+m)*255-data[i])*mix;data[i+1]=data[i+1]+((G+m)*255-data[i+1])*mix;data[i+2]=data[i+2]+((B+m)*255-data[i+2])*mix;
 }
}

// Applies `a` in place. `mix` (0-1) is the layer's opacity.
export function applyAdjustment(data:Uint8ClampedArray,a:Adjustment,mix=1){
 if(mix<=0)return;
 if(a.kind==='hueSaturation'){hueSaturation(data,a,mix);return;}
 const lut=a.kind==='levels'?levelsLut(a):curvesLut(a);
 for(let i=0;i<data.length;i+=4){if(!data[i+3])continue;for(let c=0;c<3;c++){const v=data[i+c];data[i+c]=v+(lut[v]-v)*mix;}}
}

export const isIdentity=(a:Adjustment)=>a.kind==='hueSaturation'?!a.hue&&!a.saturation&&!a.lightness:levelsOrCurvesIdentity(a);
function levelsOrCurvesIdentity(a:Levels|Curves){const lut=a.kind==='levels'?levelsLut(a):curvesLut(a);return lut.every((v,i)=>v===i);}
