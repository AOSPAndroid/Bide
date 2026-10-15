// Layer styles (drop shadow, glows, stroke, colour and gradient overlays),
// computed from a layer's rendered pixels the way Photoshop and Photopea stack
// them. Pure functions on RGBA buffers; the renderer is layer-style-render.ts.
import {blurAlpha,distanceTo} from './pixel-mask';

export type ShadowEffect={enabled:boolean;color:string;opacity:number;angle:number;distance:number;size:number;spread:number};
export type GlowEffect={enabled:boolean;color:string;opacity:number;size:number;spread:number};
export type StrokeEffect={enabled:boolean;color:string;opacity:number;size:number;position:'outside'|'center'|'inside'};
export type ColorOverlay={enabled:boolean;color:string;opacity:number};
export type GradientOverlay={enabled:boolean;from:string;to:string;angle:number;opacity:number};
export type LayerStyle={dropShadow?:ShadowEffect;innerShadow?:ShadowEffect;outerGlow?:GlowEffect;innerGlow?:GlowEffect;stroke?:StrokeEffect;colorOverlay?:ColorOverlay;gradientOverlay?:GradientOverlay};
export type EffectName=keyof LayerStyle;

// Opacity is 0-100, angle in degrees (light direction, 120° = from the top
// left), distance/size in page units, spread 0-100 (% of size made solid).
export const effectDefaults:{[K in EffectName]-?:NonNullable<LayerStyle[K]>}={
 dropShadow:{enabled:true,color:'#000000',opacity:45,angle:120,distance:6,size:8,spread:0},
 innerShadow:{enabled:true,color:'#000000',opacity:45,angle:120,distance:3,size:5,spread:0},
 outerGlow:{enabled:true,color:'#ffe38a',opacity:75,size:10,spread:0},
 innerGlow:{enabled:true,color:'#fff7d6',opacity:75,size:6,spread:0},
 stroke:{enabled:true,color:'#25272d',opacity:100,size:3,position:'outside'},
 colorOverlay:{enabled:true,color:'#c44c28',opacity:100},
 gradientOverlay:{enabled:true,from:'#25272d',to:'#c44c28',angle:90,opacity:100},
};
export const effectLabels:Record<EffectName,string>={dropShadow:'Drop shadow',innerShadow:'Inner shadow',outerGlow:'Outer glow',innerGlow:'Inner glow',stroke:'Stroke',colorOverlay:'Color overlay',gradientOverlay:'Gradient overlay'};

export const hasEffects=(s:LayerStyle|undefined|null):s is LayerStyle=>!!s&&Object.values(s).some(e=>e?.enabled);

// How far (page units) the effects can reach beyond the layer's own pixels.
export function effectExtent(s:LayerStyle){
 let e=0;
 if(s.dropShadow?.enabled)e=Math.max(e,s.dropShadow.distance+s.dropShadow.size*1.5+2);
 if(s.outerGlow?.enabled)e=Math.max(e,s.outerGlow.size*1.5+2);
 if(s.stroke?.enabled&&s.stroke.position!=='inside')e=Math.max(e,s.stroke.size+2);
 return Math.ceil(e);
}

export const hexRgb=(hex:string):[number,number,number]=>{const h=/^#?([0-9a-f]{6})$/i.exec(hex)?.[1]??'000000';return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};

// Offset of a light angle: the shadow falls away from the light.
export const lightOffset=(angle:number,distance:number)=>({x:-Math.cos(angle*Math.PI/180)*distance,y:Math.sin(angle*Math.PI/180)*distance});

function shifted(a:Uint8ClampedArray,w:number,h:number,dx:number,dy:number,fill:number){
 const out=new Uint8ClampedArray(a.length),ix=Math.round(dx),iy=Math.round(dy);
 for(let y=0;y<h;y++){const sy=y-iy;for(let x=0;x<w;x++){const sx=x-ix;out[y*w+x]=sx<0||sy<0||sx>=w||sy>=h?fill:a[sy*w+sx];}}
 return out;
}
// Solid core (spread) inside a soft blur of `size`.
function spreadBlur(a:Uint8ClampedArray,w:number,h:number,size:number,spread:number){
 let base=a;
 const grow=size*spread/100;
 if(grow>=.5){const inside=a.map(v=>v>=128?1:0),d=distanceTo(inside,w,h);base=new Uint8ClampedArray(a.length);for(let i=0;i<a.length;i++)base[i]=Math.max(a[i],Math.min(255,(grow+1-d[i])*255));}
 return blurAlpha(base,w,h,Math.max(0,size-grow));
}
// Paint `color` with per-pixel alpha `mask`·opacity over `out` (premultiplied-free source-over).
function paint(out:Float32Array,mask:ArrayLike<number>,rgb:readonly number[],opacity:number,clip?:ArrayLike<number>){
 for(let i=0;i<mask.length;i++){
  let a=mask[i]/255*opacity;if(clip)a*=clip[i]/255;if(a<=0)continue;
  const o=i*4,da=out[o+3],na=a+da*(1-a);
  for(let c=0;c<3;c++)out[o+c]=(rgb[c]*a+out[o+c]*da*(1-a))/(na||1);
  out[o+3]=na;
 }
}

// The styled layer for its rendered pixels (RGBA, straight alpha). `scale`
// converts page units to these pixels.
export function applyLayerStyle(rgba:Uint8ClampedArray,w:number,h:number,s:LayerStyle,scale=1):Uint8ClampedArray{
 const n=w*h,A=new Uint8ClampedArray(n);for(let i=0;i<n;i++)A[i]=rgba[i*4+3];
 const out=new Float32Array(n*4);// rgb 0-255, alpha 0-1
 const px=(v:number)=>v*scale;
 // Distances to the shape (outside) and to the background (inside), for strokes.
 let dOut:Float32Array|undefined,dIn:Float32Array|undefined;
 const outside=()=>dOut??=distanceTo(A.map(v=>v>=128?1:0),w,h),inside=()=>dIn??=distanceTo(A.map(v=>v<128?1:0),w,h);
 const st=s.stroke?.enabled?s.stroke:undefined,stSize=st?px(st.size):0;
 // 1. Below the layer: drop shadow, outer glow, the outside part of a stroke.
 if(s.dropShadow?.enabled){const d=s.dropShadow,o=lightOffset(d.angle,px(d.distance));paint(out,shifted(spreadBlur(A,w,h,px(d.size),d.spread),w,h,o.x,o.y,0),hexRgb(d.color),d.opacity/100);}
 if(s.outerGlow?.enabled){const g=s.outerGlow;paint(out,spreadBlur(A,w,h,px(g.size),g.spread),hexRgb(g.color),g.opacity/100);}
 if(st&&st.position!=='inside'){const reach=st.position==='center'?stSize/2:stSize,d=outside(),m=new Uint8ClampedArray(n);for(let i=0;i<n;i++)m[i]=Math.max(0,Math.min(1,reach+.5-d[i]))*255;paint(out,m,hexRgb(st.color),st.opacity/100);}
 // 2. The layer itself, with colour and gradient overlays replacing its colour.
 const fill=new Float32Array(n*4);
 for(let i=0;i<n;i++){fill[i*4]=rgba[i*4];fill[i*4+1]=rgba[i*4+1];fill[i*4+2]=rgba[i*4+2];}
 if(s.gradientOverlay?.enabled){
  const g=s.gradientOverlay,a=hexRgb(g.from),b=hexRgb(g.to),t=g.opacity/100,rad=g.angle*Math.PI/180,ux=Math.cos(rad),uy=-Math.sin(rad);
  // Gradient across the layer's own extent along the angle.
  let lo=Infinity,hi=-Infinity;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(A[y*w+x]){const p=x*ux+y*uy;if(p<lo)lo=p;if(p>hi)hi=p;}
  const span=hi-lo||1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!A[i])continue;const f=Math.max(0,Math.min(1,(x*ux+y*uy-lo)/span));for(let c=0;c<3;c++)fill[i*4+c]+=(a[c]+(b[c]-a[c])*f-fill[i*4+c])*t;}
 }
 if(s.colorOverlay?.enabled){const c=hexRgb(s.colorOverlay.color),t=s.colorOverlay.opacity/100;for(let i=0;i<n;i++)for(let k=0;k<3;k++)fill[i*4+k]+=(c[k]-fill[i*4+k])*t;}
 const layer=new Float32Array(n*4);
 for(let i=0;i<n;i++){layer[i*4]=fill[i*4];layer[i*4+1]=fill[i*4+1];layer[i*4+2]=fill[i*4+2];layer[i*4+3]=A[i]/255;}
 // 3. Inside the layer: inner glow and inner shadow (clipped to its pixels).
 if(s.innerGlow?.enabled){const g=s.innerGlow,inv=A.map(v=>255-v),m=spreadBlur(inv,w,h,px(g.size),g.spread);paint(layer,m,hexRgb(g.color),g.opacity/100,A);}
 if(s.innerShadow?.enabled){const d=s.innerShadow,o=lightOffset(d.angle,px(d.distance)),inv=A.map(v=>255-v),m=spreadBlur(shifted(inv,w,h,o.x,o.y,255),w,h,px(d.size),d.spread);paint(layer,m,hexRgb(d.color),d.opacity/100,A);}
 if(st&&st.position!=='outside'){const reach=st.position==='center'?stSize/2:stSize,d=inside(),m=new Uint8ClampedArray(n);for(let i=0;i<n;i++)m[i]=Math.max(0,Math.min(1,reach+.5-d[i]))*255;paint(layer,m,hexRgb(st.color),st.opacity/100,A);}
 // 4. Layer over the effects beneath it.
 for(let i=0;i<n;i++){
  const o=i*4,a=layer[o+3];if(a<=0)continue;const da=out[o+3],na=a+da*(1-a);
  for(let c=0;c<3;c++)out[o+c]=(layer[o+c]*a+out[o+c]*da*(1-a))/(na||1);out[o+3]=na;
 }
 const result=new Uint8ClampedArray(n*4);
 for(let i=0;i<n;i++){const o=i*4;result[o]=out[o];result[o+1]=out[o+1];result[o+2]=out[o+2];result[o+3]=out[o+3]*255;}
 return result;
}
