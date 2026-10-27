// Saved business documents: your business details, clients and invoices, kept
// in this browser's storage (next to the autosaved project). Issued invoices
// are frozen: French rules want them kept as sent and numbered without gaps,
// so a mistake is corrected with a credit note, not an edit.
import {loadLocal,saveLocal} from './model';
import {blankInvoice,nextNumber,type Invoice,type Party} from './einvoice';
import type {InvoiceLanguage} from './facturx-pdf';

export type Client=Party&{id:string};
export type StoredInvoice={id:string;status:'draft'|'issued';invoice:Invoice;updated:string;issued?:string};
export type DocumentsData={seller?:Party;payment?:Invoice['payment'];exemptionReason?:string;language:InvoiceLanguage;clients:Client[];invoices:StoredInvoice[]};

const key='documents';
export const emptyDocuments=():DocumentsData=>({language:'fr',clients:[],invoices:[]});
export async function loadDocuments():Promise<DocumentsData>{return {...emptyDocuments(),...await loadLocal<DocumentsData>(key)};}
export const saveDocuments=(data:DocumentsData)=>saveLocal(key,data);
export const newId=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);

// Invoices and credit notes each follow their own series.
export function nextInvoiceNumber(data:DocumentsData,type:Invoice['type']){
 const credit=type==='381',issued=data.invoices.filter(s=>s.status==='issued'&&(s.invoice.type==='381')===credit).sort((a,b)=>(a.issued??'').localeCompare(b.issued??''));
 const last=issued.at(-1)?.invoice.number;
 return last?nextNumber(last):`${credit?'AV':'F'}-${new Date().getFullYear()}-0001`;
}
// A new draft carries your saved business details and payment settings.
export function newInvoice(data:DocumentsData,type:Invoice['type']='380'):StoredInvoice{
 const inv=blankInvoice();
 return {id:newId(),status:'draft',updated:new Date().toISOString(),invoice:{...inv,type,number:nextInvoiceNumber(data,type),
  seller:data.seller??inv.seller,payment:data.payment?{...data.payment}:inv.payment,exemptionReason:data.exemptionReason}};
}
// A credit note cancelling an issued invoice: same parties and lines.
export function creditNoteFor(data:DocumentsData,source:StoredInvoice):StoredInvoice{
 const draft=newInvoice(data,'381'),inv=source.invoice;
 return {...draft,invoice:{...inv,type:'381',number:draft.invoice.number,issueDate:draft.invoice.issueDate,dueDate:draft.invoice.dueDate,prepaid:undefined,precedingInvoice:{number:inv.number,date:inv.issueDate},lines:inv.lines.map(l=>({...l}))}};
}
