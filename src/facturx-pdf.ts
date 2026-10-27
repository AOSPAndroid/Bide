// Factur-X: the invoice as a readable A4 PDF/A-3b with its CII XML embedded
// (factur-x.xml, EN 16931 profile), so people read the page and software reads
// the data. pdfkit writes the PDF/A parts (sRGB output intent, XMP, file ID);
// the Factur-X XMP schema is added here. Fonts are passed in as TTF bytes
// because PDF/A requires every font embedded.
import PDFDocument from 'pdfkit';
import {totals,lineNet,sirenOf,units,paymentMeans,type Invoice,type Party} from './einvoice';

export type InvoiceLanguage='fr'|'en';
const labels={
 fr:{invoice:'Facture',credit:'Avoir',prepayment:'Facture d’acompte',number:'N°',issued:'Date',due:'Échéance',delivery:'Livraison',from:'Émetteur',to:'Client',siren:'SIREN',siret:'SIRET',vat:'TVA',item:'Désignation',qty:'Qté',unit:'Unité',price:'P.U. HT',rate:'TVA',net:'Total HT',
  base:'Base HT',tax:'Montant TVA',subtotal:'Total HT',taxTotal:'Total TVA',total:'Total TTC',prepaid:'Déjà payé',dueAmount:'Net à payer',payment:'Paiement',iban:'IBAN',bic:'BIC',corrects:'Corrige la facture',order:'Commande',reference:'Référence',page:'Page'},
 en:{invoice:'Invoice',credit:'Credit note',prepayment:'Prepayment invoice',number:'No.',issued:'Date',due:'Due',delivery:'Delivery',from:'From',to:'Bill to',siren:'SIREN',siret:'SIRET',vat:'VAT',item:'Description',qty:'Qty',unit:'Unit',price:'Unit price',rate:'VAT',net:'Net',
  base:'Net base',tax:'VAT amount',subtotal:'Net total',taxTotal:'VAT total',total:'Total',prepaid:'Already paid',dueAmount:'Amount due',payment:'Payment',iban:'IBAN',bic:'BIC',corrects:'Corrects invoice',order:'Order',reference:'Reference',page:'Page'},
};

// The Factur-X XMP extension schema (Factur-X 1.0, section 6.2.2).
const facturxXmp=`
<rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
 <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
  <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
  <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
  <pdfaSchema:prefix>fx</pdfaSchema:prefix>
  <pdfaSchema:property><rdf:Seq>
   ${[['DocumentFileName','The name of the embedded XML document'],['DocumentType','The type of the hybrid document in capital letters, e.g. INVOICE or ORDER'],['Version','The actual version of the standard applying to the embedded XML document'],['ConformanceLevel','The conformance level of the embedded XML document']].map(([name,description])=>`<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`).join('\n   ')}
  </rdf:Seq></pdfaSchema:property>
 </rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
<rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
 <fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
</rdf:Description>`;

export function facturxPdf(inv:Invoice,xml:string,fonts:{regular:Uint8Array;bold:Uint8Array},{language='fr',created=new Date()}:{language?:InvoiceLanguage;created?:Date}={}):Promise<Uint8Array>{
 const L=labels[language],t=totals(inv),locale=language==='fr'?'fr-FR':'en-GB';
 // fr-FR groups digits with a narrow no-break space, which the bundled fonts lack.
 const money=(v:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:inv.currency}).format(v).replace(/ /g,' ');
 const qty=(v:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(v).replace(/ /g,' ');
 const date=(d?:string)=>d?new Date(d+'T12:00:00Z').toLocaleDateString(locale,{timeZone:'UTC'}):'';
 const title=inv.type==='381'?L.credit:inv.type==='386'?L.prepayment:L.invoice;
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:48,subset:'PDF/A-3b',pdfVersion:'1.7',lang:language==='fr'?'fr-FR':'en-GB',compress:true,bufferPages:true,font:fonts.regular as never,
   info:{Title:`${title} ${inv.number}`,Author:inv.seller.name,Subject:`${title} ${inv.number} — ${inv.buyer.name}`,Creator:'bide',CreationDate:created,ModDate:created}});
  doc.registerFont('regular',fonts.regular as never);doc.registerFont('bold',fonts.bold as never);
  const chunks:Uint8Array[]=[];doc.on('data',(c:Uint8Array)=>chunks.push(c));doc.on('error',reject);
  doc.on('end',()=>{const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}resolve(out);});
  try{
   const left=48,right=doc.page.width-48,width=right-left,ink='#1d1d1f',muted='#6b6f76',rule='#d9dbe0';
   const party=(p:Party,label:string,x:number,y:number,w:number)=>{
    doc.font('bold').fontSize(8).fillColor(muted).text(label.toUpperCase(),x,y,{width:w});
    doc.font('bold').fontSize(11).fillColor(ink).text(p.name,{width:w});
    doc.font('regular').fontSize(9.5).text([p.address.line1,p.address.line2,`${p.address.postcode} ${p.address.city}`,p.address.country!=='FR'?p.address.country:''].filter(Boolean).join('\n'),{width:w});
    const ids=[p.siret?`${L.siret} ${p.siret}`:sirenOf(p)?`${L.siren} ${sirenOf(p)}`:'',p.vatId?`${L.vat} ${p.vatId}`:'',p.email??''].filter(Boolean);
    if(ids.length)doc.fillColor(muted).fontSize(8.5).text(ids.join('\n'),{width:w});
    return doc.y;
   };
   // Header: title and references on the right, parties below.
   doc.font('bold').fontSize(22).fillColor(ink).text(title,left,48);
   const refs=[[L.number,inv.number],[L.issued,date(inv.issueDate)],[L.due,date(inv.dueDate)],[L.delivery,date(inv.deliveryDate)],[L.order,inv.orderReference??''],[L.reference,inv.buyerReference??''],[L.corrects,inv.precedingInvoice?.number??'']].filter(r=>r[1]);
   let ry=52;for(const [k,v] of refs){doc.font('regular').fontSize(9).fillColor(muted).text(k,right-220,ry,{width:90});doc.font('bold').fillColor(ink).text(v,right-130,ry,{width:130,align:'right'});ry+=14;}
   const top=Math.max(ry,90)+16,col=(width-24)/2;
   let y=Math.max(party(inv.seller,L.from,left,top,col),party(inv.buyer,L.to,left+col+24,top,col))+22;
   // Lines.
   const cols=[{key:'item',w:width-300,align:'left'},{key:'qty',w:48,align:'right'},{key:'unit',w:52,align:'left'},{key:'price',w:72,align:'right'},{key:'rate',w:44,align:'right'},{key:'net',w:84,align:'right'}] as const;
   const header=()=>{let x=left;doc.font('bold').fontSize(8.5).fillColor(muted);for(const c of cols){doc.text(L[c.key],x+(c.align==='right'?0:4),y,{width:c.w-4,align:c.align});x+=c.w;}y+=14;doc.moveTo(left,y).lineTo(right,y).strokeColor(rule).lineWidth(.8).stroke();y+=6;};
   header();
   for(const l of inv.lines){
    const u=units.find(u=>u.code===l.unit),unit=u?(language==='fr'?u.fr:u.label):l.unit,cells=[l.description?`${l.name}\n${l.description}`:l.name,qty(l.quantity),unit,money(l.unitPrice),`${qty(l.vatRate)} %`,money(lineNet(l))];
    doc.font('regular').fontSize(9.5);const h=Math.max(12,doc.heightOfString(cells[0],{width:cols[0].w-8}));
    if(y+h>doc.page.height-170){doc.addPage();y=48;header();}
    let x=left;cells.forEach((text,i)=>{doc.fillColor(ink).text(text,x+(cols[i].align==='right'?0:4),y,{width:cols[i].w-(i?4:8),align:cols[i].align});x+=cols[i].w;});
    y+=h+6;doc.moveTo(left,y-3).lineTo(right,y-3).strokeColor('#eef0f3').lineWidth(.6).stroke();
   }
   // VAT breakdown on the left, totals on the right.
   if(y>doc.page.height-230){doc.addPage();y=48;}
   y+=8;const box=y;
   doc.font('bold').fontSize(8.5).fillColor(muted).text(`${L.rate}`,left,y,{width:50}).text(L.base,left+50,y,{width:90,align:'right'}).text(L.tax,left+140,y,{width:90,align:'right'});y+=13;
   for(const g of t.vat){doc.font('regular').fontSize(9).fillColor(ink).text(g.category==='S'?`${qty(g.rate)} %`:`${g.category} 0 %`,left,y,{width:50}).text(money(g.basis),left+50,y,{width:90,align:'right'}).text(money(g.tax),left+140,y,{width:90,align:'right'});y+=13;}
   if(t.vat.some(g=>g.category!=='S')&&inv.exemptionReason){doc.fontSize(8.5).fillColor(muted).text(inv.exemptionReason,left,y+2,{width:230});y=doc.y;}
   let ty=box;const total=(k:string,v:string,strong=false)=>{doc.font(strong?'bold':'regular').fontSize(strong?11:9.5).fillColor(ink).text(k,right-230,ty,{width:120}).text(v,right-110,ty,{width:110,align:'right'});ty+=strong?18:14;};
   total(L.subtotal,money(t.lineTotal));total(L.taxTotal,money(t.taxTotal));total(L.total,money(t.grandTotal),!t.prepaid);
   if(t.prepaid){total(L.prepaid,money(-t.prepaid));total(L.dueAmount,money(t.due),true);}
   y=Math.max(y,ty)+18;
   // Payment and the legal mentions.
   const means=paymentMeans.find(m=>m.code===inv.payment.code),method=means?(language==='fr'?means.fr:means.label):'';
   doc.font('bold').fontSize(9).fillColor(ink).text(L.payment,left,y);
   doc.font('regular').fontSize(9).text([[method,inv.payment.terms].filter(Boolean).join(' — '),inv.payment.iban?`${L.iban} ${inv.payment.iban}`:'',inv.payment.bic?`${L.bic} ${inv.payment.bic}`:''].filter(Boolean).join('\n'),{width});
   const mentions=[inv.note,inv.latePenalty,inv.recoveryIndemnity,inv.discountTerms,inv.vatOnDebits?'Option pour le paiement de la taxe d’après les débits.':''].filter(Boolean).join('\n');
   if(mentions)doc.moveDown(.8).fontSize(8).fillColor(muted).text(mentions,{width});
   const range=doc.bufferedPageRange();
   for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.font('regular').fontSize(7.5).fillColor(muted).text(`${inv.seller.name} — ${title} ${inv.number} — ${L.page} ${i+1}/${range.count}`,left,doc.page.height-36,{width,align:'center',lineBreak:false});}
   doc.file(new TextEncoder().encode(xml),{name:'factur-x.xml',type:'text/xml',relationship:'Alternative',description:'Factur-X XML invoice',creationDate:created,modifiedDate:created} as never);
   doc.appendXML(facturxXmp);
   doc.end();
  }catch(e){reject(e);}
 });
}
