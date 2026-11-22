// A user's own font file: added from OCR settings, listed under "Your fonts",
// kept for the next visit, and tried first when a scanned line is set in a font.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';import {readFile} from 'node:fs/promises';
import * as mupdf from 'mupdf';
import {fieldScore,verdict} from '../edit-bench/score.mjs';

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


const ownFamily='Bide Private Face';
const browserOptions=()=>({executablePath:process.env.CHROMIUM_PATH||undefined,
 ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{}),
 args:['--proxy-bypass-list=127.0.0.1;localhost']});
const openSettings=async page=>{await page.locator('.ocr-settings').waitFor({state:'attached',timeout:120000});await page.evaluate(()=>document.querySelector('.ocr-settings').open=true);};
async function addUsingMenu(page,files){
 await page.locator('.menubar').getByRole('button',{name:'File',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');
 await page.locator('.dropdown').getByRole('button',{name:'Add font files',exact:true}).click();
 await (await chooser).setFiles(files);
}
const storeState=page=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');return restoreLocal();});
async function savedTextbox(page,text){
 const deadline=Date.now()+30000;let project;
 while(Date.now()<deadline){project=await storeState(page);const found=project?.pages?.[0]?.canvas?.objects?.find(o=>/textbox/i.test(o.type??'')&&o.text===text);if(found)return {project,textbox:found};await page.waitForTimeout(100);}
 assert.fail('The actual edited text was not saved: '+text);
}
async function downloadOwnPng(page){
 await page.locator('.document-actions .primary').click();
 assert.equal(await page.getByRole('dialog',{name:'Export document',exact:true}).locator('select').first().inputValue(),'image','the original image kind remains the default');
 const [file]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('dialog',{name:'Export document',exact:true}).locator('.dialog-actions .primary').click()]);
 const bytes=await readFile(await file.path());await file.delete();assert.match(file.suggestedFilename(),/\.png$/);return bytes;
}
async function downloadOwnPdf(page){
 await page.locator('.document-actions .primary').click();const modal=page.getByRole('dialog',{name:'Export document',exact:true});await modal.locator('select').first().selectOption('pdf');await modal.locator('label').filter({hasText:/^Compression/}).locator('select').selectOption('lossless');
 const [file]=await Promise.all([page.waitForEvent('download',{timeout:60000}),modal.locator('.dialog-actions .primary').click()]);const bytes=await readFile(await file.path());await file.delete();assert.match(file.suggestedFilename(),/\.pdf$/);return bytes;
}
function renderedPdf(bytes){const doc=mupdf.Document.openDocument(bytes,'pdf'),page=doc.loadPage(0),pix=page.toPixmap(mupdf.Matrix.scale(1,1),mupdf.ColorSpace.DeviceRGB,false,true);try{const n=pix.getNumberOfComponents(),source=pix.getPixels(),data=new Uint8Array(pix.getWidth()*pix.getHeight()*4);for(let i=0,j=0;i<source.length;i+=n,j+=4){data[j]=source[i];data[j+1]=source[i+1];data[j+2]=source[i+2];data[j+3]=n===4?source[i+3]:255;}return {width:pix.getWidth(),height:pix.getHeight(),w:pix.getWidth(),h:pix.getHeight(),data};}finally{pix.destroy();page.destroy();doc.destroy();}}
function decoded(bytes){
 const image=new mupdf.Image(bytes),pix=image.toPixmap();
 try{const n=pix.getNumberOfComponents(),source=pix.getPixels(),data=new Uint8Array(pix.getWidth()*pix.getHeight()*4);for(let i=0,j=0;i<source.length;i+=n,j+=4){data[j]=source[i];data[j+1]=source[i+1];data[j+2]=source[i+2];data[j+3]=n===4?source[i+3]:255;}return {width:pix.getWidth(),height:pix.getHeight(),w:pix.getWidth(),h:pix.getHeight(),data};}
 finally{pix.destroy();image.destroy();}
}
async function ownFixture(browser,font,text='Order 4417 ready'){
 const page=await browser.newPage();
 try{return await page.evaluate(async({font,text})=>{
  const bytes=Uint8Array.from(atob(font),c=>c.charCodeAt(0)),face=await new FontFace('Independent font fixture',bytes.buffer).load();document.fonts.add(face);
  const c=document.createElement('canvas');c.width=800;c.height=220;const g=c.getContext('2d');g.fillStyle='#f5f7fb';g.fillRect(0,0,c.width,c.height);g.fillStyle='#263644';g.font='32px "Independent font fixture"';g.fillText(text,60,90);
  const m=g.measureText(text),box={x:60-m.actualBoundingBoxLeft,y:90-m.actualBoundingBoxAscent,w:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};
  g.font='24px "Independent font fixture"';g.fillText('Keep this line unchanged',60,166);
  return {png:c.toDataURL('image/png').split(',')[1],box};
 },{font:font.toString('base64'),text});}finally{await page.close();}
}
function noCollateral(before,after,box,pad=8){
 assert.deepEqual([after.width,after.height],[before.width,before.height]);let changed=0;
 for(let y=0;y<before.height;y++)for(let x=0;x<before.width;x++){if(x>=box.x-pad&&x<box.x+box.w+pad&&y>=box.y-pad&&y<box.y+box.h+pad)continue;const i=(y*before.width+x)*4;if([0,1,2,3].some(k=>before.data[i+k]!==after.data[i+k]))changed++;}
 assert.equal(changed,0,'Every pixel outside the edited line remains identical');
}
const canvasFontPixels=(page,family)=>page.evaluate(async family=>{await document.fonts.load(`24px "${family}"`);const c=document.createElement('canvas');c.width=400;c.height=60;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,400,60);g.fillStyle='#111';g.font=`24px "${family}"`;g.fillText('Existing document 4417',8,40);return [...g.getImageData(0,0,400,60).data];},family);

test('an uploaded unbundled face matches an explicit edit, exports faithfully and restores before the saved page opens',{timeout:900000},async()=>{
 const regular=await readFile('tests/fixtures/fonts/BeVietnamPro-Regular.ttf'),bold=await readFile('tests/fixtures/fonts/BeVietnamPro-Bold.ttf');
 const files=[{name:ownFamily+'-Regular.ttf',mimeType:'font/ttf',buffer:regular},{name:ownFamily+'-Bold.ttf',mimeType:'font/ttf',buffer:bold}];
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();const browser=await chromium.launch(browserOptions());
 try{
  const original=await ownFixture(browser,regular),wanted='Order 4481 ready',reference=await ownFixture(browser,regular,wanted);
  const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');
  await addUsingMenu(page,files);await page.getByText(ownFamily+' added',{exact:false}).waitFor({timeout:30000});
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:'private-face.png',mimeType:'image/png',buffer:Buffer.from(original.png,'base64')});
  const line=page.getByRole('button',{name:'Edit detected text: Order 4417 ready',exact:true});await line.waitFor({timeout:240000});
  await openSettings(page);assert.equal(await page.getByLabel('Edit image text with').inputValue(),'letters','adding a font never permits automatic substitution');
  assert.equal(await page.locator('select[aria-label="OCR replacement font"] optgroup[label="Your fonts"] option').filter({hasText:ownFamily}).count(),1);
  await page.evaluate(()=>document.querySelector('.ocr-settings').open=false);
  const before=await storeState(page);await line.click();await page.getByLabel('New text').fill(wanted);await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.locator('.lettering-refusal').waitFor({timeout:60000});assert.equal(await page.getByLabel('New text').inputValue(),wanted);
  assert.deepEqual((await storeState(page)).pages[0].canvas,before.pages[0].canvas,'a missing original digit is refused even when a matching font was uploaded');
  await page.getByRole('button',{name:'Use a font for this edit',exact:true}).click();
  const saved=await savedTextbox(page,wanted);assert.equal(saved.textbox.fontFamily,ownFamily,'automatic font fitting chooses the uploaded, genuinely unbundled face');
  assert.ok(saved.textbox.extraFontRequired?.some(r=>r.family===ownFamily&&r.origin==='yours'&&r.faces.length===2),'the saved project records both actual font-face identities');
  assert.equal(await page.getByLabel('Edit image text with').inputValue(),'letters','consent applies only to this edit');
  const first=decoded(await downloadOwnPng(page)),source=decoded(Buffer.from(original.png,'base64')),expected=decoded(Buffer.from(reference.png,'base64'));
  const box={x:Math.min(original.box.x,reference.box.x),y:Math.min(original.box.y,reference.box.y),w:Math.max(original.box.x+original.box.w,reference.box.x+reference.box.w)-Math.min(original.box.x,reference.box.x),h:Math.max(original.box.y+original.box.h,reference.box.y+reference.box.h)-Math.min(original.box.y,reference.box.y)};
  noCollateral(source,first,box);const score=fieldScore(first,expected,box,96);assert.ok(['mismatch','mass','core','sharp'].every(k=>Number.isFinite(score[k]))&&score.shift.every(Number.isFinite),'appearance scores must be measured, never NaN');assert.deepEqual(verdict(score,96),[],'the downloaded edit matches the independent face/weight/sharpness reference: '+JSON.stringify(score));

  const pdf=renderedPdf(await downloadOwnPdf(page));noCollateral(source,pdf,box);const pdfScore=fieldScore(pdf,expected,box,96);assert.ok(['mismatch','mass','core','sharp'].every(k=>Number.isFinite(pdfScore[k]))&&pdfScore.shift.every(Number.isFinite));assert.deepEqual(verdict(pdfScore,96),[],'the lossless PDF also retains the custom face/weight/sharpness: '+JSON.stringify(pdfScore));

  // Delay precisely the restored private face, not all browser fonts or OCR.
  await page.evaluate(()=>sessionStorage.setItem('font-test-hold-restoration','yes'));
  await page.addInitScript(()=>{
   const armed=sessionStorage.getItem('font-test-hold-restoration')==='yes';sessionStorage.removeItem('font-test-hold-restoration');
   window.__fontRestoreGate={waiting:false,released:false,holds:0};if(!armed)return;
   const native=FontFace.prototype.load;let hold=true;
   FontFace.prototype.load=function(){const ready=native.call(this);if(hold&&this.family.replace(/["']/g,'')==='Bide Private Face'){hold=false;window.__fontRestoreGate.waiting=true;window.__fontRestoreGate.holds++;return ready.then(face=>new Promise(resolve=>{window.__fontRestoreGate.release=()=>{window.__fontRestoreGate.released=true;resolve(face);};}));}return ready;};
  });
  await page.reload();await page.waitForFunction(()=>window.__fontRestoreGate.waiting,null,{timeout:60000});
  const premature=[];const observed=file=>premature.push(file.suggestedFilename());page.on('download',observed);
  const exportButton=page.locator('.document-actions .primary');
  if(await exportButton.isEnabled()){
   await exportButton.click();const confirm=page.getByRole('dialog',{name:'Export document',exact:true}).locator('.dialog-actions .primary');
   if(await confirm.isVisible()&&await confirm.isEnabled())await confirm.click();
  }
  assert.equal(await page.evaluate(()=>window.__fontRestoreGate.released),false);assert.deepEqual(premature,[],'a font that is still restoring cannot produce an early fallback download');
  await page.evaluate(()=>window.__fontRestoreGate.release());
  await page.waitForFunction(async()=>{const {extraFonts}=await import('/src/extra-fonts.ts');return extraFonts('yours').some(f=>f.family==='Bide Private Face'&&f.styles.includes('Regular'));},null,{timeout:60000});
  if(await page.getByRole('button',{name:'Got it',exact:true}).isVisible())await page.getByRole('button',{name:'Got it',exact:true}).click();
  if(await page.getByRole('dialog',{name:'Export document',exact:true}).isVisible())await page.getByRole('dialog',{name:'Export document',exact:true}).getByRole('button',{name:'Close dialog',exact:true}).click();
  page.off('download',observed);await savedTextbox(page,wanted);
  const restored=decoded(await downloadOwnPng(page));assert.deepEqual(restored,first,'the saved custom-font project reopens with exactly the same pixels');
  assert.equal(await page.evaluate(()=>window.__fontRestoreGate.holds),1);

  // A genuinely absent font cannot silently turn into the system fallback.
  await page.evaluate(async family=>(await import('/src/extra-fonts.ts')).removeFont(family),ownFamily);await page.reload();
  await page.getByText(/font.*(?:missing|unavailable|required|add)|(?:add|restore).*font/i).first().waitFor({timeout:60000});
  const preserved=await savedTextbox(page,wanted);assert.equal(preserved.textbox.fontFamily,ownFamily);assert.deepEqual(preserved.textbox.extraFontRequired,saved.textbox.extraFontRequired,'the missing font keeps its exact saved identity');
  if(await page.getByRole('button',{name:'Got it',exact:true}).isVisible())await page.getByRole('button',{name:'Got it',exact:true}).click();
  const missingDownloads=[];const missing=file=>missingDownloads.push(file.suggestedFilename());page.on('download',missing);
  await page.locator('.document-actions .primary').click();
  if(await page.getByRole('dialog',{name:'Export document',exact:true}).locator('.dialog-actions .primary').isVisible())await page.getByRole('dialog',{name:'Export document',exact:true}).locator('.dialog-actions .primary').click();
  await page.getByText(/font.*(?:missing|unavailable|required|add)|(?:add|restore).*font/i).first().waitFor({timeout:60000});assert.deepEqual(missingDownloads,[],'a missing font blocks downloading a substitute');
  if(await page.getByRole('button',{name:'Got it',exact:true}).isVisible())await page.getByRole('button',{name:'Got it',exact:true}).click();
  if(await page.getByRole('dialog',{name:'Export document',exact:true}).isVisible())await page.getByRole('dialog',{name:'Export document',exact:true}).getByRole('button',{name:'Close dialog',exact:true}).click();
  page.off('download',missing);await addUsingMenu(page,files);await page.getByText(ownFamily+' added',{exact:false}).waitFor({timeout:30000});
  const recovered=decoded(await downloadOwnPng(page));assert.deepEqual(recovered,first,'adding the missing file restores the saved text and its exact appearance');assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('font-file name collisions preserve existing bundled and system lettering',{timeout:300000},async()=>{
 const bytes=await readFile('tests/fixtures/fonts/BeVietnamPro-Regular.ttf');
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();const browser=await chromium.launch(browserOptions());
 try{const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(server.resolvedUrls.local[0]+'app/');
  const before={Arial:await canvasFontPixels(page,'Arial'),Inter:await canvasFontPixels(page,'Inter')};
  await addUsingMenu(page,[{name:'Arial-Regular.ttf',mimeType:'font/ttf',buffer:bytes},{name:'Inter-Regular.ttf',mimeType:'font/ttf',buffer:bytes}]);
  await page.getByText(/Arial \(yours\).*Inter \(yours\).*added/).waitFor({timeout:30000});
  const names=await page.evaluate(async()=>(await import('/src/extra-fonts.ts')).extraFonts('yours').map(f=>f.family));assert.deepEqual(names.sort(),['Arial (yours)','Inter (yours)']);
  assert.deepEqual(await canvasFontPixels(page,'Arial'),before.Arial,'an added system-named file does not change existing Arial text');
  assert.deepEqual(await canvasFontPixels(page,'Inter'),before.Inter,'an added bundled-named file does not change existing Inter text');assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
