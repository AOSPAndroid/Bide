import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PencilBrush, Point, Rect, SprayBrush, CircleBrush, util} from 'fabric';
import {clampZoom, fitZoom, markerColor} from '../tmp/editor-tools.mjs';
import '../tmp/psd-core.mjs'; // Registers the editor's serialized custom properties.

test('marker drawing makes a curved translucent path whose appearance survives serialization', async () => {
  const brush=new PencilBrush(null);
  brush.color=markerColor('#ffe066',38);brush.width=22;
  const path=brush.createPath(brush.convertPointsToSVGPath([new Point(0,0),new Point(20,30),new Point(50,0),new Point(80,40)]));
  assert.ok(path.path.some(command=>command[0]==='Q'));
  const serialized=path.toObject();
  const restored=await path.constructor.fromObject(serialized);
  assert.equal(restored.stroke,'rgba(255,224,102,0.38)');
  assert.equal(restored.strokeWidth,22);
  assert.deepEqual(restored.path,path.path);
});

test('a layer placed from the removed diagram workspace still loads, and its draw.io source is dropped on save', async () => {
  // Projects saved before the Documents workspace carry diagramXml on placed images.
  const saved={...new Rect({width:100,height:50}).toObject(),id:'old',name:'Process flow',diagramXml:'<mxfile><diagram id="1"/></mxfile>'};
  const [layer]=await util.enlivenObjects([saved]);
  assert.ok(layer instanceof Rect);assert.equal(layer.name,'Process flow');assert.equal(layer.width,100);
  const resaved=JSON.parse(JSON.stringify(layer.toObject()));
  assert.equal(resaved.id,'old');assert.equal('diagramXml' in resaved,false);
});

test('tiny workspace and extreme wheel input cannot create zero or unbounded canvas sizes', () => {
  assert.equal(fitZoom(5000,5000,80,80),0.1);
  assert.equal(clampZoom(-50),0.1);
  assert.equal(clampZoom(100),8);
  assert.equal(clampZoom(NaN),1);
  assert.ok(fitZoom(595,842,1000,900)>0.1);
  // Phones pass their measured margins: A4 in a 350 px wide workspace fills it instead of 39%.
  assert.equal(fitZoom(595,842,1088,781),fitZoom(595,842,1088,781,{x:120,y:100}),'desktop margins by default');
  assert.ok(fitZoom(595,842,350,595,{x:28,y:56})>0.53&&fitZoom(595,842,350,595)<0.4);
});

test('brush styles, bounds and eraser compositing survive editable project restoration', async () => {
  const {makeBrush,makeEraserStroke,brushWidth}=await import('../tmp/brushes.mjs');
  const round=makeBrush(null,'round','#00395d',24,50);
  assert.equal(round.width,24);assert.equal(round.strokeLineCap,'round');assert.equal(round.color,'rgba(0,57,93,0.5)');
  assert.equal(makeBrush(null,'square','#00395d',24,100).strokeLineCap,'square');
  assert.ok(makeBrush(null,'spray','#00395d',24,100) instanceof SprayBrush);
  assert.ok(makeBrush(null,'dots','#00395d',24,100) instanceof CircleBrush);
  assert.equal(brushWidth(Infinity),1);assert.equal(brushWidth(-2),1);assert.equal(brushWidth(999),200);
  const erase=round.createPath(round.convertPointsToSVGPath([new Point(10,10),new Point(30,50)]));
  makeEraserStroke(erase);
  const restored=await erase.constructor.fromObject(JSON.parse(JSON.stringify(erase.toObject())));
  assert.equal(restored.globalCompositeOperation,'destination-out');assert.equal(restored.stroke,'#000000');assert.equal(restored.strokeWidth,24);
});


test('selection masks follow transformed layers and survive serialization', async()=>{
  const {selectionMask,rectanglePoints}=await import('../tmp/selection-mask.mjs');
  const {util}=await import('fabric');
  const object=new Rect({left:80,top:120,width:200,height:100,scaleX:1.7,scaleY:.8,angle:35,flipX:true,originX:'left',originY:'top',strokeWidth:0});
  const local=rectanglePoints({x:-70,y:-30},{x:30,y:20});
  const world=local.map(p=>util.transformPoint(new Point(p.x,p.y),object.calcTransformMatrix()));
  const mask=selectionMask(object,world,true);
  assert.ok(Math.abs(mask.left+70)<1e-8);assert.ok(Math.abs(mask.top+30)<1e-8);assert.ok(Math.abs(mask.width-100)<1e-8);assert.ok(Math.abs(mask.height-50)<1e-8);
  object.clipPath=mask;const restored=await object.clone();assert.equal(restored.clipPath.inverted,true);assert.deepEqual(restored.clipPath.path,mask.path);
  assert.throws(()=>selectionMask(object,[{x:0,y:0},{x:1,y:1},{x:2,y:2}]),/too small/);
});

test('direct rendering survives layer serialization and reload',async()=>{
 const shape=new Rect({width:100,height:20,objectCaching:false});
 const saved=shape.toObject();assert.equal(saved.objectCaching,false);
 const restored=await Rect.fromObject(saved);assert.equal(restored.objectCaching,false);
});
