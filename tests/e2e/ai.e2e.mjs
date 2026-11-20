// End-to-end checks of the bundled AI models (PaddleOCR, LaMa, Real-ESRGAN).
// Runs on the CPU in headless Chromium, so each model takes seconds to tens of seconds.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
// OCR options sit in the "OCR settings" dropdown; open it before using one.
const ocrSetting=async(page,label)=>{await page.locator('.ocr-settings').waitFor({state:'attached',timeout:120000});await page.evaluate(()=>{const d=document.querySelector('.ocr-settings');if(d)d.open=true;});return page.getByLabel(label);};

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
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.locator('input[type=file][accept*=".psd"]').setInputFiles(image);
  await page.waitForFunction(()=>/OCR regions/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:180000});

  // PaddleOCR reads both label lines.
  await (await ocrSetting(page,'OCR engine')).selectOption('paddle');
  await page.waitForFunction(()=>/regions · AI OCR/.test(document.querySelector('.text-detection-bar span')?.textContent||''),null,{timeout:300000});
  const read=await page.evaluate(()=>[...document.querySelectorAll('.detected-text-overlay button')].map(b=>b.getAttribute('aria-label')));
  assert.ok(read.some(l=>/HUERTO DE/.test(l))&&read.some(l=>/LOS NARANJOS/.test(l)),'AI OCR read: '+read.join(' | '));

  // LaMa fills the background behind replaced text.
  await (await ocrSetting(page,'Text replacement background')).selectOption('ai');await (await ocrSetting(page,'Edit image text with')).selectOption('font');
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

test('AI OCR recovers with Rescan after its first runtime download is interrupted, without reloading or changing the document',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:1400,height:900}}),page=await context.newPage(),requests=[],errors=[];
  let blocked=true;
  await context.route('**/ai/ort/*.wasm',async route=>{requests.push({blocked});if(blocked)await route.abort('failed');else await route.continue();});
  page.on('pageerror',error=>errors.push({blocked,message:error.message}));
  const shot=await context.newPage();await shot.setViewportSize({width:750,height:250});
  await shot.setContent('<body style="margin:0;background:white;color:#222;padding:35px;font:30px Arial">Invoice total 1947 EUR<br>Quarterly maintenance report</body>');const image=await shot.screenshot();await shot.close();
  await page.goto(server.resolvedUrls.local[0]+'app/');
  await page.locator('input[type=file][accept*=".psd"]').setInputFiles({name:'invented-network-recovery.png',mimeType:'image/png',buffer:image});
  await page.waitForFunction(()=>document.querySelector('.text-detection-bar > span')?.textContent.startsWith('Text detection unavailable:'),null,{timeout:180000});
  const initialFailure=await page.locator('.text-detection-bar > span').innerText();
  assert.ok(requests.some(r=>r.blocked),'the cold runtime download was actually interrupted');
  assert.equal(await page.locator('.detected-text-overlay button').count(),0,'the interrupted scan produced no fields');
  assert.equal(await (await ocrSetting(page,'OCR engine')).inputValue(),'paddle','the initial scan used AI OCR');
  assert.equal(await (await ocrSetting(page,'Edit image text with')).inputValue(),'letters');
  await page.locator('.ocr-settings > summary').click();
  const saved=()=>page.evaluate(async()=>{const {restoreLocal}=await import('/src/model.ts');const p=await restoreLocal(),first=p?.pages[0];return first?.canvas.objects.some(o=>o.name==='invented-network-recovery.png')?{canvas:first.canvas,source:first.source,sources:p.sources}:undefined;});
  let before;for(let i=0;i<100&&!before;i++){before=await saved();if(!before)await page.waitForTimeout(100);}assert.ok(before,'the imported image was saved before retrying');
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.evaluate(()=>{const status=document.querySelector('.text-detection-bar > span');window.__aiRecoveryStatuses=[];const observer=new MutationObserver(()=>window.__aiRecoveryStatuses.push(status.textContent));observer.observe(status,{childList:true,characterData:true,subtree:true});});
  blocked=false;await page.getByRole('button',{name:'Rescan',exact:true}).click();
  await page.waitForFunction(()=>{const status=document.querySelector('.text-detection-bar > span')?.textContent||'';return window.__aiRecoveryStatuses.some(s=>s.includes('…'))&&!status.includes('…')&&(/^\d+ OCR regions.*AI OCR/.test(status)||status.startsWith('Text detection unavailable:'));},null,{timeout:180000});
  assert.match(await page.locator('.text-detection-bar > span').innerText(),/^\d+ OCR regions.*AI OCR/,'Rescan recovers after the download interruption');
  const fields=await page.locator('.detected-text-overlay button').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label')));
  assert.ok(fields.some(s=>s.includes('Invoice total 1947 EUR'))&&fields.some(s=>s.includes('Quarterly maintenance report')),'the restored runtime reads both original lines');
  assert.ok(requests.some(r=>!r.blocked),'Rescan fetched a fresh runtime after the interruption');
  assert.equal(navigations,0,'recovery did not reload or navigate the page');
  assert.deepEqual(await saved(),before,'recovery kept the source image and every original canvas object unchanged');
  assert.equal(await (await ocrSetting(page,'OCR engine')).inputValue(),'paddle');assert.equal(await (await ocrSetting(page,'Edit image text with')).inputValue(),'letters','recovery keeps original-letter editing');
  assert.deepEqual(errors.filter(e=>!e.blocked),[],'the recovered runtime has no browser errors');
  assert.match(initialFailure,/AI could not start.*Rescan/,'the initial failure explains how to retry');
 }finally{await browser.close();await server.close();}
});

test('fatal AI initialization settles queued calls once and isolates replacement workers from late replies',{timeout:120000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1'}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage();
  await page.route('**/ai-worker-lifecycle-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>AI worker lifecycle harness</title>'}));
  await page.goto(server.resolvedUrls.local[0]+'ai-worker-lifecycle-harness');
  const result=await page.evaluate(async()=>{
   const original=window.Worker,workers=[],settled={},progress=[];
   // Control the worker protocol while exercising the real main-thread client.
   // The preceding test uses an actual failed WASM download and real inference.
   window.Worker=class{
    constructor(){this.messages=[];this.terminations=0;workers.push(this);}
    postMessage(message){this.messages.push(message);if(message.type==='init')queueMicrotask(()=>this.onmessage({data:{id:message.id}}));}
    terminate(){this.terminations++;}
   };
   try{
    const ai=await import('/src/browser/ai.ts'),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
    const invoke=name=>ai.runModel(name,{input:{data:new Float32Array([1]),dims:[1]}},undefined,p=>progress.push(p)).then(value=>{settled[name]=(settled[name]??0)+1;return {state:'fulfilled',value:value.output.data[0]};},error=>{settled[name]=(settled[name]??0)+1;return {state:'rejected',message:error.message};});
    const runs=w=>w.messages.filter(m=>m.type==='run');
    const reply=(worker,id,value)=>worker.onmessage({data:{id,backend:'wasm',outputs:{output:{data:new Float32Array([value]),dims:[1]}}}});
    const first=invoke('first'),queued=invoke('queued');await tick();const old=workers[0];
    if(runs(old).length!==2)throw new Error('Both initial calls must be queued in the same worker.');
    old.onmessage({data:{id:runs(old)[0].id,error:'runtime initialization failed',restart:true}});
    const initial=await Promise.all([first,queued]);
    const fresh=invoke('fresh');await tick();const current=workers[1],freshId=runs(current)[0].id;
    // A terminated generation must not settle a new request or tear it down.
    reply(old,freshId,999);old.onerror({message:'late old-worker failure'});
    reply(current,freshId,37);const freshResult=await fresh;
    const nonfatal=invoke('nonfatal'),peer=invoke('peer');await tick();const [failedRun,peerRun]=runs(current).slice(-2);
    old.onmessage({data:{id:failedRun.id,progress:{stage:'download',loaded:9,total:10}}});
    current.onmessage({data:{id:failedRun.id,progress:{stage:'download',loaded:1,total:2}}});
    current.onmessage({data:{id:failedRun.id,error:'AI model download failed'}});
    const normalError=await nonfatal,peerSettledBeforeReply=settled.peer??0;
    reply(current,peerRun.id,51);const peerResult=await peer;
    const crashFirst=invoke('crash-first'),crashPeer=invoke('crash-peer');await tick();current.onerror({message:'browser worker crashed'});
    const crashed=await Promise.all([crashFirst,crashPeer]),backendAfterCrash=ai.aiBackend;
    const afterCrash=invoke('after-crash');await tick();const last=workers[2];reply(last,runs(last)[0].id,73);const finalResult=await afterCrash;
    return {initial,freshResult,normalError,peerSettledBeforeReply,peerResult,crashed,backendAfterCrash,finalResult,settled,progress,workers:workers.map(w=>({terminations:w.terminations,initializations:w.messages.filter(m=>m.type==='init').length,models:runs(w).map(m=>m.model)}))};
   }finally{window.Worker=original;}
  });
  assert.deepEqual(result.initial.map(v=>v.state),['rejected','rejected']);for(const v of result.initial)assert.match(v.message,/AI could not start.*Rescan/);
  assert.deepEqual(result.freshResult,{state:'fulfilled',value:37},'late replies from the terminated worker cannot settle the replacement call');
  assert.deepEqual(result.normalError,{state:'rejected',message:'AI model download failed'});assert.equal(result.peerSettledBeforeReply,0,'a normal model error does not reject its queued peer');assert.deepEqual(result.peerResult,{state:'fulfilled',value:51});
  assert.deepEqual(result.progress,[{stage:'download',loaded:1,total:2}],'only progress from the current worker reaches its caller');
  assert.deepEqual(result.crashed.map(v=>v.state),['rejected','rejected']);for(const v of result.crashed)assert.equal(v.message,'browser worker crashed');assert.equal(result.backendAfterCrash,'');assert.deepEqual(result.finalResult,{state:'fulfilled',value:73});
  assert.deepEqual(result.settled,{'first':1,'queued':1,'fresh':1,'nonfatal':1,'peer':1,'crash-first':1,'crash-peer':1,'after-crash':1},'every request settles exactly once');
  assert.deepEqual(result.workers,[{terminations:1,initializations:1,models:['first','queued']},{terminations:1,initializations:1,models:['fresh','nonfatal','peer','crash-first','crash-peer']},{terminations:0,initializations:1,models:['after-crash']}],'fatal errors replace a worker once without replaying transferred requests');
 }finally{await browser.close();await server.close();}
});
