// End-to-end: gradient tool, paint bucket, mask brush, layer styles, and that
// styled and masked layers survive saving and PDF export.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// 400×300 white page with a black frame (20..380 × 20..280, 4px thick).
const fixture=`<body style="margin:0"><svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="#ffffff"/><rect x="22" y="22" width="356" height="256" fill="none" stroke="#000" stroke-width="4"/></svg></body>`;
const saved=async page=>{await page.waitForTimeout(1500);return page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects;});};
async function point(page,x,y){const box=await page.locator('.artboard').boundingBox(),s=box.width/400;return {x:box.x+x*s,y:box.y+y*s};}
// Colour of one page pixel as rendered on the editor canvas.
const pixel=(page,x,y)=>page.evaluate(([x,y])=>{const c=document.querySelector('.canvas-host canvas'),s=c.width/400;return Array.from(c.getContext('2d').getImageData(Math.round(x*s),Math.round(y*s),1,1).data);},[x,y]);

test('gradient, bucket, mask brush and layer styles',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:400,height:300}});await shot.setContent(fixture);
  const image=join(await mkdtemp(join(tmpdir(),'bide-paint-')),'frame.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.getByText(/1 page added/).waitFor({timeout:60000});await page.waitForTimeout(800);

  // Paint bucket fills the inside of the frame only (contiguous), as a new layer.
  await page.getByLabel('Drawing color').fill('#ff0000');
  await page.getByRole('button',{name:'Paint bucket',exact:true}).click();
  let p=await point(page,200,150);await page.mouse.click(p.x,p.y);
  let objects=await saved(page);
  const fill=objects.find(o=>o.name==='Fill');
  assert.ok(fill&&Math.abs(fill.left-24)<=2&&Math.abs(fill.width-352)<=3,`fill ${fill?.left},${fill?.width}`);
  assert.deepEqual((await pixel(page,200,150)).slice(0,3),[255,0,0]);
  assert.deepEqual((await pixel(page,10,10)).slice(0,3),[255,255,255],'outside the frame stays white');

  // Gradient: drag left to right, red to blue.
  await page.getByRole('button',{name:'Gradient',exact:true}).click();
  await page.getByLabel('Gradient end color').fill('#0000ff');
  const a=await point(page,40,150),b=await point(page,360,150);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move((a.x+b.x)/2,a.y,{steps:4});await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();
  objects=await saved(page);
  const gradient=objects.find(o=>o.name==='Gradient');
  assert.equal(gradient.fill.type,'linear');assert.equal(gradient.width,400);
  const left=await pixel(page,20,150),right=await pixel(page,380,150);
  assert.ok(left[0]>230&&left[2]<25&&right[2]>230&&right[0]<25,`gradient ends ${left} → ${right}`);

  // Mask brush: hide a stroke across the gradient layer; the fill shows through.
  await page.getByRole('button',{name:'Mask brush',exact:true}).click();
  await page.getByLabel('Mask brush size').fill('60');await page.getByLabel('Mask brush softness').fill('0');
  const m1=await point(page,150,150),m2=await point(page,250,150);
  await page.mouse.move(m1.x,m1.y);await page.mouse.down();await page.mouse.move(m2.x,m2.y,{steps:8});await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual((await pixel(page,200,150)).slice(0,3),[255,0,0],'masked area shows the fill below');
  const kept=await pixel(page,200,60);assert.ok(kept[2]>80&&kept[0]<200,`unmasked gradient remains ${kept}`);
  objects=await saved(page);
  assert.equal(objects.find(o=>o.name==='Gradient').clipPath?.layerMask,true);

  // Layer style on the fill: an inside stroke recolours its edge.
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^Fill$/})}).click();
  await page.locator('.layer-style>summary').click();
  await page.getByLabel('Stroke',{exact:true}).check();
  await page.getByLabel('Stroke · position').selectOption('inside');await page.getByLabel('Stroke · size').fill('6');await page.getByLabel('Stroke · color').fill('#00ff00');
  await page.waitForTimeout(500);
  objects=await saved(page);
  const style=objects.find(o=>o.name==='Fill').layerStyle;
  assert.equal(style.stroke.position,'inside');assert.equal(style.stroke.color,'#00ff00');
  // Hide the gradient to see the fill's stroked edge.
  await page.getByRole('button',{name:'Hide Gradient'}).click();await page.waitForTimeout(300);
  assert.deepEqual((await pixel(page,27,150)).slice(0,3),[0,255,0],'inside stroke at the edge');
  assert.deepEqual((await pixel(page,200,150)).slice(0,3),[255,0,0],'centre keeps its colour');

  // PDF export includes styled and masked layers (as pixels) without errors.
  await page.keyboard.press('Control+k');await page.keyboard.type('Export PDF');await page.keyboard.press('Enter');
  const button=page.getByRole('button',{name:'Export PDF'});await button.waitFor();
  await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='Export PDF')?.disabled,null,{timeout:120000});
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:180000}),button.click()]);
  assert.match(download.suggestedFilename(),/\.pdf$/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
