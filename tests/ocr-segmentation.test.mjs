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
test('low-confidence symbol noise is dropped but real low-confidence words stay',()=>{
 const l={text:'| Bonjour ~ 42',bbox:{x0:0,x1:200,y0:0,y1:20},words:[{...word('|',0,4),confidence:10},{...word('Bonjour',10,80),confidence:20},{...word('~',90,96),confidence:5},{...word('42',100,120),confidence:90}]};
 assert.deepEqual(segmentOcrLine(l,'words').map(r=>r.text),['Bonjour','42']);
 assert.deepEqual(segmentOcrLine(l,'lines'),[{text:'Bonjour 42',bbox:{x0:10,x1:120,y0:10,y1:30},confidence:20}]);
 assert.deepEqual(segmentOcrLine({...l,words:[l.words[0]]}),[]);
 assert.deepEqual(segmentOcrLine(l).map(r=>[r.text,r.confidence]),[['Bonjour 42',20]]);
 const phrase={text:'ta session',bbox:line.bbox,words:[{...word('ta',120,140),confidence:95},{...word('session',148,220),confidence:58}]};
 assert.equal(segmentOcrLine(phrase)[0].confidence,58);
});
test('a thorough second pass only adds lines the first pass missed',async()=>{
 const {missingLines}=await import('../tmp/ocr-segmentation.mjs');
 const first=[{bbox:{x0:0,y0:0,x1:100,y1:20}}],extra=[{text:'dup',bbox:{x0:5,y0:2,x1:60,y1:18}},{text:'new',bbox:{x0:200,y0:0,x1:240,y1:12}},{text:'edge',bbox:{x0:95,y0:0,x1:160,y1:20}},{text:'empty',bbox:{x0:5,y0:5,x1:5,y1:9}}];
 assert.deepEqual(missingLines(first,extra).map(l=>l.text),['new','edge']);
});
