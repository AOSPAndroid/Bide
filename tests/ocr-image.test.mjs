import {test} from 'node:test';import assert from 'node:assert/strict';
import {ocrScale,prepareOcrPixels,estimateLineHeight,sampleBackground,estimateTextColor,toHex} from '../tmp/ocr-image.mjs';
function image(width,height,bg,fill){const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=fill(x,y)??bg;data.set([...c,255],(y*width+x)*4);}return {data,width,height};}
test('small text is upscaled towards 24px lines; large text is left alone',()=>{
 assert.equal(ocrScale(800,600,8),3);assert.equal(ocrScale(800,600,12),2);assert.equal(ocrScale(800,600,30),1);
 assert.equal(ocrScale(800,600),2);assert.equal(ocrScale(3600,2546),1);
 const s=ocrScale(3000,3000,6);assert.ok(s>1&&3000*3000*s*s<=12e6+1);
});
test('line height is the median inked row run, measured per vertical strip',()=>{
 const lines=(y0s,h,width=80,x0=0,x1=80)=>(x,y)=>x>=x0&&x<x1&&y0s.some(y0=>y>=y0&&y<y0+h)&&x%3!==0?[0,0,0]:undefined;
 assert.equal(estimateLineHeight(image(80,100,[255,255,255],lines([10,40,70],12))),12);
 // Two columns with offset baselines would merge into one tall run without strips.
 const left=lines([10,40],12,80,0,30),right=lines([16,46],12,80,50,80);
 assert.equal(estimateLineHeight(image(80,100,[255,255,255],(x,y)=>left(x,y)??right(x,y))),12);
 assert.equal(estimateLineHeight(image(80,100,[255,255,255],()=>undefined)),undefined);
 assert.equal(estimateLineHeight(image(80,100,[255,255,255],(x,y)=>y===50?[0,0,0]:undefined)),undefined,'rules are ignored');
});
test('dark-mode images become dark text on a light background; contrast is kept',()=>{
 const img=image(20,10,[30,32,40],(x)=>x===5?[235,235,240]:undefined);
 assert.equal(prepareOcrPixels(img).inverted,true);
 assert.ok(img.data[0]>200,'background turns light');assert.ok(img.data[5*4]<60,'text turns dark');
 const light=image(20,10,[250,250,250],(x)=>x===5?[120,120,120]:undefined);assert.equal(prepareOcrPixels(light).inverted,false);assert.equal(light.data[5*4],120);
});
test('background ignores a stray pixel and text colour ignores anti-aliasing',()=>{
 const blue=[20,90,200],img=image(30,20,[245,240,230],(x,y)=>x===8&&y===4?[0,0,0]:x>=10&&x<20&&y>=7&&y<13?(x===10||x===19?[130,165,215]:blue):undefined);
 const box={x0:10,y0:7,x1:20,y1:13},bg=sampleBackground(img,box);
 assert.deepEqual(bg,[245,240,230]);assert.equal(toHex(estimateTextColor(img,box,bg)),toHex(blue));
 assert.equal(estimateTextColor(image(30,20,[245,240,230],()=>undefined),box,bg),undefined);
});

test('right-to-left OCR text is put in reading order, keeping numbers as they read',async()=>{
 const {rtlReorder,separateLetters}=await import('../tmp/ai-image.mjs');
 // Visual order as the recognizer reads Arabic: last letter first.
 assert.equal(rtlReorder('ملاس'),'سالم');
 assert.equal(rtlReorder('2024 ماع'),'عام 2024');
 assert.equal(rtlReorder('PDF فلم'),'ملف PDF');
 assert.equal(separateLetters('cyrillic'),true);assert.equal(separateLetters('arabic'),false);
});

test('a line\'s outer word edges grow over the ink they cut through, but not across gaps',async()=>{
 const {growToInk}=await import('../tmp/ai-image.mjs');
 const columns=[0,0,2,3,4,9,9,0,9];
 assert.equal(growToInk(columns,5,-1,10),2,'left edge moves to the start of the serif');
 assert.equal(growToInk(columns,3,-1,1),2,'at most `limit` columns');
 assert.equal(growToInk(columns,5,1,10),7,'right edge stops at the gap');
 assert.equal(growToInk(columns,1,-1,10),1,'no ink beside it, no change');
});

test('the clicked object wins over a higher-scoring whole-scene mask',async()=>{
 const {pickMask}=await import('../tmp/ai-image.mjs');
 assert.equal(pickMask([.98,.914,.961],[233621,69721,35179]),2,'rectangle, not the background');
 assert.equal(pickMask([.913,1.013,.988],[264342,31220,30850]),2,'circle: either object mask is close');
 assert.equal(pickMask([.5,.9,.6],[10,0,20]),1,'empty masks are skipped unless nothing else qualifies');
});

test('a line split by the detector is joined; table cells and the next line are not',async()=>{
 const {mergeLineBoxes}=await import('../tmp/ai-image.mjs');
 const split=[{x0:0,y0:10,x1:60,y1:30},{x0:55,y0:11,x1:200,y1:31}];
 assert.deepEqual(mergeLineBoxes(split),[{x0:0,y0:10,x1:200,y1:31}]);
 const cells=[{x0:0,y0:10,x1:60,y1:30},{x0:120,y0:10,x1:180,y1:30}];
 assert.equal(mergeLineBoxes(cells).length,2,'a gap of 3 line heights keeps table cells apart');
 const lines=[{x0:0,y0:10,x1:200,y1:30},{x0:0,y0:32,x1:200,y1:52}];
 assert.equal(mergeLineBoxes(lines).length,2,'lines above each other stay apart');
});
