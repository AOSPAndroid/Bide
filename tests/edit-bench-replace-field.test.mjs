import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replaceBenchmarkField} from './edit-bench/replace-field.mjs';

test('a collapsed OCR gap still sends the requested digit change',()=>{
 const field='REF 5521-0934  COLIS 1/2',region='REF 5521-0934 COLIS 1/2',to='REF 5521-0943  COLIS 1/2';
 assert.equal(region.replace(field,to),region,'the former literal replacement silently did nothing');
 assert.equal(replaceBenchmarkField(region,field,to),to);
});

test('Unicode nonbreaking spaces, tabs and line breaks match field whitespace',()=>{
 assert.equal(replaceBenchmarkField('Net\u00a0à\tpayer\n1\u202f482,36 €','Net à payer 1 482,36 €','Net à payer 1 428,36 €'),'Net à payer 1 428,36 €');
});

test('regex characters and replacement-dollar sequences remain literal',()=>{
 assert.equal(replaceBenchmarkField('Note: [A+B] (v2.1)? — fin','[A+B] (v2.1)?','[A+B] $& (v2.2)?'),'Note: [A+B] $& (v2.2)? — fin');
 assert.throws(()=>replaceBenchmarkField('x-any-A','x.*A','new'),/was not found/);
});

test('a field inside a shared OCR region keeps its prefix and suffix',()=>{
 assert.equal(replaceBenchmarkField('Avant: 1\u00a0482,36 €  Après: inchangé','1 482,36 €','1 428,36 €'),'Avant: 1 428,36 €  Après: inchangé');
});

test('a missing or empty field stops the benchmark instead of grading an unchanged value',()=>{
 assert.throws(()=>replaceBenchmarkField('Montant 12,00 €','13,00 €','14,00 €'),/was not found/);
 assert.throws(()=>replaceBenchmarkField('Montant 12,00 €',' \t ','14,00 €'),/field is empty/);
});

test('a replacement that sends no change is rejected',()=>{
 assert.throws(()=>replaceBenchmarkField('REF 12 COLIS','REF 12  COLIS','REF 12 COLIS'),/did not change the text/);
});
