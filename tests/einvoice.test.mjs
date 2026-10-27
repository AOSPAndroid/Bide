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
