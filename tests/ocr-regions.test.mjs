import {test} from 'node:test';import assert from 'node:assert/strict';
import {recognitionKey,scaleRegions,unconvertedRegions,ocrPatchBounds,ocrScanStatus} from '../tmp/ocr-regions.mjs';
const region=(text,left,top,width=40,height=10)=>({id:text,text,left,top,width,height,size:height/.75,baseline:top+height,fontName:'',bold:false,italic:false,color:'#000',kind:'ocr'});
test('OCR boxes scale from raster pixels back to page units',()=>{
 const [r]=scaleRegions([region('Hi',100,50,40,20)],.5,.25);
 assert.deepEqual([r.left,r.top,r.width,r.height,r.baseline],[50,12.5,20,5,17.5]);assert.equal(r.size,20/.75*.25);
});
test('converted regions are hidden by key or by a covering OCR text layer',()=>{
 const a=region('Hello',10,10),b=region('World',100,10),c=region('Other',300,300);
 const layers=[{recognizedKey:recognitionKey(a),bounds:{left:0,top:0,width:1,height:1}},{recognizedKey:'ocr:0:0:Edited',bounds:{left:90,top:0,width:80,height:40}},{recognizedKey:'pdf:300:300:Other',bounds:{left:290,top:290,width:80,height:40}},{bounds:{left:0,top:0,width:999,height:999}}];
 assert.deepEqual(unconvertedRegions([a,b,c],layers).map(r=>r.text),['Other']);
});
test('patch padding is automatic, custom, and clamped to the page',()=>{
 assert.deepEqual(ocrPatchBounds({left:10,top:10,width:50,height:40},-1,{width:500,height:500}),{left:6,top:6,width:58,height:48});
 assert.deepEqual(ocrPatchBounds({left:1,top:1,width:50,height:10},5,{width:54,height:500}),{left:0,top:0,width:54,height:16});
});
test('scan status reflects what was found',()=>{
 assert.match(ocrScanStatus(3,'English',false),/3 OCR regions · English/);
 assert.match(ocrScanStatus(0,'English',true),/converted/);assert.match(ocrScanStatus(0,'English',false),/No text/);
});
