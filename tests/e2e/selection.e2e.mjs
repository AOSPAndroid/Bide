// End-to-end: magic wand, combined selections, refine, layer masks from a
// selection, colour range and the AI subject tools.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// 400×300: grey background, a blue square (60..160, 60..160) and a green disc (centre 280,150, r 50).
const fixture=`<body style="margin:0"><svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="#bbbbbb"/><rect x="60" y="60" width="100" height="100" fill="#1040d0"/><circle cx="280" cy="150" r="50" fill="#20a040"/></svg></body>`;

// Bounds of the selection outline in page units (all loops together).
const outline=page=>page.evaluate(()=>{
 const paths=[...document.querySelectorAll('.selection-outline path.ants')].map(p=>p.getAttribute('d')).join(' ');
 const n=(paths.match(/-?\d+(\.\d+)?/g)||[]).map(Number),xs=n.filter((_,i)=>i%2===0),ys=n.filter((_,i)=>i%2===1);
 return xs.length?{left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys),loops:(paths.match(/M/g)||[]).length}:null;
});
// Click a page point (page units) on the canvas.
async function clickAt(page,x,y,modifiers=[]){
 const box=await page.locator('.artboard').boundingBox(),scale=box.width/400;
 for(const m of modifiers)await page.keyboard.down(m);
 await page.mouse.click(box.x+x*scale,box.y+y*scale);
 for(const m of modifiers)await page.keyboard.up(m);
}
const saved=async page=>{await page.waitForTimeout(1500);return page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects;});};

test('wand, combined selections, refine and layer masks',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:400,height:300}});await shot.setContent(fixture);
  const image=join(await mkdtemp(join(tmpdir(),'bide-sel-')),'shapes.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.getByText(/1 page added/).waitFor({timeout:60000});await page.waitForTimeout(800);

  // Magic wand on the square selects exactly the square.
  await page.getByRole('button',{name:'Magic wand',exact:true}).click();
  await clickAt(page,100,100);
  let o=await outline(page);
  assert.deepEqual([o.left,o.top,o.right,o.bottom,o.loops],[60,60,160,160,1],JSON.stringify(o));
  // Shift adds the disc as a second region.
  await clickAt(page,280,150,['Shift']);
  o=await outline(page);assert.equal(o.loops,2);assert.ok(Math.abs(o.right-330)<=1&&Math.abs(o.left-60)<=1,JSON.stringify(o));
  // Alt subtracts the square again.
  await clickAt(page,100,100,['Alt']);
  o=await outline(page);assert.equal(o.loops,1);assert.ok(Math.abs(o.left-230)<=1,JSON.stringify(o));

  // Refine: expand by 5 pixels.
  await clickAt(page,100,100);
  await page.locator('.selection-refine>summary').click();await page.getByLabel('Refine amount').fill('5');
  await page.locator('.selection-refine').getByRole('button',{name:'Expand'}).click();
  o=await outline(page);assert.deepEqual([o.left,o.top,o.right,o.bottom],[55,55,165,165],JSON.stringify(o));

  // Inverse covers everything else (outer border + hole = 2 loops).
  await page.getByRole('button',{name:'Inverse'}).click();
  o=await outline(page);assert.equal(o.loops,2);assert.deepEqual([o.left,o.top,o.right,o.bottom],[0,0,400,300]);
  await page.getByRole('button',{name:'Inverse'}).click();

  // Copy to layer cuts out the selected pixels as a new layer.
  await page.getByRole('button',{name:'Copy to layer'}).click();
  let objects=await saved(page);
  assert.equal(objects.length,2);const cut=objects[1];
  assert.ok(Math.abs(cut.left-55)<=1&&Math.abs(cut.width-110)<=2,`cutout ${cut.left},${cut.width}`);

  // Keep inside turns a wand selection into a paintable raster layer mask.
  await page.getByRole('button',{name:'Magic wand',exact:true}).click();
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^shapes\.png$/})}).click();
  await page.getByRole('button',{name:'Magic wand',exact:true}).click();
  await clickAt(page,280,150);
  await page.getByRole('button',{name:'Keep inside'}).click();
  objects=await saved(page);
  const masked=objects.find(x=>x.name==='shapes.png');
  assert.equal(masked.clipPath?.type,'Image');assert.equal(masked.clipPath.layerMask,true);
  assert.match(masked.clipPath.src,/^data:image\/png/);

  // Colour range selects every pixel of a colour, wherever it is (here the blue
  // square, which survives only in the cutout layer).
  await page.keyboard.press('Control+k');await page.keyboard.type('Select color range');await page.keyboard.press('Enter');
  await page.getByLabel('Range color').fill('#1040d0');
  await page.getByText(/pixels selected/).waitFor();
  const count=Number((await page.getByText(/pixels selected/).textContent()).replace(/[^\d]/g,''));
  assert.ok(count>9500&&count<10500,`colour range count ${count}`);
  await page.getByRole('button',{name:'Select pixels'}).click();await page.waitForTimeout(300);o=await outline(page);assert.deepEqual([o.left,o.top,o.right,o.bottom],[60,60,160,160],'colour range outline');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('AI selects the subject and removes the background as a layer mask',{timeout:900000},async t=>{
 try{await access('public/ai/models/isnet.onnx');}catch{t.skip('AI model pack not prepared (npm run assets:ai)');return;}
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  // A dark rounded figure on a light textured backdrop.
  const shot=await browser.newPage({viewport:{width:480,height:360}});
  await shot.setContent(`<body style="margin:0;background:repeating-linear-gradient(45deg,#e9e4d8 0 12px,#f4f0e6 12px 24px)"><div style="position:absolute;left:150px;top:60px;width:180px;height:260px;border-radius:90px 90px 40px 40px;background:radial-gradient(circle at 40% 30%,#c0392b,#5b1010)"></div></body>`);
  const image=join(await mkdtemp(join(tmpdir(),'bide-sel-')),'figure.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.getByText(/1 page added/).waitFor({timeout:60000});await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Magic wand',exact:true}).click();
  await page.getByRole('button',{name:'Subject'}).click();
  await page.getByText(/Subject selected/).waitFor({timeout:300000});
  const o=await outline(page);
  assert.ok(o&&Math.abs(o.left-150)<20&&Math.abs(o.right-330)<20&&Math.abs(o.top-60)<20,`subject ${JSON.stringify(o)}`);

  await page.keyboard.press('Escape');
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^figure\.png$/})}).click();
  await page.keyboard.press('Control+k');await page.keyboard.type('Remove background with AI');await page.keyboard.press('Enter');
  await page.getByText(/Background removed/).waitFor({timeout:300000});
  const objects=await saved(page);
  assert.equal(objects[0].clipPath?.layerMask,true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
