import {test} from 'node:test';import assert from 'node:assert/strict';
import {typesetRegions,dashFor,curlyShape,measureLine,markShape} from '../tmp/ocr-typography.mjs';
import {lineCells,withUnread,planGlyphEdit,UNREAD} from '../tmp/glyph-edit.mjs';

// Synthetic lines on a white page: lowercase letters are boxes over rows
// 10-20 (x-height 10, baseline 20), capitals and digits rows 6-20, dashes
// 2-px bars at mid x-height, apostrophes over rows 6-12 (all `dy` lower).
// A part is [read, shape, width]; '' reads nothing (ink the recognizer
// missed), a shape ending in '+' widens the previous cell over it, one
// ending in '<' the next cell, 'skip' is a gap that adds no space to the text.
const W=400,H=60,page=()=>({width:W,height:H,data:new Uint8ClampedArray(W*H*4).fill(255)});
const ink=(img,x0,y0,x1,y1)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*W+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=20;}};
function line(img,parts,{dy=0,...extra}={}){
 let x=10,text='',from;const glyphs=[],at=(x0,y0,x1,y1)=>ink(img,x0,y0+dy,x1,y1+dy);
 for(const [read,shape,w=7] of parts){
  if(shape==='gap'||shape==='skip'){if(shape==='gap')text+=' ';x+=w;continue;}
  const kind=shape.replace(/[+<]/,''),width={dot:2,tick:2,curl:4}[kind]??w;
  if(kind==='x')at(x,10,x+w,20);else if(kind==='X')at(x,6,x+w,20);
  else if(kind==='bar')at(x,14,x+w,16);else if(kind==='dot')at(x,14,x+2,16);
  else if(kind==='tick')at(x,6,x+2,12);
  // A raised comma: a head, then a tail curling back left.
  else if(kind==='curl'){at(x+1,6,x+4,10);at(x+2,10,x+4,11);at(x,11,x+2,12);}
  else if(kind==='star')at(x,8,x+w,18);
  if(shape.endsWith('+'))glyphs.at(-1).x1=x+width+1;else if(shape.endsWith('<'))from=x-1;else if(read){glyphs.push({ch:read,x0:from??x-1,x1:x+width+1,p:.9});text+=read;from=undefined;}
  x+=width+2;
 }
 return {id:'r'+dy,text,left:9,top:6+dy,width:x-9,height:14,background:'#ffffff',glyphs,...extra};
}
const read=parts=>{const img=page();return typesetRegions([line(img,parts)],img)[0];};
const word=s=>[...s].map(ch=>[ch,/[a-z]/.test(ch)?'x':'X']);

test('a dash is judged by its length against the x-height and its neighbours',()=>{
 assert.equal(dashFor(.95,' ','1'),'−','a long dash before a number is a minus');
 assert.equal(dashFor(.45,' ','1'),'-','a hyphen-length one stays a hyphen');
 assert.equal(dashFor(1,' ',' '),'–','alone between spaces: an en dash');
 assert.equal(dashFor(1.9,' ',undefined),'—','much longer: an em dash');
 assert.equal(dashFor(1,'0','1'),'–','between digits: a range');
 assert.equal(dashFor(.5,'a','b'),'-');assert.equal(dashFor(1,'a','b'),undefined,'between letters only an em dash is clear');
 assert.equal(dashFor(.62,' ','1'),undefined,'between a hyphen and a minus: unsure');
 // On a page whose own hyphens are long, so is its hyphen-minus.
 assert.equal(dashFor(.85,' ','1',.8),'-');assert.equal(dashFor(.95,' ','1',.8),undefined);assert.equal(dashFor(1.1,' ','1',.8),'−');
});

test('a minus, an en dash and an em dash are read from the bars themselves',()=>{
 assert.equal(read([...word('ab'),[' ','gap',5],['-','bar',10],...word('12')]).text,'ab −12');
 assert.equal(read([...word('ab'),[' ','gap',5],['-','bar',4],...word('12')]).text,'ab -12','a short dash is a hyphen');
 assert.equal(read([...word('ab'),[' ','gap',5],['-','bar',10],[' ','gap',5],...word('cd')]).text,'ab – cd');
 assert.equal(read([...word('ab'),[' ','gap',5],['—','bar',10],[' ','gap',5],...word('cd')]).text,'ab – cd','read as — but only en-dash long');
 assert.equal(read([...word('ab'),[' ','gap',5],['-','bar',19],[' ','gap',5],...word('cd')]).text,'ab — cd');
 assert.equal(read([...word('10'),['-','bar',10],...word('12')]).text,'10–12');
 assert.equal(read([...word('ab'),['-','bar',4],...word('cd')]).text,'ab-cd','hyphens in words stay');
});

test('an apostrophe is ’ when its tail curls, or when the page uses ’ in clear cases',()=>{
 const shape=kind=>{const img=page(),r=line(img,[...word('l'),["'",kind],...word('ab')]),m=measureLine(img,r),g=r.glyphs[1];return {s:markShape(m,m.runs(Math.round(g.x0),Math.round(g.x1))[0]),xh:m.xh};};
 const curl=shape('curl'),straight=shape('tick');
 assert.ok(curlyShape(curl.s,curl.xh),`curled: ${JSON.stringify(curl)}`);assert.ok(!curlyShape(straight.s,straight.xh),`straight: ${JSON.stringify(straight)}`);
 assert.equal(read([...word('l'),["'",'curl'],...word('ab')]).text,'l’ab');
 assert.equal(read([...word('l'),["'",'tick'],...word('ab')]).text,"l'ab",'a straight tick stays');
 // The page's convention: a mark too plain to tell follows a clear ’ elsewhere on the page.
 const img=page(),plain=line(img,[...word('l'),["'",'tick'],...word('ab')]),clear=line(img,[...word('d'),["'",'curl'],...word('cd')],{dy:25});
 assert.deepEqual(typesetRegions([plain,clear],img).map(r=>r.text),['l’ab','d’cd']);
 const other=page(),alone=line(other,[...word('l'),["'",'tick'],...word('ab')]),recognized={...line(other,[...word('d'),['’','tick'],...word('cd')],{dy:25})};
 assert.deepEqual(typesetRegions([alone,recognized],other).map(r=>r.text),['l’ab','d’cd'],'the recognizer read a ’ on this page');
 // ’ is never made straight, and a mark not after a letter is left alone.
 assert.equal(read([...word('l'),['’','tick'],...word('ab')]).text,'l’ab');
 assert.equal(read([["'",'curl'],...word('ab')]).text,"'ab");
});

test('ink no cell covers becomes a dash or a placeholder cell that a letter edit keeps',()=>{
 // An en dash the recognizer dropped, swallowed by the 0's cell.
 const range=read([...word('10'),['','bar+',10],...word('12')]);
 assert.equal(range.text,'10–12');assert.deepEqual(range.glyphs.map(g=>g.ch),['1','0','–','1','2']);
 assert.ok(range.glyphs[1].x1<=range.glyphs[2].x0+1e-9,'the 0 gives its cell up to the dash');
 // One dropped between two words, in no cell at all: spaced like its gaps.
 assert.equal(read([...word('ab'),[' ','gap',5],['','bar',10],['','skip',5],...word('cd')]).text,'ab – cd');
 // A ★ (no character for it) inside the · cell after a space: a placeholder.
 const star=read([...word('E'),[' ','gap',5],['·','dot'],['','skip',4],['','star+',9],[' ','gap',5],...word('4')]);
 assert.equal(star.text,'E · 4','the text holds only what was read');
 assert.deepEqual(star.glyphs.map(g=>g.ch),['E','·',UNREAD,'4']);
 const dot=star.glyphs[1],cell=star.glyphs[2];assert.ok(dot.x1<=cell.x0&&cell.x1-cell.x0>=9,'the dot keeps only its own ink');
 const cells=lineCells(star.text,star.glyphs);assert.equal(cells.map(c=>c.ch).join(''),`E · ${UNREAD}4`);
 // An edit after it keeps it in place; so does one of the digit beside it.
 assert.equal(withUnread(star.text,cells,'E · 44'),`E · ${UNREAD}44`);assert.equal(withUnread(star.text,cells,'E · 5'),`E · ${UNREAD}5`);
 assert.equal(withUnread(star.text,cells,'E ·'),'E ·','deleting what is on both sides takes it away');
 const plan=planGlyphEdit(cells.map(c=>c.ch).join(''),cells,withUnread(star.text,cells,'4 · 4'));
 assert.ok(plan.pieces.some(p=>p.x0===cells[4].x0&&p.x1===cells[4].x1),'the edit redraws the ★ from its own cell');
 // One before a word, in its first letter's cell: the letter keeps its own run.
 const lead=read([...word('E'),[' ','gap',5],['','star<',9],['','skip',5],...word('48')]);
 assert.equal(lead.text,'E 48');assert.deepEqual(lead.glyphs.map(g=>g.ch),['E',UNREAD,'4','8']);assert.ok(lead.glyphs[2].x0>=lead.glyphs[1].x1);
 // Specks and accents stay with their letter.
 assert.deepEqual(read([...word('a'),['','skip',3],['','dot+'],...word('b')]).glyphs.map(g=>g.ch),['a','b']);
});

test('words follow the new text, and a line shared by fields stays in step',()=>{
 const img=page(),words=[{text:'ab',inkMass:5,width:14},{text:'cd',inkMass:6,width:14},{text:'ef',inkMass:7,width:14}];
 const a=line(img,[...word('ab'),[' ','gap',5],['','bar',10],['','skip',5],...word('cd')],{words:words.slice(0,2).map(w=>({...w})),line:{words,start:0,count:2}});
 const b={...line(img,word('ef'),{dy:25}),line:{words,start:2,count:1}};
 const [r,s]=typesetRegions([a,b],img);
 assert.equal(r.text,'ab – cd');assert.deepEqual(r.words.map(w=>w.text),['ab','–','cd']);assert.equal(r.words[2].inkMass,6,'measurements stay with their word');
 assert.deepEqual(r.line.words.slice(r.line.start,r.line.start+r.line.count).map(w=>w.text),['ab','–','cd']);
 assert.deepEqual(s.line.words.slice(s.line.start,s.line.start+s.line.count).map(w=>w.text),['ef'],'the next field of the line moves along');
 assert.equal(s.line.words,r.line.words);
});
