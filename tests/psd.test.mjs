import {Rect} from 'fabric';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {writePsd,readPsd,initializeCanvas} from 'ag-psd';
import {validatePsdHeader,requiresComposite,needsFlattenedPsd} from '../tmp/psd-core.mjs';
initializeCanvas(()=>{throw new Error('Tests use raw image data, not a native canvas.');},(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
const pixels=(w,h,color)=>({width:w,height:h,data:Uint8ClampedArray.from(Array.from({length:w*h},()=>color).flat())});
const sample={width:320,height:200,imageData:pixels(320,200,[190,215,196,255]),children:[{name:'Sage background',top:0,left:0,imageData:pixels(320,200,[190,215,196,255])},{name:'Blue square',top:45,left:85,opacity:.7,blendMode:'multiply',imageData:pixels(100,80,[40,100,210,255])}]};
const bytes=new Uint8Array(writePsd(sample));
await mkdir('tmp/psd',{recursive:true});await writeFile('tmp/psd/layers.psd',bytes);
test('PSD raster interchange preserves dimensions, names, position, opacity, blend and pixels',()=>{
 validatePsdHeader(bytes);
 const psd=readPsd(bytes,{useImageData:true,skipThumbnail:true});assert.equal(psd.width,320);assert.equal(psd.height,200);
 assert.equal(psd.children.length,2);const layer=psd.children[1];assert.equal(layer.name,'Blue square');assert.equal(layer.left,85);assert.equal(layer.top,45);assert.equal(layer.blendMode,'multiply');assert.ok(Math.abs(layer.opacity-.7)<.005);assert.deepEqual([...layer.imageData.data.subarray(0,4)],[40,100,210,255]);assert.equal(requiresComposite(psd),false);
});
test('PSD header rejects truncated, PSB, excessive dimensions and unsupported color depth',()=>{
 assert.throws(()=>validatePsdHeader(bytes.subarray(0,10)),/incomplete/);
 for(const [offset,value,message] of [[4,2,/PSB/],[22,16,/8-bit RGB/],[24,4,/8-bit RGB/]]){const bad=bytes.slice();new DataView(bad.buffer).setUint16(offset,value);assert.throws(()=>validatePsdHeader(bad),message);}
 const huge=bytes.slice();new DataView(huge.buffer).setUint32(18,6000);assert.throws(()=>validatePsdHeader(huge),/5000/);
});
test('Photoshop features outside the supported raster subset use the composite preview',async()=>{
 for(const extra of [{mask:{}},{effects:{}},{adjustment:{}},{placedLayer:{}},{clipping:true},{blendMode:'dissolve'}])assert.equal(requiresComposite({width:100,height:100,children:[extra]}),true);
 const grouped={...sample,children:[{name:'Group',blendMode:'normal',children:sample.children}]};await writeFile('tmp/psd/grouped.psd',new Uint8Array(writePsd(grouped)));
});

test('new editor objects use top-left coordinates under Fabric 7',()=>{const r=new Rect({left:10,top:20,width:100,height:80});assert.equal(r.originX,'left');assert.equal(r.originY,'top');assert.equal(r.getBoundingRect().left,10);assert.equal(r.getBoundingRect().top,20);});


test('normal nested PSD groups remain editable; unsupported descendants and pass-through blends fall back',()=>{
 assert.equal(requiresComposite({width:100,height:100,children:[{name:'Outer',blendMode:'normal',children:[{name:'Inner',blendMode:'normal',children:[{name:'Pixels'}]}]}]}),false);
 assert.equal(requiresComposite({width:100,height:100,children:[{blendMode:'pass through',children:[{blendMode:'normal'}]}]}),false);
 assert.equal(requiresComposite({width:100,height:100,children:[{blendMode:'pass through',children:[{blendMode:'multiply'}]}]}),true);
 assert.equal(requiresComposite({width:100,height:100,children:[{blendMode:'normal',children:[{effects:{}}]}]}),true);
 assert.equal(needsFlattenedPsd([new Rect({globalCompositeOperation:'destination-out'})]),true);
 assert.equal(needsFlattenedPsd([new Rect({globalCompositeOperation:'multiply'})]),false);
});
