import {Path, Point, util, type FabricObject} from 'fabric';
export type SelectionPoint = {x:number;y:number};
export function rectanglePoints(a:SelectionPoint,b:SelectionPoint):SelectionPoint[] {
  return [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];
}
/** Store masks in layer coordinates so they follow scale, rotation and flip. */
export function selectionMask(object:FabricObject,points:SelectionPoint[],inverted=false) {
  if(points.length<3)throw new Error('Draw a selection with an area first.');
  const inverse=util.invertTransform(object.calcTransformMatrix());
  const local=points.map(p=>util.transformPoint(new Point(p.x,p.y),inverse));
  const left=Math.min(...local.map(p=>p.x)),top=Math.min(...local.map(p=>p.y));
  const area=Math.abs(local.reduce((sum,p,i)=>{const q=local[(i+1)%local.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
  if(area<1)throw new Error('The selection is too small. Draw a wider area.');
  return new Path(local.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')+' Z',{
    left,top,originX:'left',originY:'top',fill:'#000000',strokeWidth:0,inverted,
  });
}
