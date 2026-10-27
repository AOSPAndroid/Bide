import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchCommands,commandMetadata} from '../tmp/command-search.mjs';

test('workspace aliases rank navigation first and handle case, punctuation and multiple words',()=>{
 const commands=['Draw with brush','Open Documents workspace','Open photo editor','Open PDF MasterTool','Add form field: Text'].map(label=>({label,...commandMetadata(label)}));
 for(const q of ['documents','Invoice','facture','e-invoice','Factur-X','forms'])assert.equal(searchCommands(commands,q)[0].label,'Open Documents workspace');
 assert.equal(searchCommands(commands,'visio').length,0);
 assert.equal(searchCommands(commands,'photoshop')[0].label,'Open photo editor');
 assert.equal(searchCommands(commands,'ilovepdf')[0].label,'Open PDF MasterTool');
 assert.equal(searchCommands(commands,'DRAW')[0].label,'Draw with brush');
 assert.equal(searchCommands(commands,'Add form field: Text')[0].label,'Add form field: Text');
 assert.equal(searchCommands(commands,'unmatched word').length,0);
 assert.deepEqual(searchCommands(commands,'  '),commands);
});

test('search retains contextual disabled reasons and matches dynamic page and font commands',()=>{
 const commands=[{label:'Set font: Poppins',disabled:'Select a text layer first'},{label:'Go to page 2: Contract'},{label:'Export pages as JPEG',keywords:'jpg image'}];
 assert.equal(searchCommands(commands,'poppins')[0].disabled,'Select a text layer first');
 assert.equal(searchCommands(commands,'page contract')[0].label,'Go to page 2: Contract');
 assert.equal(searchCommands(commands,'jpg')[0].label,'Export pages as JPEG');
});
