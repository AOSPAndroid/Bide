// Drag handles in the Warp and Perspective editors. Hit-testing happens in
// screen pixels through the SVG's own transform, so a finger grabs the nearest
// handle within 24px however small the dots are drawn, and letterboxed layers
// map correctly. A mouse still has to land on the dot, as before.
import type React from 'react';

type Pt={x:number;y:number};
const REACH:Record<string,number>={touch:24,pen:12};
export const toSvg=(e:React.PointerEvent<SVGSVGElement>)=>new DOMPoint(e.clientX,e.clientY).matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
// The handle to drag, with the grab offset so it does not jump to the finger; null when none is in reach.
export function grabHandle(e:React.PointerEvent<SVGSVGElement>,points:Pt[],radius:number){
 const ctm=e.currentTarget.getScreenCTM();if(!ctm)return null;
 const p=toSvg(e),perPx=1/(Math.hypot(ctm.a,ctm.b)||1),reach=Math.max(radius+perPx,(REACH[e.pointerType]??0)*perPx);
 let best=-1,bestD=reach;
 points.forEach((q,i)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<=bestD){bestD=d;best=i;}});
 if(best<0)return null;
 e.currentTarget.setPointerCapture(e.pointerId);
 return {i:best,dx:points[best].x-p.x,dy:points[best].y-p.y};
}
