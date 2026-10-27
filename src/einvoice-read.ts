// Reading e-invoices received from others: CII (inside Factur-X/ZUGFeRD
// PDFs, or alone) and UBL invoices and credit notes, into the editor's
// invoice model. What the model cannot hold (document-level discounts,
// several payment methods…) is reported, and the sender's own totals are
// compared with the recomputed ones so nothing changes silently.
import {parseXml,find,findAll,text,type XmlNode} from './xml-lite';
import {totals,type Invoice,type InvoiceLine,type Party,type VatCategory,type PaymentCode,type InvoiceType,type Adjustment} from './einvoice';

export type ReadInvoice={invoice:Invoice;format:'cii'|'ubl';warnings:string[];stated:{total?:number;tax?:number;due?:number}};

const round2=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
const num=(s?:string)=>s===undefined||s===''?undefined:Number(s);
const ymd=(s?:string)=>s&&/^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:s?.slice(0,10);
const categories=new Set(['S','Z','E','AE','K','G','O']);
const payments=new Set(['58','30','49','48','10','20']);
const types:Record<string,InvoiceType>={'380':'380','381':'381','386':'386','384':'380','389':'380','751':'380','261':'381','262':'381','396':'381'};
const operation=(frame?:string)=>frame?.startsWith('B')?'goods' as const:frame?.startsWith('M')?'mixed' as const:'services' as const;

function mentions(inv:Invoice,notes:{text:string;code?:string}[]){
 const rest:string[]=[];
 for(const n of notes){
  if(n.code==='PMD')inv.latePenalty=n.text;else if(n.code==='PMT')inv.recoveryIndemnity=n.text;else if(n.code==='AAB')inv.discountTerms=n.text;else if(n.code==='TXD')inv.vatOnDebits=true;else rest.push(n.text);
 }
 if(rest.length)inv.note=rest.join('\n');
}
// A line's net amount is kept as sent: when it is not quantity × price (line
// discounts, price per pack), the unit price is restated from the amount.
function line(id:string,name:string,description:string|undefined,quantity:number,unit:string,price:number,net:number|undefined,category:string,rate:number,warnings:string[]):InvoiceLine{
 let unitPrice=price;
 if(net!==undefined&&quantity&&round2(quantity*price)!==round2(net)){unitPrice=net/quantity;const note='Some unit prices are restated from their line amounts (the original has line discounts or prices per pack).';if(!warnings.includes(note))warnings.push(note);}
 if(!categories.has(category))warnings.push(`Line ${id}: VAT category ${category} is shown as standard rate.`);
 return {id,name,description,quantity,unit,unitPrice,vatCategory:(categories.has(category)?category:'S') as VatCategory,vatRate:rate};
}

const adjustment=(charge:boolean,amount:number,reason:string|undefined,category:string|undefined,rate:number|undefined):Adjustment=>({charge,amount,reason:reason??(charge?'Charge':'Discount'),vatCategory:(categories.has(category??'')?category:'S') as VatCategory,vatRate:rate??0});

function ciiParty(p?:XmlNode):Party{
 const legal=find(p,'SpecifiedLegalOrganization/ID'),scheme=legal?.attrs.schemeID,id=text(legal);
 const taxes=findAll(p,'SpecifiedTaxRegistration').map(t=>find(t,'ID')),address=find(p,'PostalTradeAddress');
 return {name:text(p,'Name')??'',siren:scheme==='0002'||(!scheme&&id&&/^\d{9}$/.test(id))?id:scheme==='0009'?id?.slice(0,9):undefined,siret:scheme==='0009'?id:undefined,
  vatId:text(taxes.find(t=>t?.attrs.schemeID==='VA')),taxRegistration:text(taxes.find(t=>t?.attrs.schemeID==='FC')),
  email:text(p,'DefinedTradeContact/EmailURIUniversalCommunication/URIID'),electronicAddress:text(p,'URIUniversalCommunication/URIID'),
  address:{line1:text(address,'LineOne')??'',line2:text(address,'LineTwo'),postcode:text(address,'PostcodeCode')??'',city:text(address,'CityName')??'',country:text(address,'CountryID')??''}};
}

export function fromCii(root:XmlNode):ReadInvoice{
 const warnings:string[]=[],doc=find(root,'ExchangedDocument'),trade=find(root,'SupplyChainTradeTransaction'),agreement=find(trade,'ApplicableHeaderTradeAgreement'),settlement=find(trade,'ApplicableHeaderTradeSettlement');
 const type=text(doc,'TypeCode')??'380',means=findAll(settlement,'SpecifiedTradeSettlementPaymentMeans'),pay=means[0],sum=find(settlement,'SpecifiedTradeSettlementHeaderMonetarySummation');
 if(!types[type])warnings.push(`Document type ${type} is shown as an invoice.`);
 if(means.length>1)warnings.push('Only the first of several payment methods is shown.');
 const taxes=findAll(settlement,'ApplicableTradeTax'),reason=taxes.map(t=>text(t,'ExemptionReason')).find(Boolean);
 const inv:Invoice={type:types[type]??'380',number:text(doc,'ID')??'',issueDate:ymd(text(doc,'IssueDateTime/DateTimeString'))??'',
  dueDate:ymd(text(find(settlement,'SpecifiedTradePaymentTerms'),'DueDateDateTime/DateTimeString')),deliveryDate:ymd(text(trade,'ApplicableHeaderTradeDelivery/ActualDeliverySupplyChainEvent/OccurrenceDateTime/DateTimeString')),
  deliveryCountry:text(trade,'ApplicableHeaderTradeDelivery/ShipToTradeParty/PostalTradeAddress/CountryID'),currency:text(settlement,'InvoiceCurrencyCode')??'EUR',
  operation:operation(text(root,'ExchangedDocumentContext/BusinessProcessSpecifiedDocumentContextParameter/ID')),
  seller:ciiParty(find(agreement,'SellerTradeParty')),buyer:ciiParty(find(agreement,'BuyerTradeParty')),buyerReference:text(agreement,'BuyerReference'),orderReference:text(agreement,'BuyerOrderReferencedDocument/IssuerAssignedID'),
  precedingInvoice:text(settlement,'InvoiceReferencedDocument/IssuerAssignedID')?{number:text(settlement,'InvoiceReferencedDocument/IssuerAssignedID')!,date:ymd(text(settlement,'InvoiceReferencedDocument/FormattedIssueDateTime/DateTimeString'))}:undefined,
  payment:{code:(payments.has(text(pay,'TypeCode')??'')?text(pay,'TypeCode'):'30') as PaymentCode,iban:text(pay,'PayeePartyCreditorFinancialAccount/IBANID'),bic:text(pay,'PayeeSpecifiedCreditorFinancialInstitution/BICID'),terms:text(settlement,'SpecifiedTradePaymentTerms/Description')},
  prepaid:num(text(sum,'TotalPrepaidAmount'))||undefined,rounding:num(text(sum,'RoundingAmount'))||undefined,exemptionReason:reason,
  adjustments:findAll(settlement,'SpecifiedTradeAllowanceCharge').map(a=>adjustment(text(a,'ChargeIndicator/Indicator')==='true',num(text(a,'ActualAmount'))??0,text(a,'Reason')??text(a,'ReasonCode'),text(a,'CategoryTradeTax/CategoryCode'),num(text(a,'CategoryTradeTax/RateApplicablePercent')))),
  lines:findAll(trade,'IncludedSupplyChainTradeLineItem').map((item,i)=>{
   const id=text(item,'AssociatedDocumentLineDocument/LineID')??String(i+1),qty=find(item,'SpecifiedLineTradeDelivery/BilledQuantity'),tax=find(item,'SpecifiedLineTradeSettlement/ApplicableTradeTax');
   const price=num(text(item,'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount'))??0,basis=num(text(item,'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/BasisQuantity'))||1;
   return line(id,text(item,'SpecifiedTradeProduct/Name')??'',text(item,'SpecifiedTradeProduct/Description'),num(text(qty))??1,qty?.attrs.unitCode??'C62',price/basis,num(text(item,'SpecifiedLineTradeSettlement/SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount')),text(tax,'CategoryCode')??'S',num(text(tax,'RateApplicablePercent'))??0,warnings);
  })};
 mentions(inv,findAll(doc,'IncludedNote').map(n=>({text:text(n,'Content')??'',code:text(n,'SubjectCode')})).filter(n=>n.text));
 return finish(inv,'cii',warnings,{total:num(text(sum,'GrandTotalAmount')),tax:num(text(sum,'TaxTotalAmount')),due:num(text(sum,'DuePayableAmount'))});
}

function ublParty(p?:XmlNode):Party{
 const party=find(p,'Party'),legal=find(party,'PartyLegalEntity'),companyId=find(legal,'CompanyID'),address=find(party,'PostalAddress'),schemes=findAll(party,'PartyTaxScheme');
 const scheme=(s:XmlNode)=>text(s,'TaxScheme/ID'),endpoint=text(party,'EndpointID'),id=text(companyId);
 return {name:text(legal,'RegistrationName')??text(party,'PartyName/Name')??'',siren:companyId?.attrs.schemeID==='0002'||(!companyId?.attrs.schemeID&&id&&/^\d{9}$/.test(id))?id:companyId?.attrs.schemeID==='0009'?id?.slice(0,9):undefined,siret:companyId?.attrs.schemeID==='0009'?id:undefined,
  vatId:text(schemes.find(s=>scheme(s)==='VAT'),'CompanyID'),taxRegistration:text(schemes.find(s=>scheme(s)!=='VAT'),'CompanyID'),email:text(party,'Contact/ElectronicMail'),electronicAddress:endpoint,
  address:{line1:text(address,'StreetName')??'',line2:text(address,'AdditionalStreetName'),postcode:text(address,'PostalZone')??'',city:text(address,'CityName')??'',country:text(address,'Country/IdentificationCode')??''}};
}

export function fromUbl(root:XmlNode):ReadInvoice{
 const warnings:string[]=[],credit=root.name==='CreditNote',type=text(root,credit?'CreditNoteTypeCode':'InvoiceTypeCode')??(credit?'381':'380'),means=findAll(root,'PaymentMeans'),pay=means[0],sum=find(root,'LegalMonetaryTotal');
 if(!types[type])warnings.push(`Document type ${type} is shown as an invoice.`);
 if(means.length>1)warnings.push('Only the first of several payment methods is shown.');
 const subtotals=findAll(find(root,'TaxTotal'),'TaxSubtotal'),reason=subtotals.map(s=>text(s,'TaxCategory/TaxExemptionReason')).find(Boolean);
 const notes=findAll(root,'Note').map(n=>{const t=text(n)??'',m=/^#(\w{3})#([\s\S]*)$/.exec(t);return m?{code:m[1],text:m[2]}:{text:t};}).filter(n=>n.text);
 const inv:Invoice={type:types[type]??(credit?'381':'380'),number:text(root,'ID')??'',issueDate:text(root,'IssueDate')??'',dueDate:text(root,'DueDate')??text(pay,'PaymentDueDate'),
  deliveryDate:text(root,'Delivery/ActualDeliveryDate'),deliveryCountry:text(root,'Delivery/DeliveryLocation/Address/Country/IdentificationCode'),currency:text(root,'DocumentCurrencyCode')??'EUR',
  operation:operation(text(root,'ProfileID')),seller:ublParty(find(root,'AccountingSupplierParty')),buyer:ublParty(find(root,'AccountingCustomerParty')),buyerReference:text(root,'BuyerReference'),orderReference:text(root,'OrderReference/ID'),
  precedingInvoice:text(root,'BillingReference/InvoiceDocumentReference/ID')?{number:text(root,'BillingReference/InvoiceDocumentReference/ID')!,date:text(root,'BillingReference/InvoiceDocumentReference/IssueDate')}:undefined,
  payment:{code:(payments.has(text(pay,'PaymentMeansCode')??'')?text(pay,'PaymentMeansCode'):'30') as PaymentCode,iban:text(pay,'PayeeFinancialAccount/ID'),bic:text(pay,'PayeeFinancialAccount/FinancialInstitutionBranch/ID'),terms:text(root,'PaymentTerms/Note')},
  prepaid:num(text(sum,'PrepaidAmount'))||undefined,rounding:num(text(sum,'PayableRoundingAmount'))||undefined,exemptionReason:reason,
  adjustments:findAll(root,'AllowanceCharge').map(a=>adjustment(text(a,'ChargeIndicator')==='true',num(text(a,'Amount'))??0,text(a,'AllowanceChargeReason')??text(a,'AllowanceChargeReasonCode'),text(a,'TaxCategory/ID'),num(text(a,'TaxCategory/Percent')))),
  lines:findAll(root,credit?'CreditNoteLine':'InvoiceLine').map((item,i)=>{
   const id=text(item,'ID')??String(i+1),qty=find(item,credit?'CreditedQuantity':'InvoicedQuantity'),tax=find(item,'Item/ClassifiedTaxCategory'),basis=num(text(item,'Price/BaseQuantity'))||1;
   return line(id,text(item,'Item/Name')??'',text(item,'Item/Description'),num(text(qty))??1,qty?.attrs.unitCode??'C62',(num(text(item,'Price/PriceAmount'))??0)/basis,num(text(item,'LineExtensionAmount')),text(tax,'ID')??'S',num(text(tax,'Percent'))??0,warnings);
  })};
 mentions(inv,notes);
 return finish(inv,'ubl',warnings,{total:num(text(sum,'TaxInclusiveAmount')),tax:num(text(find(root,'TaxTotal'),'TaxAmount')),due:num(text(sum,'PayableAmount'))});
}

function finish(invoice:Invoice,format:'cii'|'ubl',warnings:string[],stated:ReadInvoice['stated']):ReadInvoice{
 if(!invoice.adjustments?.length)delete invoice.adjustments;
 const t=totals(invoice),money=(v:number)=>v.toFixed(2);
 if(stated.total!==undefined&&round2(stated.total)!==t.grandTotal)warnings.push(`The sender states a total of ${money(stated.total)} ${invoice.currency}; the lines add up to ${money(t.grandTotal)}.`);
 else if(stated.tax!==undefined&&round2(stated.tax)!==t.taxTotal)warnings.push(`The sender states ${money(stated.tax)} ${invoice.currency} of VAT; recomputed per rate it is ${money(t.taxTotal)}.`);
 return {invoice,format,warnings,stated};
}

export function readInvoiceXml(xml:string):ReadInvoice{
 const root=parseXml(xml.replace(/^﻿/,''));
 if(root.name==='CrossIndustryInvoice')return fromCii(root);
 if(root.name==='Invoice'||root.name==='CreditNote')return fromUbl(root);
 throw new Error(root.name==='CrossIndustryDocument'?'This is a ZUGFeRD 1.0 invoice, which is not supported; ask the sender for Factur-X or UBL.':'This XML file is not a CII or UBL invoice.');
}
