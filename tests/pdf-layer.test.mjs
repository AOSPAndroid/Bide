import {test} from 'node:test';import assert from 'node:assert/strict';import {unlockPdfPage} from '../tmp/pdf-layer.mjs';
test('unlocking a PDF preserves overlays and geometry without modifying the undo snapshot',()=>{
 const overlay={type:'Textbox',text:'Existing edit',left:40,top:30};const page={id:'page',name:'PDF',width:595,height:842,color:'#fff',source:'immutable-source',index:2,thumb:'old',canvas:{objects:[overlay]}};
 const snapshot=JSON.stringify(page);const image={type:'Image',src:'data:image/png;base64,test',id:'background',lockMovementX:false};const unlocked=unlockPdfPage(page,image);
 assert.equal(JSON.stringify(page),snapshot);assert.equal(unlocked.width,595);assert.equal(unlocked.height,842);assert.equal(unlocked.source,undefined);assert.deepEqual(unlocked.canvas.objects,[image,overlay]);assert.equal(unlocked.canvas.objects[1],overlay);assert.equal(JSON.parse(JSON.stringify(unlocked)).canvas.objects[0].src,image.src);assert.equal(unlocked.thumb,undefined);assert.throws(()=>unlockPdfPage(unlocked,image),/already editable/);
});
