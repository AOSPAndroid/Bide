import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyLayerStyle,effectDefaults,effectExtent,hasEffects,lightOffset,hexRgb} from '../tmp/layer-effects.mjs';

// W×H transparent buffer with an opaque white square [x0,x1)×[y0,y1).
function square(w,h,x0,y0,x1,y1,rgb=[255,255,255]){
 const d=new Uint8ClampedArray(w*h*4);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)d.set([...rgb,255],(y*w+x)*4);
 return d;
}
const px=(d,w,x,y)=>Array.from(d.slice((y*w+x)*4,(y*w+x)*4+4));
const W=60,H=60,img=square(W,H,20,20,40,40);

test('effect switches and reach',()=>{
 assert.equal(hasEffects(undefined),false);assert.equal(hasEffects({dropShadow:{...effectDefaults.dropShadow,enabled:false}}),false);
 assert.equal(hasEffects({stroke:effectDefaults.stroke}),true);
 assert.equal(effectExtent({stroke:{...effectDefaults.stroke,size:4}}),6);
 assert.equal(effectExtent({stroke:{...effectDefaults.stroke,size:4,position:'inside'}}),0);
 const o=lightOffset(120,10);assert.ok(o.x>4.9&&o.x<5.1&&o.y>8.6&&o.y<8.7,'light from the top left casts down and right');
 assert.deepEqual(hexRgb('#00aeef'),[0,174,239]);
});

test('drop shadow falls away from the light, below the layer',()=>{
 const out=applyLayerStyle(img,W,H,{dropShadow:{...effectDefaults.dropShadow,angle:90,distance:8,size:0,opacity:100,color:'#ff0000'}});
 assert.deepEqual(px(out,W,30,30),[255,255,255,255],'layer stays on top');
 assert.deepEqual(px(out,W,30,45),[255,0,0,255],'shadow below the square (light from above)');
 assert.equal(px(out,W,30,15)[3],0,'nothing above');
});

test('outside stroke rings the shape without covering it; inside stroke covers its edge',()=>{
 const outside=applyLayerStyle(img,W,H,{stroke:{...effectDefaults.stroke,size:3,color:'#0000ff'}});
 assert.deepEqual(px(outside,W,18,30),[0,0,255,255],'2px outside');
 assert.equal(px(outside,W,15,30)[3],0,'5px outside is clear');
 assert.deepEqual(px(outside,W,21,30),[255,255,255,255],'edge pixel stays white');
 const inside=applyLayerStyle(img,W,H,{stroke:{...effectDefaults.stroke,size:3,position:'inside',color:'#0000ff'}});
 assert.deepEqual(px(inside,W,21,30),[0,0,255,255],'inner edge is stroked');
 assert.deepEqual(px(inside,W,30,30),[255,255,255,255],'centre untouched');
 assert.equal(px(inside,W,18,30)[3],0,'nothing outside');
});

test('colour overlay recolours only the layer; glow surrounds it softly',()=>{
 const over=applyLayerStyle(img,W,H,{colorOverlay:{enabled:true,color:'#00ff00',opacity:100}});
 assert.deepEqual(px(over,W,30,30),[0,255,0,255]);assert.equal(px(over,W,10,10)[3],0);
 const half=applyLayerStyle(img,W,H,{colorOverlay:{enabled:true,color:'#000000',opacity:50}});
 assert.deepEqual(px(half,W,30,30).slice(0,3),[128,128,128]);
 const glow=applyLayerStyle(img,W,H,{outerGlow:{...effectDefaults.outerGlow,size:6,opacity:100,color:'#ffff00'}});
 const near=px(glow,W,18,30)[3],far=px(glow,W,10,30)[3];
 assert.ok(near>far&&near>40,`glow fades with distance (${near} > ${far})`);
});

test('gradient overlay runs across the layer along the angle',()=>{
 const g=applyLayerStyle(img,W,H,{gradientOverlay:{enabled:true,from:'#000000',to:'#ffffff',angle:0,opacity:100}});
 assert.ok(px(g,W,20,30)[0]<15,'left edge starts at the first colour');
 assert.ok(px(g,W,39,30)[0]>240,'right edge reaches the second colour');
 assert.ok(px(g,W,30,30)[0]>110&&px(g,W,30,30)[0]<150,'middle is between');
});

test('inner shadow darkens the edge facing the light',()=>{
 const s=applyLayerStyle(img,W,H,{innerShadow:{...effectDefaults.innerShadow,angle:90,distance:4,size:0,opacity:100}});
 assert.deepEqual(px(s,W,30,21),[0,0,0,255],'top inside edge shadowed');
 assert.deepEqual(px(s,W,30,38),[255,255,255,255],'bottom edge lit');
 assert.equal(px(s,W,30,10)[3],0,'clipped to the layer');
});
