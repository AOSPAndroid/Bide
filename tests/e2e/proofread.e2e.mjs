// End-to-end: proofreading detected image text and fixing a word with the
// image's own letters.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// "rnodern" is corrected to "modern" using verified original lettering.
const scan=`<body style="margin:0;background:#fff;font-family:Arial"><div style="padding:40px 50px;font-size:28px;line-height:2;color:#111">Our rnodern office<br>Weekly meeting notes</div></body>`;
const differentLettering=scan.replace('Weekly meeting notes','<strong>Weekly meeting notes</strong>');

test('Proofread retains unsupported corrections and fixes words using the same line letters',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:520,height:200}});await shot.setContent(differentLettering);
  assert.deepEqual(await shot.evaluate(()=>[getComputedStyle(document.querySelector('div')).fontWeight,getComputedStyle(document.querySelector('strong')).fontWeight]),['400','700'],'the only donor m is visibly heavier than the edited line');
  const image=join(await mkdtemp(join(tmpdir(),'bide-proof-')),'notes.png');await shot.screenshot({path:image});await shot.close();
  let page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').waitFor({timeout:240000});

  // The edit dialog checks spelling too.
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').click();
  await page.getByRole('button',{name:'Use modern'}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Use modern'}).click();
  assert.equal(await page.getByLabel('New text').inputValue(),'Our modern office');
  await page.getByRole('button',{name:'Cancel'}).click();

  // The other line's bold m is not this regular line's lettering. Refuse the
  // correction and keep it available, with the saved page unchanged.
  const saved=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return JSON.stringify((await restoreLocal()).pages[0].canvas);});
  const before=await saved();
  await page.getByRole('button',{name:'Proofread'}).click();
  const pending=page.locator('.proofread-line',{hasText:'rnodern'});await pending.waitFor({timeout:60000});
  await pending.getByRole('button',{name:'Use modern'}).click();
  await page.getByText('Cannot preserve the original lettering',{exact:false}).waitFor({timeout:30000});
  assert.equal(await saved(),before,'unsupported proofreading leaves the canvas unchanged');
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  assert.equal(await pending.count(),1,'the unapplied suggestion remains available');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.close();

  // Provide the same missing letter on the edited line, then check that the
  // same correction succeeds using original pixels rather than a font.
  const availableShot=await browser.newPage({viewport:{width:720,height:200}});
  await availableShot.setContent(scan.replace('Our rnodern office','Our rnodern meeting office'));
  const available=join(await mkdtemp(join(tmpdir(),'bide-proof-')),'available-notes.png');await availableShot.screenshot({path:available});await availableShot.close();
  page=await browser.newPage({viewport:{width:1400,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(available);
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').waitFor({timeout:240000});
  // Proofread finds it across the page; one click fixes it.
  await page.getByRole('button',{name:'Proofread'}).click();
  const line=page.locator('.proofread-line',{hasText:'rnodern'});await line.waitFor({timeout:60000});
  assert.equal(await page.locator('.proofread-line').count(),1,'only the misspelled line is listed');
  await line.getByRole('button',{name:'Use modern'}).click();
  await page.locator('.toast',{hasText:/Edited with the image's own letters/}).waitFor({timeout:120000});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  // The fix is a patch layer of the image's own letters, named after the new text.
  await page.locator('.layer-name',{hasText:/^Edited text: Our modern meeting office/}).waitFor({timeout:30000});
  assert.equal(await page.locator('.layer-name',{hasText:/rnodern/}).count(),0);
  await page.close();

  // The original two regular Arial lines can verify one another: Proofread
  // may borrow the missing m, while retaining the source and avoiding a font.
  const matchingShot=await browser.newPage({viewport:{width:520,height:200}});await matchingShot.setContent(scan);
  const matching=join(await mkdtemp(join(tmpdir(),'bide-proof-')),'matching-notes.png');await matchingShot.screenshot({path:matching});await matchingShot.close();
  page=await browser.newPage({viewport:{width:1400,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(matching);
  await page.locator('button[aria-label^="Edit detected text: Our rnodern"]').waitFor({timeout:240000});
  await page.waitForFunction(()=>{const status=document.querySelector('.text-detection-bar > span')?.textContent||'';return status.includes('AI OCR')&&!status.includes('…');},null,{timeout:240000});
  const matchingBefore=JSON.parse(await saved()),original=matchingBefore.objects.find(o=>o.type?.toLowerCase()==='image');assert.ok(original,'the imported source image is present');
  assert.equal(await page.getByLabel('Edit image text with').inputValue(),'letters');
  await page.getByRole('button',{name:'Proofread'}).click();const borrowedLine=page.locator('.proofread-line',{hasText:'rnodern'});await borrowedLine.waitFor({timeout:60000});
  await borrowedLine.getByRole('button',{name:'Use modern'}).click();
  await page.locator('.toast',{hasText:/a missing one came from another line in the same lettering/}).waitFor({timeout:120000});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Edit detected text: Our modern office',exact:true}).waitFor({timeout:30000});
  const deadline=Date.now()+30000;let matchingAfter,patch;
  while(Date.now()<deadline){matchingAfter=JSON.parse(await saved());patch=matchingAfter.objects.find(o=>o.editedText==='Our modern office');if(patch)break;await page.waitForTimeout(100);}
  assert.ok(patch,'Proofread stores the corrected text in an image patch');assert.equal(patch.type.toLowerCase(),'image');
  assert.equal(matchingAfter.objects.filter(o=>o.type?.toLowerCase()==='textbox').length,0,'borrowing never substitutes a font');
  assert.equal(matchingAfter.objects.length,matchingBefore.objects.length+1,'one correction adds one original-letter patch');
  const kept=matchingAfter.objects.find(o=>o.id===original.id);assert.ok(kept,'the original image layer remains');
  for(const key of ['src','width','height','left','top','scaleX','scaleY','angle'])assert.equal(kept[key],original[key],`the original image ${key} is unchanged`);
  assert.equal(await page.getByLabel('Edit image text with').inputValue(),'letters','the global original-letter default is unchanged');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
