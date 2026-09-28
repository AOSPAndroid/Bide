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
