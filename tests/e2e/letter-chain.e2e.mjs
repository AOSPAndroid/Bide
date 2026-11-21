// Original letters in a table: the cell "4,8" shares no character with the
// cells holding a 5, so its 5 is verified through a third cell that shares
// letters with both ("1 482" with "4,8", "1 205" with "1 482"). The edit is
// made of the page's own pixels; a letter no cell has is still refused.
// The page is the edit benchmark's invented meter table (tests/edit-bench/docs.mjs).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {templates} from '../edit-bench/docs.mjs';

test('a table cell borrows a digit verified through a neighbouring cell',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const tpl=templates.readings,dpr=200/72,shot=await browser.newPage({viewport:{width:tpl.width,height:tpl.height},deviceScaleFactor:dpr});
  await shot.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;overflow:hidden}</style><div style="width:${tpl.width}px;height:${tpl.height}px">${tpl.html(tpl.fields)}</div>`);
  const png=(await shot.screenshot({clip:{x:0,y:0,width:tpl.width,height:tpl.height}})).toString('base64');await shot.close();
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const doc=await page.evaluate(async b64=>(await import('/tests/edit-bench/bench.ts')).open('t',b64,'table.png','image/png'),png);
  const cell=doc.regions.find(r=>r.text==='4,8');assert.ok(cell,`the cell 4,8 is read (${doc.regions.map(r=>r.text).join(' | ')})`);
  const edit=(text)=>page.evaluate(async([id,text])=>{const r=await (await import('/tests/edit-bench/bench.ts')).edit('t',id,text,'letters');return {outcome:r.outcome,reason:r.reason};},[cell.id,text]);
  assert.equal((await edit('5,8')).outcome,'letters','the 5 comes from the table itself');
  const refused=await edit('4,8%');
  assert.equal(refused.outcome,'refused');assert.match(refused.reason,/“%” does not appear in this line/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
