import {test} from 'node:test';import assert from 'node:assert/strict';
import {formatDoubt,amountStyle,markDoubts} from '../tmp/ocr-checks.mjs';

test('an IBAN whose check digits fail is flagged; a valid one is not',()=>{
 assert.equal(formatDoubt('IBAN FR76 3000 6000 0112 3456 7890 189'),undefined);
 assert.match(formatDoubt('IBAN FR76 3000 6000 0112 3456 7890 186'),/IBAN/);
});
test('dates that cannot exist are flagged, either day/month order is accepted',()=>{
 assert.equal(formatDoubt('Issued 14/10/2026'),undefined);
 assert.equal(formatDoubt('Due 10/31/2026'),undefined);
 assert.match(formatDoubt('Due 31/02/2026'),/date/);
 assert.match(formatDoubt('Visit 38.10.2026'),/date/);
 assert.equal(formatDoubt('Version 3.14.15'),undefined);
 assert.equal(formatDoubt('Tel 06 12 34 56 78'),undefined);
});
test('a SIREN or SIRET failing its checksum is flagged',()=>{
 assert.equal(formatDoubt('SIREN 000 123 455'),undefined);
 assert.match(formatDoubt('SIREN : 000 123 456'),/SIREN/);
});
test("an amount without the page's thousands space is flagged",()=>{
 const page=['Menuiseries 12 480,00 €','Isolation 3 612,50 €','Électricité 4813,33 €','Gravats 289,70 €'];
 assert.equal(amountStyle(page),'space');
 assert.match(formatDoubt(page[2],'space'),/thousands space/);
 assert.equal(formatDoubt(page[3],'space'),undefined);
 assert.equal(formatDoubt(page[2]),undefined,'no convention, no flag');
 assert.equal(amountStyle(['Total 1,250.00','Tax 2,412.10']),'comma');
});
test('fields are flagged with their reason: format, then confidence (93 for the AI, 70 otherwise), then unsure letters',()=>{
 const r=(text,confidence,glyphs)=>({id:text,kind:'ocr',text,confidence,glyphs});
 const out=markDoubts([r('Due 31/02/2026',99),r('Invoice',91),r('Total',99,[{ch:'T',x0:0,x1:1,p:.9},{ch:'o',x0:1,x1:2,p:.4},{ch:'t',x0:2,x1:3},{ch:'a',x0:3,x1:4},{ch:'l',x0:4,x1:5}]),r('Clear',98)],{ai:true});
 assert.match(out[0].doubt,/date/);assert.match(out[1].doubt,/91%/);assert.match(out[2].doubt,/letters/);assert.equal(out[3].doubt,undefined);
 assert.equal(markDoubts([r('Invoice',91)],{ai:false})[0].doubt,undefined,'Tesseract keeps its 70 threshold');
 assert.equal(markDoubts([{...r('x',10),kind:'pdf'}],{ai:true})[0].doubt,undefined,'PDF text is never flagged');
});
