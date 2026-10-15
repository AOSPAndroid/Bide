import {test} from 'node:test';import assert from 'node:assert/strict';
import {penPathData,withHandles,nearPoint} from '../tmp/pen-path.mjs';
import {perspectivePixels,mapSquare} from '../tmp/perspective.mjs';
import {historyLabel} from '../tmp/history-labels.mjs';

test('pen anchors become lines and curves; closing joins the first point',()=>{
 assert.equal(penPathData([]),'');
 assert.equal(penPathData([{x:0,y:0},{x:10,y:0},{x:10,y:10}]),'M 0 0 L 10 0 L 10 10');
 assert.equal(penPathData([{x:0,y:0},{x:10,y:0},{x:10,y:10}],true),'M 0 0 L 10 0 L 10 10 L 0 0 Z');
 const smooth=withHandles({x:10,y:0},{x:15,y:5});
 assert.deepEqual(smooth,{x:10,y:0,out:{x:15,y:5},in:{x:5,y:-5}});
 assert.equal(penPathData([{x:0,y:0},smooth,{x:20,y:0}]),'M 0 0 C 0 0 5 -5 10 0 C 15 5 20 0 20 0');
 assert.deepEqual(withHandles({x:1,y:1},{x:1.5,y:1}),{x:1,y:1},'a click is a corner point');
 assert.ok(nearPoint({x:0,y:0},{x:3,y:4},5));assert.ok(!nearPoint({x:0,y:0},{x:3,y:4.1},5));
});

test('perspective maps the image onto four corners',()=>{
 // 2×2 image: red, green / blue, white.
 const src={width:2,height:2,data:[255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255]};
 // Identity: corners at the image's own size.
 const same=perspectivePixels(src,[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]);
 assert.equal(same.width,2);assert.equal(same.left,0);assert.deepEqual(Array.from(same.data),src.data);
 // Scaled to 20×20: corners keep their colours.
 const big=perspectivePixels(src,[{x:10,y:10},{x:30,y:10},{x:30,y:30},{x:10,y:30}]);
 assert.deepEqual([big.left,big.top,big.width,big.height],[10,10,20,20]);
 assert.deepEqual(Array.from(big.data.slice(0,4)),[255,0,0,255]);
 assert.deepEqual(Array.from(big.data.slice((19*20+19)*4,(19*20+19)*4+4)),[255,255,255,255]);
 // A keystone: outside the quad stays transparent.
 const key=perspectivePixels(src,[{x:5,y:0},{x:15,y:0},{x:20,y:20},{x:0,y:20}]);
 assert.equal(key.data[3],0,'top-left corner is outside the narrowed top');
 const mid=mapSquare([{x:5,y:0},{x:15,y:0},{x:20,y:20},{x:0,y:20}],.5,1);assert.deepEqual(mid,{x:10,y:20});
});

test('history steps get readable names',()=>{
 const page=(objects,extra={})=>({id:'p1',name:'Page',width:100,height:100,canvas:{objects},...extra});
 const base={name:'Doc',pages:[page([{id:'a',name:'Logo',type:'Image',left:0,top:0}])]};
 const withPage=(...objs)=>({...base,pages:[page(objs)]});
 assert.equal(historyLabel(base,{...base,name:'New'}),'Rename document');
 assert.equal(historyLabel(base,{name:'cat',pages:[{...page([]),id:'p9'}]}),'Open document');
 assert.equal(historyLabel(base,{...base,pages:[...base.pages,{...page([]),id:'p2'}]}),'Add page');
 assert.equal(historyLabel(base,withPage({id:'a',name:'Logo',type:'Image',left:0,top:0},{id:'b',name:'Title',type:'Textbox'})),'Add Title');
 assert.equal(historyLabel(base,withPage()),'Delete Logo');
 assert.equal(historyLabel(base,withPage({id:'a',name:'Logo',type:'Image',left:5,top:9})),'Move Logo');
 assert.equal(historyLabel(base,withPage({id:'a',name:'Logo',type:'Image',left:0,top:0,scaleX:2})),'Transform Logo');
 assert.equal(historyLabel(base,withPage({id:'a',name:'Logo',type:'Image',left:0,top:0,layerStyle:{}})),'Layer style Logo');
 assert.equal(historyLabel(base,{...base,pages:[page(base.pages[0].canvas.objects,{width:50})]}),'Resize page');
 assert.equal(historyLabel(base,{...base,pages:[page(base.pages[0].canvas.objects,{guides:{x:[10],y:[]}})]}),'Guides');
});
