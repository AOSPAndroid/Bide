import {test} from 'node:test';import assert from 'node:assert/strict';
import {thumbnailScale,editorPreviewScale,pdfRasterScale} from '../tmp/render-budget.mjs';
import {recognizeImage} from '../tmp/ocr-core.mjs';
test('large and zoomed pages keep thumbnail raster work within 200 pixels',()=>{for(const [w,h] of [[6000,4000],[24000,16000],[595,842],[100,50]]){const scale=thumbnailScale(w,h);assert.ok(w*scale<=200&&h*scale<=200);assert.ok(scale>0&&scale<=1);}assert.equal(thumbnailScale(100,50),1);});
test('cancelled OCR jobs reject before loading the browser worker',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(recognizeImage(null,controller.signal),{name:'AbortError'});await assert.rejects(recognizeImage(null,controller.signal),{name:'AbortError'});});

test('PDF preview follows zoom and display density within a bounded raster budget',()=>{
 assert.equal(editorPreviewScale(1,2),2);assert.equal(editorPreviewScale(2,2),300/72);
 assert.equal(pdfRasterScale(595,842,300/72),300/72);
 for(const [w,h] of [[24000,16000],[100,50000],[595,842]]){const scale=pdfRasterScale(w,h,100);assert.ok(w*h*scale*scale<=16000001);assert.ok(Math.max(w,h)*scale<=8192.001);}
 assert.equal(editorPreviewScale(1.01),editorPreviewScale(1.2));
});
