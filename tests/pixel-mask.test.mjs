import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMask,combineMasks,invertMask,maskBounds,featherMask,growMask,smoothMask,floodSelect,colorRangeMask,maskOutline,maskOpFor,distanceTo,maskArea} from '../tmp/pixel-mask.mjs';

// RGBA image from a function of (x, y) returning [r, g, b, a].
const image=(w,h,f)=>{const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d.set(f(x,y),(y*w+x)*4);return d;};
const square=(w,h,x0,y0,x1,y1)=>{const m=createMask(w,h);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)m.data[y*w+x]=255;return m;};

test('modifier keys pick the combine mode',()=>{
 assert.equal(maskOpFor(false,false),'replace');assert.equal(maskOpFor(true,false),'add');
 assert.equal(maskOpFor(false,true),'subtract');assert.equal(maskOpFor(true,true),'intersect');
});

test('masks add, subtract and intersect',()=>{
 const a=square(10,10,0,0,6,10),b=square(10,10,4,0,10,10);
 assert.equal(maskArea(combineMasks(a,b,'add')),100);
 assert.equal(maskArea(combineMasks(a,b,'subtract')),40);
 assert.equal(maskArea(combineMasks(a,b,'intersect')),20);
 assert.equal(combineMasks(a,b,'replace'),b);
 assert.equal(maskArea(invertMask(a)),40);
 assert.deepEqual(maskBounds(b),{left:4,top:0,width:6,height:10});
 assert.equal(maskBounds(createMask(5,5)),undefined);
});

test('magic wand fills the clicked colour, contiguous or everywhere',()=>{
 // Red left and right thirds, blue middle third.
 const img=image(30,10,x=>x<10||x>=20?[255,0,0,255]:[0,0,255,255]);
 const near=floodSelect(img,30,10,2,2,{antiAlias:false});
 assert.deepEqual(maskBounds(near),{left:0,top:0,width:10,height:10});
 const all=floodSelect(img,30,10,2,2,{contiguous:false,antiAlias:false});
 assert.equal(maskArea(all),200);
 // Tolerance includes close colours.
 const shade=image(10,1,x=>[200+x*4,0,0,255]);
 assert.equal(maskArea(floodSelect(shade,10,1,0,0,{tolerance:10,antiAlias:false})),3);
 assert.equal(maskArea(floodSelect(shade,10,1,0,0,{tolerance:40,antiAlias:false})),10);
});

test('wand anti-aliasing softens only the edge',()=>{
 const img=image(20,20,(x,y)=>x>=5&&x<15&&y>=5&&y<15?[0,0,0,255]:[255,255,255,255]);
 const m=floodSelect(img,20,20,10,10);
 assert.equal(m.data[10*20+10],255,'interior');assert.equal(m.data[0],0,'far outside');
 const edgeIn=m.data[10*20+5],edgeOut=m.data[10*20+4];
 assert.ok(edgeIn>=128&&edgeIn<255,`inner edge ${edgeIn}`);assert.ok(edgeOut>0&&edgeOut<128,`outer edge ${edgeOut}`);
});

test('colour range selects similar colours with a soft falloff',()=>{
 const img=image(4,1,x=>[[100,100,100,255],[120,100,100,255],[150,100,100,255],[100,100,100,0]][x]);
 const m=colorRangeMask(img,4,1,[100,100,100],40);
 assert.equal(m.data[0],255);assert.equal(m.data[1],255,'within half the fuzziness');
 assert.equal(m.data[2],0,'beyond the fuzziness');assert.equal(m.data[3],0,'transparent pixels are skipped');
});

test('distance transform is Euclidean',()=>{
 const seed=new Uint8Array(25);seed[12]=1;
 const d=distanceTo(seed,5,5);
 assert.equal(d[12],0);assert.equal(d[13],1);assert.ok(Math.abs(d[0]-Math.SQRT2*2)<1e-6);
});

test('expand and contract move the edge by whole pixels',()=>{
 const m=square(30,30,10,10,20,20);
 assert.deepEqual(maskBounds(growMask(m,3),128),{left:7,top:7,width:16,height:16});
 assert.deepEqual(maskBounds(growMask(m,-3),128),{left:13,top:13,width:4,height:4});
 assert.equal(growMask(m,0),m);
});

test('feather keeps the area and softens the edge; smooth removes specks',()=>{
 const m=square(40,40,10,10,30,30),f=featherMask(m,4);
 assert.ok(Math.abs(maskArea(f)-400)<8,`area ${maskArea(f)}`);
 assert.ok(f.data[20*40+10]>60&&f.data[20*40+10]<200,'edge is soft');
 assert.equal(f.data[20*40+20],255,'centre stays selected');
 const speck=square(40,40,5,5,6,6),s=smoothMask(speck,3);
 assert.equal(maskArea(s),0);
});

test('outline traces each selected region as a closed path',()=>{
 const m=square(10,10,2,2,5,5);
 assert.equal(maskOutline(m),'M2 2L5 2L5 5L2 5Z');
 const two=combineMasks(m,square(10,10,7,7,9,9),'add');
 assert.equal(maskOutline(two).split('M').length-1,2);
 // A hole gives a second loop.
 const ring=combineMasks(square(10,10,1,1,9,9),square(10,10,4,4,6,6),'subtract');
 assert.equal(maskOutline(ring).split('M').length-1,2);
 assert.equal(maskOutline(createMask(4,4)),'');
});
