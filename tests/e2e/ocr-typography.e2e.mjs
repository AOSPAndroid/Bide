// End-to-end on an invented price card: AI OCR reads typographic marks the
// recognizer alone gets wrong (’ read as ', − as -, an en dash it lacks
// dropped) and keeps a symbol it cannot read (★) as a cell of its own, so a
// letter edit of that line redraws the star from its own pixels.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

const lines=['Profitez de l’offre du 10–12 novembre','Avoir client −12,50 € <span id="star">★</span> 4,8'];
const pixels=(page,bytes)=>page.evaluate(async b64=>{const bmp=await createImageBitmap(await (await fetch('data:image/png;base64,'+b64)).blob()),c=new OffscreenCanvas(bmp.width,bmp.height),g=c.getContext('2d');g.drawImage(bmp,0,0);return {width:bmp.width,height:bmp.height,data:[...g.getImageData(0,0,bmp.width,bmp.height).data]};},bytes.toString('base64'));
const button=(page,text)=>page.locator(`button[aria-label^="Edit detected text"][aria-label*="${text}"]`).first();

test('AI OCR reads ’, −, – and keeps an unreadable ★ through a letter edit',{timeout:600000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const shot=await browser.newPage({viewport:{width:620,height:150}});
  await shot.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:36px 44px;font:24px Arial;color:#1d1d1f;background:#fff">${lines.map(l=>`<div style="margin-bottom:22px;white-space:nowrap">${l}</div>`).join('')}</body>`);
  const star=await shot.evaluate(()=>{const b=document.getElementById('star').getBoundingClientRect();return {x0:Math.floor(b.left)-2,x1:Math.ceil(b.right)+2,y0:Math.floor(b.top),y1:Math.ceil(b.bottom)};});
  const dir=await mkdtemp(join(tmpdir(),'bide-typo-')),file=join(dir,'card.png');await writeFile(file,await shot.screenshot());await shot.close();
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(file);
  await button(page,'4,8').waitFor({timeout:240000});
  const fields=await page.locator('.detected-text-overlay button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label').replace(/^Edit detected text: /,'')));
  // The star has no character: the field holds only what was read.
  assert.deepEqual(fields,['Profitez de l’offre du 10–12 novembre','Avoir client −12,50 € 4,8'],`read ${JSON.stringify(fields)}`);
  // A letter edit of the amount that also drops the € the star's ink was read with.
  await button(page,'4,8').click();
  await page.getByLabel('New text').fill('Avoir client −15,20 4,8',{timeout:10000});await page.getByRole('button',{name:'Apply'}).click();
  await page.getByText("Edited with the image's own letters",{exact:false}).waitFor({timeout:60000});
  await page.keyboard.press('Escape');await page.waitForTimeout(1000);
  await page.locator('.document-actions .primary').click();
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.locator('.modal .dialog-actions .primary').click()]);
  const out=join(dir,'edited-'+download.suggestedFilename());await download.saveAs(out);
  const before=await pixels(page,await readFile(file)),after=await pixels(page,await readFile(out));
  assert.deepEqual(errors,[]);await page.close();
  assert.deepEqual([after.width,after.height],[before.width,before.height]);
  // The star's pixels, moved left with the rest of the line by the € and its space.
  const at=(img,x,y)=>{const i=(y*img.width+x)*4;return img.data.slice(i,i+3);};
  const diff=(x0,x1,dx)=>{let d=0;for(let y=star.y0;y<star.y1;y++)for(let x=x0;x<x1;x++){const a=at(before,x,y),b=at(after,x+dx,y);d+=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);}return d/(3*(x1-x0)*(star.y1-star.y0));};
  let ink=0;for(let y=star.y0;y<star.y1;y++)for(let x=star.x0;x<star.x1;x++)if(at(before,x,y)[0]<128)ink++;
  assert.ok(ink>40,`the star is drawn (${ink} dark pixels)`);
  let best=Infinity,shift=0;for(let dx=-40;dx<=4;dx++){const d=diff(star.x0,star.x1,dx);if(d<best){best=d;shift=dx;}}
  assert.ok(best<3&&shift<-10,`the edited line keeps the star's pixels (mean difference ${best.toFixed(2)} at ${shift} px)`);
  assert.ok(diff(star.x1,star.x1+60,shift)<3,'the rating after it moved with it');
  let changed=0;for(let y=star.y0;y<star.y1;y++)for(let x=star.x0-150;x<star.x0-40;x++){const a=at(before,x,y),b=at(after,x,y);if(Math.abs(a[0]-b[0])>60)changed++;}
  assert.ok(changed>20,`the amount changed (${changed} pixels)`);
  console.log(`star kept at ${shift} px (mean difference ${best.toFixed(2)}); amount changed ${changed} px`);
 }finally{await browser.close();await server.close();}
});
