import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CircleAlert,CircleCheck,Copy,Download,FileX2,Plus,Trash2,TriangleAlert} from 'lucide-react';
import {checkInvoice,totals,lineNet,units,paymentMeans,vatCategories,frenchMentions,frenchVatId,validSiren,type Invoice,type InvoiceLine,type Party,type Issue,type Adjustment} from './einvoice';
import type {StoredInvoice,Client} from './invoice-store';
import type {InvoiceFormat} from './browser/invoice-files';
import type {InvoiceLanguage} from './facturx-pdf';

type Edit=(patch:Partial<Invoice>)=>void;
const moneyFormat=(currency:string)=>(v:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency}).format(v);

// Every input names the invoice field it edits, so a check can focus it.
function Text({label,field,value,onChange,locked,type='text',wide,placeholder,list}:{label:string;field:string;value?:string;onChange:(v:string)=>void;locked?:boolean;type?:string;wide?:boolean;placeholder?:string;list?:string}){
 return <label className={`invoice-field${wide?' wide':''}`}><span>{label}</span><input data-field={field} type={type} value={value??''} disabled={locked} placeholder={placeholder} list={list} onChange={e=>onChange(e.target.value)}/></label>;
}
// Numbers accept a decimal comma; the value updates once the text parses.
function Num({label,field,value,onChange,locked,suffix}:{label:string;field:string;value:number|undefined;onChange:(v:number)=>void;locked?:boolean;suffix?:string}){
 const shown=value===undefined||Number.isNaN(value)?'':String(value).replace('.',','),[draft,setDraft]=useState(shown);
 useEffect(()=>{if(Number(draft.replace(',','.').replace(/\s/g,''))!==value)setDraft(shown);},[value]);
 return <label className="invoice-field number"><span>{label}</span><span className="invoice-number"><input data-field={field} inputMode="decimal" value={draft} disabled={locked} onChange={e=>{setDraft(e.target.value);const v=Number(e.target.value.replace(',','.').replace(/\s/g,''));onChange(e.target.value.trim()===''?NaN:v);}}/>{suffix&&<i>{suffix}</i>}</span></label>;
}

function PartyFields({who,party,onChange,locked,clients,onPick}:{who:'seller'|'buyer';party:Party;onChange:(p:Party)=>void;locked?:boolean;clients?:Client[];onPick?:(c:Client)=>void}){
 const set=(patch:Partial<Party>)=>onChange({...party,...patch}),address=(patch:Partial<Party['address']>)=>set({address:{...party.address,...patch}});
 const f=(name:string)=>`${who}.${name}`,siren=party.siren??'';
 return <div className="invoice-grid">
  {clients&&clients.length>0&&!locked&&<label className="invoice-field wide"><span>Saved client</span><select aria-label="Saved client" value="" onChange={e=>{const c=clients.find(c=>c.id===e.target.value);if(c)onPick?.(c);}}><option value="">Choose a saved client…</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  <Text label="Name" field={f('name')} value={party.name} onChange={name=>set({name})} locked={locked} wide/>
  <Text label="Street" field={f('address')} value={party.address.line1} onChange={line1=>address({line1})} locked={locked} wide/>
  <Text label="Postcode" field={f('address.postcode')} value={party.address.postcode} onChange={postcode=>address({postcode})} locked={locked}/>
  <Text label="City" field={f('address.city')} value={party.address.city} onChange={city=>address({city})} locked={locked}/>
  <Text label="Country" field={f('address.country')} value={party.address.country} onChange={country=>address({country:country.toUpperCase().slice(0,2)})} locked={locked} placeholder="FR"/>
  <Text label="SIREN" field={f('siren')} value={siren} onChange={v=>set({siren:v.replace(/\s/g,'')})} locked={locked} placeholder="9 digits"/>
  <label className="invoice-field"><span>VAT number</span><span className="invoice-number"><input aria-label="VAT number" data-field={f('vatId')} value={party.vatId??''} disabled={locked} onChange={e=>set({vatId:e.target.value.toUpperCase().replace(/\s/g,'')||undefined})}/>{!locked&&party.address.country==='FR'&&validSiren(siren)&&!party.vatId&&<button className="invoice-inline" onClick={()=>set({vatId:frenchVatId(siren)})} title="Fill in the French VAT number computed from the SIREN">From SIREN</button>}</span></label>
  <Text label="Email" field={f('email')} type="email" value={party.email} onChange={v=>set({email:v||undefined})} locked={locked}/>
  <Text label="E-invoicing address" field={f('electronicAddress')} value={party.electronicAddress} onChange={v=>set({electronicAddress:v||undefined})} locked={locked} placeholder={siren?`SIREN ${siren}`:'Leave empty to use the SIREN'}/>
 </div>;
}

function Line({line,index,currency,set,remove,locked}:{line:InvoiceLine;index:number;currency:string;set:(l:InvoiceLine)=>void;remove:()=>void;locked?:boolean}){
 const f=(name:string)=>`lines.${index}.${name}`,zero=vatCategories.find(c=>c.code===line.vatCategory)?.zero;
 return <div className="invoice-line" role="group" aria-label={`Line ${index+1}`}>
  <Text label="Description" field={f('name')} value={line.name} onChange={name=>set({...line,name})} locked={locked} wide/>
  <Num label="Quantity" field={f('quantity')} value={line.quantity} onChange={quantity=>set({...line,quantity})} locked={locked}/>
  <label className="invoice-field"><span>Unit</span><select data-field={f('unit')} value={line.unit} disabled={locked} onChange={e=>set({...line,unit:e.target.value})}>{units.map(u=><option key={u.code} value={u.code}>{u.label}</option>)}</select></label>
  <Num label="Unit price (excl. VAT)" field={f('unitPrice')} value={line.unitPrice} onChange={unitPrice=>set({...line,unitPrice})} locked={locked} suffix={currency}/>
  <label className="invoice-field"><span>VAT</span><select data-field={f('vatCategory')} value={line.vatCategory} disabled={locked} onChange={e=>{const c=vatCategories.find(c=>c.code===e.target.value)!;set({...line,vatCategory:c.code,vatRate:c.zero?0:line.vatRate||20});}}>{vatCategories.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
  <Num label="Rate" field={f('vatRate')} value={line.vatRate} onChange={vatRate=>set({...line,vatRate})} locked={locked||zero} suffix="%"/>
  <span className="invoice-line-total" aria-label={`Line ${index+1} total`}>{Number.isFinite(lineNet(line))?moneyFormat(currency)(lineNet(line)):'—'}</span>
  {!locked&&<button className="icon-button" aria-label={`Remove line ${index+1}`} title="Remove line" onClick={remove}><Trash2 size={15}/></button>}
 </div>;
}

export default function InvoiceEditor({stored,onChange,onBack,onIssue,onDownload,onDownloadOriginal,onCreditNote,onDuplicate,onDelete,onSaveClient,clients,language,setLanguage}:{
 stored:StoredInvoice;onChange:(inv:Invoice)=>void;onBack:()=>void;onIssue:()=>void;onDownload:(format:InvoiceFormat)=>void;onDownloadOriginal:()=>void;onCreditNote:()=>void;onDuplicate:()=>void;onDelete:()=>void;
 onSaveClient:(p:Party)=>void;clients:Client[];language:InvoiceLanguage;setLanguage:(l:InvoiceLanguage)=>void}){
 const inv=stored.invoice,locked=stored.status!=='draft',received=stored.status==='received',edit:Edit=patch=>onChange({...inv,...patch});
 const issues=useMemo(()=>checkInvoice(inv),[inv]),errors=issues.filter(i=>i.severity==='error'),t=useMemo(()=>totals(inv),[inv]),money=moneyFormat(inv.currency);
 const zeroRated=[...inv.lines,...inv.adjustments??[]].some(l=>l.vatCategory!=='S'&&l.vatCategory!=='Z');
 const setAdjustment=(i:number,a:Adjustment)=>edit({adjustments:(inv.adjustments??[]).map((x,k)=>k===i?a:x)});
 const focus=(i:Issue)=>{const el=document.querySelector<HTMLElement>(`[data-field="${i.field}"]`)??document.querySelector<HTMLElement>(`[data-field^="${i.field}"]`);el?.scrollIntoView({block:'center'});el?.focus();};
 const title=inv.type==='381'?'Credit note':inv.type==='386'?'Prepayment invoice':'Invoice';
 return <div className="invoice-editor">
  <div className="invoice-main">
   <div className="invoice-topline"><button className="secondary" onClick={onBack}><ArrowLeft size={15}/>All documents</button>{stored.status==='issued'&&<span className="invoice-status issued">Issued {stored.issued?.slice(0,10)} · read only</span>}{received&&<span className="invoice-status received">Received · read only</span>}</div>
   <h1>{title} {inv.number||'(no number)'}</h1>
   {stored.source&&<div className={`invoice-source ${stored.source.format==='scan'?'scan':''}`} role="note">
    <strong>{stored.source.format==='scan'?`Read from ${stored.source.name} with OCR: check every field before issuing.`:`Received as ${stored.source.format==='facturx'?'Factur-X':stored.source.format.toUpperCase()} from ${inv.seller.name||'the sender'} (${stored.source.name}).`}</strong>
    {stored.source.warnings.length>0&&<ul>{stored.source.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}
   </div>}
   <section className="invoice-card" aria-label="Invoice details"><h2>Details</h2><div className="invoice-grid">
    <label className="invoice-field"><span>Type</span><select data-field="type" value={inv.type} disabled={locked} onChange={e=>edit({type:e.target.value as Invoice['type']})}><option value="380">Invoice</option><option value="386">Prepayment invoice</option><option value="381">Credit note</option></select></label>
    <Text label="Number" field="number" value={inv.number} onChange={number=>edit({number})} locked={locked}/>
    <Text label="Issue date" field="issueDate" type="date" value={inv.issueDate} onChange={issueDate=>edit({issueDate})} locked={locked}/>
    <Text label="Due date" field="dueDate" type="date" value={inv.dueDate} onChange={v=>edit({dueDate:v||undefined})} locked={locked}/>
    <Text label="Delivery date" field="deliveryDate" type="date" value={inv.deliveryDate} onChange={v=>edit({deliveryDate:v||undefined})} locked={locked}/>
    <label className="invoice-field"><span>You sell</span><select data-field="operation" value={inv.operation} disabled={locked} onChange={e=>edit({operation:e.target.value as Invoice['operation']})}><option value="services">Services</option><option value="goods">Goods</option><option value="mixed">Goods and services</option></select></label>
    <Text label="Currency" field="currency" value={inv.currency} onChange={v=>edit({currency:v.toUpperCase().slice(0,3)})} locked={locked}/>
    <Text label="Client reference" field="buyerReference" value={inv.buyerReference} onChange={v=>edit({buyerReference:v||undefined})} locked={locked}/>
    <Text label="Purchase order" field="orderReference" value={inv.orderReference} onChange={v=>edit({orderReference:v||undefined})} locked={locked}/>
    {inv.type==='381'&&<Text label="Corrects invoice" field="precedingInvoice" value={inv.precedingInvoice?.number} onChange={number=>edit({precedingInvoice:number?{...inv.precedingInvoice,number}:undefined})} locked={locked}/>}
   </div></section>
   <section className="invoice-card" aria-label="Your business"><h2>From (your business)</h2><PartyFields who="seller" party={inv.seller} onChange={seller=>edit({seller})} locked={locked}/></section>
   <section className="invoice-card" aria-label="Client"><h2>Bill to</h2><PartyFields who="buyer" party={inv.buyer} onChange={buyer=>edit({buyer})} locked={locked} clients={clients} onPick={c=>{const {id:_,...buyer}=c;edit({buyer});}}/>
    {!locked&&inv.buyer.name.trim()&&<button className="secondary small" onClick={()=>onSaveClient(inv.buyer)}>Save as client</button>}</section>
   <section className="invoice-card" aria-label="Lines"><h2>Lines</h2>
    {inv.lines.map((l,i)=><Line key={l.id} line={l} index={i} currency={inv.currency} locked={locked} set={line=>edit({lines:inv.lines.map((x,k)=>k===i?line:x)})} remove={()=>edit({lines:inv.lines.filter((_,k)=>k!==i)})}/>)}
    {!locked&&<button className="secondary small" onClick={()=>{const last=inv.lines.at(-1);edit({lines:[...inv.lines,{id:String(Date.now()),name:'',quantity:1,unit:last?.unit??'C62',unitPrice:0,vatCategory:last?.vatCategory??'S',vatRate:last?.vatRate??20}]});}}><Plus size={14}/>Add line</button>}
    {(inv.adjustments??[]).map((a,i)=><div key={i} className="invoice-line adjustment" role="group" aria-label={`${a.charge?'Charge':'Discount'} ${i+1}`}>
     <Text label={a.charge?'Charge (e.g. shipping)':'Discount'} field={`adjustments.${i}.reason`} value={a.reason} onChange={reason=>setAdjustment(i,{...a,reason})} locked={locked} wide/>
     <Num label="Amount (excl. VAT)" field={`adjustments.${i}.amount`} value={a.amount} onChange={amount=>setAdjustment(i,{...a,amount})} locked={locked} suffix={inv.currency}/>
     <label className="invoice-field"><span>VAT</span><select data-field={`adjustments.${i}.vatCategory`} value={a.vatCategory} disabled={locked} onChange={e=>{const c=vatCategories.find(c=>c.code===e.target.value)!;setAdjustment(i,{...a,vatCategory:c.code,vatRate:c.zero?0:a.vatRate||20});}}>{vatCategories.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
     <Num label="Rate" field={`adjustments.${i}.vatRate`} value={a.vatRate} onChange={vatRate=>setAdjustment(i,{...a,vatRate})} locked={locked||vatCategories.find(c=>c.code===a.vatCategory)?.zero} suffix="%"/>
     <span className="invoice-line-total">{Number.isFinite(a.amount)?money(a.charge?a.amount:-a.amount):'—'}</span>
     {!locked&&<button className="icon-button" aria-label={`Remove ${a.charge?'charge':'discount'} ${i+1}`} title="Remove" onClick={()=>edit({adjustments:(inv.adjustments??[]).filter((_,k)=>k!==i)})}><Trash2 size={15}/></button>}
    </div>)}
    {!locked&&<div className="invoice-row start">{(['discount','charge'] as const).map(kind=><button key={kind} className="secondary small" onClick={()=>{const l=inv.lines[0];edit({adjustments:[...(inv.adjustments??[]),{charge:kind==='charge',amount:0,reason:kind==='charge'?'Frais de port':'Remise',vatCategory:l?.vatCategory??'S',vatRate:l?.vatRate??20}]});}}><Plus size={14}/>{kind==='charge'?'Add charge':'Add discount'}</button>)}</div>}
    {zeroRated&&<div className="invoice-grid"><label className="invoice-field wide"><span>Reason for 0% VAT (printed on the invoice)</span><input data-field="exemptionReason" list="exemption-reasons" value={inv.exemptionReason??''} disabled={locked} onChange={e=>edit({exemptionReason:e.target.value})}/></label>
     <datalist id="exemption-reasons"><option value={frenchMentions.franchise}/><option value="Autoliquidation"/><option value="Exonération de TVA, article 262 ter, I du CGI"/><option value="Exonération de TVA, article 262 I du CGI"/></datalist></div>}
   </section>
   <section className="invoice-card" aria-label="Payment"><h2>Payment</h2><div className="invoice-grid">
    <label className="invoice-field"><span>Method</span><select data-field="payment.code" value={inv.payment.code} disabled={locked} onChange={e=>edit({payment:{...inv.payment,code:e.target.value as Invoice['payment']['code']}})}>{paymentMeans.map(m=><option key={m.code} value={m.code}>{m.label}</option>)}</select></label>
    <Text label="IBAN" field="payment.iban" value={inv.payment.iban} onChange={v=>edit({payment:{...inv.payment,iban:v||undefined}})} locked={locked} wide/>
    <Text label="BIC" field="payment.bic" value={inv.payment.bic} onChange={v=>edit({payment:{...inv.payment,bic:v||undefined}})} locked={locked}/>
    <Text label="Payment terms" field="payment.terms" value={inv.payment.terms} onChange={v=>edit({payment:{...inv.payment,terms:v||undefined}})} locked={locked} placeholder="e.g. 30 days"/>
    <Num label="Already paid" field="prepaid" value={inv.prepaid??0} onChange={v=>edit({prepaid:Number.isFinite(v)&&v?v:undefined})} locked={locked} suffix={inv.currency}/>
   </div></section>
   <section className="invoice-card" aria-label="Mentions"><h2>Mentions</h2><div className="invoice-grid">
    <Text label="Late-payment penalties" field="latePenalty" value={inv.latePenalty} onChange={latePenalty=>edit({latePenalty})} locked={locked} wide/>
    <Text label="Recovery indemnity" field="recoveryIndemnity" value={inv.recoveryIndemnity} onChange={recoveryIndemnity=>edit({recoveryIndemnity})} locked={locked} wide/>
    <Text label="Early-payment discount" field="discountTerms" value={inv.discountTerms} onChange={discountTerms=>edit({discountTerms})} locked={locked} wide/>
    <label className="invoice-field wide check"><input type="checkbox" checked={!!inv.vatOnDebits} disabled={locked} onChange={e=>edit({vatOnDebits:e.target.checked||undefined})}/><span>VAT paid on invoicing (option pour les débits)</span></label>
    <label className="invoice-field wide"><span>Note</span><textarea data-field="note" value={inv.note??''} disabled={locked} onChange={e=>edit({note:e.target.value||undefined})}/></label>
   </div></section>
  </div>
  <aside className="invoice-side" aria-label="Totals and checks">
   <div className="invoice-card invoice-totals">
    {t.vat.map(g=><div key={`${g.category}${g.rate}`}><span>VAT {g.category==='S'?`${g.rate} %`:`${g.category} 0 %`} on {money(g.basis)}</span><b>{money(g.tax)}</b></div>)}
    {t.allowances+t.charges>0&&<div><span>Lines</span><b>{money(t.lineTotal)}</b></div>}{t.allowances>0&&<div><span>Discounts</span><b>{money(-t.allowances)}</b></div>}{t.charges>0&&<div><span>Charges</span><b>{money(t.charges)}</b></div>}
    <div><span>Total excl. VAT</span><b>{money(t.taxBasis)}</b></div><div><span>VAT</span><b>{money(t.taxTotal)}</b></div>
    <div className="grand"><span>Total</span><b aria-label="Invoice total">{money(t.grandTotal)}</b></div>
    {t.prepaid>0&&<div className="grand"><span>Amount due</span><b>{money(t.due)}</b></div>}
   </div>
   <div className="invoice-card invoice-checks" aria-label="Checks">
    <h2>{received?(errors.length?`${errors.length} ${errors.length===1?'problem':'problems'} in this invoice`:'This invoice passes the checks'):errors.length?`${errors.length} to fix before issuing`:'Ready to issue'}</h2>
    {!issues.length&&<p className="invoice-ok"><CircleCheck size={15}/>Meets EN 16931 and the French e-invoicing rules this editor checks.</p>}
    <ul>{issues.map((i,k)=><li key={k} className={i.severity}><button onClick={()=>focus(i)} title={i.rule}>{i.severity==='error'?<CircleAlert size={14}/>:<TriangleAlert size={14}/>}<span>{i.message}</span></button></li>)}</ul>
   </div>
   <div className="invoice-card invoice-actions">
    {received&&<>{stored.source?.original&&<button className="primary" onClick={onDownloadOriginal}><Download size={16}/>Original file</button>}
     <button className="secondary" onClick={()=>onDownload('ubl')}>Save as UBL XML</button><button className="secondary danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></>}
    {!received&&<>
    <label className="invoice-field"><span>Invoice language</span><select aria-label="Invoice language" value={language} onChange={e=>setLanguage(e.target.value as InvoiceLanguage)}><option value="fr">Français</option><option value="en">English</option></select></label>
    {!locked&&<button className="primary" disabled={!!errors.length} onClick={onIssue} title={errors.length?'Fix the checks above first':'Freeze this invoice and download it as Factur-X'}><Download size={16}/>Issue and download Factur-X</button>}
    {locked&&<><button className="primary" onClick={()=>onDownload('facturx')}><Download size={16}/>Factur-X PDF</button><div className="invoice-row"><button className="secondary" onClick={()=>onDownload('ubl')}>UBL XML</button><button className="secondary" onClick={()=>onDownload('cii')}>CII XML</button></div>
     {inv.type!=='381'&&<button className="secondary" onClick={onCreditNote}><FileX2 size={15}/>Credit note for this invoice</button>}</>}
    <button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate as new draft</button>
    {!locked&&<button className="secondary danger" onClick={onDelete}><Trash2 size={15}/>Delete draft</button>}
    <p className="fine-print">Issuing freezes the invoice and its number. Send it to your client through your approved e-invoicing platform (plateforme agréée).</p></>}
   </div>
  </aside>
 </div>;
}
