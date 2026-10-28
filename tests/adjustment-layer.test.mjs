import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rect,setEnv} from 'fabric';
import {AdjustmentLayer} from '../tmp/adjustment-layer.mjs';
import {needsRasterExport} from '../tmp/layer-style-render.mjs';

// A small in-memory backdrop, without a browser or native canvas dependency.
// The mask supplies known alpha samples; the real Fabric transform/opacity
// path and AdjustmentLayer renderer still run, so an isolated-cache regression
// changes the observed pixels (or trips renderCache below).
function bitmap(width=1,height=1,values){
 const canvas={width,height},data=values??new Uint8ClampedArray(width*height*4);
 let matrix=[1,0,0,1,0,0];const stack=[];
 const context={canvas,globalAlpha:1,
  save(){stack.push({matrix:[...matrix],alpha:this.globalAlpha});},
  restore(){const previous=stack.pop();matrix=previous.matrix;this.globalAlpha=previous.alpha;},
  setTransform(...m){matrix=m;},
  transform(a,b,c,d,e,f){const [A,B,C,D,E,F]=matrix;matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];},
  getTransform(){const [a,b,c,d,e,f]=matrix;return {a,b,c,d,e,f};},
  getImageData(){return {data:data.slice()};},
  putImageData(image){data.set(image.data);},
 };
 canvas.getContext=()=>context;return {canvas,context,data};
}

setEnv({document:{createElement:()=>bitmap(4,1).canvas},window:{devicePixelRatio:1}});
const layer=()=>new AdjustmentLayer({left:0,top:0,originX:'left',originY:'top',width:4,height:1,opacity:.5,
 adjustment:{kind:'levels',inBlack:0,inWhite:255,gamma:1,outBlack:200,outWhite:200}});
const backdrop=()=>bitmap(4,1,new Uint8ClampedArray([100,100,100,255,100,100,100,255,100,100,100,255,80,40,20,0]));

test('masked adjustments blend with the backdrop, preserving opacity and alpha',()=>{
 const adjustment=layer(),mask=new Rect({width:4,height:1});
 mask.render=ctx=>ctx.putImageData({data:new Uint8ClampedArray([255,255,255,255,255,255,255,0,255,255,255,128,255,255,255,255])},0,0);
 adjustment.set({clipPath:mask});
 assert.equal(adjustment.shouldCache(),true,'Fabric would force a clipped object into an isolated cache');
 adjustment.renderCache=()=>{throw new Error('An adjustment must read its backdrop, not an isolated cache.');};
 const image=backdrop();adjustment.render(image.context);
 assert.deepEqual([...image.data],[150,150,150,255,100,100,100,255,125,125,125,255,80,40,20,0]);
 mask.inverted=true;const inverse=backdrop();adjustment.render(inverse.context);
 assert.deepEqual([...inverse.data],[100,100,100,255,150,150,150,255,125,125,125,255,80,40,20,0]);
});

test('masked adjustments remain in the page stack until PDF/SVG flattening',()=>{
 const adjustment=layer(),mask=Object.assign(new Rect({width:4,height:1}),{layerMask:true});
 adjustment.set({clipPath:mask});
 assert.equal(needsRasterExport(adjustment),false,'isolating this layer during export would lose the backdrop');
 assert.equal(needsRasterExport(Object.assign(new Rect(),{clipPath:mask})),true,'ordinary painted masks still rasterize');
 const saved=adjustment.toObject();assert.equal(saved.adjustment.outBlack,200);assert.equal(saved.opacity,.5);assert.ok(saved.clipPath,'projects keep the editable mask');
});
