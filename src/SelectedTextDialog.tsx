import {useState} from 'react';
import {ModalShell} from './ui-kit';

export type SelectedTextResult={pending:boolean;status:string;text:string;error:string};
export default function SelectedTextDialog({result,close,retry}:{result:SelectedTextResult;close:()=>void;retry:()=>void}){
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState('');
 const copy=async()=>{try{await navigator.clipboard.writeText(result.text);setCopied(true);setCopyError('');}catch{setCopyError('Copy is unavailable here. Select the text and copy it with your device.');}};
 return <ModalShell title="Read selected text" close={close}>
  <p className="muted">Read and copy text from this area. Your document stays unchanged.</p>
  {result.pending?<p className="read-selection-status" role="status">{result.status||'Reading text…'}</p>:result.error?<p className="notice" role="alert">{result.error}</p>:<><label className="stacked-label">Detected text<textarea className="read-selection-result" aria-label="Detected text" readOnly value={result.text}/></label>{!result.text&&<p className="muted">No text was found in this area. Try another selection.</p>}</>}
  {copyError&&<p role="alert" className="muted">{copyError}</p>}
  <div className="dialog-actions"><button className="secondary" onClick={close}>Cancel</button><button className="secondary" disabled={result.pending} onClick={()=>{setCopied(false);setCopyError('');retry();}}>Read again</button><button className="primary" disabled={result.pending||!result.text||!!result.error} onClick={()=>void copy()}>{copied?'Copied':'Copy text'}</button></div>
 </ModalShell>;
}
