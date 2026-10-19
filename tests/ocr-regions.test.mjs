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
test('low-confidence OCR regions are flagged for proofreading',async()=>{
 const {isUncertain}=await import('../tmp/ocr-regions.mjs');
 assert.equal(isUncertain({kind:'ocr',confidence:55}),true);assert.equal(isUncertain({kind:'ocr',confidence:88}),false);
 assert.equal(isUncertain({kind:'ocr'}),false);assert.equal(isUncertain({kind:'pdf',confidence:10}),false);
 assert.match(ocrScanStatus(5,'English',false,2),/5 OCR regions · 2 to check/);
});
test('a bold label keeps its weight next to a regular value',async()=>{
 const {mixedWeights}=await import('../tmp/ocr-regions.mjs');
 const words=['Nom','du','client:','Dalil','REDOUANE','/','pour','6','adultes'].map(text=>({text}));
 const {base,ranges}=mixedWeights(words,[true,true,true,false,false,undefined,false,false,false]);
 assert.equal(base,false);assert.deepEqual(ranges,[{start:0,end:14,bold:true}]);
 assert.equal(words.map(w=>w.text).join(' ').slice(0,14),'Nom du client:');
 assert.deepEqual(mixedWeights([{text:'Répas:'},{text:'é'}],[true,false]),{base:true,ranges:[{start:7,end:8,bold:false}]});
 assert.deepEqual(mixedWeights(words.slice(0,2),[undefined,undefined]),{base:false,ranges:[]});
 // Unknown punctuation follows its neighbour: the bold amount's symbol stays bold.
 assert.deepEqual(mixedWeights(['Prix','1','284,99','€','taxes'].map(text=>({text})),[false,true,true,undefined,false]).ranges,[{start:5,end:15,bold:true}]);
});
test('the cleanup margin stops at neighbouring lines and words',()=>{
 const line={left:10,top:100,width:300,height:14},below={left:10,top:115,width:280,height:14},above={left:12,top:85,width:200,height:14},next={left:313,top:100,width:40,height:14},far={left:400,top:300,width:20,height:10};
 assert.deepEqual(ocrPatchBounds(line,-1,{width:500,height:500},[below,above,next,far]),{left:8,top:99,width:304,height:16},'stops at the line above (99), the line below (115) and the next word (312 inside its 313 edge)');
 assert.deepEqual(ocrPatchBounds(line,-1,{width:500,height:500}),{left:8,top:98,width:304,height:18},'no neighbours: unchanged');
 const overlapping={left:10,top:112,width:280,height:14};
 assert.equal(ocrPatchBounds(line,-1,{width:500,height:500},[overlapping]).height,112-98,'a next line overlapping our descenders still stops the patch');
});
test('a lone digit or currency sign takes the weight of its number',async()=>{
 const {attachNumberParts}=await import('../tmp/ocr-regions.mjs');
 const texts=['Prix','total','1','284,99','€','taxes'];
 assert.deepEqual(attachNumberParts(texts,[false,false,false,true,false,false]),[false,false,true,true,true,false]);
 assert.deepEqual(attachNumberParts(['pour','6','adultes'],[false,true,false]),[false,true,false],'no number next to it: unchanged');
});

test('doubtful letters map to text positions, skipping spaces',async()=>{
 const {doubtfulLetters}=await import('../tmp/ocr-regions.mjs');
 const region={text:'Dal iil',glyphs:[{p:.99},{p:.98},{p:.97},{p:.95},{p:.4},{p:.9}]};
 assert.deepEqual(doubtfulLetters(region),[5]);
 assert.deepEqual(doubtfulLetters({text:'abc'}),[]);
});
