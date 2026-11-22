// First-use UI must be exercised explicitly: ordinary automated sessions skip
// the welcome card. Imported portrait documents open readably, while each
// deliberate Fit command still shows the whole page.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import * as mupdf from 'mupdf';

const variants=[
 {name:'desktop',viewport:{width:1400,height:900}},
 {name:'phone',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true},
];
const current=page=>page.locator('.workspace-nav button[aria-current=page]').getAttribute('aria-label');
const welcome=page=>page.getByRole('dialog',{name:'Welcome',exact:true});
const field=page=>page.getByRole('button',{name:'Edit detected text: PORTRAIT DOCUMENT ONE',exact:true});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const geometry=page=>page.evaluate(()=>{
 const page=document.querySelector('.artboard'),root=document.querySelector('.canvas-workspace'),box=page.getBoundingClientRect();
 return {width:box.width,height:box.height,availableWidth:root.clientWidth,availableHeight:root.clientHeight,scrollTop:root.scrollTop};
});
function portrait(){
 const doc=new mupdf.PDFDocument(),font=doc.addSimpleFont(new mupdf.Font('Courier'),'Latin');
 const created=doc.addPage([0,0,595,1800],0,{Font:{F:font}},'BT /F 16 Tf 60 1700 Td (PORTRAIT DOCUMENT ONE) Tj 0 -32 Td (PORTRAIT DOCUMENT TWO) Tj ET');
 doc.insertPage(-1,created);
 try{return {name:'invented-tall-portrait.pdf',mimeType:'application/pdf',buffer:Buffer.from(doc.saveToBuffer('').asUint8Array())};}
 finally{created.destroy();font.destroy();doc.destroy();}
}
async function session(browser,variant){
 const {name,...options}=variant,context=await browser.newContext(options),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));return {context,page,errors};
}
async function activate(page,locator,variant){if(variant.hasTouch)await locator.tap();else await locator.click();}
async function checkCard(page,variant){
 await welcome(page).waitFor({timeout:60000});
 assert.equal(await current(page),'Photo editor',variant.name+': first use opens the text-capable Photo editor');
 const bounds=await welcome(page).boundingBox();
 assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=variant.viewport.width&&bounds.y+bounds.height<=variant.viewport.height,variant.name+': welcome fits the screen');
 if(variant.hasTouch)for(const button of await welcome(page).getByRole('button').all()){
  const rect=await button.boundingBox();assert.ok(rect.height>=44,variant.name+': welcome actions have finger-sized targets');
 }
}

test('welcome actions work on desktop and phones; dismissal persists and PDF tool links keep their destination',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined}),url=server.resolvedUrls.local[0]+'app/';
 try{for(const variant of variants){
  const example=await session(browser,variant);
  try{
   await example.page.goto(url+'?welcome&tool=compress');
   await example.page.getByRole('heading',{name:'Make your PDF smaller',exact:true}).waitFor({timeout:60000});
   assert.equal(await current(example.page),'PDF MasterTool',variant.name+': a PDF tool link keeps its requested workspace');
   assert.equal(await welcome(example.page).isVisible(),false,variant.name+': welcome does not cover the PDF tool');
   await example.page.goto(url+'?welcome');await checkCard(example.page,variant);
   await activate(example.page,welcome(example.page).getByRole('button',{name:'Explore the example',exact:true}),variant);
   assert.equal(await welcome(example.page).count(),0,variant.name+': Explore dismisses welcome');
   await example.page.locator('.artboard').waitFor();
   assert.equal(await example.page.evaluate(()=>sessionStorage.getItem('bide-welcome')),'no');
   await example.page.reload();await example.page.locator('.artboard').waitFor({timeout:60000});
   assert.equal(await welcome(example.page).count(),0,variant.name+': welcome stays dismissed after reload');
   assert.deepEqual(example.errors,[]);
  }finally{await example.context.close();}
  const opening=await session(browser,variant);
  try{
   await opening.page.goto(url+'?welcome');await checkCard(opening.page,variant);
   const chooser=opening.page.waitForEvent('filechooser');
   await activate(opening.page,welcome(opening.page).getByRole('button',{name:'Open a file',exact:true}),variant);
   await (await chooser).setFiles(portrait());await field(opening.page).waitFor({timeout:120000});
   assert.equal(await welcome(opening.page).count(),0,variant.name+': Open dismisses welcome and imports the selected document');
   assert.equal(await opening.page.evaluate(()=>sessionStorage.getItem('bide-welcome')),'no');
   assert.deepEqual(opening.errors,[]);
  }finally{await opening.context.close();}
 }}finally{await browser.close();await server.close();}
});

test('portrait documents open at readable width; footer, toolbar and keyboard Fit still show the whole page',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined}),url=server.resolvedUrls.local[0]+'app/';
 try{for(const variant of variants){
  const {context,page,errors}=await session(browser,variant);
  try{
   await page.goto(url+'?welcome');await checkCard(page,variant);
   await activate(page,welcome(page).getByRole('button',{name:'Explore the example',exact:true}),variant);
   await page.locator('input[type=file][accept*=".psd"]').setInputFiles(portrait());await field(page).waitFor({timeout:120000});await settle(page);
   const readable=await geometry(page);
   assert.ok(readable.width>=readable.availableWidth*.85&&readable.width<=readable.availableWidth,variant.name+': imported text fills the usable width');
   assert.ok(readable.height>readable.availableHeight*1.25,variant.name+': a tall document opens readably instead of shrinking to a miniature');
   assert.equal(readable.scrollTop,0,variant.name+': the opened page starts at its top');
   if(variant.hasTouch)assert.equal(await page.locator('.command-strip.reading>.options-bar').isVisible(),false,'phone reading gives the options row space to the page');
   else assert.equal(await page.locator('.text-guide').isVisible(),true,'detected text has a visible editing guide');
   const fits=[['footer',()=>activate(page,page.getByRole('button',{name:'Fit to screen',exact:true}),variant)],
    ...(!variant.hasTouch?[['toolbar',()=>page.getByRole('button',{name:'Fit page (Ctrl 0)',exact:true}).click()]]:[]),
    ['keyboard',()=>page.keyboard.press('Control+0')]];
   let reference;
   for(const [label,fit] of fits){
    await activate(page,page.locator('button[title="Reset to 100%"]'),variant);await settle(page);
    assert.ok((await geometry(page)).height>1500,variant.name+': '+label+' starts zoomed in');
    await fit();await settle(page);const whole=await geometry(page);
    assert.ok(whole.height<=whole.availableHeight&&whole.width<=whole.availableWidth,variant.name+': '+label+' fits the entire page');
    assert.ok(whole.width<readable.width*.8,variant.name+': deliberate Fit is distinct from the readable opening zoom');
    if(reference)assert.ok(Math.abs(whole.width-reference.width)<.1&&Math.abs(whole.height-reference.height)<.1,variant.name+': '+label+' agrees with the other Fit commands');
    else reference=whole;
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }}finally{await browser.close();await server.close();}
});
