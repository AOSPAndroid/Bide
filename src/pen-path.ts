// Pen tool geometry: anchors with optional Bézier handles become SVG path data.
export type XY={x:number;y:number};
export type Anchor=XY&{in?:XY;out?:XY};

const segment=(a:Anchor,b:Anchor)=>a.out||b.in
 ?`C ${(a.out??a).x} ${(a.out??a).y} ${(b.in??b).x} ${(b.in??b).y} ${b.x} ${b.y}`
 :`L ${b.x} ${b.y}`;

export function penPathData(anchors:Anchor[],closed=false):string{
 if(!anchors.length)return '';
 const parts=[`M ${anchors[0].x} ${anchors[0].y}`];
 for(let i=1;i<anchors.length;i++)parts.push(segment(anchors[i-1],anchors[i]));
 if(closed&&anchors.length>2)parts.push(segment(anchors[anchors.length-1],anchors[0]),'Z');
 return parts.join(' ');
}

// Dragging from an anchor sets its outgoing handle; the incoming one mirrors it
// (a smooth point). A drag shorter than `min` leaves a corner point.
export function withHandles(anchor:Anchor,drag:XY,min=1.5):Anchor{
 if(Math.hypot(drag.x-anchor.x,drag.y-anchor.y)<min)return {x:anchor.x,y:anchor.y};
 return {x:anchor.x,y:anchor.y,out:{x:drag.x,y:drag.y},in:{x:2*anchor.x-drag.x,y:2*anchor.y-drag.y}};
}

export const nearPoint=(a:XY,b:XY,radius:number)=>Math.hypot(a.x-b.x,a.y-b.y)<=radius;
