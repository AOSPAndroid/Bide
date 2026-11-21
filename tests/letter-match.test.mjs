import {test} from 'node:test';import assert from 'node:assert/strict';
import {letterCover,letterMismatch,sameLettering,overBackground,coverMass,telling} from '../tmp/letter-match.mjs';
// A drawn shape as coverage: strokes of `weight` pixels at a sub-pixel offset.
const cover=(shape,weight=3,dx=0,size=1)=>{const w=24,h=30,data=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++)if(shape((x+sx/4-dx-12)/size,(y+sy/4-15)/size,weight))v+=1/16;data[y*w+x]=v;}return {data,width:w,height:h};};
const ring=(x,y,t)=>{const r=Math.hypot(x,y);return r<=8&&r>=8-t;},bar=(x,y,t)=>Math.abs(x)<=t/2&&Math.abs(y)<=9,cross=(x,y,t)=>Math.abs(x)<=t/2&&Math.abs(y)<=9||Math.abs(y)<=t/2&&Math.abs(x)<=7;
const line=(weight,dx=0,size=1)=>new Map([['0',[cover(ring,weight,dx,size)]],['1',[cover(bar,weight,dx,size)]],['4',[cover(cross,weight,dx,size)]]]);

test('the same letters at another sub-pixel position are the same lettering',()=>{
 assert.ok(letterMismatch(cover(ring,3,0),cover(ring,3,.4))<.08);
 const v=sameLettering(line(3,0),line(3,.6));assert.equal(v.ok,true);assert.equal(v.shared,3);assert.ok(Math.abs(v.mass-1)<.06,`mass ${v.mass}`);
});
test('a heavier weight, a larger size or one look-alike character do not verify',()=>{
 assert.equal(sameLettering(line(3),line(4.5)).ok,false,'bold: half as much ink again');
 assert.ok(sameLettering(line(3),line(4.5)).mass>1.3);
 assert.equal(sameLettering(line(3),line(3,0,1.1)).ok,false,'10% larger');
 const one=new Map([['0',[cover(ring,3)]]]);assert.equal(sameLettering(one,new Map([['0',[cover(ring,3,.3)]]])).ok,true,'a single shared character must be very close');
 assert.equal(sameLettering(one,new Map([['0',[cover(ring,3.3,.3)]]])).ok,false,'and is refused when 10% heavier');
 assert.equal(sameLettering(line(3),new Map([[',',[cover(bar,3)]]])).ok,false,'punctuation proves nothing');assert.equal(telling(','),false);assert.equal(telling('€'),true);
});
test('ink is measured against the edited line\'s contrast, so darker ink weighs more',()=>{
 const px=v=>new Uint8ClampedArray([v,v,v,255]);
 assert.equal(coverMass(letterCover(px(105),1,1,[255,255,255],150)),1);
 assert.ok(Math.abs(coverMass(letterCover(px(30),1,1,[255,255,255],150))-1.5)<1e-6,'black ink in a grey line is not capped at 1');
 assert.equal(coverMass(letterCover(px(245),1,1,[255,255,255],150)),0,'paper noise is no ink');
});
test('a borrowed letter keeps its ink over another paper',()=>{
 assert.equal(overBackground(30,1,255,238),30,'full ink is unchanged');
 assert.equal(overBackground(255,0,255,238),238,'bare paper becomes the new paper');
 assert.equal(overBackground(140,.5,255,238),132,'half coverage moves half way');
});
