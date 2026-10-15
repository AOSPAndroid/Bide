// Checks OCR and text editing on the user's own screenshots in tests/real/
// (see tests/real/README.md). Runs the real editor in Chromium.
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';import {existsSync} from 'node:fs';

const dir='tests/real',images=(await readdir(dir)).filter(f=>/\.(png|jpe?g|webp)$/i.test(f)&&existsSync(`${dir}/${f.replace(/\.[^.]+$/,'.json')}`));
if(!images.length){console.log('No screenshots with a matching .json in tests/real/ (see tests/real/README.md).');process.exit(0);}
await mkdir(`${dir}/out`,{recursive:true});
const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});let failures=0;
for(const file of images){
 const name=file.replace(/\.[^.]+$/,''),spec=JSON.parse(await readFile(`${dir}/${name}.json`,'utf8')),problems=[];
 const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(server.resolvedUrls.local[0]);await page.locator('input[type=file][accept*=".psd"]').setInputFiles(`${dir}/${file}`);
  await page.waitForFunction(()=>/OCR regions|No text/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:600000});
  const regions=await page.evaluate(()=>[...document.querySelectorAll('.detected-text-overlay button')].map(b=>b.getAttribute('aria-label').replace('Edit detected text: ','')));
  for(const text of spec.contains??[])if(!regions.some(r=>r.includes(text)))problems.push(`not read: "${text}"`);
  for(const [i,edit] of (spec.edits??[]).entries()){
   const before=await page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal())?.pages[0].canvas.objects.length??0;});
   await page.getByRole('button',{name:'Find & replace'}).click();await page.getByLabel('Find text').fill(edit.find);await page.getByLabel('Replace with').fill(edit.replace);
   const replace=page.getByRole('button',{name:'Replace all'});
   if(await replace.isDisabled()){problems.push(`edit ${i+1}: "${edit.find}" not found`);await page.keyboard.press('Escape');continue;}
   await replace.click();await page.waitForTimeout(2500);
   const added=await page.evaluate(async n=>{const {restoreLocal}=await import('/src/model.ts');return (await restoreLocal()).pages[0].canvas.objects.slice(n).map(o=>({name:o.name,type:o.type,left:o.left,top:o.top,width:o.width*(o.scaleX??1),height:o.height*(o.scaleY??1)}));},before);
   if(!added.length)problems.push(`edit ${i+1}: nothing changed`);
   if(edit.letters&&!added.some(l=>/^Edited text:/.test(l.name)))problems.push(`edit ${i+1}: used the OCR font, not the image's letters`);
   // Before/after crop of the edited area for a visual check.
   const box=added.reduce((b,l)=>({x0:Math.min(b.x0,l.left),y0:Math.min(b.y0,l.top),x1:Math.max(b.x1,l.left+l.width),y1:Math.max(b.y1,l.top+l.height)}),{x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity});
   if(Number.isFinite(box.x0)){
    const crop=await page.evaluate(async([box,src])=>{const im=new Image();im.src=src;await im.decode();const pad=20,x=Math.max(0,box.x0-pad),y=Math.max(0,box.y0-pad),w=Math.min(im.width-x,box.x1-box.x0+2*pad),h=Math.min(im.height-y,box.y1-box.y0+2*pad);
     const art=document.querySelector('.artboard canvas.lower-canvas')||document.querySelector('.artboard canvas');const c=Object.assign(document.createElement('canvas'),{width:w*3,height:h*2*3+6});const x2=c.getContext('2d');x2.imageSmoothingEnabled=false;x2.fillStyle='#f00';x2.fillRect(0,0,c.width,c.height);
     x2.drawImage(im,x,y,w,h,0,0,w*3,h*3);const k=art.width/im.width;x2.drawImage(art,x*k,y*k,w*k,h*k,0,h*3+6,w*3,h*3);return c.toDataURL();},[box,`data:image/png;base64,${(await readFile(`${dir}/${file}`)).toString('base64')}`]);
    await writeFile(`${dir}/out/${name}-edit${i+1}.png`,Buffer.from(crop.split(',')[1],'base64'));
   }
  }
  if(errors.length)problems.push('page errors: '+errors.join('; '));
 }catch(e){problems.push(e.message.split('\n')[0]);}
 await page.close();
 console.log(`${problems.length?'FAIL':'ok  '} ${file}${problems.length?'\n     - '+problems.join('\n     - '):''}`);failures+=problems.length?1:0;
}
await browser.close();await server.close();
console.log(`\n${images.length-failures}/${images.length} screenshots passed. Crops: tests/real/out/`);process.exitCode=failures?1:0;
