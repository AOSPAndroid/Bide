import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleTextColors,repairTextBackground} from '../tmp/text-replacement.mjs';
function image(w,h,pixel){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(pixel(x,y),(y*w+x)*4);return {width:w,height:h,data};}
test('OCR color sampling retains blue lettering despite a contaminated corner',()=>{
 const p=image(60,30,(x,y)=>x>=10&&x<50&&y>=10&&y<20&&x%5<3?[0,100,180,255]:[240,230,220,255]);p.data.set([0,0,0,255],(8*60+8)*4);
 assert.deepEqual(sampleTextColors(p,{left:10,top:10,width:40,height:10}),{background:'#f0e6dc',color:'#0064b4'});
});
test('smooth repair reconstructs a gradient and never changes source pixels',()=>{
 const p=image(40,40,(x,y)=>[80+x,100+y,160,255]),before=p.data.slice();
 for(let y=10;y<20;y++)for(let x=10;x<30;x++)p.data.set([0,0,0,255],(y*40+x)*4);
 const original=p.data.slice(),patch=repairTextBackground(p,{left:10,top:10,width:20,height:10});
 assert.deepEqual(p.data,original);
 for(let y=0;y<10;y++)for(let x=0;x<20;x++)for(let c=0;c<4;c++)assert.equal(patch.data[(y*20+x)*4+c],before[((y+10)*40+x+10)*4+c]);
});
test('repair preserves alpha, clips page edges and handles a single available border',()=>{
 const p=image(10,10,()=>[40,60,90,0]),patch=repairTextBackground(p,{left:-2,top:0,width:8,height:5});
 assert.equal(patch.width,6);assert.equal(patch.height,5);assert.equal(patch.data[3],0);
 assert.throws(()=>repairTextBackground(p,{left:0,top:0,width:10,height:10}),/background/);
 assert.throws(()=>repairTextBackground(p,{left:20,top:20,width:2,height:2}),/outside/);
});
