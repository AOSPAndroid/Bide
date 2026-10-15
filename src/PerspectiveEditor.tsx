import {useMemo,useRef,useState} from 'react';
import {perspectivePixels,type XY} from './perspective';

// Drag the four corners to distort a layer in perspective. The handles live in
// a padded frame so corners can move outward too.
export default function PerspectiveEditor({source,onApply}:{source:HTMLCanvasElement;onApply:(canvas:HTMLCanvasElement,dx:number,dy:number)=>void}){
 const w=source.width,h=source.height,pad=Math.round(Math.max(w,h)*.25);
 const [corners,setCorners]=useState<XY[]>([{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}]),drag=useRef<number|null>(null);
 const input=useMemo(()=>source.getContext('2d')!.getImageData(0,0,w,h),[source,w,h]);
 const output=useMemo(()=>{const r=perspectivePixels(input,corners),c=Object.assign(document.createElement('canvas'),{width:r.width,height:r.height});c.getContext('2d')!.putImageData(new ImageData(r.data,r.width,r.height),0,0);return {canvas:c,left:r.left,top:r.top};},[input,corners]);
 const nudge=(i:number,dx:number,dy:number)=>setCorners(c=>c.map((p,j)=>j===i?{x:Math.max(-pad,Math.min(w+pad,p.x+dx)),y:Math.max(-pad,Math.min(h+pad,p.y+dy))}:p));
 const names=['top left','top right','bottom right','bottom left'];
 return <><p className="muted">Drag the four corners. Arrow keys move a focused corner; Shift moves faster. Apply rasterizes this layer; Undo restores it.</p>
  <svg className="warp-editor" viewBox={`${-pad} ${-pad} ${w+2*pad} ${h+2*pad}`} role="group" aria-label="Perspective corners"
   onPointerMove={e=>{if(drag.current===null)return;const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*(w+2*pad)-pad,y=(e.clientY-r.top)/r.height*(h+2*pad)-pad,i=drag.current;setCorners(c=>c.map((p,j)=>j===i?{x:Math.max(-pad,Math.min(w+pad,x)),y:Math.max(-pad,Math.min(h+pad,y))}:p));}}
   onPointerUp={()=>{drag.current=null;}}>
   <image href={output.canvas.toDataURL()} x={output.left} y={output.top} width={output.canvas.width} height={output.canvas.height}/>
   <polygon points={corners.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#00aeef" strokeWidth={Math.max(1,w/300)}/>
   {corners.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={Math.max(6,Math.max(w,h)/60)} fill="white" stroke="#00395d" strokeWidth={Math.max(1,w/300)} tabIndex={0} role="slider" aria-label={`Corner ${names[i]}`} aria-valuetext={`${Math.round(p.x)}, ${Math.round(p.y)}`}
    onPointerDown={e=>{(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);drag.current=i;}}
    onKeyDown={e=>{const s=e.shiftKey?10:1,d={ArrowLeft:[-s,0],ArrowRight:[s,0],ArrowUp:[0,-s],ArrowDown:[0,s]}[e.key];if(d){e.preventDefault();nudge(i,d[0],d[1]);}}}/>)}
  </svg>
  <div className="dialog-actions"><button className="secondary" onClick={()=>setCorners([{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}])}>Reset</button><button className="primary" onClick={()=>onApply(output.canvas,output.left,output.top)}>Apply perspective</button></div>
 </>;
}
