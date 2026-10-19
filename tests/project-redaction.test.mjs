import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeProjectSources,remainingForms} from '../tmp/project-redaction.mjs';

test('redaction sanitizes older sibling PDF versions and remaps only their used pages',async()=>{
 const project={version:1,name:'Two versions',sources:{old:'hidden original first page',redacted:'redacted first page',unused:'unused source'},pages:[
  {id:'a',source:'redacted',index:0,canvas:{}},
  {id:'b',source:'old',index:1,canvas:{}},
  {id:'c',source:'old',index:3,canvas:{}},
  {id:'d',source:'old',index:1,canvas:{}},
  {id:'image',index:0,canvas:{}}
 ]};
 const calls=[];
 const clean=await sanitizeProjectSources(project,async(source,indexes)=>{calls.push([source,indexes]);return {id:'clean-'+source,data:JSON.stringify(indexes)};});
 assert.deepEqual(calls,[['redacted',[0]],['old',[1,3]]]);
 assert.deepEqual(clean.pages.map(p=>[p.source,p.index]),[['clean-redacted',0],['clean-old',0],['clean-old',1],['clean-old',0],[undefined,0]]);
 assert.deepEqual(clean.sources,{'clean-redacted':'[0]','clean-old':'[1,3]'});
 assert.equal(project.sources.old,'hidden original first page');
 assert.equal(project.pages[2].index,3);
});

test('redaction drops intersecting added form fields and their hidden values',()=>{
 const secret={id:'secret',value:'hidden secret',left:10,top:10,width:50,height:15};
 const safe={id:'safe',value:'keep me',left:100,top:10,width:50,height:15};
 assert.deepEqual(remainingForms([secret,safe],[{left:15,top:15,width:5,height:5}]),[safe]);
 assert.equal(secret.value,'hidden secret');
});
