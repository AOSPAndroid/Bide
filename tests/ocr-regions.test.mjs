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
 // A placeholder cell (ink with no character) does not shift the letters after it.
 assert.deepEqual(doubtfulLetters({text:'a b',glyphs:[{ch:'a',p:.9},{ch:'\uFFFC'},{ch:'b',p:.3}]}),[2]);
});
test('a tilted line is a level box turned about its centre; lines tilted alike only shift between frames',async()=>{
 const {frameOf,turn,turnedQuad,turnedBounds,inFrame}=await import('../tmp/ocr-regions.mjs');
 const a={...region('Total',100,50,100,20),angle:90,glyphs:[{ch:'T',x0:100,x1:120}]},f=frameOf(a),near=(p,x,y)=>Math.abs(p.x-x)<1e-9&&Math.abs(p.y-y)<1e-9;
 assert.deepEqual(f,{angle:90,cx:150,cy:60});
 const p=turn(f,200,60);assert.ok(near(p,150,110),'the right end of the box turns below its centre (clockwise)');
 assert.ok(near(turn(f,p.x,p.y,true),200,60));
 assert.equal(turnedQuad(f,a).length,4);
 const b=turnedBounds(f,a);assert.ok(near({x:b.left,y:b.top},140,10)&&near({x:b.width,y:b.height},20,100));
 assert.equal(turnedBounds(frameOf(region('x',1,2)),region('x',1,2)).left,1,'a level box is its own bounds');
 assert.equal(inFrame(f,a),a,'a line is at home in its own frame');
 // Another line of the same page, 40 px below this one in its level frame.
 const at=turn(f,150,100),d={...region('Due',at.x-50,at.y-10,100,20),angle:90,glyphs:[{ch:'D',x0:at.x-50,x1:at.x-40}]},m=inFrame(f,d);
 assert.ok(Math.abs(m.left-100)<1e-9&&Math.abs(m.top-90)<1e-9&&Math.abs(m.glyphs[0].x0-100)<1e-9,'it only shifts into the frame');
 assert.equal(inFrame(f,{...d,angle:45}),undefined,'a line tilted otherwise has no place in the frame');
 const n=inFrame(f,{...d,angle:91},3);assert.ok(Math.abs(n.left-100)<1e-9&&Math.abs(n.top-90)<1e-9,'unless nearly level with it: then it is placed by its centre');
 const level=region('Level',0,0);assert.equal(inFrame(frameOf(level),level),level);assert.equal(inFrame(frameOf(level),a),undefined);
});
test('scaling keeps a tilted line\'s angle, and follows uneven scales',()=>{
 const [r]=scaleRegions([{...region('Hi',100,50,40,20),angle:-2.5}],.5,.5);assert.equal(r.angle,-2.5);
 const [s]=scaleRegions([{...region('Hi',100,50,40,20),angle:45}],1,2);assert.ok(Math.abs(s.angle-Math.atan(2)*180/Math.PI)<1e-9);
 assert.equal('angle' in scaleRegions([region('Hi',1,1)],.5,.25)[0],false,'a level line stays without an angle');
});
test('a field target grows evenly around a small line, so the middle of each line is its own',async()=>{
 const {fieldBox}=await import('../tmp/ocr-regions.mjs');
 // Lines 16 pt apart, 12 pt tall, seen at 35%: 4.2 px tall, under the 10 px minimum.
 const lines=[0,1,2].map(i=>({left:70,top:160+i*16,width:180,height:12})),boxes=lines.map(l=>fieldBox(l,.35));
 boxes.forEach((b,i)=>{assert.equal(b.height,10);assert.ok(Math.abs(b.top+b.height/2-(lines[i].top+6)*.35)<1e-9,'centred on its line');});
 // The next line's target (drawn on top) does not reach this line's middle.
 for(let i=0;i<2;i++)assert.ok(boxes[i+1].top>(lines[i].top+6)*.35);
 assert.deepEqual(fieldBox({left:10,top:20,width:100,height:30},2),{left:20,top:40,width:200,height:60,transform:undefined});
 assert.equal(fieldBox({left:0,top:0,width:2,height:2,angle:-2.5},1).transform,'rotate(-2.5deg)');
});
