// End-to-end checks of the bundled AI models (PaddleOCR, LaMa, Real-ESRGAN).
// Runs on the CPU in headless Chromium, so each model takes seconds to tens of seconds.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

// A map-like texture with a road sign and a soft two-line label, like a booking screenshot header.
const fixture=`<body style="margin:0"><svg width="520" height="300" xmlns="http://www.w3.org/2000/svg" style="filter:blur(.5px)"><rect width="520" height="300" fill="#e8ece6"/>${Array.from({length:14},(_,i)=>`<path d="M${-20+i*40} 0 C ${60+i*30} 120, ${i*35} 180, ${80+i*38} 300" stroke="${i%3?'#c9d2dc':'#b8c4cf'}" stroke-width="${6+i%4*3}" fill="none"/>`).join('')}<rect x="300" y="40" width="90" height="34" rx="6" fill="#d33"/><text x="345" y="64" font-family="sans-serif" font-weight="bold" font-size="20" fill="#fff" text-anchor="middle">A-387</text><text x="260" y="190" font-family="sans-serif" font-weight="bold" font-size="30" fill="#333" text-anchor="middle">HUERTO DE</text><text x="260" y="228" font-family="sans-serif" font-weight="bold" font-size="30" fill="#333" text-anchor="middle">LOS NARANJOS</text></svg></body>`;

test('AI OCR, AI background fill, AI removal and AI sharpening work offline in the editor',{timeout:900000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:520,height:300}});await shot.setContent(fixture);
  const image=join(await mkdtemp(join(tmpdir(),'bide-ai-')),'map.png');await shot.screenshot({path:image});await shot.close();
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const layers=async()=>{await page.waitForTimeout(1500);return page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.map(o=>({name:o.name,width:o.width,scaleX:o.scaleX}));});};
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.waitForFunction(()=>/OCR regions/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:180000});

  // PaddleOCR reads both label lines.
  await page.getByLabel('OCR engine').selectOption('paddle');
  await page.waitForFunction(()=>/regions · AI OCR/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:300000});
  const read=await page.evaluate(()=>[...document.querySelectorAll('.detected-text-overlay button')].map(b=>b.getAttribute('aria-label')));
  assert.ok(read.some(l=>/HUERTO DE/.test(l))&&read.some(l=>/LOS NARANJOS/.test(l)),'AI OCR read: '+read.join(' | '));

  // LaMa fills the background behind replaced text.
  await page.getByLabel('Text replacement background').selectOption('ai');
  await page.locator('button[aria-label*="LOS NARANJOS"]').click();await page.getByText('OCR text is editable',{exact:false}).waitFor({timeout:300000});
  assert.ok((await layers()).some(l=>l.name==='AI-filled background'),'AI background patch layer');

  // LaMa removes a marquee selection (the road sign).
  for(let k=0;k<3;k++)await page.keyboard.press('Escape');
  await page.getByRole('checkbox',{name:'Edit detected text'}).uncheck();
  const host=async()=>page.locator('.canvas-host').boundingBox();let box=await host();
  await page.mouse.click(box.x+20,box.y+box.height-20);await page.keyboard.press('m');await page.waitForTimeout(300);box=await host();
  const z=box.width/520;await page.mouse.move(box.x+292*z,box.y+32*z);await page.mouse.down();await page.mouse.move(box.x+398*z,box.y+82*z,{steps:8});await page.mouse.up();
  await page.getByRole('button',{name:'Remove with AI'}).click();await page.getByText('Selection filled with AI',{exact:false}).waitFor({timeout:300000});
  assert.ok((await layers()).some(l=>l.name==='AI-removed area'),'AI removal patch layer');

  // Real-ESRGAN doubles the image layer's resolution without changing its size on the page.
  await page.keyboard.press('v');box=await host();await page.mouse.click(box.x+20,box.y+box.height-20);
  await page.getByRole('button',{name:'Sharpen with AI (2×)'}).click();await page.getByText('Image sharpened with AI',{exact:false}).waitFor({timeout:600000});
  const photo=(await layers()).find(l=>l.name==='map.png');assert.equal(photo.width,1040);assert.equal(photo.scaleX,.5);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
