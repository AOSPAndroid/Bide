import {test} from 'node:test';import assert from 'node:assert/strict';
import {substringDistance,lineErrors,wordScores} from './ocr-bench/score.mjs';
test('benchmark scores: substring edit distance, line errors and word scores',()=>{
 assert.equal(substringDistance('Total 12','Grand Total 12,00'),0);
 assert.equal(substringDistance('Total 12','Tota1 12'),1);
 const merged=lineErrors(['Left column','Right column'],['Left column     Right column']);
 assert.equal(merged.rate,0,'two columns read as one line are not errors');
 assert.equal(lineErrors(['abcd'],[]).rate,1);
 const w=wordScores(['Le montant est 12,50 €.'],['Le rnontant est 12,50 €','bruit']);
 assert.equal(w.recall,4/5);assert.equal(w.precision,4/6);
});
