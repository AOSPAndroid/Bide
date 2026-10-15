import {useEffect,useRef,useState} from 'react';
import {ModalShell} from './ui-kit';
import type {MaskOp} from './pixel-mask';

export type SelectionAction='unlock'|'copy'|'paste'|'keep'|'hide'|'layer'|'mask'|'ai-remove'|'subject'|'inverse'|'all'|'color-range'|'deselect'|'feather'|'expand'|'contract'|'smooth';
type Props={hasRegion:boolean;busy:boolean;ai:boolean;pdf:boolean;canPaste:boolean;mode:MaskOp;onMode:(mode:MaskOp)=>void;run:(action:SelectionAction,amount?:number)=>void};

const modes:{id:MaskOp;label:string;title:string}[]=[
 {id:'replace',label:'New',title:'New selection'},{id:'add',label:'Add',title:'Add to selection (hold Shift)'},
 {id:'subtract',label:'Subtract',title:'Subtract from selection (hold Alt)'},{id:'intersect',label:'Intersect',title:'Intersect with selection (hold Shift+Alt)'},
];

// Selection actions for the marquee, lasso and magic wand, in one row.
export default function SelectionBar({hasRegion,busy,ai,pdf,canPaste,mode,onMode,run}:Props){
 const [amount,setAmount]=useState(4),refine=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(refine.current?.open&&!refine.current.contains(e.target as Node))refine.current.open=false;};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const go=(action:SelectionAction,value?:number)=>{if(refine.current)refine.current.open=false;run(action,value);};
 return <div className="selection-toolbar">
  <span className="selection-hint">{hasRegion?'Selection':'Shift adds · Alt subtracts'}</span>
  <div className="mode-switch" role="group" aria-label="Selection mode">{modes.map(m=><button key={m.id} title={m.title} aria-pressed={mode===m.id} onClick={()=>onMode(m.id)}>{m.label}</button>)}</div>
  {pdf&&<button disabled={busy} title="Convert PDF background to an editable image; Undo restores it." onClick={()=>run('unlock')}>Unlock PDF as image</button>}
  <button disabled={busy} title="Select the whole page" onClick={()=>run('all')}>All</button>
  {ai&&<button disabled={busy} title="Select the main subject with AI (ISNet)" onClick={()=>run('subject')}>Subject</button>}
  <button disabled={busy} title="Select every pixel of a similar colour" onClick={()=>run('color-range')}>Color…</button>
  <button disabled={!hasRegion} title="Swap selected and unselected areas (Ctrl Shift I)" onClick={()=>run('inverse')}>Inverse</button>
  <details ref={refine} className="selection-refine"><summary aria-disabled={!hasRegion}>Refine</summary><div>
   <label>Pixels<input aria-label="Refine amount" type="number" min={1} max={200} value={amount} onChange={e=>setAmount(Math.max(1,Math.min(200,Number(e.target.value)||1)))}/></label>
   <button disabled={!hasRegion} onClick={()=>go('feather',amount)}>Feather</button>
   <button disabled={!hasRegion} onClick={()=>go('expand',amount)}>Expand</button>
   <button disabled={!hasRegion} onClick={()=>go('contract',amount)}>Contract</button>
   <button disabled={!hasRegion} onClick={()=>go('smooth',amount)}>Smooth</button>
  </div></details>
  <span className="divider"/>
  <button disabled={!hasRegion} aria-label="Copy area" title="Copy the selected pixels (Ctrl C)" onClick={()=>run('copy')}>Copy</button>
  <button disabled={!canPaste} aria-label="Paste as layer" title="Paste as a new layer (Ctrl V)" onClick={()=>run('paste')}>Paste</button>
  <button disabled={!hasRegion} aria-label="Keep inside" title="Keep inside: mask the layer outside the selection (paintable layer mask)" onClick={()=>run('keep')}>Keep</button>
  <button disabled={!hasRegion} aria-label="Hide inside" title="Hide inside: mask the selected area" onClick={()=>run('hide')}>Hide</button>
  <button disabled={!hasRegion} aria-label="Copy to layer" title="Copy the selected pixels to a new layer" onClick={()=>run('layer')}>To layer</button>
  {ai&&<button disabled={!hasRegion||busy} title="Fill the selection from its surroundings with AI (LaMa). Adds an undoable layer." aria-label="Remove with AI" onClick={()=>run('ai-remove')}>AI remove</button>}
  <button onClick={()=>run('deselect')}>Deselect</button>
 </div>;
}

// Colour range: pick a colour (from the screen where the browser allows it)
// and how far to reach; the selection previews live on the page.
export function ColorRangeDialog({initial,preview,apply,close}:{initial:string;preview:(color:string,fuzziness:number)=>number;apply:()=>void;close:()=>void}){
 const [color,setColor]=useState(initial),[fuzziness,setFuzziness]=useState(40),[count,setCount]=useState(0);
 useEffect(()=>{setCount(preview(color,fuzziness));},[color,fuzziness]);
 const dropper=(window as unknown as {EyeDropper?:new()=>{open:()=>Promise<{sRGBHex:string}>}}).EyeDropper;
 return <ModalShell title="Select color range" close={close}>
  <p className="muted">Selects every pixel close to this colour. Fuzziness widens the range; edges fade softly.</p>
  <label className="color-field"><input type="color" aria-label="Range color" value={color} onChange={e=>setColor(e.target.value)}/><span>Colour</span>{dropper&&<button onClick={()=>void new dropper().open().then(r=>setColor(r.sRGBHex)).catch(()=>{})}>Pick from screen</button>}</label>
  <label className="stacked-label">Fuzziness · {fuzziness}<input aria-label="Fuzziness" type="range" min={1} max={200} value={fuzziness} onChange={e=>setFuzziness(Number(e.target.value))}/></label>
  <p className="muted" aria-live="polite">{count?`${count.toLocaleString()} pixels selected.`:'No pixels match yet.'}</p>
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!count} onClick={apply}>Select pixels</button></div>
 </ModalShell>;
}
