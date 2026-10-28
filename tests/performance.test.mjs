import {test} from 'node:test';import assert from 'node:assert/strict';
import {thumbnailScale,editorPreviewScale,pdfRasterScale,canvasBackingScale} from '../tmp/render-budget.mjs';
import {recognizeImage} from '../tmp/ocr-core.mjs';
test('large and zoomed pages keep thumbnail raster work within 200 pixels',()=>{for(const [w,h] of [[6000,4000],[24000,16000],[595,842],[100,50]]){const scale=thumbnailScale(w,h);assert.ok(w*scale<=200&&h*scale<=200);assert.ok(scale>0&&scale<=1);}assert.equal(thumbnailScale(100,50),1);});
test('cancelled OCR jobs reject before loading the browser worker',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(recognizeImage(null,{signal:controller.signal}),{name:'AbortError'});await assert.rejects(recognizeImage(null,{signal:controller.signal}),{name:'AbortError'});});

test('PDF preview follows zoom and display density within a bounded raster budget',()=>{
 assert.equal(editorPreviewScale(1,2),2);assert.equal(editorPreviewScale(2,2),300/72);
 assert.equal(pdfRasterScale(595,842,300/72),300/72);
 for(const [w,h] of [[24000,16000],[100,50000],[595,842]]){const scale=pdfRasterScale(w,h,100);assert.ok(w*h*scale*scale<=16000001);assert.ok(Math.max(w,h)*scale<=8192.001);}
 assert.equal(editorPreviewScale(1.01),editorPreviewScale(1.2));
});

test('the editor canvas backing store stays within the budget at any zoom, lowering density first',()=>{
 assert.equal(canvasBackingScale(232,328,3,16e6),3,'a fitted page keeps the screen density');
 // A4 at 800% on a 3x phone asked for 289M pixels; a 12 MP photo at 800% for 6.3G.
 for(const [w,h] of [[595*8,842*8],[3024*8,4032*8],[400*8,8000*8]]){const s=canvasBackingScale(w,h,3,16e6);assert.ok(w*h*s*s<=16000001&&Math.max(w,h)*s<=16384.001,`${w}×${h} at ${s}`);}
 assert.ok(canvasBackingScale(595*2,842*2,3,16e6)>2.8&&canvasBackingScale(3024*8,4032*8,3,16e6)<1,'retina density goes first, then below one pixel per CSS pixel');
 assert.ok(canvasBackingScale(595*8,842*8,2,128e6)>1.99,'a desktop retina screen keeps its density up to A4 at 800%');
});
