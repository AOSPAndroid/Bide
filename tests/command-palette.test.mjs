import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {searchCommands,commandMetadata} from '../tmp/command-search.mjs';

test('workspace aliases rank navigation first and handle case, punctuation and multiple words',()=>{
 const commands=['Draw with brush','Open diagram workspace','Open photo editor','Open PDF MasterTool','Save editable diagram'].map(label=>({label,...commandMetadata(label)}));
 for(const q of ['visio','DRAW','diagram','draw.io','flowchart','network diagram'])assert.equal(searchCommands(commands,q)[0].label,'Open diagram workspace');
 assert.equal(searchCommands(commands,'photoshop')[0].label,'Open photo editor');
 assert.equal(searchCommands(commands,'ilovepdf')[0].label,'Open PDF MasterTool');
 assert.equal(searchCommands(commands,'save diagram')[0].label,'Save editable diagram');
 assert.equal(searchCommands(commands,'unmatched word').length,0);
 assert.deepEqual(searchCommands(commands,'  '),commands);
});

test('search retains contextual disabled reasons and matches dynamic page and font commands',()=>{
 const commands=[{label:'Set font: Poppins',disabled:'Select a text layer first'},{label:'Go to page 2: Contract'},{label:'Export pages as JPEG',keywords:'jpg image'}];
 assert.equal(searchCommands(commands,'poppins')[0].disabled,'Select a text layer first');
 assert.equal(searchCommands(commands,'page contract')[0].label,'Go to page 2: Contract');
 assert.equal(searchCommands(commands,'jpg')[0].label,'Export pages as JPEG');
});

test('diagram command bridge rejects other origins, non-allowlisted and disabled actions',()=>{
 let receive,checks=0,runs=0;const messages=[];let enabled=true;
 const parent={postMessage:(data)=>messages.push(JSON.parse(data))};
 const context={URL,location:{href:'https://bide.test/diagrams/runtime/index.html',origin:'https://bide.test'},parent,urlParams:{},checkAllLoaded:()=>{checks++;},addEventListener:(name,fn)=>{if(name==='message')receive=fn;},EditorUi:function(){}};
 context.window=context;context.EditorUi.prototype.init=function(){this.actions={get:id=>id==='zoomIn'?{label:'Zoom In',shortcut:'Ctrl +',isVisible:()=>true,isEnabled:()=>enabled,funct:()=>{runs++;}}:null};return 12;};
 vm.runInNewContext(readFileSync('public/diagrams/PreConfig.js','utf8'),context);context.checkAllLoaded();const ui=new context.EditorUi();assert.equal(ui.init(),12);assert.equal(checks,1);
 const send=(action,id,origin='https://bide.test',source=parent)=>receive({source,origin,data:JSON.stringify({action,id})});
 send('bide-list-commands');assert.equal(messages[0].commands[0].id,'zoomIn');
 send('bide-run-command','zoomIn','https://other.test');send('bide-run-command','zoomIn','https://bide.test',{});send('bide-run-command','deleteAll');assert.equal(runs,0);
 send('bide-run-command','zoomIn');assert.equal(runs,1);enabled=false;send('bide-run-command','zoomIn');assert.equal(runs,1);assert.equal(messages.at(-1).event,'bide-command-error');
});
