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
test('a comma cut through its middle by its neighbour\'s cell gets its columns back',async()=>{
 const {settleMarks}=await import('../tmp/glyph-edit.mjs');
 // "2,2": a 2 at 0-8, a comma inked low at 9-12 with nothing above, and a 2 at 13-19 whose cell took 10-12.
 const upper=[3,3,3,3,3,3,3,3,0,0,0,0,0,3,3,3,3,3,3,3],lower=[3,3,3,3,3,3,3,3,0,2,2,2,1,3,3,3,3,3,3,3];
 assert.deepEqual(settleMarks([{ch:'2',x0:0,x1:9},{ch:',',x0:9,x1:10},{ch:'2',x0:10,x1:20}],upper,lower).map(g=>[g.ch,g.x0,g.x1]),[['2',0,9],[',',9,13],['2',13,20]]);
 // A mark whose cell already holds its ink keeps it.
 const fine=[{ch:'2',x0:0,x1:9},{ch:',',x0:8.5,x1:13.5},{ch:'2',x0:13.5,x1:20}];
 assert.deepEqual(settleMarks(fine,upper,lower),fine);
});
test('a comma read half a letter late keeps its own small run (small table digits)',()=>{
 // Ink per column of "4,8" and "211,36" at 8 px, as the reader measured them; its
 // centres come in steps of 10.8 px, and placed the comma on the next digit.
 const a=[0,0,1,4,5,7,8,8,8,9,8,9,10,23,23,23,22,4,3,2,0,0,0,3,8,8,6,0,0,0,0,6,15,19,22,17,10,10,11,10,11,10,13,23,20,18,8,0,0];
 const g=segmentGlyphs('4,8',[38.2,60,70.9],31,76,a,29);
 assert.deepEqual(g.map(c=>c.ch),['4',',','8']);
 assert.ok(g[1].x0>=49&&g[1].x0<=52&&g[1].x1>=56&&g[1].x1<=60,`the comma's cell holds the comma (${g[1].x0}-${g[1].x1})`);
 assert.ok(g[0].x1<=52,'the 4 ends before the comma');assert.ok(g[2].x0>=56,'the 8 keeps all its ink');
 const b=[0,0,5,10,11,13,11,10,10,10,12,11,12,16,14,12,9,2,0,0,0,2,5,6,6,7,6,23,23,23,22,3,3,3,3,3,0,2,5,6,7,6,6,23,23,23,22,3,3,3,3,3,2,0,0,0,1,8,8,6,0,0,0,0,2,7,11,11,9,8,10,11,11,11,11,13,23,20,16,10,0,0,0,10,16,19,21,14,10,9,9,10,9,11,15,17,15,11,5,0,0];
 const h=segmentGlyphs('211,36',[37.8,48.6,81,91.8,113.4,124.2],32,129,b,30);
 assert.ok(h[3].x0>=83&&h[3].x1<=94,`the comma between 211 and 36 (${h[3].x0}-${h[3].x1})`);
 assert.ok(h[4].x0>=90&&h[4].x0<=94&&h[4].x1>=109&&h[4].x1<=113,`the 3 has its whole run (${h[4].x0}-${h[4].x1})`);
 assert.ok(h[5].x0>=109&&h[5].x1>=128,'and the 6 its own');
});
// Cells as glyphEditPatch measures them: ink middle `m` and ink extent `i0`-`i1`.
const cell=(ch,x0,x1,i0=x0+1,i1=x1-1)=>({ch,x0,x1,i0,i1,m:(i0+i1)/2});
test('a digit for a digit is drawn where the old one stood and nothing else moves',async()=>{
 const {planGlyphEdit:plan}=await import('../tmp/glyph-edit.mjs');
 // "18,40": the 1 is narrow (cell 0-8, ink 3-6), the others 12 wide.
 const cells=[cell('1',0,8,3,6),cell('8',8,20),cell(',',20,25,21,24),cell('4',25,37),cell('0',37,49)];
 const p=plan('18,40',cells,'81,40');
 // Each cell from the first change on keeps its place; the new letters are placed over the old ink.
 assert.deepEqual(p.pieces.map(q=>[q.x0,q.x1,q.to]),[[8,20,-1.5],[0,8,9.5],[20,25,20],[25,37,25],[37,49,37]]);
 assert.equal(p.end,49,'the line ends where it ended (chained cells made it shift)');assert.equal(p.startX,-1.5);
 // Ink of about the same width goes edge to edge, whatever its centroid.
 const lopsided=[cell('6',0,12),{...cell('3',12,24),m:20},cell('9',24,36)];
 assert.equal(plan('639',lopsided,'339').pieces[0].to,0,'the 3 (cut from 12) covers exactly where the 6 was, from 0');
 // Letters are not on one advance: cells follow each other as before.
 assert.equal(plan('ab',[cell('a',0,10),cell('b',10,16)],'ba').pieces[0].to,undefined);
});
test('a line set at one pitch keeps its grid when its length changes; proportional text does not qualify',async()=>{
 const {planGlyphEdit:plan,fixedPitch}=await import('../tmp/glyph-edit.mjs');
 // Typewriter text at 10 per character; cells are cut at the ink, so an I's cell is narrow.
 const at=(ch,i,w)=>({ch,x0:i*10+5-w/2-1,x1:i*10+5+w/2+1,i0:i*10+5-w/2,i1:i*10+5+w/2,m:i*10+5});
 const cells=[at('P',0,7),at('O',1,8),at('I',2,2),at('D',3,7),at('S',4,7),{ch:' ',x0:53,x1:57,space:true},at('3',6,6)];
 assert.deepEqual(fixedPitch(cells),{pitch:10,origin:5});
 const p=plan('POIDS 3',cells,'POIDS 33');
 assert.deepEqual(p.pieces.map(q=>q.to),[70+5-3-1],'the new 3 sits one pitch after the old one');
 const q=plan('POIDS 3',cells,'PODS 3');
 assert.deepEqual(q.pieces.map(x=>x.to),[cells[3].x0-10,cells[4].x0-10,40,cells[6].x0-10],'kept letters move by whole pitches');
 assert.equal(fixedPitch([cell('M',0,16),cell('i',16,20),cell('l',20,24),cell('a',24,34),cell('n',34,44)]),undefined);
});
test('a right-aligned line that grows keeps its right edge; a new digit takes a digit\'s advance',async()=>{
 const {planGlyphEdit:plan}=await import('../tmp/glyph-edit.mjs');
 const cells=[cell('1',100,108,103,106),cell('7',108,120),cell(',',120,125,121,124),cell('8',125,137),cell('0',137,149)];
 // Digits advance by 12 (7 to 8 across the comma does not count: 8 to 0 does).
 const left=plan('17,80',cells,'117,80'),right=plan('17,80',cells,'117,80',[],{right:true});
 assert.equal(left.startX,108);assert.equal(left.end-left.oldEnd,12,'one digit longer, by a digit\'s advance, not the narrow cell of the 1');
 assert.equal(right.end,149,'the end stays');assert.equal(right.startX,100-12,'the start moves left by the same advance');
 assert.equal(plan('17,80',cells,'71,80',[],{right:true}).end,149,'no change of width: nothing moves');
});
