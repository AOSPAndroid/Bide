import {test} from 'node:test';import assert from 'node:assert/strict';
import {thumbnailScale} from '../tmp/render-budget.mjs';
import {recognizeImage} from '../tmp/ocr-core.mjs';
test('large and zoomed pages keep thumbnail raster work within 200 pixels',()=>{for(const [w,h] of [[6000,4000],[24000,16000],[595,842],[100,50]]){const scale=thumbnailScale(w,h);assert.ok(w*scale<=200&&h*scale<=200);assert.ok(scale>0&&scale<=1);}assert.equal(thumbnailScale(100,50),1);});
test('cancelled OCR jobs reject before loading the browser worker',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(recognizeImage(null,controller.signal),{name:'AbortError'});await assert.rejects(recognizeImage(null,controller.signal),{name:'AbortError'});});
