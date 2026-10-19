import {test} from 'node:test';import assert from 'node:assert/strict';
import {segmentGlyphs,lineCells,planGlyphEdit} from '../tmp/glyph-edit.mjs';
test('letters follow blank-separated ink runs even when the recognizer centres are off',()=>{
 // "Daliil" at small size: D 0-4, a 6-9, l 11, i 13, i 15, l 17 (blank columns between).
 const cols=[3,3,3,3,3,0,3,3,3,3,0,3,0,3,0,3,0,3];
 // Centres drift left (as CTC peaks often do): runs, not centres, set the edges.
 const g=segmentGlyphs('Daliil',[1.5,6.5,10.6,12.6,14.6,16.8],0,18,cols);
 assert.deepEqual(g.map(x=>[x.ch,x.x0,x.x1]),[['D',0,5.5],['a',5.5,10.5],['l',10.5,12.5],['i',12.5,14.5],['i',14.5,16.5],['l',16.5,18]]);
 assert.equal(segmentGlyphs('Da',[3],0,17,cols),undefined,'count mismatch');
});
test('one letter per ink run when the counts match, even if centres drift by a letter',()=>{
 // Column ink measured on "Daliil" in the booking screenshot (x 125-156).
 const ink={125:11,126:11,127:4,128:4,129:4,130:4,131:4,132:8,133:5,135:3,136:7,137:6,138:5,139:6,140:8,141:7,144:11,145:9,147:10,148:10,150:7,151:10,152:8,154:11,155:11};
 const cols=Array.from({length:40},(_,i)=>ink[125+i]??0);
 const g=segmentGlyphs('Daliil',[129,138,146,151,154.5,155.5],125,156,cols,125);
 assert.deepEqual(g.map(x=>x.ch+x.x0+'-'+x.x1),['D125-134.5','a134.5-143','l143-146.5','i146.5-149.5','i149.5-153.5','l153.5-156']);
});
test('touching letters split at the faintest column; a detached dot joins its letter',()=>{
 // "rn" touching (one run 0-8, faint column 4), then a separate dot run at 10 with no centre.
 const cols=[3,3,3,3,1,3,3,3,3,0,2];
 const g=segmentGlyphs('rn',[2,6.5],0,11,cols);
 assert.deepEqual(g.map(x=>[x.ch,x.x0,x.x1]),[['r',0,4],['n',4,11]]);
});
test('line cells are contiguous and spaces span the gap between words',()=>{
 const cells=lineCells('ab cd',[{ch:'a',x0:0,x1:5},{ch:'b',x0:6,x1:10},{ch:'c',x0:14,x1:18},{ch:'d',x0:18,x1:22}]);
 assert.deepEqual(cells.map(c=>[c.ch,c.x0,c.x1]),[['a',0,5.5],['b',5.5,10],[' ',10,14],['c',14,18],['d',18,22]]);
 assert.equal(lineCells('ab',[{ch:'a',x0:0,x1:5},{ch:'x',x0:5,x1:9}]),undefined);
});
// "Nom Daliil Re" with 5-px letters and 4-px spaces.
const text='Nom Daliil Re';let x=0;const glyphs=[];for(const ch of text){if(ch===' '){x+=4;continue;}glyphs.push({ch,x0:x,x1:x+5});x+=5;}
const cells=lineCells(text,glyphs);
test('deleting a letter keeps the start untouched and shifts the rest left with its own pixels',()=>{
 const plan=planGlyphEdit(text,cells,'Nom Dalil Re');
 assert.equal(plan.startX,cells[8].x0,'changes start at the second i');assert.equal(plan.oldEnd,cells[12].x1);
 assert.deepEqual(plan.pieces.map(p=>p.x0),[cells[9].x0,cells[10].x0,cells[11].x0,cells[12].x0],'l, space, R, e reuse their own cells');
 const width=plan.pieces.reduce((s,p)=>s+p.x1-p.x0,0);assert.equal(plan.startX+width,plan.oldEnd-5,'line ends one letter earlier');
});
test('new letters come from the same line, then the page library; missing letters fail',()=>{
 const plan=planGlyphEdit(text,cells,'Nom Daliil Rem');assert.deepEqual(plan.pieces.at(-1),{x0:cells[2].x0,x1:cells[2].x1},'m borrowed from "Nom"');
 assert.equal(planGlyphEdit(text,cells,'Nom Daliil Rez'),undefined,'no z anywhere');
 const lib=[{ch:'z',x0:100,x1:105,y0:50,y1:62,source:'r2'}];
 assert.deepEqual(planGlyphEdit(text,cells,'Nom Daliil Rez',lib).pieces.at(-1),{x0:100,x1:105,y0:50,y1:62,source:'r2'});
 assert.equal(planGlyphEdit(text,cells,text),undefined,'no change');
 const spaced=planGlyphEdit(text,cells,'Nom Dal iil Re');assert.ok(spaced.pieces.some(p=>p.blank&&p.x1===4),"new space uses the line's space width");
});

test('line metrics find the baseline and x-height whatever the descenders',async()=>{
 const {lineMetrics}=await import('../tmp/glyph-edit.mjs');
 // Rows: caps/ascenders (light), x-height band (heavy), descenders (light).
 const plain=[2,2,3,9,10,10,9,0,0];assert.deepEqual(lineMetrics(plain),{xTop:3,baseline:7,xHeight:4});
 const descending=[2,2,3,9,10,10,9,3,2,2];assert.deepEqual(lineMetrics(descending),{xTop:3,baseline:7,xHeight:4},'descenders do not move the baseline');
 assert.equal(lineMetrics([0,0]),undefined);
});
