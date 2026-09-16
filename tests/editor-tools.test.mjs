import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PencilBrush, Point, Rect} from 'fabric';
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
