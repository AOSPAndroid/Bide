// End-to-end: Object select (SlimSAM) selects the clicked shape, and
// Shift-click adds a second one.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// Bounds of the selection: copy it to a new layer and read that layer back.
async function selection(page){
 const count=async()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.length;});
 const before=await count();await page.getByRole('button',{name:'Copy to layer'}).click({timeout:240000});
 for(let i=0;i<30&&await count()===before;i++)await page.waitForTimeout(500);
 return page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const o=(await restoreLocal()).pages[0].canvas.objects.at(-1);return {left:o.left,top:o.top,width:o.width*(o.scaleX??1),height:o.height*(o.scaleY??1)};});
}

test('Object select picks the clicked object',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:640,height:420}});
  await shot.setContent('<body style="margin:0;background:#cfd8dc"><div style="position:absolute;left:60px;top:80px;width:200px;height:200px;border-radius:50%;background:#e63946"></div><div style="position:absolute;left:340px;top:120px;width:220px;height:160px;background:#1d3557"></div></body>');
  const file=join(await mkdtemp(join(tmpdir(),'bide-sam-')),'shapes.png');await shot.screenshot({path:file});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);await page.getByText(/page added/).waitFor({timeout:60000});
  await page.locator('.layer-row').first().click();
  await page.getByRole('button',{name:'Object select (AI)'}).click();
  const at=async(x,y)=>{const b=await page.locator('.artboard').boundingBox(),k=b.width/640;return [b.x+x*k,b.y+y*k];};
  await page.mouse.click(...await at(450,200));
  // The first click encodes the page (seconds); the selection then enables the selection actions.
  await page.waitForFunction(()=>document.querySelector('[aria-label="Copy to layer"]')?.disabled===false,null,{timeout:240000});
  let s=await selection(page);
  assert.ok(s&&Math.abs(s.width-220)<12&&Math.abs(s.height-160)<12,`rectangle selected: ${JSON.stringify(s)}`);
  // Undo the copy (back to the page version already encoded), then add the circle with Shift.
  await page.keyboard.press('Control+z');await page.waitForTimeout(1500);
  await page.locator('.layer-row').last().click();await page.getByRole('button',{name:'Object select (AI)'}).click();
  await page.mouse.click(...await at(450,200));
  await page.waitForFunction(()=>document.querySelector('[aria-label="Copy to layer"]')?.disabled===false,null,{timeout:240000});
  await page.keyboard.down('Shift');await page.mouse.click(...await at(160,180));await page.keyboard.up('Shift');await page.waitForTimeout(4000);
  s=await selection(page);assert.ok(Math.abs(s.left-60)<10&&Math.abs(s.left+s.width-560)<12&&Math.abs(s.top-80)<10,`both shapes: ${JSON.stringify(s)}`);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
