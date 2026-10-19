import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rasterSearchWords} from '../tmp/searchable-text.mjs';

test('searchable raster words exclude native replacement text but retain adjacent image words',()=>{
 const current=[
  {text:'Dalil',left:10,top:10,width:35,height:12},
  {text:'Invoice',left:80,top:10,width:45,height:12},
  {text:'',left:10,top:40,width:30,height:12}
 ];
 const native=[{left:9,top:9,width:38,height:16}];
 assert.deepEqual(rasterSearchWords(current,native).map(r=>r.text),['Invoice']);
 assert.deepEqual(rasterSearchWords(current,[]).map(r=>r.text),['Dalil','Invoice']);
});

test('native text on another line does not suppress a scanned word',()=>{
 const word={text:'visible',left:20,top:20,width:40,height:12};
 assert.deepEqual(rasterSearchWords([word],[{left:20,top:40,width:40,height:12}]),[word]);
});

test('empty text and blank textbox padding do not suppress neighboring image words',()=>{
 const words=[{text:'Dalil',left:10,top:10,width:35,height:12},{text:'Invoice',left:80,top:10,width:45,height:12}];
 const wide={left:9,top:9,width:300,height:16};
 assert.deepEqual(rasterSearchWords(words,[{...wide,text:''}]),words);
 assert.deepEqual(rasterSearchWords(words,[{...wide,text:'Dalil'}]).map(r=>r.text),['Invoice']);
});
