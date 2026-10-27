// EN 16931 invoices as XML: UN/CEFACT CII (the XML inside a Factur-X PDF,
// EN 16931 profile) and OASIS UBL 2.1. Element order follows the schemas.
import {totals,lineNet,sirenOf,electronicAddress,invoicingFrame,exemptionCode,deliveryCountry,type Invoice,type Party} from './einvoice';

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const amount=(v:number)=>v.toFixed(2);
const num=(v:number)=>String(Math.round(v*1e4)/1e4);
const ymd=(d:string)=>d.replace(/-/g,'');
const el=(name:string,value:string|undefined,attrs='')=>value===undefined||value===''?'':`<${name}${attrs}>${esc(value)}</${name}>`;
// Mentions as notes with their UNTDID 4451 subject codes, as the French
// specification asks: PMD penalties, PMT indemnity, AAB discount.
const notes=(inv:Invoice)=>[[inv.note,''],[inv.latePenalty,'PMD'],[inv.recoveryIndemnity,'PMT'],[inv.discountTerms,'AAB'],[inv.vatOnDebits?'Option pour le paiement de la taxe d’après les débits.':undefined,'TXD']].filter((n):n is [string,string]=>!!n[0]?.trim());

export const ciiProfile='urn:cen.eu:en16931:2017';

function ciiParty(tag:string,p:Party){
 const siren=sirenOf(p),address=electronicAddress(p);
 return `<ram:${tag}>${el('ram:Name',p.name)}${siren?`<ram:SpecifiedLegalOrganization>${el('ram:ID',siren,' schemeID="0002"')}</ram:SpecifiedLegalOrganization>`:''}`+
  `<ram:PostalTradeAddress>${el('ram:PostcodeCode',p.address.postcode)}${el('ram:LineOne',p.address.line1)}${el('ram:LineTwo',p.address.line2)}${el('ram:CityName',p.address.city)}${el('ram:CountryID',p.address.country)}</ram:PostalTradeAddress>`+
  (address||p.email?`<ram:URIUniversalCommunication>${el('ram:URIID',address||p.email,` schemeID="${scheme(address||p.email!)}"`)}</ram:URIUniversalCommunication>`:'')+
  (p.vatId?`<ram:SpecifiedTaxRegistration>${el('ram:ID',p.vatId.replace(/\s+/g,''),' schemeID="VA"')}</ram:SpecifiedTaxRegistration>`:'')+
  (p.taxRegistration?`<ram:SpecifiedTaxRegistration>${el('ram:ID',p.taxRegistration,' schemeID="FC"')}</ram:SpecifiedTaxRegistration>`:'')+`</ram:${tag}>`;
}
// Electronic address scheme: an email, or a French SIREN-based address (0225).
const scheme=(address:string)=>address.includes('@')?'EM':'0225';
const date102=(tag:string,d:string)=>`<${tag}><udt:DateTimeString format="102">${ymd(d)}</udt:DateTimeString></${tag}>`;

export function toCii(inv:Invoice){
 const t=totals(inv),cur=inv.currency;
 const lines=inv.lines.map((l,i)=>`<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument>${el('ram:LineID',String(i+1))}</ram:AssociatedDocumentLineDocument>`+
  `<ram:SpecifiedTradeProduct>${el('ram:Name',l.name)}${el('ram:Description',l.description)}</ram:SpecifiedTradeProduct>`+
  `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice>${el('ram:ChargeAmount',num(l.unitPrice))}</ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`+
  `<ram:SpecifiedLineTradeDelivery>${el('ram:BilledQuantity',num(l.quantity),` unitCode="${esc(l.unit)}"`)}</ram:SpecifiedLineTradeDelivery>`+
  `<ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode>${el('ram:CategoryCode',l.vatCategory)}${el('ram:RateApplicablePercent',num(l.vatRate))}</ram:ApplicableTradeTax>`+
  `<ram:SpecifiedTradeSettlementLineMonetarySummation>${el('ram:LineTotalAmount',amount(lineNet(l)))}</ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('');
 const vat=t.vat.map(g=>`<ram:ApplicableTradeTax>${el('ram:CalculatedAmount',amount(g.tax))}<ram:TypeCode>VAT</ram:TypeCode>${g.category!=='S'?el('ram:ExemptionReason',inv.exemptionReason):''}${el('ram:BasisAmount',amount(g.basis))}${el('ram:CategoryCode',g.category)}${el('ram:ExemptionReasonCode',exemptionCode(inv,g.category))}${inv.vatOnDebits&&g.category==='S'?'<ram:DueDateTypeCode>5</ram:DueDateTypeCode>':''}${el('ram:RateApplicablePercent',num(g.rate))}</ram:ApplicableTradeTax>`).join('');
 const iban=inv.payment.iban?.replace(/\s+/g,'').toUpperCase();
 return `<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`+
  `<rsm:ExchangedDocumentContext><ram:BusinessProcessSpecifiedDocumentContextParameter>${el('ram:ID',invoicingFrame(inv.operation))}</ram:BusinessProcessSpecifiedDocumentContextParameter><ram:GuidelineSpecifiedDocumentContextParameter>${el('ram:ID',ciiProfile)}</ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>`+
  `<rsm:ExchangedDocument>${el('ram:ID',inv.number)}${el('ram:TypeCode',inv.type)}${date102('ram:IssueDateTime',inv.issueDate)}${notes(inv).map(([text,code])=>`<ram:IncludedNote>${el('ram:Content',text)}${el('ram:SubjectCode',code)}</ram:IncludedNote>`).join('')}</rsm:ExchangedDocument>`+
  `<rsm:SupplyChainTradeTransaction>${lines}`+
  `<ram:ApplicableHeaderTradeAgreement>${el('ram:BuyerReference',inv.buyerReference)}${ciiParty('SellerTradeParty',inv.seller)}${ciiParty('BuyerTradeParty',inv.buyer)}${inv.orderReference?`<ram:BuyerOrderReferencedDocument>${el('ram:IssuerAssignedID',inv.orderReference)}</ram:BuyerOrderReferencedDocument>`:''}</ram:ApplicableHeaderTradeAgreement>`+
  `<ram:ApplicableHeaderTradeDelivery>${deliveryCountry(inv)?`<ram:ShipToTradeParty><ram:PostalTradeAddress>${el('ram:CountryID',deliveryCountry(inv))}</ram:PostalTradeAddress></ram:ShipToTradeParty>`:''}${inv.deliveryDate?`<ram:ActualDeliverySupplyChainEvent>${date102('ram:OccurrenceDateTime',inv.deliveryDate)}</ram:ActualDeliverySupplyChainEvent>`:''}</ram:ApplicableHeaderTradeDelivery>`+
  `<ram:ApplicableHeaderTradeSettlement>${el('ram:InvoiceCurrencyCode',cur)}`+
  `<ram:SpecifiedTradeSettlementPaymentMeans>${el('ram:TypeCode',inv.payment.code)}${iban?`<ram:PayeePartyCreditorFinancialAccount>${el('ram:IBANID',iban)}</ram:PayeePartyCreditorFinancialAccount>`:''}${inv.payment.bic&&iban?`<ram:PayeeSpecifiedCreditorFinancialInstitution>${el('ram:BICID',inv.payment.bic.replace(/\s+/g,'').toUpperCase())}</ram:PayeeSpecifiedCreditorFinancialInstitution>`:''}</ram:SpecifiedTradeSettlementPaymentMeans>`+
  vat+
  (inv.payment.terms||inv.dueDate?`<ram:SpecifiedTradePaymentTerms>${el('ram:Description',inv.payment.terms)}${inv.dueDate?date102('ram:DueDateDateTime',inv.dueDate):''}</ram:SpecifiedTradePaymentTerms>`:'')+
  `<ram:SpecifiedTradeSettlementHeaderMonetarySummation>${el('ram:LineTotalAmount',amount(t.lineTotal))}${el('ram:TaxBasisTotalAmount',amount(t.taxBasis))}${el('ram:TaxTotalAmount',amount(t.taxTotal),` currencyID="${cur}"`)}${el('ram:GrandTotalAmount',amount(t.grandTotal))}${t.prepaid?el('ram:TotalPrepaidAmount',amount(t.prepaid)):''}${el('ram:DuePayableAmount',amount(t.due))}</ram:SpecifiedTradeSettlementHeaderMonetarySummation>`+
  (inv.precedingInvoice?.number?`<ram:InvoiceReferencedDocument>${el('ram:IssuerAssignedID',inv.precedingInvoice.number)}${inv.precedingInvoice.date?`<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${ymd(inv.precedingInvoice.date)}</qdt:DateTimeString></ram:FormattedIssueDateTime>`:''}</ram:InvoiceReferencedDocument>`:'')+
  `</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>\n`;
}

function ublParty(tag:string,p:Party){
 const siren=sirenOf(p),address=electronicAddress(p);
 return `<cac:${tag}><cac:Party>${address||p.email?el('cbc:EndpointID',address||p.email,` schemeID="${scheme(address||p.email!)}"`):''}`+
  `<cac:PostalAddress>${el('cbc:StreetName',p.address.line1)}${el('cbc:AdditionalStreetName',p.address.line2)}${el('cbc:CityName',p.address.city)}${el('cbc:PostalZone',p.address.postcode)}<cac:Country>${el('cbc:IdentificationCode',p.address.country)}</cac:Country></cac:PostalAddress>`+
  (p.vatId?`<cac:PartyTaxScheme>${el('cbc:CompanyID',p.vatId.replace(/\s+/g,''))}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`:'')+
  (p.taxRegistration?`<cac:PartyTaxScheme>${el('cbc:CompanyID',p.taxRegistration)}<cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`:'')+
  `<cac:PartyLegalEntity>${el('cbc:RegistrationName',p.name)}${siren?el('cbc:CompanyID',siren,' schemeID="0002"'):''}</cac:PartyLegalEntity>`+
  (p.email?`<cac:Contact>${el('cbc:ElectronicMail',p.email)}</cac:Contact>`:'')+`</cac:Party></cac:${tag}>`;
}

// UBL has separate Invoice and CreditNote documents.
export function toUbl(inv:Invoice){
 const t=totals(inv),cur=` currencyID="${inv.currency}"`,credit=inv.type==='381',root=credit?'CreditNote':'Invoice',line=credit?'CreditNoteLine':'InvoiceLine';
 const category=(c:string,rate:number)=>`${el('cbc:ID',c)}${el('cbc:Percent',num(rate))}${el('cbc:TaxExemptionReasonCode',exemptionCode(inv,c as never))}${c!=='S'?el('cbc:TaxExemptionReason',inv.exemptionReason):''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
 const iban=inv.payment.iban?.replace(/\s+/g,'').toUpperCase();
 return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`+
  `${el('cbc:CustomizationID',ciiProfile)}${el('cbc:ProfileID',invoicingFrame(inv.operation))}${el('cbc:ID',inv.number)}${el('cbc:IssueDate',inv.issueDate)}${credit?'':el('cbc:DueDate',inv.dueDate)}${el(credit?'cbc:CreditNoteTypeCode':'cbc:InvoiceTypeCode',inv.type)}`+
  notes(inv).map(([text,code])=>el('cbc:Note',code?`#${code}#${text}`:text)).join('')+
  `${el('cbc:DocumentCurrencyCode',inv.currency)}${el('cbc:BuyerReference',inv.buyerReference)}`+
  (inv.orderReference?`<cac:OrderReference>${el('cbc:ID',inv.orderReference)}</cac:OrderReference>`:'')+
  (inv.precedingInvoice?.number?`<cac:BillingReference><cac:InvoiceDocumentReference>${el('cbc:ID',inv.precedingInvoice.number)}${el('cbc:IssueDate',inv.precedingInvoice.date)}</cac:InvoiceDocumentReference></cac:BillingReference>`:'')+
  ublParty('AccountingSupplierParty',inv.seller)+ublParty('AccountingCustomerParty',inv.buyer)+
  (inv.deliveryDate||deliveryCountry(inv)?`<cac:Delivery>${el('cbc:ActualDeliveryDate',inv.deliveryDate)}${deliveryCountry(inv)?`<cac:DeliveryLocation><cac:Address><cac:Country>${el('cbc:IdentificationCode',deliveryCountry(inv))}</cac:Country></cac:Address></cac:DeliveryLocation>`:''}</cac:Delivery>`:'')+
  `<cac:PaymentMeans>${el('cbc:PaymentMeansCode',inv.payment.code)}${credit?el('cbc:PaymentDueDate',inv.dueDate):''}${iban?`<cac:PayeeFinancialAccount>${el('cbc:ID',iban)}${inv.payment.bic?`<cac:FinancialInstitutionBranch>${el('cbc:ID',inv.payment.bic.replace(/\s+/g,'').toUpperCase())}</cac:FinancialInstitutionBranch>`:''}</cac:PayeeFinancialAccount>`:''}</cac:PaymentMeans>`+
  (inv.payment.terms?`<cac:PaymentTerms>${el('cbc:Note',inv.payment.terms)}</cac:PaymentTerms>`:'')+
  `<cac:TaxTotal>${el('cbc:TaxAmount',amount(t.taxTotal),cur)}${t.vat.map(g=>`<cac:TaxSubtotal>${el('cbc:TaxableAmount',amount(g.basis),cur)}${el('cbc:TaxAmount',amount(g.tax),cur)}<cac:TaxCategory>${category(g.category,g.rate)}</cac:TaxCategory></cac:TaxSubtotal>`).join('')}</cac:TaxTotal>`+
  `<cac:LegalMonetaryTotal>${el('cbc:LineExtensionAmount',amount(t.lineTotal),cur)}${el('cbc:TaxExclusiveAmount',amount(t.taxBasis),cur)}${el('cbc:TaxInclusiveAmount',amount(t.grandTotal),cur)}${t.prepaid?el('cbc:PrepaidAmount',amount(t.prepaid),cur):''}${el('cbc:PayableAmount',amount(t.due),cur)}</cac:LegalMonetaryTotal>`+
  inv.lines.map((l,i)=>`<cac:${line}>${el('cbc:ID',String(i+1))}${el(credit?'cbc:CreditedQuantity':'cbc:InvoicedQuantity',num(l.quantity),` unitCode="${esc(l.unit)}"`)}${el('cbc:LineExtensionAmount',amount(lineNet(l)),cur)}`+
   `<cac:Item>${el('cbc:Description',l.description)}${el('cbc:Name',l.name)}<cac:ClassifiedTaxCategory>${el('cbc:ID',l.vatCategory)}${el('cbc:Percent',num(l.vatRate))}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>`+
   `<cac:Price>${el('cbc:PriceAmount',num(l.unitPrice),cur)}</cac:Price></cac:${line}>`).join('')+
  `</${root}>\n`;
}
