import {useState} from 'react';
import {ModalShell} from './ui-kit';

export type Anchor=[number,number];// each 0, .5 or 1: where the old content stays
const anchors:Anchor[]=[[0,0],[.5,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[.5,1],[1,1]];
const clamp=(v:number)=>Math.max(1,Math.min(14400,Math.round(v)||1));

// Image size: resample the page and everything on it.
export function ImageSizeDialog({width,height,close,apply}:{width:number;height:number;close:()=>void;apply:(w:number,h:number)=>void}){
 const [w,setW]=useState(Math.round(width)),[h,setH]=useState(Math.round(height)),[locked,setLocked]=useState(true);
 const setWidth=(v:number)=>{setW(clamp(v));if(locked)setH(clamp(v*height/width));};
 const setHeight=(v:number)=>{setH(clamp(v));if(locked)setW(clamp(v*width/height));};
 return <ModalShell title="Image size" close={close}>
  <p className="muted">Scales the page and every layer on it. Currently {Math.round(width)} × {Math.round(height)}.</p>
  <div className="field-grid">
   <label className="stacked-label">Width<input aria-label="Image width" type="number" min={1} value={w} onChange={e=>setWidth(Number(e.target.value))}/></label>
   <label className="stacked-label">Height<input aria-label="Image height" type="number" min={1} value={h} onChange={e=>setHeight(Number(e.target.value))}/></label>
  </div>
  <label className="check-label"><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/>Keep proportions</label>
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={w===Math.round(width)&&h===Math.round(height)} onClick={()=>apply(w,h)}>Resize</button></div>
 </ModalShell>;
}

// Canvas size: grow or shrink the page around its content, kept at the anchor.
export function CanvasSizeDialog({width,height,close,apply}:{width:number;height:number;close:()=>void;apply:(w:number,h:number,anchor:Anchor)=>void}){
 const [w,setW]=useState(Math.round(width)),[h,setH]=useState(Math.round(height)),[anchor,setAnchor]=useState<Anchor>([.5,.5]);
 return <ModalShell title="Canvas size" close={close}>
  <p className="muted">Adds or trims space around the page; layers keep their size. Choose where the current content stays.</p>
  <div className="field-grid">
   <label className="stacked-label">Width<input aria-label="Canvas width" type="number" min={1} value={w} onChange={e=>setW(clamp(Number(e.target.value)))}/></label>
   <label className="stacked-label">Height<input aria-label="Canvas height" type="number" min={1} value={h} onChange={e=>setH(clamp(Number(e.target.value)))}/></label>
  </div>
  <div className="anchor-grid" role="radiogroup" aria-label="Anchor">{anchors.map(a=><button key={a.join()} role="radio" aria-checked={a[0]===anchor[0]&&a[1]===anchor[1]} aria-label={`Anchor ${['left','center','right'][a[0]*2]} ${['top','middle','bottom'][a[1]*2]}`} onClick={()=>setAnchor(a)}/>)}</div>
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={w===Math.round(width)&&h===Math.round(height)} onClick={()=>apply(w,h,anchor)}>Apply</button></div>
 </ModalShell>;
}
