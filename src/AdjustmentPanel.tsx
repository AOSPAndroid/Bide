import {useRef} from 'react';
import {curvesLut,levelsLut,adjustmentLabels,type Adjustment,type Curves} from './adjustments';

const slider=(label:string,value:number,min:number,max:number,step:number,set:(v:number)=>void)=><label className="adjust-row" key={label}>
 <span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e=>set(Number(e.target.value))}/><output>{step<1?value.toFixed(2):value}</output>
</label>;

// The curve (or levels mapping) as a graph. On a curve, drag the round
// points up and down, or anywhere to move the nearest one.
function Graph({adjustment,onChange}:{adjustment:Adjustment;onChange:(a:Adjustment)=>void}){
 const ref=useRef<SVGSVGElement>(null),drag=useRef<number|null>(null);
 if(adjustment.kind==='hueSaturation')return null;
 const lut=adjustment.kind==='levels'?levelsLut(adjustment):curvesLut(adjustment),path=Array.from(lut,(v,i)=>`${i?'L':'M'}${i} ${255-v}`).join('');
 const curve=adjustment.kind==='curves'?adjustment:undefined;
 const at=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();return [(e.clientX-r.left)/r.width*255,255-(e.clientY-r.top)/r.height*255];};
 const move=(e:React.PointerEvent)=>{
  if(!curve||drag.current===null)return;const [,y]=at(e),points=curve.points.map(p=>[...p] as [number,number]);
  points[drag.current][1]=Math.round(Math.max(0,Math.min(255,y)));onChange({...curve,points} as Curves);
 };
 return <svg ref={ref} className="adjust-graph" viewBox="0 0 255 255" aria-label={`${adjustmentLabels[adjustment.kind]} graph`}
  onPointerDown={e=>{if(!curve)return;const [x]=at(e);drag.current=curve.points.reduce((best,p,i)=>Math.abs(p[0]-x)<Math.abs(curve.points[best][0]-x)?i:best,0);(e.target as Element).setPointerCapture?.(e.pointerId);move(e);}}
  onPointerMove={move} onPointerUp={()=>{drag.current=null;}}>
  <path d="M0 255L255 0" className="adjust-diagonal"/><path d={path} className="adjust-curve"/>
  {curve?.points.map(([x,y],i)=><circle key={i} cx={x} cy={255-y} r={7} className="adjust-point"/>)}
 </svg>;
}

export default function AdjustmentPanel({adjustment,onChange}:{adjustment:Adjustment;onChange:(a:Adjustment)=>void}){
 const a=adjustment;
 return <div className="property-section adjustment-panel"><div className="section-label">{adjustmentLabels[a.kind].toUpperCase()}</div>
  <Graph adjustment={a} onChange={onChange}/>
  {a.kind==='levels'&&<>
   {slider('Input black',a.inBlack,0,254,1,v=>onChange({...a,inBlack:Math.min(v,a.inWhite-1)}))}
   {slider('Midtones',a.gamma,.1,4,.01,v=>onChange({...a,gamma:v}))}
   {slider('Input white',a.inWhite,1,255,1,v=>onChange({...a,inWhite:Math.max(v,a.inBlack+1)}))}
   {slider('Output black',a.outBlack,0,255,1,v=>onChange({...a,outBlack:v}))}
   {slider('Output white',a.outWhite,0,255,1,v=>onChange({...a,outWhite:v}))}
  </>}
  {a.kind==='curves'&&<>{a.points.slice(1,-1).map((p,k)=>slider(['Shadows','Midtones','Highlights'][k]??`Point ${k+1}`,p[1],0,255,1,v=>onChange({...a,points:a.points.map((q,i)=>i===k+1?[q[0],v]:q) as [number,number][]})))}</>}
  {a.kind==='hueSaturation'&&<>
   {slider('Hue',a.hue,-180,180,1,v=>onChange({...a,hue:v}))}
   {slider('Saturation',a.saturation,-100,100,1,v=>onChange({...a,saturation:v}))}
   {slider('Lightness',a.lightness,-100,100,1,v=>onChange({...a,lightness:v}))}
  </>}
  <p className="fine-print">Changes every layer below. Hide the layer to compare; opacity weakens it. PDF and SVG export flatten the page to pixels.</p>
 </div>;
}
