import {test} from 'node:test';import assert from 'node:assert/strict';
import {tilePlan,toPlanar,dbBoxes,ctcDecode,ctcWords,trimToInk,inkBand,inpaintWindows} from '../tmp/ai-image.mjs';
test('tiles cover the image once and read padded context',()=>{
 const tiles=tilePlan(300,130,128,8),covered=new Uint8Array(300*130);
 for(const {read,inner} of tiles){assert.ok(read.x<=inner.x&&read.y<=inner.y&&read.x+read.width>=inner.x+inner.width);for(let y=inner.y;y<inner.y+inner.height;y++)for(let x=inner.x;x<inner.x+inner.width;x++)covered[y*300+x]++;}
 assert.equal(tiles.length,6);assert.ok(covered.every(v=>v===1));assert.deepEqual(tiles[4].read,{x:120,y:120,width:144,height:10});
});
test('planar tensors normalize per channel and can swap to BGR',()=>{
 const px=[255,0,51,255, 0,255,0,255];
 assert.deepEqual([...toPlanar(px,2,1)].map(v=>+v.toFixed(4)),[1,0,0,1,.2,0]);
 assert.deepEqual([...toPlanar(px,2,1,{mean:[.5,.5,.5],std:[.5,.5,.5],bgr:true})].map(v=>+v.toFixed(2)),[-.6,-1,-1,1,1,-1]);
});
test('DB boxes: components above threshold, confident, grown by unclip',()=>{
 const w=40,h=20,prob=new Float32Array(w*h);for(let y=5;y<11;y++)for(let x=4;x<24;x++)prob[y*w+x]=.9;for(let y=14;y<16;y++)for(let x=30;x<38;x++)prob[y*w+x]=.9;prob[0]=.5;
 const boxes=dbBoxes(prob,w,h);assert.equal(boxes.length,1,'thin and weak blobs are dropped');
 const b=boxes[0],d=20*6*1.5/(2*26);assert.ok(Math.abs(b.x0-(4-d))<1e-9&&Math.abs(b.x1-(24+d))<1e-9&&Math.abs(b.y0-(5-d))<1e-9);
});
test('CTC decoding collapses repeats, skips blanks, maps the last class to a space',()=>{
 const dict=['a','b'],C=4,frames=[[0,.9],[1,.8],[1,.7],[0,.9],[1,.6],[3,.9],[2,.95],[0,.9]];
 const data=new Float32Array(frames.length*C);frames.forEach(([c,p],t)=>{data.fill((1-p)/3,t*C,t*C+C);data[t*C+c]=p;});
 const r=ctcDecode(data,frames.length,C,dict);assert.equal(r.text,'aa b');assert.deepEqual(r.chars.map(c=>c.t),[1,4,5,6]);
 const words=ctcWords(r.chars,4,32);assert.deepEqual(words.map(w=>w.text),['aa','b']);assert.equal(words[0].x1,words[1].x0);assert.equal(words[0].x1,(4+6+1)/2*4);
});
test('word boxes trim to inked columns',()=>{assert.deepEqual(trimToInk([0,0,1,2,0,3,0,0],0,8),{x0:2,x1:6});assert.deepEqual(trimToInk([0,0,0],0,3),{x0:0,x1:3});});
test('inpaint windows group nearby holes and keep 512px context inside the image',()=>{
 const w=inpaintWindows([{x:100,y:100,width:200,height:20},{x:100,y:130,width:180,height:20},{x:1500,y:900,width:50,height:20}],1600,1000);
 assert.equal(w.length,2);assert.equal(w[0].rects.length,2);
 for(const {crop,rects} of w){assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1600&&crop.y+crop.height<=1000);assert.equal(crop.width,512);for(const r of rects)assert.ok(r.x>=crop.x&&r.x+r.width<=crop.x+crop.width&&r.y>=crop.y&&r.y+r.height<=crop.y+crop.height);}
 const small=inpaintWindows([{x:10,y:10,width:50,height:10}],300,200);assert.deepEqual(small[0].crop,{x:0,y:0,width:300,height:200});
 const wide=inpaintWindows([{x:0,y:0,width:900,height:30}],1200,800);assert.ok(wide[0].crop.width>=900+64);
});
test('line band keeps accents but drops the neighbouring line in a padded box',()=>{
 // rows: neighbour line (0-3), gap (4-7), accent (8), gap (9), line (10-19), gap, next line (24-27)
 const rows=[3,3,3,3,0,0,0,0,2,0,...Array(10).fill(9),0,0,0,0,4,4,4,4];
 assert.deepEqual(inkBand(rows,14),{x0:8,x1:20});assert.deepEqual(inkBand(rows,9),{x0:8,x1:20},'centre on an empty row snaps to ink');
});
test('bilinear resize keeps flat colours, aligns pixel centres and interpolates',async()=>{
 const {resizeBilinear}=await import('../tmp/ai-image.mjs');
 const flat=resizeBilinear(new Uint8ClampedArray(4*4).fill(200),2,2,5,3);assert.ok(flat.every(v=>v===200));
 const ramp=resizeBilinear([0,0,0,255, 255,255,255,255],2,1,4,1);assert.deepEqual([...ramp].filter((_,i)=>i%4===0),[0,64,191,255]);
 assert.deepEqual([...resizeBilinear([10,20,30,40],1,1,2,2)],[10,20,30,40,10,20,30,40,10,20,30,40,10,20,30,40]);
});
test('word boundaries snap to the nearest real gap between words',async()=>{
 const {snapToGap}=await import('../tmp/ai-image.mjs');
 // "Daliil" ink 0-29, 1-px letter gaps, a 5-px space, then "R..." from 35.
 const cols=Array.from({length:60},(_,x)=>x<30?(x%6===5?0:3):x<35?0:3);
 assert.equal(snapToGap(cols,36,3,13),32,'boundary inside R moves back to the space (blank 29-34)');
 assert.equal(snapToGap(cols,20,3,13),32);assert.equal(snapToGap(cols,58,3,5),58,'no gap within reach: unchanged');
});
test('CTC: a letter split between its accented forms still beats the blank',()=>{
 // classes: blank, e, é, t. Step 1: blank .4, é .35, e .25 (the accents together win).
 const dict=['e','é','t'],C=4,steps=[[.05,0,0,.95],[.4,.25,.35,0],[.05,0,0,.95]],data=new Float32Array(steps.flat());
 assert.equal(ctcDecode(data,3,C,dict).text,'tét');
 // A weak blank between two of the same letter still separates them (t and T together outweigh it).
 const upper=['e','é','t','T'],tt=new Float32Array([[.05,0,0,.95,0],[.45,0,0,.3,.25],[.05,0,0,.95,0]].flat());
 assert.equal(ctcDecode(tt,3,5,upper).text,'tt');
});
