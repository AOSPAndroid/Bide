import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contrastCoverage,coverageFit,matchedInkColor} from '../tmp/ocr-appearance.mjs';
const coverage=(fill)=>{const width=28,height=16,data=new Float32Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=fill(x,y);return {width,height,data};};
const glyphs=(x,y)=>y>=4&&y<12&&((x>=5&&x<7)||(x>=11&&x<14)||(y<6&&x>=5&&x<14))?1:0;
const soft=coverage((x,y)=>{let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=glyphs(x+dx,y+dy)*(dx===0?2:1)*(dy===0?2:1);return sum/16;});
test('continuous matching distinguishes soft edges from crisp glyphs at the same ink strength',()=>{
 const original={...soft,data:soft.data.map(v=>v*.72)},crisp=coverage(glyphs);
 const fit=coverageFit(original,soft);assert.ok(fit.score>.999);assert.ok(Math.abs(fit.gain-.72)<1e-6);
 assert.ok(coverageFit(original,crisp).score<fit.score-.1);
 // Excessive blur cannot win by inventing ink darker than black.
 const weak={...soft,data:soft.data.map(v=>v*.1)};assert.ok(coverageFit(original,weak).score<.5);
});
test('matching recovers alignment independently of the colour and rejects empty samples',()=>{
 const crisp=coverage(glyphs),moved=coverage((x,y)=>glyphs(x-1,y)*.8);
 assert.ok(coverageFit(moved,crisp,1,0).score>.999);
 assert.ok(coverageFit(moved,crisp,0,0).score<.8);
 assert.equal(coverageFit(coverage(()=>0),crisp).score,0);
});
test('coverage handles coloured dark-mode letters, transparency and background noise',()=>{
 const pixels=new Uint8ClampedArray([22,22,22,255,182,102,22,255,255,255,255,0]);
 const mask=contrastCoverage(pixels,3,1,[20,20,20]);
 assert.equal(mask.data[0],0);assert.ok(Math.abs(mask.data[1]-162/255)<1e-6);assert.equal(mask.data[2],0);
 assert.equal(matchedInkColor('#444444','#ffffff',.8),'#333333');
 assert.equal(matchedInkColor('#d0d0d0','#202020',.8),'#ececec');
 assert.equal(matchedInkColor('invalid','#ffffff',.8),'invalid');
});
