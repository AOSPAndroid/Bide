import {test} from 'node:test';import assert from 'node:assert/strict';
import {segmentOcrLine} from '../tmp/ocr-segmentation.mjs';
const word=(text,x0,x1,y0=10,y1=30)=>({text,bbox:{x0,x1,y0,y1}});
const line={text:'AM ta session',bbox:{x0:10,x1:260,y0:10,y1:30},words:[word('AM',10,40),word('ta',120,140),word('session',148,220)]};
test('smart OCR separates avatar initials while keeping message words together',()=>{
 const before=JSON.stringify(line),regions=segmentOcrLine(line);
 assert.deepEqual(regions.map(r=>r.text),['AM','ta session']);assert.equal(regions[1].bbox.x0,120);assert.equal(regions[0].bbox.x1,40);assert.equal(JSON.stringify(line),before);
});
test('word mode gives precise independent boxes and line mode preserves legacy grouping',()=>{
 assert.deepEqual(segmentOcrLine(line,'words').map(r=>r.text),['AM','ta','session']);
 assert.deepEqual(segmentOcrLine(line,'lines'),[{text:line.text,bbox:line.bbox}]);
});
test('normal names and accented phrases stay together; absent word boxes are safe',()=>{
 const l={text:'Émilie Dupont',bbox:{x0:0,x1:180,y0:0,y1:20},words:[word('Émilie',0,70),word('Dupont',77,170)]};
 assert.equal(segmentOcrLine(l).length,1);assert.equal(segmentOcrLine(l)[0].text,l.text);
 assert.equal(segmentOcrLine({...l,words:[]})[0].text,l.text);
});
