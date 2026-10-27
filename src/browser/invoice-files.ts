// The files an invoice is exported as: the Factur-X PDF (what most French
// platforms and clients take), and UBL or CII XML for platforms that want XML.
import regularFont from './fonts/LiberationSans-Regular.ttf';
import boldFont from './fonts/LiberationSans-Bold.ttf';
import {toCii,toUbl} from '../einvoice-xml';
import {facturxPdf,type InvoiceLanguage} from '../facturx-pdf';
import {safeName} from '../model';
import type {Invoice} from '../einvoice';

let fonts:Promise<{regular:Uint8Array;bold:Uint8Array}>|undefined;
const bytes=async(url:string)=>{const r=await fetch(url);if(!r.ok)throw new Error('The invoice font is missing.');return new Uint8Array(await r.arrayBuffer());};
const loadFonts=()=>fonts??=Promise.all([bytes(regularFont),bytes(boldFont)]).then(([regular,bold])=>({regular,bold})).catch(e=>{fonts=undefined;throw e;});

export type InvoiceFormat='facturx'|'ubl'|'cii';
export async function invoiceFile(inv:Invoice,format:InvoiceFormat,language:InvoiceLanguage='fr'){
 const base=safeName(`${inv.type==='381'?'Avoir':'Facture'} ${inv.number}`);
 if(format==='ubl')return {blob:new Blob([toUbl(inv)],{type:'application/xml'}),name:`${base}.ubl.xml`};
 if(format==='cii')return {blob:new Blob([toCii(inv)],{type:'application/xml'}),name:`${base}.cii.xml`};
 const pdf=await facturxPdf(inv,toCii(inv),await loadFonts(),{language});
 return {blob:new Blob([pdf as Uint8Array<ArrayBuffer>],{type:'application/pdf'}),name:`${base}.pdf`};
}
