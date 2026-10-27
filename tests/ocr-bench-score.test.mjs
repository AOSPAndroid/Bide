import {test} from 'node:test';import assert from 'node:assert/strict';
import {substringDistance,lineErrors,wordScores,joinRows} from './ocr-bench/score.mjs';
test('benchmark scores: substring edit distance, line errors and word scores',()=>{
 assert.equal(substringDistance('Total 12','Grand Total 12,00'),0);
 assert.equal(substringDistance('Total 12','Tota1 12'),1);
 const merged=lineErrors(['Left column','Right column'],['Left column     Right column']);
 assert.equal(merged.rate,0,'two columns read as one line are not errors');
 assert.equal(lineErrors(['abcd'],[]).rate,1);
 const w=wordScores(['Le montant est 12,50 €.'],['Le rnontant est 12,50 €','bruit']);
 assert.equal(w.recall,4/5);assert.equal(w.precision,4/6);
});
test('table cells on a tilted page are joined along the tilt',()=>{
 // A row tilted 3° clockwise: the right cell sits 30 px lower than the left one.
 const cells=[{text:'Logo',left:0,top:100,width:60,height:14},{text:'780.00',left:570,top:130,width:60,height:14},{text:'Next',left:0,top:130,width:60,height:14}];
 assert.deepEqual(joinRows(cells,0),['Next 780.00'],'level rows pair the wrong cells');
 assert.deepEqual(joinRows(cells,Math.atan(30/600)*180/Math.PI),['Logo 780.00']);
});
