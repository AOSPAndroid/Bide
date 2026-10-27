import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {inflateSync} from 'node:zlib';
import {totals,checkInvoice,validSiren,validSiret,frenchVatId,nextNumber,blankInvoice,exemptionCode} from '../tmp/einvoice.mjs';
import {toCii,toUbl} from '../tmp/einvoice-xml.mjs';
import {facturxPdf} from '../tmp/facturx-pdf.mjs';
import {samples} from './einvoice/samples.mjs';

test('totals: VAT is computed per rate on the summed lines, then added up',()=>{
 const t=totals(samples['services-vat']);
 assert.deepEqual(t.vat.map(g=>[g.rate,g.basis,g.tax]),[[20,2321.25,464.25],[5.5,174,9.57]]);
 assert.equal(t.lineTotal,2495.25);assert.equal(t.taxTotal,473.82);assert.equal(t.grandTotal,2969.07);assert.equal(t.due,2969.07);
 const paid=totals(samples['deposit-paid']);assert.equal(paid.grandTotal,3312);assert.equal(paid.due,2712);
});

test('French identifiers: SIREN, SIRET and VAT number checksums',()=>{
 assert.ok(validSiren('000123455'));assert.ok(!validSiren('000123456'));assert.ok(!validSiren('12345'));
 assert.ok(validSiret('00012345500016')||validSiret('00012345500024'));
 assert.equal(frenchVatId('000123455'),'FR31000123455');
 assert.equal(nextNumber('F-2026-0042'),'F-2026-0043');assert.equal(nextNumber('2026-099'),'2026-100');assert.equal(nextNumber('AV-9/B'),'AV-10/B');
});

test('every sample passes the editor checks; mistakes are reported against the right field',()=>{
 for(const [name,inv] of Object.entries(samples))assert.deepEqual(checkInvoice(inv).filter(i=>i.severity==='error'),[],name);
 const blank=checkInvoice(blankInvoice('2026-10-27')),rules=new Set(blank.map(i=>i.rule));
 for(const rule of ['BR-02','BR-06','BR-07','BR-08','BR-25','BR-S-02','FR-SIREN','BR-61'])assert.ok(rules.has(rule),`blank invoice reports ${rule}`);
 const base=samples['services-vat'];
 assert.equal(checkInvoice({...base,seller:{...base.seller,vatId:undefined}}).find(i=>i.severity==='error')?.field,'seller.vatId');
 assert.ok(checkInvoice({...base,seller:{...base.seller,siren:'000123456'}}).some(i=>i.rule==='FR-SIREN'));
 assert.ok(checkInvoice({...base,seller:{...base.seller,vatId:'FR99000123455'}}).some(i=>i.rule==='FR-VAT'&&i.severity==='warning'));
 assert.ok(checkInvoice({...base,payment:{code:'58',iban:'FR76 3000 6000 0112 3456 7890 188'}}).some(i=>i.rule==='BR-61'),'bad IBAN checksum');
 assert.ok(checkInvoice({...samples.franchise,seller:{...samples.franchise.seller,vatId:undefined}}).some(i=>i.rule==='BR-E-02'));
 assert.ok(checkInvoice({...samples['credit-note'],precedingInvoice:undefined}).some(i=>i.rule==='FR-CREDIT'));
 assert.ok(checkInvoice({...base,latePenalty:''}).some(i=>i.rule==='FR-PMD'&&i.severity==='warning'));
});

test('CII and UBL carry the invoice, the French frame and the mentions',()=>{
 const cii=toCii(samples['services-vat']),ubl=toUbl(samples['services-vat']);
 for(const part of ['<ram:ID>S1</ram:ID>','<ram:ID>urn:cen.eu:en16931:2017</ram:ID>','<ram:ID schemeID="0002">000123455</ram:ID>','<ram:URIID schemeID="0225">000987651</ram:URIID>','<ram:SubjectCode>PMT</ram:SubjectCode>','<ram:GrandTotalAmount>2969.07</ram:GrandTotalAmount>','<ram:IBANID>FR7630006000011234567890189</ram:IBANID>'])assert.ok(cii.includes(part),part);
 for(const part of ['<cbc:ProfileID>S1</cbc:ProfileID>','<cbc:EndpointID schemeID="0225">000123455</cbc:EndpointID>','<cbc:PayableAmount currencyID="EUR">2969.07</cbc:PayableAmount>'])assert.ok(ubl.includes(part),part);
 assert.ok(toUbl(samples['credit-note']).includes('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"'));
 assert.equal(exemptionCode(samples.franchise,'E'),'VATEX-FR-FRANCHISE');assert.ok(toCii(samples.franchise).includes('<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>'));
 assert.ok(toCii(samples['intra-eu']).includes('<ram:ShipToTradeParty><ram:PostalTradeAddress><ram:CountryID>DE</ram:CountryID>'),'intra-EU delivery country');
 assert.ok(toCii({...samples['services-vat'],number:'A&B <1>'}).includes('<ram:ID>A&amp;B &lt;1&gt;</ram:ID>'),'escaped');
});

test('Factur-X PDF: PDF/A-3 with factur-x.xml attached and the Factur-X XMP',async()=>{
 const fonts={regular:new Uint8Array(await readFile('src/browser/fonts/LiberationSans-Regular.ttf')),bold:new Uint8Array(await readFile('src/browser/fonts/LiberationSans-Bold.ttf'))};
 const inv=samples['services-vat'],xml=toCii(inv),pdf=Buffer.from(await facturxPdf(inv,xml,fonts,{created:new Date('2026-10-27T10:00:00Z')}));
 const text=pdf.toString('latin1');
 assert.ok(text.startsWith('%PDF-1.7'));
 for(const part of ['/AFRelationship /Alternative','(factur-x.xml)','/OutputIntents','/GTS_PDFA1','/Subtype /text#2Fxml'])assert.ok(text.includes(part),part);
 // Streams are compressed: inflate each one to find the XMP and the embedded XML.
 const streams=[...text.matchAll(/stream\r?\n/g)].map(m=>{const start=m.index+m[0].length,end=text.indexOf('endstream',start);try{return inflateSync(pdf.subarray(start,end)).toString('utf8');}catch{return pdf.subarray(start,end).toString('utf8');}});
 assert.ok(streams.some(s=>s.includes('<pdfaid:part>3</pdfaid:part>')&&s.includes('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>')),'XMP');
 assert.ok(streams.includes(xml),'the attached XML is the CII invoice, unchanged');
 assert.ok(!/\/BaseFont \/(Helvetica|Times|Courier)/.test(text),'no unembedded standard fonts');
});

test('received e-invoices are read back: CII, UBL and the XML inside a Factur-X PDF',async()=>{
 const {readInvoiceXml}=await import('../tmp/einvoice-read.mjs'),{embeddedInvoiceXml}=await import('../tmp/facturx-read.mjs'),{parseXml,text}=await import('../tmp/xml-lite.mjs');
 const strip=inv=>JSON.parse(JSON.stringify(inv));// drop undefined fields
 const same=(a,b)=>{for(const k of ['type','number','issueDate','dueDate','currency','operation','exemptionReason','latePenalty','recoveryIndemnity','discountTerms','prepaid'])assert.deepEqual(a[k],b[k],k);
  for(const k of ['name','siren','vatId'])assert.deepEqual([a.seller[k],a.buyer[k]],[b.seller[k],b.buyer[k]],k);
  assert.deepEqual(a.lines.map(l=>[l.name,l.quantity,l.unit,l.unitPrice,l.vatCategory,l.vatRate]),b.lines.map(l=>[l.name,l.quantity,l.unit,l.unitPrice,l.vatCategory,l.vatRate]));
  assert.deepEqual(totals(a),totals(b));};
 for(const [name,inv] of Object.entries(samples)){
  for(const xml of [toCii(inv),toUbl(inv)]){const r=readInvoiceXml(xml);assert.deepEqual(r.warnings,[],name);same(strip(r.invoice),strip(inv));}
 }
 assert.equal(readInvoiceXml(toCii(samples['credit-note'])).invoice.precedingInvoice.number,'F-2026-0042');
 // A sender's total that does not match its lines is reported.
 const off=readInvoiceXml(toCii(samples['services-vat']).replace('<ram:GrandTotalAmount>2969.07','<ram:GrandTotalAmount>2970.00'));assert.match(off.warnings[0],/states a total of 2970.00/);
 assert.throws(()=>readInvoiceXml('<html><body/></html>'),/not a CII or UBL invoice/);
 assert.equal(text(parseXml('<a x="1"><b>&lt;5 &amp; caf&#233;</b><![CDATA[<raw>]]></a>'),'b'),'<5 & café');
 // The XML attached to our own Factur-X PDF comes back unchanged.
 const fonts={regular:new Uint8Array(await readFile('src/browser/fonts/LiberationSans-Regular.ttf')),bold:new Uint8Array(await readFile('src/browser/fonts/LiberationSans-Bold.ttf'))};
 const xml=toCii(samples.franchise),pdf=await facturxPdf(samples.franchise,xml,fonts);
 assert.deepEqual(await embeddedInvoiceXml(pdf),{name:'factur-x.xml',xml});
});

test('scanned invoices: dates, amounts and table rows are read into a draft',async()=>{
 const {datesIn,amountsIn,rowNumberReadings,invoiceFromOcr}=await import('../tmp/invoice-ocr.mjs');
 assert.deepEqual(datesIn('Date 27/10/2026, échéance le 26 novembre 2026'),['2026-10-27','2026-11-26']);
 assert.deepEqual(datesIn('Issued October 5, 2026 · due 2026-11-04'),['2026-10-05','2026-11-04']);
 assert.deepEqual(amountsIn('1 284,50 € · 1.284,50 · 1,284.50 · 18,5 · 3,200 words'),[1284.5,1284.5,1284.5,18.5,3200]);
 // "1 450.00 450.00": the space is a column gap, not a thousands separator.
 assert.ok(rowNumberReadings('1 450.00 450.00').some(r=>r.join()==='1,450,450'));
 // Two columns of parties side by side, a table and totals, as OCR returns them.
 const at=(text,left,top)=>({text,left,top,width:text.length*7,height:14});
 const lines=[at('Facture',48,48),at('N°',320,52),at('F-2026-0099',470,52),at('Date',320,66),at('03/11/2026',470,66),at('Échéance',320,80),at('03/12/2026',470,80),
  at('ÉMETTEUR',48,150),at('CLIENT',300,150),at('Atelier Lumière SARL',48,164),at('Harbour View SAS',300,164),at('14 rue des Acacias',48,178),at('2 quai de la Fosse',300,178),
  at('69003 Lyon',48,192),at('44000 Nantes',300,192),at('SIREN 000123455',48,206),at('SIREN 000987651',300,206),at('TVA FR31000123455',48,220),
  at('Désignation',48,260),at('Qté',300,260),at('P.U. HT',380,260),at('TVA',450,260),at('Total HT',500,260),
  at('Refonte du site web',48,280),at('1',300,280),at('1 850,00 €',380,280),at('20 %',450,280),at('1 850,00 €',500,280),
  at('Maintenance (heures)',48,300),at('6,5',300,300),at('72,50 €',380,300),at('20 %',450,300),at('471,25 €',500,300),
  at('Total HT',330,340),at('2 321,25 €',500,340),at('Total TVA',330,354),at('464,25 €',500,354),at('Total TTC',330,368),at('2 785,50 €',500,368),
  at('IBAN FR76 3000 6000 0112 3456 7890 189',48,420)];
 const {invoice:inv,found,notes}=invoiceFromOcr(lines,'2026-11-05');
 assert.equal(inv.number,'F-2026-0099');assert.equal(inv.issueDate,'2026-11-03');assert.equal(inv.dueDate,'2026-12-03');
 assert.equal(inv.seller.name,'Atelier Lumière SARL');assert.equal(inv.seller.siren,'000123455');assert.equal(inv.seller.vatId,'FR31000123455');assert.equal(inv.seller.address.city,'Lyon');
 assert.equal(inv.buyer.name,'Harbour View SAS');assert.equal(inv.buyer.siren,'000987651');assert.equal(inv.buyer.address.postcode,'44000');
 assert.deepEqual(inv.lines.map(l=>[l.name,l.quantity,l.unitPrice,l.vatRate]),[['Refonte du site web',1,1850,20],['Maintenance (heures)',6.5,72.5,20]]);
 assert.equal(inv.payment.iban,'FR76 3000 6000 0112 3456 7890 189');
 assert.ok(found.includes('totals match'),JSON.stringify({found,notes}));
});
