// E-invoices (EN 16931, the European semantic model behind Factur-X, UBL
// and CII): the invoice data, its totals, and the checks run before export.
// French 2026 reform rules (SIREN, electronic addresses, invoicing frame,
// mandatory payment mentions) come on top of EN 16931's. Pure functions.

export type Country=string;// ISO 3166-1 alpha-2
export type Address={line1:string;line2?:string;postcode:string;city:string;country:Country};
export type Party={name:string;siren?:string;siret?:string;vatId?:string;
 // Tax registration number other than a VAT number (BT-32), for sellers without one.
 taxRegistration?:string;address:Address;email?:string;
 // Electronic invoicing address (BT-34/BT-49). Empty: the SIREN, scheme 0225, as in France.
 electronicAddress?:string};
// VAT categories (UNTDID 5305) offered: standard, zero rated, exempt (with a
// reason, e.g. the French "franchise en base"), reverse charge, intra-EU, export.
export type VatCategory='S'|'Z'|'E'|'AE'|'K'|'G'|'O';
export type InvoiceLine={id:string;name:string;description?:string;quantity:number;unit:string;unitPrice:number;vatCategory:VatCategory;vatRate:number};
// Discounts and charges on the whole invoice (BG-20/BG-21), e.g. a global
// discount or shipping; each sits in a VAT category like a line.
export type Adjustment={charge:boolean;amount:number;reason:string;vatCategory:VatCategory;vatRate:number};
export type PaymentCode='58'|'30'|'49'|'48'|'10'|'20';
export type InvoiceType='380'|'381'|'386';// invoice, credit note, prepayment invoice
export type Operation='goods'|'services'|'mixed';
export type Invoice={
 type:InvoiceType;number:string;issueDate:string;dueDate?:string;deliveryDate?:string;currency:string;
 // Country the goods go to (BT-80); intra-EU supplies need it, the buyer's by default.
 deliveryCountry?:Country;
 operation:Operation;seller:Party;buyer:Party;lines:InvoiceLine[];
 buyerReference?:string;orderReference?:string;
 // Credit notes and corrections refer to the invoice they correct (BT-25).
 precedingInvoice?:{number:string;date?:string};
 payment:{code:PaymentCode;iban?:string;bic?:string;terms?:string};
 adjustments?:Adjustment[];prepaid?:number;
 // Rounding of the amount due (BT-114), as some senders state it.
 rounding?:number;
 // Reason printed for VAT categories other than S (BT-120), e.g. "TVA non applicable, art. 293 B du CGI".
 exemptionReason?:string;
 // French mandatory mentions on business invoices: late-payment penalties,
 // the €40 recovery indemnity, early-payment discount terms.
 latePenalty?:string;recoveryIndemnity?:string;discountTerms?:string;
 vatOnDebits?:boolean;note?:string;
};

export const units:{code:string;label:string;fr:string}[]=[
 {code:'C62',label:'unit',fr:'unité'},{code:'HUR',label:'hour',fr:'heure'},{code:'DAY',label:'day',fr:'jour'},{code:'WEE',label:'week',fr:'semaine'},{code:'MON',label:'month',fr:'mois'},{code:'ANN',label:'year',fr:'an'},
 {code:'KGM',label:'kg',fr:'kg'},{code:'MTR',label:'metre',fr:'mètre'},{code:'MTK',label:'m²',fr:'m²'},{code:'LTR',label:'litre',fr:'litre'},{code:'KWH',label:'kWh',fr:'kWh'},{code:'LS',label:'lump sum',fr:'forfait'},
];
export const paymentMeans:{code:PaymentCode;label:string;fr:string}[]=[
 {code:'58',label:'SEPA credit transfer',fr:'Virement SEPA'},{code:'30',label:'Credit transfer',fr:'Virement'},{code:'49',label:'Direct debit',fr:'Prélèvement'},{code:'48',label:'Card',fr:'Carte bancaire'},{code:'20',label:'Cheque',fr:'Chèque'},{code:'10',label:'Cash',fr:'Espèces'},
];
export const vatCategories:{code:VatCategory;label:string;zero:boolean}[]=[
 {code:'S',label:'Standard rate',zero:false},{code:'Z',label:'Zero rated',zero:true},{code:'E',label:'Exempt',zero:true},
 {code:'AE',label:'Reverse charge',zero:true},{code:'K',label:'Intra-EU supply',zero:true},{code:'G',label:'Export outside the EU',zero:true},{code:'O',label:'Not subject to VAT',zero:true},
];
export const frenchMentions={
 latePenalty:'Pénalités de retard : trois fois le taux d’intérêt légal.',
 recoveryIndemnity:'Indemnité forfaitaire pour frais de recouvrement : 40 €.',
 discountTerms:'Pas d’escompte pour paiement anticipé.',
 franchise:'TVA non applicable, art. 293 B du CGI',
};

// Exemption reason codes (VATEX, BT-121) for the zero-rate categories; the
// French extension adds VATEX-FR-FRANCHISE for the "franchise en base".
export function exemptionCode(inv:Invoice,category:VatCategory){
 if(category==='E')return /293\s*B|L\.?\s*223-3|franchise/i.test(inv.exemptionReason??'')?'VATEX-FR-FRANCHISE':undefined;
 return {AE:'VATEX-EU-AE',K:'VATEX-EU-IC',G:'VATEX-EU-G',O:'VATEX-EU-O'}[category as 'AE'|'K'|'G'|'O'];
}
export const deliveryCountry=(inv:Invoice)=>inv.deliveryCountry||(inv.lines.some(l=>l.vatCategory==='K')?inv.buyer.address.country:undefined);

const round2=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export const lineNet=(l:InvoiceLine)=>round2(l.quantity*l.unitPrice);
// Totals as EN 16931 defines them: VAT per category and rate on the summed
// line amounts (rounded once per group, BR-CO-17), then the invoice totals.
export function totals(inv:Invoice){
 const groups=new Map<string,{category:VatCategory;rate:number;basis:number;tax:number}>();
 const add=(category:VatCategory,rate:number,amount:number)=>{const key=`${category}:${rate}`,g=groups.get(key)??{category,rate,basis:0,tax:0};g.basis=round2(g.basis+amount);groups.set(key,g);};
 for(const l of inv.lines)add(l.vatCategory,l.vatRate,lineNet(l));
 const adjustments=inv.adjustments??[];for(const a of adjustments)add(a.vatCategory,a.vatRate,a.charge?round2(a.amount):-round2(a.amount));
 const vat=[...groups.values()].map(g=>({...g,tax:round2(g.basis*g.rate/100)}));
 const lineTotal=round2(inv.lines.reduce((s,l)=>s+lineNet(l),0)),allowances=round2(adjustments.filter(a=>!a.charge).reduce((s,a)=>s+a.amount,0)),charges=round2(adjustments.filter(a=>a.charge).reduce((s,a)=>s+a.amount,0));
 const taxBasis=round2(lineTotal-allowances+charges),taxTotal=round2(vat.reduce((s,g)=>s+g.tax,0)),grandTotal=round2(taxBasis+taxTotal),prepaid=round2(inv.prepaid??0),rounding=round2(inv.rounding??0);
 return {vat,lineTotal,allowances,charges,taxBasis,taxTotal,grandTotal,prepaid,rounding,due:round2(grandTotal-prepaid+rounding)};
}

// Luhn check used by SIREN and SIRET (La Poste's SIRETs follow their own rule).
function luhn(digits:string){let sum=0;for(let i=0;i<digits.length;i++){let d=+digits[digits.length-1-i];if(i%2){d*=2;if(d>9)d-=9;}sum+=d;}return sum%10===0;}
export const validSiren=(s:string)=>/^\d{9}$/.test(s)&&luhn(s);
export const validSiret=(s:string)=>/^\d{14}$/.test(s)&&(luhn(s)||(s.startsWith('356000000')&&[...s].reduce((a,c)=>a+ +c,0)%5===0));
// French VAT number: FR, a two-digit key, then the SIREN.
export const frenchVatId=(siren:string)=>`FR${String((12+3*(Number(siren)%97))%97).padStart(2,'0')}${siren}`;
export const sirenOf=(p:Party)=>p.siren||(p.siret?.slice(0,9))||'';
export const electronicAddress=(p:Party)=>p.electronicAddress||sirenOf(p);
// The French invoicing frame (BT-23): goods, services or both, first issued.
export const invoicingFrame=(op:Operation)=>op==='goods'?'B1':op==='services'?'S1':'M1';
const ibanValid=(iban:string)=>{const s=iban.replace(/\s+/g,'').toUpperCase();if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s))return false;const n=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));let r=0;for(const ch of n)r=(r*10+ +ch)%97;return r===1;};
const isDate=(s?:string)=>!!s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));

// EN 16931 names the intra-EU rules BR-IC-*.
const ruleGroup:Record<VatCategory,string>={S:'S',Z:'Z',E:'E',AE:'AE',K:'IC',G:'G',O:'O'};
export type Issue={rule:string;severity:'error'|'warning';field:string;message:string};
// EN 16931 business rules (BR-*) that a form can break, plus the French
// reform's (FR-*). Errors block export; warnings are mentions French law
// expects on the invoice.
export function checkInvoice(inv:Invoice):Issue[]{
 const out:Issue[]=[],err=(rule:string,field:string,message:string)=>out.push({rule,severity:'error',field,message}),warn=(rule:string,field:string,message:string)=>out.push({rule,severity:'warning',field,message});
 if(!inv.number.trim())err('BR-02','number','The invoice needs a number.');
 if(!isDate(inv.issueDate))err('BR-03','issueDate','The issue date is missing.');
 if(!/^[A-Z]{3}$/.test(inv.currency))err('BR-05','currency','The currency must be a 3-letter code such as EUR.');
 for(const [who,p,base] of [['seller',inv.seller,'BR-06'],['buyer',inv.buyer,'BR-07']] as const){
  const label=who==='seller'?'Your':'The client’s';
  if(!p.name.trim())err(base,`${who}.name`,`${label} name is missing.`);
  if(!p.address.line1.trim()||!p.address.city.trim()||!p.address.postcode.trim())err(who==='seller'?'BR-08':'BR-10',`${who}.address`,`${label} address needs a street, postcode and city.`);
  if(!/^[A-Z]{2}$/.test(p.address.country))err(who==='seller'?'BR-09':'BR-11',`${who}.address.country`,`${label} country must be a 2-letter code such as FR.`);
  if(p.vatId&&!/^[A-Z]{2}[A-Z0-9+*.]{2,13}$/.test(p.vatId.replace(/\s+/g,'')))err('BR-CO-09',`${who}.vatId`,`${label} VAT number must start with its country code (e.g. FR…).`);
  if(p.address.country==='FR'){
   const siren=sirenOf(p);
   if(p.siret&&!validSiret(p.siret))err('FR-SIRET',`${who}.siret`,`${label} SIRET is not valid (14 digits).`);
   if(!siren&&(who==='seller'||p.vatId))err('FR-SIREN',`${who}.siren`,`${label} SIREN is required on French e-invoices.`);
   else if(siren&&!validSiren(siren))err('FR-SIREN',`${who}.siren`,`${label} SIREN is not valid (9 digits).`);
   else if(siren&&p.vatId?.startsWith('FR')&&p.vatId.replace(/\s+/g,'')!==frenchVatId(siren))warn('FR-VAT',`${who}.vatId`,`${label} VAT number does not match the SIREN (expected ${frenchVatId(siren)}).`);
   if(!electronicAddress(p)&&siren)err('FR-ADDRESS',`${who}.electronicAddress`,`${label} electronic invoicing address is missing.`);
  }
 }
 if(!inv.lines.length)err('BR-16','lines','Add at least one line.');
 inv.lines.forEach((l,i)=>{
  const at=`lines.${i}`,n=i+1;
  if(!l.name.trim())err('BR-25',`${at}.name`,`Line ${n} needs a description.`);
  if(!Number.isFinite(l.quantity)||l.quantity===0)err('BR-22',`${at}.quantity`,`Line ${n} needs a quantity.`);
  if(!l.unit)err('BR-23',`${at}.unit`,`Line ${n} needs a unit.`);
  if(!Number.isFinite(l.unitPrice)||l.unitPrice<0)err('BR-27',`${at}.unitPrice`,`Line ${n}: the unit price cannot be negative (use a negative quantity for a refund line).`);
  const zero=vatCategories.find(c=>c.code===l.vatCategory)?.zero;
  if(zero&&l.vatRate!==0)err(`BR-${ruleGroup[l.vatCategory]}-05`,`${at}.vatRate`,`Line ${n}: ${vatCategories.find(c=>c.code===l.vatCategory)!.label.toLowerCase()} lines have 0% VAT.`);
  if(!zero&&!(l.vatRate>0))err('BR-S-05',`${at}.vatRate`,`Line ${n}: standard-rate lines need a VAT rate above 0%.`);
 });
 (inv.adjustments??[]).forEach((a,i)=>{
  const at=`adjustments.${i}`,what=a.charge?'charge':'discount';
  if(!(a.amount>0))err(a.charge?'BR-36':'BR-31',`${at}.amount`,`The ${what} needs an amount above zero.`);
  if(!a.reason.trim())err(a.charge?'BR-38':'BR-33',`${at}.reason`,`Say what the ${what} is for.`);
  if(a.vatCategory==='S'&&!(a.vatRate>0))err(a.charge?'BR-S-07':'BR-S-06',`${at}.vatRate`,`The ${what} needs the VAT rate of the lines it applies to.`);
 });
 const cats=new Set([...inv.lines.map(l=>l.vatCategory),...(inv.adjustments??[]).map(a=>a.vatCategory)]);
 if(cats.has('S')&&!inv.seller.vatId)err('BR-S-02','seller.vatId','Your VAT number is required when you charge VAT.');
 for(const c of ['AE','K','G'] as const)if(cats.has(c)&&!inv.seller.vatId)err(`BR-${ruleGroup[c]}-02`,'seller.vatId','Your VAT number is required for this VAT category.');
 if(cats.has('E')&&!inv.seller.vatId&&!inv.seller.taxRegistration)err('BR-E-02','seller.vatId','Exempt invoices need your VAT number or another tax registration number. Micro-entrepreneurs under the VAT franchise can ask their tax office (SIE) for an intra-EU VAT number.');
 for(const c of ['AE','K'] as const)if(cats.has(c)&&!inv.buyer.vatId)err(`BR-${ruleGroup[c]}-02`,'buyer.vatId','The client’s VAT number is required for reverse charge and intra-EU supplies.');
 if(cats.has('K')&&!inv.deliveryDate)err('BR-IC-11','deliveryDate','Intra-EU supplies need the delivery date.');
 if(cats.has('O')&&cats.size>1)err('BR-O-11','lines','Lines not subject to VAT must go on their own invoice.');
 if([...cats].some(c=>c!=='S'&&c!=='Z')&&!inv.exemptionReason?.trim())err('BR-E-10','exemptionReason','Give the reason for 0% VAT (e.g. “TVA non applicable, art. 293 B du CGI”).');
 if(inv.type==='381'&&!inv.precedingInvoice?.number)err('FR-CREDIT','precedingInvoice','A credit note must name the invoice it corrects.');
 const t=totals(inv);
 if(t.due>0&&!inv.dueDate&&!inv.payment.terms?.trim())err('BR-CO-25','dueDate','Give a due date or payment terms.');
 if(inv.dueDate&&!isDate(inv.dueDate))err('BR-CO-25','dueDate','The due date is not a valid date.');
 if(inv.dueDate&&isDate(inv.issueDate)&&inv.dueDate<inv.issueDate)warn('DUE','dueDate','The due date is before the issue date.');
 if((inv.payment.code==='58'||inv.payment.code==='30')&&!inv.payment.iban?.trim())err('BR-61','payment.iban','A credit transfer needs your IBAN.');
 else if(inv.payment.iban&&!ibanValid(inv.payment.iban))err('BR-61','payment.iban','The IBAN is not valid.');
 if(t.prepaid>t.grandTotal)err('PREPAID','prepaid','The amount already paid is more than the total.');
 if(inv.seller.address.country==='FR'){
  if(!inv.latePenalty?.trim())warn('FR-PMD','latePenalty','French invoices must state the late-payment penalty rate.');
  if(!inv.recoveryIndemnity?.trim())warn('FR-PMT','recoveryIndemnity','French business invoices must state the €40 recovery indemnity.');
  if(!inv.discountTerms?.trim())warn('FR-AAB','discountTerms','French invoices must state the early-payment discount terms (or that there is none).');
 }
 return out;
}

export function blankInvoice(today=new Date().toISOString().slice(0,10)):Invoice{
 const blank=():Party=>({name:'',address:{line1:'',postcode:'',city:'',country:'FR'}});
 const due=new Date(Date.parse(today)+30*864e5).toISOString().slice(0,10);
 return {type:'380',number:'',issueDate:today,dueDate:due,currency:'EUR',operation:'services',seller:blank(),buyer:blank(),
  lines:[{id:'1',name:'',quantity:1,unit:'C62',unitPrice:0,vatCategory:'S',vatRate:20}],payment:{code:'58'},
  latePenalty:frenchMentions.latePenalty,recoveryIndemnity:frenchMentions.recoveryIndemnity,discountTerms:frenchMentions.discountTerms};
}
// The next number after the last one used: the trailing digits go up by one,
// keeping their width (F-2026-0042 → F-2026-0043).
export function nextNumber(last:string){
 const m=/^(.*?)(\d+)(\D*)$/.exec(last);if(!m)return last?`${last}-1`:`F-${new Date().getFullYear()}-0001`;
 return m[1]+String(+m[2]+1).padStart(m[2].length,'0')+m[3];
}
