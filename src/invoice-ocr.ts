// A paper or PDF invoice read by OCR, turned into an invoice draft: number,
// dates, SIREN/SIRET, VAT numbers, IBAN, parties, lines and totals, found
// from labels and checksums (French and English wording). Everything found is
// a suggestion for the person to check; what was not found is listed. Pure.
import {blankInvoice,validSiren,validSiret,totals,type Invoice,type InvoiceLine,type Party} from './einvoice';

export type OcrLine={text:string;left:number;top:number;width:number;height:number};
export type ScannedInvoice={invoice:Invoice;found:string[];missing:string[];notes:string[]};

const months:Record<string,number>={janvier:1,février:2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,aout:8,septembre:9,octobre:10,novembre:11,décembre:12,decembre:12,
 january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const pad=(n:number)=>String(n).padStart(2,'0');
// Dates in a line, in reading order: 21/10/2026, 21.10.26, 2026-10-21, 21 octobre 2026.
export function datesIn(s:string){
 const out:{index:number;date:string}[]=[];
 for(const m of s.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})\b/g)){const y=+m[3]<100?2000+ +m[3]:+m[3],mo=+m[2],d=+m[1];if(mo>=1&&mo<=12&&d>=1&&d<=31)out.push({index:m.index!,date:`${y}-${pad(mo)}-${pad(d)}`});}
 for(const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))out.push({index:m.index!,date:m[0]});
 for(const m of s.matchAll(/\b(\d{1,2})(?:er)?\s+([a-zéûô]+)\s+(\d{4})\b/gi)){const mo=months[m[2].toLowerCase()];if(mo)out.push({index:m.index!,date:`${m[3]}-${pad(mo)}-${pad(+m[1])}`});}
 for(const m of s.matchAll(/\b([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/gi)){const mo=months[m[1].toLowerCase()];if(mo)out.push({index:m.index!,date:`${m[3]}-${pad(mo)}-${pad(+m[2])}`});}
 return out.sort((a,b)=>a.index-b.index).map(d=>d.date);
}
// Amounts as printed: 1 284,50 · 1.284,50 · 1,284.50 · 1284.5 · 450,00 €.
export function amountsIn(s:string){
 const out:number[]=[];
 for(const m of s.replace(/[−–]/g,'-').matchAll(/-?\d{1,3}(?:[   .,]\d{3})*(?:[.,]\d{1,2})?(?!\d)|-?\d+(?:[.,]\d{1,2})?(?!\d)/g)){
  let t=m[0].replace(/[   ]/g,'');
  const dec=/[.,]\d{1,2}$/.exec(t);
  // A final separator followed by one or two digits is the decimal point;
  // any other separator groups thousands.
  t=dec?t.slice(0,-dec[0].length).replace(/[.,]/g,'')+'.'+dec[0].slice(1):t.replace(/[.,]/g,'');
  const v=Number(t);if(Number.isFinite(v))out.push(v);
 }
 return out;
}
// The numbers at the end of a table row. A space may separate thousands
// ("1 450,00") or columns ("1 450.00"), so every reading is offered; the
// caller keeps the one where quantity × price = amount.
export function rowNumberReadings(tail:string){
 const tokens=tail.replace(/[−–]/g,'-').split(/[\s\u00a0\u202f]+/).filter(t=>/^-?\d[\d.,]*$/.test(t));
 const readings:number[][]=[];
 const walk=(i:number,acc:string[])=>{
  if(i===tokens.length){readings.push(acc.map(t=>amountsIn(t)[0]));return;}
  walk(i+1,[...acc,tokens[i]]);
  const prev=acc[acc.length-1];
  if(prev&&/^-?\d{1,3}(?: \d{3})*$/.test(prev)&&/^\d{3}(?:[.,]\d{1,2})?$/.test(tokens[i]))walk(i+1,[...acc.slice(0,-1),`${prev} ${tokens[i]}`]);
 };
 if(tokens.length<=8)walk(0,[]);
 return readings.filter(r=>r.every(Number.isFinite));
}
const lastAmount=(s:string)=>{const a=amountsIn(s.replace(/\d+(?:[.,]\d+)?\s?%/g,''));return a.length?a[a.length-1]:undefined;};
const ibanOk=(iban:string)=>{const s=iban.replace(/\s+/g,'');if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s))return false;let r=0;for(const ch of (s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55)))r=(r*10+ +ch)%97;return r===1;};

// Lines in reading order, rows joined left to right (a table row read cell by cell).
function rows(lines:OcrLine[]){
 const out:{text:string;top:number;left:number;height:number;cells:OcrLine[]}[]=[];
 for(const l of [...lines].sort((a,b)=>a.top-b.top||a.left-b.left)){
  const mid=l.top+l.height/2,row=out.find(r=>mid>r.top&&mid<r.top+r.height);
  if(row){row.cells.push(l);row.cells.sort((a,b)=>a.left-b.left);row.text=row.cells.map(c=>c.text).join(' ');}
  else out.push({text:l.text,top:l.top,left:l.left,height:l.height,cells:[l]});
 }
 return out;
}

const labels={
 number:/\b(?:facture|invoice|avoir|credit note)\s*(?:n[°ºo]\.?|no\.?|#|num[ée]ro|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/._]{2,})/iu,
 numberAlone:/^(?:n[°ºo]\.?|no\.?|num[ée]ro|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/._]{2,})$/iu,
 issue:/(?<![\p{L}\d])(?:date(?: de (?:la )?facture| d'émission)?|issued?|invoice date|émise? le)(?![\p{L}\d])/iu,
 due:/(?<![\p{L}\d])(?:échéance|echeance|due(?: date)?|à payer avant|payable (?:avant|by|before)|date limite)(?![\p{L}\d])/iu,
 delivery:/(?<![\p{L}\d])(?:livraison|delivery|livré le|date de prestation|prestation)(?![\p{L}\d])/iu,
 buyer:/(?<![\p{L}\d])(?:client|facturé à|facture a|adressée? à|destinataire|bill(?:ed)? to|customer|acheteur)(?![\p{L}\d])/iu,
 seller:/(?<![\p{L}\d])(?:émetteur|emetteur|vendeur|fournisseur|prestataire|from|seller|supplier)(?![\p{L}\d])/iu,
 header:/(?:désignation|designation|description|libellé|article|item).*(?:qt[ée]|quantit[ée]|qty|quantity)/iu,
 lineTotal:/(?<![\p{L}\d])(?:total (?:des lignes )?ht|sous-total|subtotal|net total|total excl|montant ht|total hors taxes)(?![\p{L}\d])/iu,
 vat:/(?<![\p{L}\d])(?:tva|vat|taxe)(?![\p{L}\d])/iu,
 grand:/(?<![\p{L}\d])(?:total ttc|net à payer|net a payer|total (?:due|à payer|a payer)|amount due|grand total|montant ttc|total)(?![\p{L}\d])/iu,
 prepaid:/(?<![\p{L}\d])(?:acompte versé|déjà payé|deja paye|already paid|paid)(?![\p{L}\d])/iu,
};

export function invoiceFromOcr(lines:OcrLine[],today?:string):ScannedInvoice{
 const inv=blankInvoice(today),found:string[]=[],notes:string[]=[],all=rows(lines),texts=all.map(r=>r.text);
 inv.number='';inv.dueDate=undefined;inv.lines=[];inv.latePenalty=inv.recoveryIndemnity=inv.discountTerms=undefined;
 // Number: "Facture n° F-2026-0042", or "N° F-2026-0042" next to the title.
 for(const t of texts){const m=labels.number.exec(t)??labels.numberAlone.exec(t.trim());if(m&&/\d/.test(m[1])){inv.number=m[1].replace(/[.,;:]$/,'');found.push('number');break;}}
 if(/\bavoir\b|credit note/i.test(texts.slice(0,8).join(' ')))inv.type='381';
 // Dates by their label, else the first date on the page is the issue date.
 const dated=(re:RegExp)=>{for(const [i,t] of texts.entries()){if(!re.test(t))continue;const d=datesIn(t.slice(t.search(re)))[0]??datesIn(texts[i+1]??'')[0];if(d)return d;}return undefined;};
 const issue=dated(labels.issue)??texts.map(datesIn).find(d=>d.length)?.[0];if(issue){inv.issueDate=issue;found.push('issue date');}
 const due=dated(labels.due);if(due){inv.dueDate=due;found.push('due date');}
 const delivery=dated(labels.delivery);if(delivery&&delivery!==issue){inv.deliveryDate=delivery;found.push('delivery date');}
 // Parties are blocks of text under their labels ("Client", "Émetteur"),
 // read by column because the two often sit side by side. Without a seller
 // label, the seller is the block at the top left.
 const cells=[...lines].sort((x,y)=>x.top-y.top||x.left-y.left),lineHeight=cells.length?cells.map(c=>c.height).sort((x,y)=>x-y)[cells.length>>1]:12;
 const labelCell=(re:RegExp)=>cells.find(c=>{const at=c.text.search(re);return at>=0&&at<4;});
 const buyerLabel=labelCell(labels.buyer),sellerLabel=labelCell(labels.seller);
 const owner=(c:OcrLine):'seller'|'buyer'|undefined=>{
  if(buyerLabel&&c.top>=buyerLabel.top-lineHeight/2&&c.top<buyerLabel.top+lineHeight*12){
   if(!sellerLabel||Math.abs(sellerLabel.top-buyerLabel.top)>lineHeight*8)return c.left>=buyerLabel.left-lineHeight*2?'buyer':'seller';
   return Math.abs(c.left-buyerLabel.left)<Math.abs(c.left-sellerLabel.left)?'buyer':'seller';
  }
  return buyerLabel&&c.top>buyerLabel.top?undefined:'seller';
 };
 const block=(who:'seller'|'buyer')=>{
  const label=who==='buyer'?buyerLabel:sellerLabel,list=cells.filter(c=>owner(c)===who&&c!==label&&(!label||c.top>=label.top-lineHeight/2));
  // Without a label the seller block is the top of the page down to the client block, minus the invoice's own references.
  return (label?list:list.filter(c=>c.left<(buyerLabel?buyerLabel.left-lineHeight:Infinity)&&!labels.number.test(c.text)&&!labels.numberAlone.test(c.text.trim())&&!/^(facture|invoice|avoir|n[°o]?\.?)$/i.test(c.text.trim())&&!datesIn(c.text).length)).slice(0,8);
 };
 const ids:{who:'seller'|'buyer';siren?:string;siret?:string;vat?:string}[]=[];
 for(const c of cells){
  const who=owner(c)??'seller';
  for(const m of c.text.matchAll(/\b(\d{3})\s?(\d{3})\s?(\d{3})(?:\s?(\d{5}))?\b/g)){const siren=m[1]+m[2]+m[3],siret=m[4]?siren+m[4]:undefined;
   if(siret&&validSiret(siret))ids.push({who,siren,siret});else if(validSiren(siren)&&/siren|siret|rcs|r\.c\.s|immatricul/i.test(c.text))ids.push({who,siren});}
  for(const m of c.text.matchAll(/\b(FR\s?[0-9A-Z]{2}\s?\d{3}\s?\d{3}\s?\d{3}|(?:DE|BE|ES|IT|NL|LU|AT|PT|IE|DK|SE|FI|PL|CZ|GB)[0-9A-Z]{8,12})\b/g))ids.push({who,vat:m[1].replace(/\s/g,'')});
 }
 for(const who of ['seller','buyer'] as const){
  const list=block(who),p=inv[who],role=who==='seller'?'seller':'client';
  const label=who==='buyer'?buyerLabel:sellerLabel,inline=label&&label.text.replace(who==='buyer'?labels.buyer:labels.seller,'').replace(/^[\s:–—-]+/,'').trim();
  if(inline&&inline.length>3){
   const parts=inline.split(/\s*,\s*/);p.name=parts[0];found.push(role);
   if(parts[1])p.address.line1=parts[1];
   const place=parts.slice(2).join(' ')||'',pc=/\b(\d{5})\s+(.+)$/.exec(place);
   if(pc){p.address.postcode=pc[1];p.address.city=pc[2];found.push(`${role} address`);}else if(place){const uk=/^(.*?)\s+([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/.exec(place);p.address.city=uk?uk[1]:place;p.address.postcode=uk?uk[2]:'';if(uk){p.address.country='GB';found.push(`${role} address`);}}
  }
  const nameCell=inline&&inline.length>3?undefined:list.find(c=>/[A-Za-zÀ-ÿ]{2}/.test(c.text)&&!/siren|siret|tva|vat|@|^\d/i.test(c.text));
  if(nameCell){p.name=nameCell.text.trim();found.push(role);}
  if(nameCell)for(const c of list.slice(list.indexOf(nameCell)+1)){
   const pc=/\b(\d{5})\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’\- ]{1,40})/.exec(c.text);
   if(pc){p.address.postcode=pc[1];p.address.city=pc[2].replace(/\s+france$/i,'').trim();const before=c.text.slice(0,pc.index).replace(/[,–—-]\s*$/,'').trim();if(before&&!p.address.line1)p.address.line1=before;found.push(`${role} address`);break;}
   if(!p.address.line1&&/\d/.test(c.text)&&!/siren|siret|tva|vat|@/i.test(c.text))p.address.line1=c.text.trim();
  }
  const email=list.map(c=>/[\w.+-]+@[\w-]+\.[\w.]+/.exec(c.text)?.[0]).find(Boolean);if(email)p.email=email;
  const mine=ids.filter(i=>i.who===who),siren=mine.find(i=>i.siren),vat=mine.find(i=>i.vat);
  if(siren){p.siren=siren.siren;p.siret=siren.siret;found.push(`${role} SIREN`);}
  if(vat){p.vatId=vat.vat;found.push(`${role} VAT number`);}
 }
 // Payment details.
 for(const t of texts){const m=/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?)\b/.exec(t);if(m&&ibanOk(m[1])){inv.payment.iban=m[1].replace(/\s+/g,' ').trim();found.push('IBAN');const bic=/\bBIC\s*:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/.exec(texts.join(' '));if(bic)inv.payment.bic=bic[1];break;}}
 // Lines: rows below the column headings whose last numbers fit quantity × price = amount.
 const header=all.findIndex(r=>labels.header.test(r.text)),end=all.findIndex((r,k)=>k>header&&(labels.lineTotal.test(r.text)||labels.grand.test(r.text)));
 const rate=(t:string)=>{const m=/(\d{1,2}(?:[.,]\d{1,2})?)\s?%/.exec(t);return m?Number(m[1].replace(',','.')):undefined;};
 if(header>=0)for(const r of all.slice(header+1,end>header?end:undefined)){
  const words=r.text.replace(/(\d{1,2}(?:[.,]\d{1,2})?)\s?%/g,' ').replace(/[€$£]|EUR\b/g,' ');
  const name=/^\D*?[A-Za-zÀ-ÿ][^\d]*?(?=\s+\d|$)/.exec(words)?.[0].trim()??'';
  const close=(a:number,b:number)=>Math.abs(a-b)<=.011+Math.abs(b)*.001;
  const nums=rowNumberReadings(words.slice(name.length)).sort((a,b)=>a.length-b.length).find(n=>n.length>=2&&(close((n.length>=3?n[n.length-3]:1)*n[n.length-2],n[n.length-1])||n.length===2&&close(n[0],n[1])));
  if(!nums||!name)continue;
  const total=nums[nums.length-1],price=nums[nums.length-2],qty=nums.length>=3?nums[nums.length-3]:1;
  const unit=/\b(heures?|h|jours?|j|mois|forfait|kg|m²|m2|unités?|u|pcs?)\b/i.exec(words.slice(name.length))?.[1].toLowerCase();
  inv.lines.push({id:String(inv.lines.length+1),name,quantity:nums.length>=3?qty:1,unit:unit?.startsWith('h')?'HUR':unit?.startsWith('j')?'DAY':unit==='mois'?'MON':unit==='forfait'?'LS':unit==='kg'?'KGM':unit?.startsWith('m')?'MTK':'C62',unitPrice:nums.length>=3?price:total,vatCategory:'S',vatRate:rate(r.text)??NaN});
 }
 // Totals by label; the lines' VAT rate is checked against them.
 const byLabel=(re:RegExp,not?:RegExp)=>{for(const t of [...texts].reverse()){if(re.test(t)&&!(not&&not.test(t))){const v=lastAmount(t);if(v!==undefined)return v;}}return undefined;};
 const net=byLabel(labels.lineTotal),tax=byLabel(/^(?:total )?(?:tva|vat)\b/i,labels.lineTotal);
 // The total with VAT, and the amount due once deposits are deducted.
 const ttc=byLabel(/\b(?:total ttc|grand total|montant ttc|total incl)/i),dueShown=byLabel(/(?:net à payer|net a payer|amount due|total due|total à payer|reste à payer|solde)/i),grand=ttc??dueShown??byLabel(/^total\b/i,labels.lineTotal);
 const paid=byLabel(labels.prepaid),prepaid=paid===undefined?undefined:Math.abs(paid);if(prepaid&&grand&&prepaid<grand){inv.prepaid=prepaid;found.push('amount already paid');}
 // Discounts and charges printed between the lines total and the total before VAT.
 const basisRow=all.findIndex((r,k)=>k>end&&/^(?:total ht|total excl|net total|total hors taxes)/i.test(r.text.trim()));
 if(end>=0&&basisRow>end){const rate0=inv.lines[0]?.vatRate??20,cat=inv.lines[0]?.vatCategory??'S';
  for(const r of all.slice(end+1,basisRow)){const v=lastAmount(r.text),reason=r.text.replace(/[−–-]?\s?\d[\d\s\u00a0\u202f.,]*\s?(?:€|EUR)?\s*$/,'').trim();
   if(v===undefined||!/[A-Za-zÀ-ÿ]{3}/.test(reason)||labels.vat.test(reason))continue;
   (inv.adjustments??=[]).push({charge:v>0&&!/[−–-]\s?\d/.test(r.text),amount:Math.abs(v),reason,vatCategory:cat,vatRate:rate0});}
  if(inv.adjustments?.length)found.push(`${inv.adjustments.length} ${inv.adjustments.length===1?'discount or charge':'discounts and charges'}`);}
 // Lines without a printed rate take the page's: VAT total over net total.
 const pageRate=net&&tax!==undefined?[20,10,8.5,5.5,2.1,0].find(k=>Math.abs(k-tax/net*100)<.3):undefined;
 inv.lines=inv.lines.map(l=>Number.isNaN(l.vatRate)?{...l,vatRate:pageRate??20}:l);
 if(inv.lines.length)found.push(`${inv.lines.length} ${inv.lines.length===1?'line':'lines'}`);
 else if(net!==undefined){
  const r=tax!==undefined&&net?Math.round(tax/net*1000)/10:20,known=[20,10,8.5,5.5,2.1,0].find(k=>Math.abs(k-r)<.3);
  inv.lines=[{id:'1',name:'Prestation (à détailler)',quantity:1,unit:'LS',unitPrice:net,vatCategory:known===0?'E':'S',vatRate:known??r} satisfies InvoiceLine];
  notes.push('The lines could not be read one by one: one line carries the total before VAT.');
 }
 if(grand!==undefined&&inv.lines.length){const t=totals(inv),[shown,read]=ttc!==undefined||dueShown===undefined?[grand,t.grandTotal]:[dueShown,t.due];
  if(Math.abs(shown-read)>.011)notes.push(`The page shows a total of ${shown.toFixed(2)}, the lines read add up to ${read.toFixed(2)}: check the lines and VAT rates.`);else found.push('totals match');}
 if(inv.lines.every(l=>l.vatRate===0)&&/293\s*B|non applicable|franchise/i.test(texts.join(' '))){inv.lines=inv.lines.map(l=>({...l,vatCategory:'E',vatRate:0}));inv.exemptionReason=texts.find(t=>/293\s*B|non applicable/i.test(t))?.trim();}
 if(!inv.lines.length)inv.lines=blankInvoice(today).lines;
 const wanted=['number','issue date','seller','client','seller SIREN','IBAN'],missing=wanted.filter(w=>!found.includes(w));
 return {invoice:inv,found,missing,notes};
}
