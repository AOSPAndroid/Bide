// End-to-end: proofreading detected image text and fixing a word with the
// image's own letters.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// "rnodern" is a classic OCR-style misspelling of "modern"; "meeting" gives the page an "m".
const scan=`<body style="margin:0;background:#fff;font-family:Arial"><div style="padding:40px 50px;font-size:28px;line-height:2;color:#111">Our rnodern office<br>Weekly meeting notes</div></body>`;

test('Proofread lists a misspelled word and fixes it with the image letters',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:520,height:200}});await shot.setContent(scan);
  const image=join(await mkdtemp(join(tmpdir(),'bide-proof-')),'notes.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').waitFor({timeout:240000});

  // The edit dialog checks spelling too.
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').click();
  await page.getByRole('button',{name:'Use modern'}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Use modern'}).click();
  assert.equal(await page.getByLabel('New text').inputValue(),'Our modern office');
  await page.getByRole('button',{name:'Cancel'}).click();

  // Proofread finds it across the page; one click fixes it.
  await page.getByRole('button',{name:'Proofread'}).click();
  const line=page.locator('.proofread-line',{hasText:'rnodern'});await line.waitFor({timeout:60000});
  assert.equal(await page.locator('.proofread-line').count(),1,'only the misspelled line is listed');
  await line.getByRole('button',{name:'Use modern'}).click();
  await page.locator('.toast',{hasText:/Edited with the image's own letters/}).waitFor({timeout:120000});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  // The fix is a patch layer of the image's own letters, named after the new text.
  await page.locator('.layer-name',{hasText:/^Edited text: Our modern office/}).waitFor({timeout:30000});
  assert.equal(await page.locator('.layer-name',{hasText:/rnodern/}).count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
