// Regenerates the README screenshots in docs/screenshots/ from the running app
// (Vite dev server + headless Chromium). Uses only the built-in demo page and
// generated pictures, so no personal files end up in the repository.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/readme-screenshots.mjs
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const out='docs/screenshots',view={width:1440,height:900};
const booking=`<body style="margin:0;font-family:Arial,sans-serif;background:#f3f6f9"><div style="margin:40px;padding:34px 40px;background:white;border-radius:10px;box-shadow:0 2px 10px #0002;width:640px">
 <div style="font-size:13px;color:#0a6;font-weight:bold;letter-spacing:1px">BOOKING CONFIRMED</div>
 <div style="font-size:28px;font-weight:bold;margin:10px 0 18px;color:#123">Harbour View Apartments</div>
 <div style="font-size:18px;line-height:1.9;color:#222"><b>Guest name:</b> Alex Martinn<br><b>Check-in:</b> Friday 14 March 2026<br><b>Check-out:</b> Sunday 16 March 2026<br><b>Total:</b> 284,50 €</div></div></body>`;
const poster=`<body style="margin:0"><svg width="800" height="520" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="520" fill="#9fd3ef"/><circle cx="610" cy="130" r="62" fill="#ffd166"/>
 <polygon points="0,520 0,330 170,190 330,340 470,220 640,360 800,260 800,520" fill="#2a6f97"/><polygon points="0,520 0,420 220,300 420,430 600,330 800,410 800,520" fill="#1b4965"/>
 <rect x="0" y="470" width="800" height="50" fill="#14364d"/></svg></body>`;

async function picture(browser,html,size,name){
 const p=await browser.newPage({viewport:size});await p.setContent(html);
 const file=join(await mkdtemp(join(tmpdir(),'bide-shot-')),name);await p.screenshot({path:file});await p.close();return file;
}
async function open(browser,file){
 const page=await browser.newPage({viewport:view});
 await page.addInitScript(()=>{try{localStorage.setItem('bide-demo-notice','hidden');}catch{}});
 await page.goto(server.resolvedUrls.local[0]);
 if(file){await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);await page.getByText(/page added/).waitFor({timeout:60000});await page.waitForTimeout(1200);}
 else await page.waitForTimeout(2500);
 return page;
}
const at=async(page,w,x,y)=>{const b=await page.locator('.artboard').boundingBox(),s=b.width/w;return [b.x+x*s,b.y+y*s];};
const hideToast=page=>page.evaluate(()=>document.querySelectorAll('.toast').forEach(t=>t.remove()));

await mkdir(out,{recursive:true});
const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
const browser=await chromium.launch();
try{
 // 1. Photo editor: demo design, layer style on the headline, rulers and a guide.
 {const page=await open(browser);
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^Make room/})}).click();
  await page.locator('.layer-style>summary').click();
  await page.getByLabel('Drop shadow',{exact:true}).check();await page.getByLabel('Outer glow',{exact:true}).check();await page.getByLabel('Outer glow · color').fill('#b9d1b0');
  const r=await page.locator('.rulers-top .ruler-canvas').boundingBox();await page.mouse.move(r.x+300,r.y+8);await page.mouse.down();await page.mouse.move(...await at(page,595,300,420),{steps:6});await page.mouse.up();
  await page.locator('.layer-row',{has:page.locator('.layer-name',{hasText:/^Make room/})}).click();
  await page.waitForTimeout(800);await hideToast(page);await page.screenshot({path:`${out}/photo-editor.png`});await page.close();}

 // 2. Image text: detected lines on a screenshot, fixing a typo with the image's own letters.
 {const file=await picture(browser,booking,{width:720,height:330},'booking.png'),page=await open(browser,file);
  await page.waitForFunction(()=>/OCR regions/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:240000});
  await page.locator('button[aria-label^="Edit detected text: Guest name"]').click();
  await page.getByLabel('New text').fill((await page.getByLabel('New text').inputValue()).replace('Martinn','Martin'));
  await page.getByRole('button',{name:'Apply'}).click();await page.getByText(/own letters/).waitFor({timeout:120000});
  await page.keyboard.press('Escape');await page.waitForTimeout(800);await hideToast(page);
  await page.locator('button[aria-label^="Edit detected text: Check-in"]').hover();await page.waitForTimeout(300);
  await page.screenshot({path:`${out}/image-text.png`});await page.close();}

 // 3. Selections: magic wand with an added region and the selection bar.
 {const file=await picture(browser,poster,{width:800,height:520},'poster.png'),page=await open(browser,file);
  await page.getByRole('button',{name:'Magic wand',exact:true}).click();
  await page.mouse.click(...await at(page,800,170,300));await page.keyboard.down('Shift');await page.mouse.click(...await at(page,800,610,130));await page.keyboard.up('Shift');
  await page.waitForTimeout(500);await hideToast(page);await page.screenshot({path:`${out}/selection.png`});await page.close();}

 // 4. Pen tool shape, gradient and the History panel.
 {const file=await picture(browser,poster,{width:800,height:520},'poster.png'),page=await open(browser,file);
  await page.getByRole('button',{name:'Gradient',exact:true}).click();await page.getByLabel('Drawing color').fill('#ff9f1c');await page.getByText('To transparent',{exact:true}).click();
  const g0=await at(page,800,400,0),g1=await at(page,800,400,300);await page.mouse.move(...g0);await page.mouse.down();await page.mouse.move(...g1,{steps:5});await page.mouse.up();
  await page.getByRole('button',{name:'Pen',exact:true}).click();await page.getByText('Fill',{exact:true}).click();await page.getByLabel('Drawing color').fill('#ffffff');
  // A snow cap on the left peak: corners along the slopes, a curved lower edge, closed on the first point.
  for(const [x,y] of [[170,190],[226,242]])await page.mouse.click(...await at(page,800,x,y));
  const c=await at(page,800,170,236);await page.mouse.move(...c);await page.mouse.down();await page.mouse.move(c[0]-26,c[1]+12,{steps:4});await page.mouse.up();
  await page.mouse.click(...await at(page,800,118,233));await page.mouse.click(...await at(page,800,170,190));
  await page.getByRole('tab',{name:'History'}).click();
  await page.waitForTimeout(600);await hideToast(page);await page.screenshot({path:`${out}/pen-history.png`});await page.close();}

 // 5. PDF tools home.
 {const page=await open(browser);await page.getByRole('button',{name:/PDF MasterTool/}).first().click();await page.waitForTimeout(800);await page.screenshot({path:`${out}/pdf-tools.png`});await page.close();}

 // 6. Diagrams (bundled draw.io).
 {const page=await open(browser);await page.getByRole('button',{name:/Diagrams/}).first().click();
  await page.waitForFunction(()=>!document.querySelector('.diagram-loading'),null,{timeout:120000}).catch(()=>{});await page.waitForTimeout(4000);
  await page.screenshot({path:`${out}/diagrams.png`});await page.close();}
}finally{await browser.close();await server.close();}
console.log('Screenshots written to',out);
