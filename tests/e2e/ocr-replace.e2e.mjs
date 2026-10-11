// End-to-end: import a raster image, let local OCR detect its text, replace one
// region and check that an editable text layer and a background patch appear.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import * as mupdf from 'mupdf';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

function fixture(){
 const doc=new mupdf.PDFDocument(),font=new mupdf.Font('Helvetica'),ref=doc.addSimpleFont(font);
 const obj=doc.addPage([0,0,420,200],0,{Font:{F:ref}},'1 1 1 rg 0 0 420 200 re f 0.1 0.1 0.1 rg BT /F 22 Tf 30 140 Td (Quarterly report) Tj ET 0.1 0.3 0.7 rg BT /F 14 Tf 30 80 Td (Revenue grew strongly) Tj ET');
 doc.insertPage(-1,obj);const page=doc.loadPage(0),pix=page.toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true),png=Buffer.from(pix.asPNG());
 pix.destroy();page.destroy();obj.destroy();ref.destroy();font.destroy();doc.destroy();return png;
}

test('OCR text on an imported image becomes an editable layer',{timeout:240000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bide-e2e-')),image=join(dir,'scan.png');await writeFile(image,fixture());
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  const region=page.locator('button[aria-label^="Edit detected text: Quarterly"]');
  await region.waitFor({timeout:180000});
  assert.ok(await page.locator('button[aria-label^="Edit detected text: Revenue"]').count(),'second line detected');
  await page.getByLabel('Text replacement background').selectOption('sampled');
  await region.click();
  await page.getByText('OCR text is editable',{exact:false}).waitFor({timeout:30000});
  await page.locator('button[aria-label^="Edit detected text: Quarterly"]').waitFor({state:'detached'});
  const layers=await page.locator('body').innerText();
  assert.match(layers,/Text background patch/);assert.match(layers,/Quarterly report/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
