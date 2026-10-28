// The editor canvas holds page × zoom × devicePixelRatio pixels, twice (Fabric's
// lower and upper canvas). Past the browser's limits a canvas silently draws
// nothing (iOS up to 17: 16.7M pixels; Chrome: 32767 px a side, ~268M pixels),
// and long before that a phone runs out of memory. So past a budget the canvas
// keeps its CSS size, zoom and pointer mapping but renders fewer pixels: first
// less than the retina density, then less than one pixel per CSS pixel. Only
// sharpness drops, at extreme zoom; exports render separately and are unaffected.
import type {Canvas} from 'fabric';
import {canvasBackingScale} from './render-budget';

const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
// Phones and tablets: under iOS's 16.7M limit and their memory; desktops: well under Chrome's.
export const BACKING_BUDGET=coarse?16e6:128e6;

const scales=new WeakMap<Canvas,number>();
export function sizeCanvas(c:Canvas,width:number,height:number){
 const s=canvasBackingScale(width,height,window.devicePixelRatio||1,BACKING_BUDGET);
 // Fabric reads this for rendering, pointers, caches and the text cursor; exports turn it off.
 if(!scales.has(c))c.getRetinaScaling=function(this:Canvas){return this.enableRetinaScaling?scales.get(this)??1:1;};
 scales.set(c,s);
 if(s>=1){c.setDimensions({width,height});return;}
 // Fabric only ever enlarges the backing store, so a smaller one is set here.
 c.setDimensions({width,height},{cssOnly:true});Object.assign(c,{width,height,hasLostContext:true});
 for(const el of [c.lowerCanvasEl,c.upperCanvasEl]){el.width=Math.max(1,Math.round(width*s));el.height=Math.max(1,Math.round(height*s));el.getContext('2d')!.scale(s,s);}
 c.requestRenderAll();
}
