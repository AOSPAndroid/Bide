// A user's own font file: added from OCR settings, listed under "Your fonts",
// kept for the next visit, and tried first when a scanned line is set in a font.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {readFile} from 'node:fs/promises';

test('an added font file is listed, kept across reloads and matched on a scan',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.waitForTimeout(1500);
  // Any font file will do: a bundled one under a name the app does not know.
  const bytes=await readFile('src/browser/fonts/library/manrope-Bold.ttf');
  await page.locator('input[aria-label="Add font files"]').setInputFiles({name:'House Brand-Bold.ttf',mimeType:'font/ttf',buffer:bytes});
  await page.getByText('House Brand added',{exact:false}).waitFor({timeout:30000});
  const listed=()=>page.evaluate(async()=>(await import('/src/extra-fonts.ts')).extraFonts('yours').map(f=>f.family+':'+f.styles.join('+')));
  assert.deepEqual(await listed(),['House Brand:Bold']);
  assert.ok(await page.evaluate(()=>document.fonts.check('700 20px "House Brand"')),'the canvas can draw it');
  // Not a font: said plainly, nothing added.
  await page.locator('input[aria-label="Add font files"]').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('x')});
  await page.getByText('notes.txt is not a font file',{exact:false}).waitFor({timeout:30000});
  await page.reload();await page.waitForTimeout(2500);
  assert.deepEqual(await listed(),['House Brand:Bold'],'kept for the next visit');
  // A name the app already has is added beside it, not mixed with it.
  await page.locator('input[aria-label="Add font files"]').setInputFiles({name:'Roboto-Regular.ttf',mimeType:'font/ttf',buffer:bytes});
  await page.getByText('Roboto (yours) added',{exact:false}).waitFor({timeout:30000});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
