import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutOffsets} from '../tmp/design-layout.mjs';
const page={left:0,top:0,width:800,height:600};
test('single layer alignment uses page edges and centers',()=>{const b=[{left:40,top:50,width:100,height:60}];assert.deepEqual(layoutOffsets(b,'right',page),[{x:660,y:0}]);assert.deepEqual(layoutOffsets(b,'middle',page),[{x:0,y:220}]);});
test('multiple alignment uses selection bounds without mutating input',()=>{const b=[{left:20,top:40,width:100,height:20},{left:200,top:100,width:60,height:40}];const copy=structuredClone(b);assert.deepEqual(layoutOffsets(b,'right',page),[{x:140,y:0},{x:0,y:0}]);assert.deepEqual(layoutOffsets(b,'top',page),[{x:0,y:0},{x:0,y:-60}]);assert.deepEqual(b,copy);});
test('equal spacing accounts for unequal sizes and retains outer edges',()=>{const b=[{left:300,top:20,width:100,height:20},{left:0,top:50,width:20,height:20},{left:100,top:0,width:80,height:20}];assert.deepEqual(layoutOffsets(b,'distribute-x',page),[{x:0,y:0},{x:0,y:0},{x:20,y:0}]);});
test('row and column arrange with explicit gaps in spatial order',()=>{const b=[{left:30,top:50,width:50,height:30},{left:140,top:10,width:20,height:10}];assert.deepEqual(layoutOffsets(b,'row',page,16),[{x:0,y:-40},{x:-44,y:0}]);assert.deepEqual(layoutOffsets(b,'column',page,16),[{x:0,y:-14},{x:-110,y:0}]);});
test('insufficient selection and invalid spacing remain safe',()=>{const b=[{left:10,top:20,width:30,height:40}];assert.deepEqual(layoutOffsets(b,'distribute-y',page),[{x:0,y:0}]);assert.deepEqual(layoutOffsets([],'row',page),[]);assert.equal(layoutOffsets([...b,{left:100,top:20,width:20,height:40}],'row',page,NaN)[1].x,-44);});
