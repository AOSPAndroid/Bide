import {test} from 'node:test';import assert from 'node:assert/strict';
import {ocrScale,prepareOcrPixels,sampleBackground,estimateTextColor,toHex} from '../tmp/ocr-image.mjs';
function image(width,height,bg,fill){const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=fill(x,y)??bg;data.set([...c,255],(y*width+x)*4);}return {data,width,height};}
test('small screenshots are upscaled for OCR within the pixel budget',()=>{
 assert.equal(ocrScale(800,600),3);assert.equal(ocrScale(1920,1080),2);assert.equal(ocrScale(3600,2546),1);
 const s=ocrScale(2400,2400);assert.ok(s>1&&2400*2400*s*s<=12e6+1);
});
test('dark-mode images become dark text on a light background',()=>{
 const img=image(20,10,[30,32,40],(x)=>x===5?[235,235,240]:undefined);
 assert.equal(prepareOcrPixels(img).inverted,true);
 assert.ok(img.data[0]>200,'background turns light');assert.ok(img.data[5*4]<60,'text turns dark');
 const light=image(20,10,[250,250,250],(x)=>x===5?[20,20,20]:undefined);assert.equal(prepareOcrPixels(light).inverted,false);assert.ok(light.data[5*4]<60);
});
test('background ignores a stray pixel and text colour ignores anti-aliasing',()=>{
 const blue=[20,90,200],img=image(30,20,[245,240,230],(x,y)=>x===8&&y===4?[0,0,0]:x>=10&&x<20&&y>=7&&y<13?(x===10||x===19?[130,165,215]:blue):undefined);
 const box={x0:10,y0:7,x1:20,y1:13},bg=sampleBackground(img,box);
 assert.deepEqual(bg,[245,240,230]);assert.equal(toHex(estimateTextColor(img,box,bg)),toHex(blue));
 assert.equal(estimateTextColor(image(30,20,[245,240,230],()=>undefined),box,bg),undefined);
});
