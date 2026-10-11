import {test} from 'node:test';import assert from 'node:assert/strict';
import {inkMask,normalizeMask,maskIoU,shapeScore} from '../tmp/font-match.mjs';
// Draw rectangles ("glyphs") into an RGBA buffer.
function draw(width,height,rects,ink=[20,20,20],bg=[250,250,250]){const px=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)px.set([...bg,255],i*4);for(const [x,y,w,h] of rects)for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)px.set([...ink,255],(j*width+i)*4);return px;}
test('ink masks follow contrast in either polarity and ignore blank crops',()=>{
 const dark=inkMask(draw(10,10,[[2,2,3,3]]),10,10,[250,250,250]),light=inkMask(draw(10,10,[[2,2,3,3]],[240,240,240],[20,20,20]),10,10,[20,20,20]);
 assert.equal(dark.data.reduce((a,b)=>a+b),9);assert.deepEqual(light.data,dark.data);
 assert.equal(normalizeMask(inkMask(draw(10,10,[]),10,10,[250,250,250])),undefined);
});
test('normalized masks are cropped, scaled to a common height, and optionally stretched',()=>{
 const m=normalizeMask(inkMask(draw(40,30,[[5,5,20,10]]),40,30,[250,250,250]),10);
 assert.equal(m.height,10);assert.equal(m.width,20);assert.equal(m.data.reduce((a,b)=>a+b),200);
 assert.equal(normalizeMask(inkMask(draw(40,30,[[5,5,20,10]]),40,30,[250,250,250]),10,7).width,7);
});
test('the same shapes outscore different shapes and different widths',()=>{
 const mask=rects=>normalizeMask(inkMask(draw(80,20,rects),80,20,[250,250,250]),12);
 const source=mask([[0,0,4,12],[8,0,4,12],[16,6,4,6]]),same=mask([[0,0,4,12],[8,0,4,12],[16,6,4,6]]),other=mask([[0,6,4,6],[8,0,4,12],[16,0,4,12]]),wide=mask([[0,0,6,12],[12,0,6,12],[24,6,6,6]]);
 assert.equal(maskIoU(source,same),1);assert.equal(shapeScore(source,same),1);
 assert.ok(shapeScore(source,other)<.8);assert.ok(shapeScore(source,wide)<shapeScore(source,same)*.5);
});
