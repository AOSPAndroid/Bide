// End-to-end: pen tool and point editing, rulers and guides, image and canvas
// size, crop, skew, perspective and the History panel.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const fixture=`<body style="margin:0"><svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="#dfe8ee"/><circle cx="200" cy="150" r="80" fill="#2a6f97"/></svg></body>`;
const project=async page=>{await page.waitForTimeout(1500);return page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=(await restoreLocal()).pages[0];return {width:p.width,height:p.height,guides:p.guides,objects:p.canvas.objects};});};
async function at(page,x,y){const box=await page.locator('.artboard').boundingBox(),w=Number((await page.locator('.artboard-label span').last().textContent()).split('×')[0]);const s=box.width/w;return [box.x+x*s,box.y+y*s];}

test('pen, guides, image and canvas size, crop, skew, perspective and history',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:400,height:300}});await shot.setContent(fixture);
  const image=join(await mkdtemp(join(tmpdir(),'bide-canvas-')),'disc.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.getByText(/1 page added/).waitFor({timeout:60000});await page.waitForTimeout(800);

  // Pen: a filled triangle, closed by clicking the first point.
  await page.getByRole('button',{name:'Pen',exact:true}).click();
  await page.getByText('Fill',{exact:true}).click();
  for(const [x,y] of [[50,50],[150,50],[100,120],[50,50]])await page.mouse.click(...await at(page,x,y));
  let p=await project(page);
  const shape=p.objects.find(o=>o.name==='Shape');
  assert.ok(shape,'closed path saved as a shape');assert.equal(shape.type,'Path');
  assert.equal(shape.path.at(-1)[0],'Z');assert.ok(shape.fill&&shape.fill!=='',`filled ${shape.fill}`);
  assert.ok(Math.abs(shape.left-50)<=2&&Math.abs(shape.width-100)<=2,`shape box ${shape.left},${shape.width}`);

  // Edit points: drag the apex down by 30.
  await page.getByRole('button',{name:'Move & select',exact:true}).click();
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^Shape$/})}).click();
  await page.getByRole('button',{name:'Edit points'}).click();
  const apex=await at(page,100,120),below=await at(page,100,150);
  await page.mouse.move(...apex);await page.mouse.down();await page.mouse.move(...below,{steps:5});await page.mouse.up();
  p=await project(page);
  const edited=p.objects.find(o=>o.name==='Shape');
  assert.ok(edited.height>p.objects.find(o=>o.name==='Shape').height-1&&Math.abs(edited.height-100)<=3,`apex moved: height ${edited.height}`);
  await page.getByRole('button',{name:'Done editing points'}).click();

  // Guides: drag from the top ruler onto the page; it saves with the page.
  const ruler=await page.locator('.rulers-top .ruler-canvas').boundingBox();
  await page.mouse.move(ruler.x+200,ruler.y+8);await page.mouse.down();await page.mouse.move(...await at(page,200,200),{steps:6});await page.mouse.up();
  p=await project(page);
  assert.deepEqual(p.guides,{x:[],y:[200]});

  // Image size: 400×300 → 200×150 keeps proportions and scales the layers.
  await page.keyboard.press('Control+k');await page.keyboard.type('Image size');await page.keyboard.press('Enter');
  await page.getByLabel('Image width').fill('200');
  assert.equal(await page.getByLabel('Image height').inputValue(),'150');
  await page.getByRole('button',{name:'Resize'}).click();
  p=await project(page);
  assert.deepEqual([p.width,p.height,p.guides.y[0]],[200,150,100]);
  assert.ok(Math.abs(p.objects[0].scaleX-.5)<.01,`image scale ${p.objects[0].scaleX}`);

  // Canvas size: 300×200 around the centre moves content by (50, 25).
  await page.keyboard.press('Control+k');await page.keyboard.type('Canvas size');await page.keyboard.press('Enter');
  await page.getByLabel('Canvas width').fill('300');await page.getByLabel('Canvas height').fill('200');
  await page.getByRole('button',{name:'Apply'}).click();
  p=await project(page);
  assert.deepEqual([p.width,p.height],[300,200]);
  assert.ok(Math.abs(p.objects[0].left-50)<.01&&Math.abs(p.objects[0].top-25)<.01,`moved ${p.objects[0].left},${p.objects[0].top}`);

  // Crop to a dragged rectangle.
  await page.getByRole('button',{name:'Crop',exact:true}).click();
  const c0=await at(page,50,25),c1=await at(page,250,175);
  await page.mouse.move(...c0);await page.mouse.down();await page.mouse.move(...c1,{steps:6});await page.mouse.up();
  await page.getByRole('button',{name:'Apply crop'}).click();
  p=await project(page);
  assert.ok(Math.abs(p.width-200)<=1&&Math.abs(p.height-150)<=1,`cropped ${p.width}×${p.height}`);
  assert.ok(Math.abs(p.objects[0].left)<=1,`content at the new origin ${p.objects[0].left}`);

  // Skew and perspective on the image layer.
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^disc\.png$/})}).click();
  await page.getByLabel('Skew X').fill('10');await page.getByLabel('Skew X').press('Enter');
  p=await project(page);assert.equal(p.objects[0].skewX,10);
  await page.getByRole('button',{name:'Perspective',exact:true}).click();
  await page.getByRole('slider',{name:'Corner top left'}).focus();for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button',{name:'Apply perspective'}).click();
  p=await project(page);assert.ok(p.objects.some(o=>/in perspective$/.test(o.name)),'perspective layer');

  // History: jump back to the state after Image size.
  await page.getByRole('tab',{name:'History'}).click();
  const steps=await page.locator('.history-list button').allTextContents();
  assert.ok(steps.includes('Image size')&&steps.includes('Canvas size')&&steps.includes('Crop'),steps.join(' | '));
  await page.locator('.history-list button',{hasText:/^Image size$/}).click();
  p=await project(page);
  assert.deepEqual([p.width,p.height],[200,150]);
  assert.equal(await page.locator('.history-list button.future').count()>=3,true,'later steps can be redone');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
