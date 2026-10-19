import {test} from 'node:test';import assert from 'node:assert/strict';
import {levelsLut,curvesLut,applyAdjustment,adjustmentDefaults,isIdentity} from '../tmp/adjustments.mjs';

const px=(...rgb)=>new Uint8ClampedArray([...rgb,255]);

test('levels stretch the input range, bend midtones with gamma and limit the output',()=>{
 const lut=levelsLut({...adjustmentDefaults.levels,inBlack:50,inWhite:200});
 assert.equal(lut[50],0);assert.equal(lut[200],255);assert.equal(lut[20],0);assert.equal(lut[125],128);
 assert.ok(levelsLut({...adjustmentDefaults.levels,gamma:2})[128]>170,'gamma above 1 brightens midtones');
 const out=levelsLut({...adjustmentDefaults.levels,outBlack:20,outWhite:230});assert.equal(out[0],20);assert.equal(out[255],230);
 assert.ok(isIdentity(adjustmentDefaults.levels));
});

test('curves pass through their points smoothly and never overshoot',()=>{
 const lut=curvesLut({kind:'curves',points:[[0,0],[64,40],[128,128],[192,220],[255,255]]});
 assert.equal(lut[64],40);assert.equal(lut[128],128);assert.equal(lut[192],220);
 for(let v=1;v<256;v++)assert.ok(lut[v]>=lut[v-1],'monotone');
 const flat=curvesLut({kind:'curves',points:[[0,0],[100,200],[110,200],[255,255]]});
 for(let v=100;v<=110;v++)assert.equal(flat[v],200,'a level stretch stays level, no overshoot');
 assert.ok(isIdentity(adjustmentDefaults.curves));
});

test('hue/saturation rotates hue, removes colour and keeps transparent pixels',()=>{
 const red=px(255,0,0);applyAdjustment(red,{kind:'hueSaturation',hue:120,saturation:0,lightness:0});assert.deepEqual([...red.slice(0,3)],[0,255,0]);
 const grey=px(200,80,40);applyAdjustment(grey,{kind:'hueSaturation',hue:0,saturation:-100,lightness:0});assert.ok(grey[0]===grey[1]&&grey[1]===grey[2],'desaturated');
 const clear=new Uint8ClampedArray([255,0,0,0]);applyAdjustment(clear,{kind:'hueSaturation',hue:120,saturation:0,lightness:0});assert.deepEqual([...clear],[255,0,0,0]);
});

test('layer opacity blends the adjusted and original pixels',()=>{
 const p=px(100,100,100);applyAdjustment(p,{...adjustmentDefaults.levels,outBlack:200,outWhite:200},.5);
 assert.deepEqual([...p.slice(0,3)],[150,150,150]);
});
