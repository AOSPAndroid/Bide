import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,FilePlus2,FileText,FormInput,ReceiptText,ShieldCheck,Trash2,Users} from 'lucide-react';
import InvoiceEditor from './InvoiceEditor';
import {totals,checkInvoice,type Party} from './einvoice';
import {loadDocuments,saveDocuments,emptyDocuments,newInvoice,creditNoteFor,newId,type DocumentsData,type StoredInvoice} from './invoice-store';
import {download} from './model';

const money=(v:number,currency:string)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency}).format(v);
const kind={'380':'Invoice','381':'Credit note','386':'Prepayment'} as const;

// Business documents: e-invoices (Factur-X, UBL, CII) made here, and PDF
// forms, which open in the editor's form panel.
export default function Documents({onFillForm,notify}:{onFillForm:()=>void;notify:(message:string)=>void}){
 const [data,setData]=useState<DocumentsData|null>(null),[open,setOpen]=useState<string|null>(null);
 const latest=useRef<DocumentsData|null>(null);
 useEffect(()=>{let live=true;loadDocuments().then(d=>{if(live){latest.current=d;setData(d);}},()=>{if(live){notify('Saved invoices could not be read in this browser.');setData(emptyDocuments());}});return()=>{live=false;};},[]);
 // Saved a moment after the last change, like the editor's autosave.
 useEffect(()=>{if(!data||data===latest.current)return;const timer=setTimeout(()=>{latest.current=data;saveDocuments(data).catch(()=>notify('Invoices could not be saved in this browser. Download them to keep a copy.'));},400);return()=>clearTimeout(timer);},[data]);
 if(!data)return <main className="documents-workspace" aria-label="Documents workspace"><p className="muted">Loading…</p></main>;
 const update=(change:(d:DocumentsData)=>DocumentsData)=>setData(d=>d&&change(d));
 const put=(s:StoredInvoice)=>update(d=>({...d,invoices:d.invoices.some(x=>x.id===s.id)?d.invoices.map(x=>x.id===s.id?s:x):[s,...d.invoices]}));
 const start=(s:StoredInvoice)=>{put(s);setOpen(s.id);};
 const current=data.invoices.find(s=>s.id===open);

 async function issue(s:StoredInvoice){
  const inv=s.invoice;
  if(checkInvoice(inv).some(i=>i.severity==='error'))return;
  if(data!.invoices.some(x=>x.id!==s.id&&x.status==='issued'&&x.invoice.type===inv.type&&x.invoice.number===inv.number)){notify(`Number ${inv.number} is already used by an issued document.`);return;}
  try{
   const {invoiceFile}=await import('./browser/invoice-files'),file=await invoiceFile(inv,'facturx',data!.language);
   download(file.blob,file.name);
   const issued:StoredInvoice={...s,status:'issued',issued:new Date().toISOString(),updated:new Date().toISOString()};
   // Your details and payment settings are remembered for the next invoice.
   update(d=>({...d,seller:inv.seller,payment:{...inv.payment,terms:inv.payment.terms},exemptionReason:inv.exemptionReason??d.exemptionReason,invoices:d.invoices.map(x=>x.id===s.id?issued:x)}));
   notify(`${kind[inv.type]} ${inv.number} issued and downloaded as Factur-X.`);
  }catch(e){notify(`The invoice could not be created: ${e instanceof Error?e.message:e}`);}
 }
 async function save(s:StoredInvoice,format:'facturx'|'ubl'|'cii'){
  try{const {invoiceFile}=await import('./browser/invoice-files'),file=await invoiceFile(s.invoice,format,data!.language);download(file.blob,file.name);}
  catch(e){notify(`The file could not be created: ${e instanceof Error?e.message:e}`);}
 }
 const saveClient=(p:Party)=>{update(d=>{const same=d.clients.find(c=>c.name===p.name);return {...d,clients:same?d.clients.map(c=>c===same?{...p,id:c.id}:c):[...d.clients,{...p,id:newId()}]};});notify(`${p.name} saved as a client.`);};

 if(current)return <main className="documents-workspace editing" aria-label="Documents workspace">
  <InvoiceEditor stored={current} clients={data.clients} language={data.language} setLanguage={language=>update(d=>({...d,language}))}
   onChange={invoice=>put({...current,invoice,updated:new Date().toISOString()})} onBack={()=>setOpen(null)}
   onIssue={()=>void issue(current)} onDownload={f=>void save(current,f)} onSaveClient={saveClient}
   onCreditNote={()=>start(creditNoteFor(data,current))}
   onDuplicate={()=>{const copy=newInvoice(data,current.invoice.type==='381'?'380':current.invoice.type);start({...copy,invoice:{...current.invoice,type:copy.invoice.type,number:copy.invoice.number,issueDate:copy.invoice.issueDate,dueDate:copy.invoice.dueDate,precedingInvoice:undefined}});}}
   onDelete={()=>{update(d=>({...d,invoices:d.invoices.filter(x=>x.id!==current.id)}));setOpen(null);}}/>
 </main>;

 const issued=data.invoices.filter(s=>s.status==='issued'),drafts=data.invoices.filter(s=>s.status==='draft');
 const row=(s:StoredInvoice)=>{const inv=s.invoice,t=totals(inv);return <tr key={s.id} onClick={()=>setOpen(s.id)}>
  <td><button className="invoice-link" onClick={e=>{e.stopPropagation();setOpen(s.id);}}>{inv.number||'(no number)'}</button></td><td>{kind[inv.type]}</td><td>{inv.buyer.name||'—'}</td><td>{inv.issueDate}</td><td className="amount">{money(inv.type==='381'?-t.grandTotal:t.grandTotal,inv.currency)}</td>
  <td><span className={`invoice-status ${s.status}`}>{s.status==='issued'?'Issued':'Draft'}</span></td></tr>;};
 return <main className="documents-workspace" aria-label="Documents workspace"><div className="pdf-home-content">
  <header className="pdf-home-heading"><div><span className="workspace-eyebrow">DOCUMENTS</span><h1>Invoices and forms</h1><p>Create e-invoices in Factur-X, the format of the French 2026 reform, or fill in PDF forms. Everything stays on your device.</p>
   <div className="pdf-start-actions"><button className="primary" onClick={()=>start(newInvoice(data))}><FilePlus2 size={18}/>New invoice</button><button className="secondary" onClick={onFillForm}><FormInput size={16}/>Fill a PDF form</button></div></div></header>
  <section className="pdf-tool-section" aria-label="Start"><div className="pdf-tools-grid">
   <button className="pdf-tool-card" onClick={()=>start(newInvoice(data))}><span className="pdf-tool-icon"><ReceiptText size={22} strokeWidth={1.7}/></span><strong>New invoice</strong><p>Factur-X PDF with UBL and CII exports, checked against EN 16931 and the French rules.</p><ArrowUpRight className="pdf-tool-arrow" size={17}/></button>
   <button className="pdf-tool-card" onClick={()=>start(newInvoice(data,'386'))}><span className="pdf-tool-icon"><FileText size={22} strokeWidth={1.7}/></span><strong>Prepayment invoice</strong><p>Invoice a deposit before the work; deduct it from the final invoice as already paid.</p><ArrowUpRight className="pdf-tool-arrow" size={17}/></button>
   <button className="pdf-tool-card" onClick={onFillForm}><span className="pdf-tool-icon"><FormInput size={22} strokeWidth={1.7}/></span><strong>Fill a PDF form</strong><p>Open a PDF and fill its fields, or add text boxes, checkboxes and dropdowns to any page.</p><ArrowUpRight className="pdf-tool-arrow" size={17}/></button>
   <div className="pdf-tool-card static"><span className="pdf-tool-icon"><Users size={22} strokeWidth={1.7}/></span><strong>{data.clients.length} saved {data.clients.length===1?'client':'clients'}</strong><p>{data.clients.length?data.clients.map(c=>c.name).slice(0,3).join(', ')+(data.clients.length>3?'…':''):'Save a client from an invoice to reuse their details.'}</p></div>
  </div></section>
  {[['Drafts',drafts],['Issued',issued]].map(([label,list])=>(list as StoredInvoice[]).length>0&&<section key={label as string} className="pdf-tool-section" aria-label={label as string}><div className="pdf-section-heading"><h2>{label as string}</h2></div>
   <table className="invoice-table"><thead><tr><th>Number</th><th>Type</th><th>Client</th><th>Date</th><th className="amount">Total</th><th>Status</th></tr></thead><tbody>{(list as StoredInvoice[]).map(row)}</tbody></table></section>)}
  {data.clients.length>0&&<section className="pdf-tool-section" aria-label="Clients"><div className="pdf-section-heading"><h2>Clients</h2></div><ul className="client-list">{data.clients.map(c=><li key={c.id}><span><b>{c.name}</b> {c.address.city}{c.siren?` · SIREN ${c.siren}`:''}</span><button className="icon-button" aria-label={`Forget ${c.name}`} title="Forget this client" onClick={()=>update(d=>({...d,clients:d.clients.filter(x=>x.id!==c.id)}))}><Trash2 size={14}/></button></li>)}</ul></section>}
  <div className="pdf-home-note"><ShieldCheck size={15}/><span>Invoices are kept in this browser. Keep the downloaded files: French law asks you to store invoices for 10 years.</span></div>
 </div></main>;
}
