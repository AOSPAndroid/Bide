import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PencilBrush, Point, Rect, SprayBrush, CircleBrush} from 'fabric';
import {clampZoom, fitZoom, markerColor} from '../tmp/editor-tools.mjs';
import {exportRequestId, imageDataBlob, DIAGRAM_URL} from '../tmp/diagram-data.mjs';
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

test('diagram source survives layer cloning and project serialization', async () => {
  const layer=new Rect({width:100,height:50});
  layer.diagramXml='<mxfile><diagram id="1"/></mxfile>';
  const copy=await layer.clone();
  assert.equal(copy.diagramXml,layer.diagramXml);
  assert.equal(JSON.parse(JSON.stringify(copy.toObject())).diagramXml,layer.diagramXml);
});

test('tiny workspace and extreme wheel input cannot create zero or unbounded canvas sizes', () => {
  assert.equal(fitZoom(5000,5000,80,80),0.1);
  assert.equal(clampZoom(-50),0.1);
  assert.equal(clampZoom(100),8);
  assert.equal(clampZoom(NaN),1);
  assert.ok(fitZoom(595,842,1000,900)>0.1);
});

test('draw.io export replies match both PNG string envelopes and SVG object envelopes', () => {
  assert.equal(exportRequestId('{"requestId":"png-job"}'),'png-job');
  assert.equal(exportRequestId({requestId:'svg-job'}),'svg-job');
  assert.equal(exportRequestId('{broken'),undefined);
  assert.equal(exportRequestId({event:'save'}),undefined);
  assert.ok(DIAGRAM_URL.startsWith('./diagrams/runtime/'));
});

test('diagram exports accept embedded images and never fetch arbitrary URLs', async () => {
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>café</text></svg>';
  assert.equal(await imageDataBlob('data:image/svg+xml,'+encodeURIComponent(svg),'svg').text(),svg);
  assert.deepEqual([...new Uint8Array(await imageDataBlob('data:image/png;base64,iVBORw==','png').arrayBuffer())],[137,80,78,71]);
  for (const value of ['https://example.com/diagram.png','data:text/html,<script>bad</script>','data:image/svg+xml,<svg/>']) assert.throws(()=>imageDataBlob(value,'png'),/invalid image/);
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
