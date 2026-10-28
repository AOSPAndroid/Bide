import {useMemo,useState} from 'react';
import {ModalShell} from './ui-kit';
import {findRedactions,redactionPresets,type Match,type PresetId} from './redaction';
import type {TextRegion} from './text-regions';

export type RedactionHit={region:TextRegion;match:Match};
// A long line is cut to about 30 letters around the match (the full line is its
// tooltip), so the match itself stays in view at the end of a long line.
function excerpt(text:string,{start,end}:Match){
 const a=start>40?text.lastIndexOf(' ',start-30)+1||start-30:0,b=text.length-end>40?(text.indexOf(' ',end+30)+1||end+31)-1:text.length;
 return <>{a>0&&<span className="redact-gap" aria-hidden="true"/>}{text.slice(a,start)}<mark>{text.slice(start,end)}</mark>{text.slice(end,b)}{b<text.length&&<span className="redact-gap" aria-hidden="true"/>}</>;
}

// Find text or common personal data in the page's detected text and redact
// every match at once. Matches are listed so they can be checked first.
export default function RedactDialog({regions,close,apply}:{regions:TextRegion[];close:()=>void;apply:(hits:RedactionHit[])=>void}){
 const [query,setQuery]=useState(''),[presets,setPresets]=useState<PresetId[]>(['email','phone','iban','card']),[skipped,setSkipped]=useState<Set<string>>(new Set());
 const hits=useMemo(()=>regions.flatMap(region=>findRedactions(region.text,{query,presets}).map(match=>({region,match,key:`${region.id}:${match.start}`}))),[regions,query,presets]);
 const chosen=hits.filter(h=>!skipped.has(h.key));
 const toggle=(id:PresetId,on:boolean)=>setPresets(p=>on?[...p,id]:p.filter(x=>x!==id));
 return <ModalShell title="Find & redact" close={close}>
  <p className="muted">Redaction removes the text, image pixels and drawings under each match and leaves a black box. Undo restores them while this page is open; exported PDFs and saved projects keep only the redacted version.</p>
  <label className="field-label">Find text<input aria-label="Text to redact" value={query} placeholder="A name, number or word" onChange={e=>setQuery(e.target.value)} autoFocus/></label>
  <div className="redact-presets" role="group" aria-label="Personal data to find">{redactionPresets.map(p=><label key={p.id}><input type="checkbox" checked={presets.includes(p.id)} onChange={e=>toggle(p.id,e.target.checked)}/>{p.label}</label>)}</div>
  {!regions.length?<p className="muted">No text detected on this page yet.</p>:hits.length?<div className="redact-list" aria-label="Matches">{hits.map(h=><label key={h.key} className="redact-hit"><input type="checkbox" aria-label={`Redact ${h.match.text}`} checked={!skipped.has(h.key)} onChange={e=>setSkipped(s=>{const next=new Set(s);if(e.target.checked)next.delete(h.key);else next.add(h.key);return next;})}/>
   <span className="line-text" title={h.region.text}>{excerpt(h.region.text,h.match)}</span></label>)}</div>:<p className="muted" aria-live="polite">No matches on this page.</p>}
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!chosen.length} onClick={()=>apply(chosen)}>Redact {chosen.length||''}</button></div>
 </ModalShell>;
}
