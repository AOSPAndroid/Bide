import {useState} from 'react';
import {ModalShell} from './ui-kit';
import type {TextRegion} from './text-regions';

// Edit one detected line: the new text is drawn with the image's own letters
// when they are all available, otherwise with the OCR font.
export function EditTextDialog({region,close,apply}:{region:TextRegion;close:()=>void;apply:(text:string)=>void}){
 const [value,setValue]=useState(region.text);
 return <ModalShell title="Edit image text" close={close}>
  <p className="muted">Changed letters are rebuilt from the image's own letters, so the font matches exactly. If a letter does not appear anywhere on the page, the line uses the OCR font instead.</p>
  <label className="stacked-label">Text<input aria-label="New text" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&value!==region.text)apply(value);}}/></label>
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!value.trim()||value===region.text} onClick={()=>apply(value)}>Apply</button></div>
 </ModalShell>;
}

export const findMatches=(regions:TextRegion[],find:string,matchCase:boolean)=>find?regions.filter(r=>r.kind==='ocr'&&(matchCase?r.text:r.text.toLowerCase()).includes(matchCase?find:find.toLowerCase())):[];
export function replaceText(text:string,find:string,replacement:string,matchCase:boolean){
 if(!find)return text;
 return text.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),matchCase?'g':'gi'),()=>replacement);
}

// Replace a word or phrase everywhere it was detected on the page, in one step.
export function FindReplaceDialog({regions,close,apply}:{regions:TextRegion[];close:()=>void;apply:(find:string,replacement:string,matchCase:boolean)=>void}){
 const [find,setFind]=useState(''),[replacement,setReplacement]=useState(''),[matchCase,setMatchCase]=useState(true);
 const matches=findMatches(regions,find,matchCase);
 return <ModalShell title="Find and replace in image text" close={close}>
  <label className="stacked-label">Find<input aria-label="Find text" value={find} onChange={e=>setFind(e.target.value)}/></label>
  <label className="stacked-label">Replace with<input aria-label="Replace with" value={replacement} onChange={e=>setReplacement(e.target.value)}/></label>
  <label className="check-label"><input type="checkbox" checked={matchCase} onChange={e=>setMatchCase(e.target.checked)}/>Match case</label>
  <p className="muted" aria-live="polite">{find?`${matches.length} detected ${matches.length===1?'line contains':'lines contain'} "${find}".`:'Type the text to find in the detected lines.'}{matches.length?' Letters are reused from the image where possible; Undo restores everything.':''}</p>
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!matches.length||find===replacement} onClick={()=>apply(find,replacement,matchCase)}>Replace all</button></div>
 </ModalShell>;
}
