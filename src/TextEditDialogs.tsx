import {useEffect,useState} from 'react';
import type {Doubt} from './spelling';
import {applySuggestion} from './spelling';
import {doubtfulLetters} from './ocr-regions';
import {ModalShell} from './ui-kit';
import type {TextRegion} from './text-regions';

// Edit one detected line: the new text is drawn with the image's own letters
// when they are available. Unavailable lettering leaves the original unchanged.
export function EditTextDialog({region,pending=false,close,apply}:{region:TextRegion;pending?:boolean;close:()=>void;apply:(text:string)=>void}){
 const [value,setValue]=useState(region.text),doubts=useDoubts(value,value===region.text?doubtfulLetters(region):[]);
 return <ModalShell title="Edit image text" close={close}>
  <p className="muted">Changes reuse this line's own letters and sharpness. If the original lettering cannot be preserved, nothing is changed. A replacement font is used only when you explicitly choose New font in OCR settings.</p>
  <label className="stacked-label">Text<input aria-label="New text" value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(!pending&&e.key==='Enter'&&value!==region.text)apply(value);}}/></label>
  <DoubtList doubts={doubts} onPick={(d,s)=>setValue(v=>applySuggestion(v,d,s))}/>
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={pending||!value.trim()||value===region.text} onClick={()=>apply(value)}>{pending?'Applying…':'Apply'}</button></div>
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

// Proofread `text` in the background (spelling worker), again after typing pauses.
export function useDoubts(text:string,unsure:number[]){
 const [doubts,setDoubts]=useState<Doubt[]>([]),key=unsure.join(',');
 useEffect(()=>{let live=true;const t=setTimeout(()=>{void import('./browser/spelling').then(m=>m.proofread(text,unsure)).then(d=>{if(live)setDoubts(d);}).catch(()=>{if(live)setDoubts([]);});},250);return()=>{live=false;clearTimeout(t);};},[text,key]);
 return doubts;
}

export function DoubtList({doubts,onPick}:{doubts:Doubt[];onPick:(d:Doubt,replacement:string)=>void}){
 if(!doubts.length)return null;
 return <div className="doubts" aria-label="Check spelling"><span className="muted">Check spelling</span>
  {doubts.map(d=><div key={d.start+d.word} className="doubt"><strong className={d.unsure?'unsure':''} title={d.unsure?'The recognizer was unsure of some letters':'Not in the dictionary'}>{d.word}</strong>
   {d.suggestions.length?d.suggestions.map(s=><button key={s} onClick={()=>onPick(d,s)} aria-label={`Use ${s}`}>{s}</button>):<span className="muted">no suggestion</span>}</div>)}
 </div>;
}

// Every doubtful word on the page, with one-click fixes rebuilt from the image's own letters.
export function ProofreadDialog({regions,close,apply,edit}:{regions:TextRegion[];close:()=>void;apply:(region:TextRegion,text:string)=>Promise<boolean|void>|boolean|void;edit?:(region:TextRegion)=>void}){
 const ocr=regions.filter(r=>r.kind==='ocr'),[items,setItems]=useState<{region:TextRegion;doubts:Doubt[]}[]|null>(null);
 // Fields flagged at scan time (a format that cannot be right, a low confidence) are listed too, first.
 const flagged=ocr.filter(r=>r.doubt&&!/letters were hard/.test(r.doubt));
 useEffect(()=>{let live=true;void import('./browser/spelling').then(async m=>{const out=[];for(const region of ocr){const doubts=await m.proofread(region.text,doubtfulLetters(region));if(doubts.length||flagged.includes(region))out.push({region,doubts});}out.sort((a,b)=>+flagged.includes(b.region)-+flagged.includes(a.region));if(live)setItems(out);}).catch(()=>{if(live)setItems([]);});return()=>{live=false;};},[]);
 return <ModalShell title="Proofread image text" close={close}>
  <p className="muted">Words the dictionary does not know, or with letters the recognizer was unsure of. A fix rebuilds the word from the image's own letters; Undo restores it.</p>
  {items===null?<p className="muted" aria-live="polite">Checking {ocr.length} lines…</p>:items.length?<div className="proofread-list">{items.map(({region,doubts})=><div key={region.id} className="proofread-line"><span className="line-text">{region.text}</span>{flagged.includes(region)&&<p className="proofread-reason">{region.doubt}{edit&&<button className="secondary small" onClick={()=>edit(region)}>Edit</button>}</p>}<DoubtList doubts={doubts} onPick={(d,s)=>{void Promise.resolve(apply(region,applySuggestion(region.text,d,s))).then(success=>{if(success!==false)setItems(list=>list&&list.filter(i=>i.region!==region));});}}/></div>)}</div>:<p className="muted" aria-live="polite">Nothing to check: every word is in the dictionary.</p>}
  <div className="dialog-actions"><button className="secondary" onClick={close}>Close</button></div>
 </ModalShell>;
}
