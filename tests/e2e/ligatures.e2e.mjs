// A line typeset with ligatures ("ti" in Carlito, "ff" in Raleway) is narrower
// than its letters drawn one by one. The text box draws the groups its face
// joins as one unit, so its line is as wide as the browser's own, spaced or
// not; while the text is typed, the caret still moves letter by letter.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'vite';import {chromium} from 'playwright-core';

test('letter groups a face joins are drawn as one unit, and typed letter by letter',{timeout:300000},async()=>{
 const server=await createServer({logLevel:'error',server:{port:0,host:'127.0.0.1',hmr:false,watch:null}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'app/');await page.waitForTimeout(1500);
  const r=await page.evaluate(async()=>{
   const {ensureFont}=await import('/src/fonts.ts'),{Textbox}=await import('/src/text-appearance.ts'),{Canvas}=await import('/tests/e2e/ligatures-fabric.mjs');
   const out={};
   for(const [family,line,group] of [['Carlito','Maison de quartier','ti'],['Raleway Light','Plombier Chauffagiste','ff'],['Liberation Mono','office fitting','']]){
    await ensureFont(family);const g=document.createElement('canvas').getContext('2d');g.font=`100px "${family}"`;
    // charSpacing: the letters are placed one by one, as every text fitted to a scan is.
    const t=new Textbox(line,{fontFamily:family,fontSize:100,width:5000,splitByGrapheme:true,charSpacing:10});t.recognizedKey='ocr:test';t.initDimensions();
    const units=t._textLines[0];
    // The line as drawn (ink of the canvas) against the browser's own layout of it.
    const c=document.createElement('canvas');c.width=1400;c.height=200;const x=c.getContext('2d');x.translate(20+t.width/2,20+t.height/2);t._render(x);
    const d=x.getImageData(0,0,c.width,c.height).data;let right=0;for(let i=3;i<d.length;i+=4)if(d[i]>128)right=Math.max(right,(i>>2)%c.width);
    const m=g.measureText(line);
    out[family]={units:units.length,letters:Array.from(line).length,joined:units.includes(group),inkRight:right-20,natural:m.actualBoundingBoxRight+(units.length-1)*1};
   }
   // While typed: one unit a letter, then joined again.
   const canvas=new Canvas(document.createElement('canvas')),t=new Textbox('affiche',{fontFamily:'Raleway Light',fontSize:60,width:800,splitByGrapheme:true});t.recognizedKey='ocr:test';t.initDimensions();canvas.add(t);
   // Text that is not over a scan keeps its letters (a PDF's vector text is laid out letter by letter).
   out.plain=new Textbox('affiche',{fontFamily:'Raleway Light',fontSize:60,width:800,splitByGrapheme:true})._textLines[0].length;
   const before=t._textLines[0].length;t.enterEditing();const typing=t._textLines[0].length;t.exitEditing();const after=t._textLines[0].length;
   out.typing={before,typing,after};canvas.dispose();
   return out;
  });
  assert.ok(r.Carlito.joined&&r.Carlito.units===r.Carlito.letters-1,'"ti" is one unit in Carlito');
  assert.ok(r['Raleway Light'].joined&&r['Raleway Light'].units===r['Raleway Light'].letters-1,'"ff" is one unit in Raleway Light');
  assert.equal(r['Liberation Mono'].units,r['Liberation Mono'].letters,'a face that joins nothing keeps its letters');
  for(const f of ['Carlito','Raleway Light'])assert.ok(Math.abs(r[f].inkRight-r[f].natural)<=4,`${f}: the line ends where the browser's own does (${r[f].inkRight} vs ${r[f].natural.toFixed(1)})`);
  assert.deepEqual(r.typing,{before:5,typing:7,after:5},"\"ffi\" is one unit until the text is typed");
  assert.equal(r.plain,7);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
