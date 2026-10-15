import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';

export type Guides={x:number[];y:number[]};
type Axis='x'|'y';
type Props={show:boolean;zoom:number;width:number;height:number;workspace:RefObject<HTMLDivElement|null>;artboard:RefObject<HTMLDivElement|null>;onAdd:(axis:Axis,value:number)=>void;children:ReactNode};

// Tick spacing (page units) giving at least ~60 screen px between labels.
export function rulerStep(zoom:number){
 for(const base of [1,2,5,10,20,50,100,200,500,1000,2000,5000])if(base*zoom>=60)return base;
 return 10000;
}

// Rulers above and beside the canvas, in page units, following scroll and
// zoom. Dragging from a ruler onto the page creates a guide.
export default function Rulers({show,zoom,width,height,workspace,artboard,onAdd,children}:Props){
 const top=useRef<HTMLCanvasElement>(null),left=useRef<HTMLCanvasElement>(null);
 const [drag,setDrag]=useState<{axis:Axis;value:number}|null>(null);
 const draw=useCallback(()=>{
  const board=artboard.current?.getBoundingClientRect();if(!board)return;
  for(const [c,axis] of [[top.current,'x'],[left.current,'y']] as const){
   if(!c)continue;const r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
   if(c.width!==Math.round(r.width*dpr)||c.height!==Math.round(r.height*dpr)){c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);}
   const g=c.getContext('2d')!;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,r.width,r.height);
   const origin=axis==='x'?board.left-r.left:board.top-r.top,length=axis==='x'?r.width:r.height,thick=axis==='x'?r.height:r.width,step=rulerStep(zoom),minor=step/5;
   const styles=getComputedStyle(c);g.strokeStyle=styles.getPropertyValue('--line')||'#dedfe3';g.fillStyle=styles.getPropertyValue('--muted')||'#686b74';g.font='9px Inter, Segoe UI, sans-serif';g.lineWidth=1;
   // Page extent shaded.
   g.fillStyle=styles.getPropertyValue('--soft')||'#f4f5f7';const a=origin,b=origin+(axis==='x'?width:height)*zoom;
   if(axis==='x')g.fillRect(a,0,b-a,thick);else g.fillRect(0,a,thick,b-a);
   g.fillStyle=styles.getPropertyValue('--muted')||'#686b74';
   const first=Math.floor(-origin/zoom/minor)*minor;
   g.beginPath();
   for(let v=first;(v*zoom+origin)<=length;v+=minor){
    const p=Math.round(v*zoom+origin)+.5,major=Math.abs(v/step-Math.round(v/step))<1e-6,size=major?thick:thick*.3;
    if(axis==='x'){g.moveTo(p,thick);g.lineTo(p,thick-size);}else{g.moveTo(thick,p);g.lineTo(thick-size,p);}
    if(major){const label=String(Math.round(v));if(axis==='x')g.fillText(label,p+3,9);else{g.save();g.translate(9,p+3);g.rotate(-Math.PI/2);g.textAlign='right';g.fillText(label,0,0);g.restore();}}
   }
   g.stroke();
  }
 },[zoom,width,height,artboard]);
 useLayoutEffect(()=>{draw();});
 useEffect(()=>{
  const ws=workspace.current;if(!ws)return;let frame=0;const later=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
  ws.addEventListener('scroll',later,{passive:true});window.addEventListener('resize',later);const ro=new ResizeObserver(later);ro.observe(ws);
  return()=>{ws.removeEventListener('scroll',later);window.removeEventListener('resize',later);ro.disconnect();cancelAnimationFrame(frame);};
 },[draw,workspace]);
 const value=(axis:Axis,e:{clientX:number;clientY:number})=>{const b=artboard.current!.getBoundingClientRect();return Math.round(axis==='x'?(e.clientX-b.left)/zoom:(e.clientY-b.top)/zoom);};
 // The top ruler makes horizontal guides (a y value), the side ruler vertical ones.
 const start=(axis:Axis)=>(e:React.PointerEvent<HTMLCanvasElement>)=>{
  e.currentTarget.setPointerCapture(e.pointerId);setDrag({axis,value:value(axis,e)});
 };
 const move=(e:React.PointerEvent)=>{if(drag)setDrag({axis:drag.axis,value:value(drag.axis,e)});};
 const end=(e:React.PointerEvent)=>{
  if(!drag)return;const ws=workspace.current?.getBoundingClientRect(),inside=ws&&e.clientX>=ws.left&&e.clientX<=ws.right&&e.clientY>=ws.top&&e.clientY<=ws.bottom;
  const v=value(drag.axis,e),limit=drag.axis==='x'?width:height;setDrag(null);
  if(inside&&v>=0&&v<=limit)onAdd(drag.axis,v);
 };
 const board=artboard.current?.getBoundingClientRect();
 // Without rulers the workspace fills the row on its own.
 return <>
  {show&&<div className="rulers-top"><span className="ruler-corner"/><canvas ref={top} className="ruler-canvas" aria-label="Horizontal ruler · drag down to add a guide" onPointerDown={start('y')} onPointerMove={move} onPointerUp={end}/></div>}
  <div className="workspace-row">{show&&<canvas ref={left} className="ruler-canvas ruler-side" aria-label="Vertical ruler · drag right to add a guide" onPointerDown={start('x')} onPointerMove={move} onPointerUp={end}/>}{children}</div>
  {drag&&board&&<div className={`guide-preview guide-${drag.axis}`} style={drag.axis==='x'?{left:board.left+drag.value*zoom}:{top:board.top+drag.value*zoom}}><span>{drag.value}</span></div>}
 </>;
}

// Guides drawn over the page. Drag one to move it; drag it off the page to delete it.
export function GuideLayer({guides,zoom,width,height,onChange}:{guides:Guides;zoom:number;width:number;height:number;onChange:(next:Guides)=>void}){
 const [moving,setMoving]=useState<{axis:Axis;index:number;value:number}|null>(null);
 const shown=(axis:Axis)=>guides[axis].map((v,i)=>moving&&moving.axis===axis&&moving.index===i?moving.value:v);
 const grab=(axis:Axis,index:number)=>(e:React.PointerEvent<HTMLDivElement>)=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);setMoving({axis,index,value:guides[axis][index]});};
 const move=(e:React.PointerEvent<HTMLDivElement>)=>{
  if(!moving)return;const b=e.currentTarget.parentElement!.getBoundingClientRect();
  setMoving({...moving,value:Math.round(moving.axis==='x'?(e.clientX-b.left)/zoom:(e.clientY-b.top)/zoom)});
 };
 const drop=()=>{
  if(!moving)return;const limit=moving.axis==='x'?width:height,list=[...guides[moving.axis]];
  if(moving.value<0||moving.value>limit)list.splice(moving.index,1);else list[moving.index]=moving.value;
  setMoving(null);onChange({...guides,[moving.axis]:list});
 };
 return <div className="guide-layer">
  {shown('x').map((v,i)=><div key={'x'+i} className="guide guide-x" style={{left:v*zoom}} title={`Guide at x ${v} · drag off the page to remove`} onPointerDown={grab('x',i)} onPointerMove={move} onPointerUp={drop}/>)}
  {shown('y').map((v,i)=><div key={'y'+i} className="guide guide-y" style={{top:v*zoom}} title={`Guide at y ${v} · drag off the page to remove`} onPointerDown={grab('y',i)} onPointerMove={move} onPointerUp={drop}/>)}
 </div>;
}

// Snap a moving box to guides within `radius`: returns the shift to apply.
export function snapToGuides(box:{left:number;top:number;width:number;height:number},guides:Guides|undefined,radius:number){
 const best=(edges:number[],lines:number[])=>{let d=0,min=radius+1;for(const e of edges)for(const g of lines){const diff=g-e;if(Math.abs(diff)<min){min=Math.abs(diff);d=diff;}}return min<=radius?d:0;};
 return guides?{x:best([box.left,box.left+box.width/2,box.left+box.width],guides.x),y:best([box.top,box.top+box.height/2,box.top+box.height],guides.y)}:{x:0,y:0};
}
