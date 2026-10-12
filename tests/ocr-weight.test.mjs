import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inkDensity,chooseBold} from '../tmp/ocr-weight.mjs';
function patch(coverage,light){return Uint8ClampedArray.from(Array.from({length:100},(_,i)=>[...(i<coverage?(light?[255,255,255]:[0,0,0]):(light?[0,0,0]:[255,255,255])),255]).flat());}
test('stroke coverage is independent of foreground polarity',()=>{
 for(const light of [true,false]){
  const bg=light?[0,0,0]:[255,255,255];
  assert.equal(inkDensity(patch(25,light),bg),.25);
  assert.equal(inkDensity(patch(45,light),bg),.45);
  assert.equal(chooseBold(inkDensity(patch(25,light),bg),.25,.45),false);
  assert.equal(chooseBold(inkDensity(patch(45,light),bg),.25,.45),true);
 }
});
test('blank or ambiguous samples do not invent bold',()=>{
 assert.equal(inkDensity(patch(0,true),[0,0,0]),undefined);
 assert.equal(chooseBold(undefined,.2,.4),false);
 assert.equal(chooseBold(.5,.4,.4),false);
 assert.equal(chooseBold(.3,.25,.4),false);
});
test('per-word ink picks out a bold label even when blur hides stroke width',async()=>{
 const {classifyWordWeights,wordInk}=await import('../tmp/ocr-weight.mjs');
 // Reference areas per char: regular 10, bold 14.5; bold words carry ~1.45x the ink.
 const word=(text,bold,ink=.9)=>{const n=[...text].length,reg={area:10*n,width:8*n},hv={area:14.5*n,width:9*n};return wordInk(text,(bold?14.5:10)*n*ink*1.04**(n%3),(bold?9:8)*n,reg,hv);};
 const line=[word('Nom',true),word('client:',true),word('Dalil',false),word('REDOUANE',false),word('pour',false)];
 const r=classifyWordWeights(line,false);
 assert.deepEqual(r.bold,[true,true,false,false,false]);assert.ok(Math.abs(r.ink-.9)<.1,'ink level '+r.ink);
 // One weight: the line-level estimate decides, unless regular would need ink beyond black.
 assert.deepEqual(classifyWordWeights([word('Les',false),word('repas',false),word('compris',false)],false).bold,[false,false,false]);
 assert.deepEqual(classifyWordWeights([word('Titre',true,.95),word('entièrement',true,.95)],false).bold,[true,true]);
 assert.equal(classifyWordWeights([word('Titre',true),undefined],false).bold[1],undefined,'unmeasured words stay undefined');
});
