import {test} from 'node:test';import assert from 'node:assert/strict';
import {findRedactions,ocrMatchRect,selectedPdfMatches,overlaps,inside} from '../tmp/redaction.mjs';

test('presets find personal data and skip look-alikes',()=>{
 const text='Contact alex.martin@example.co.uk or +33 6 12 34 56 78. Card 4111 1111 1111 1111, IBAN FR76 3000 6000 0112 3456 7890 189. Date 14/03/2026, total 1 284,50 €, ref 4111 1111 1111 1112.';
 const all=findRedactions(text,{presets:['email','phone','iban','card']}).map(m=>m.text);
 assert.deepEqual(all,['alex.martin@example.co.uk','+33 6 12 34 56 78','4111 1111 1111 1111','FR76 3000 6000 0112 3456 7890 189']);
});

test('a selected native match uses its own character quads instead of every identical occurrence',()=>{
 const text='Alex Alex',quads=Array.from(text,(_,i)=>[100+i*10,200,110+i*10,200,100+i*10,212,110+i*10,212]);
 const region={text,left:0,top:0,width:90,height:12,quads};
 const hits=findRedactions(text,{query:'Alex'});
 assert.deepEqual(selectedPdfMatches(region,hits[0],[]),[{left:0,top:0,width:40,height:12}]);
 assert.deepEqual(selectedPdfMatches(region,hits[1],[]),[{left:50,top:0,width:40,height:12}]);
});

test('native search fallback is scoped to the chosen line and occurrence',()=>{
 const region={text:'Alex Alex',left:0,top:20,width:90,height:12};
 const found=[{left:0,top:0,width:40,height:12},{left:0,top:20,width:40,height:12},{left:50,top:20,width:40,height:12}];
 assert.deepEqual(selectedPdfMatches(region,findRedactions(region.text,{query:'Alex'})[1],found),[found[2]]);
});

test('a search text matches every occurrence, ignoring case; overlaps merge',()=>{
 assert.deepEqual(findRedactions('Alex and ALEX',{query:'alex'}).map(m=>[m.start,m.end]),[[0,4],[9,13]]);
 assert.deepEqual(findRedactions('mail alex@x.io',{query:'alex',presets:['email']}).map(m=>m.text),['alex@x.io']);
});

test('an OCR match is covered from its letter positions, or the whole line without them',()=>{
 // "Hi Bob": letters H i B o b at 10-px steps from x=100.
 const glyphs=[0,1,2,3,4].map(i=>({x0:100+i*10,x1:108+i*10}));
 const region={text:'Hi Bob',left:98,top:50,width:52,height:12,glyphs};
 const [m]=findRedactions(region.text,{query:'bob'});
 assert.deepEqual(ocrMatchRect(region,m,0),{left:120,top:50,width:28,height:12});
 assert.deepEqual(ocrMatchRect({...region,glyphs:undefined},m,0),{left:98,top:50,width:52,height:12});
 assert.ok(overlaps({left:0,top:0,width:10,height:10},{left:9,top:9,width:5,height:5}));
 assert.ok(!overlaps({left:0,top:0,width:10,height:10},{left:10,top:0,width:5,height:5}));
 assert.ok(inside({left:2,top:2,width:3,height:3},{left:0,top:0,width:10,height:10}));
});
