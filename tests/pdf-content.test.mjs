// Content streams (tokenizer, string codes, ToUnicode, TJ placement) and
// in-place edits of a PDF's own text on invented pages: each edited page must
// render exactly like the page written with the new text, or fall back saying why.
import {test} from 'node:test';import assert from 'node:assert/strict';
import * as mupdf from 'mupdf';import PDFKit from 'pdfkit';
import {tokenize,parseOps,codesOf,encodeCodes,parseToUnicode,splitEdit,alignsRight,placeGlyphs,showOp} from '../tmp/pdf-content.mjs';
import {importBytes,detectPdfText,replacePdfText} from '../tmp/browser-core.mjs';

test('tokens keep their byte offsets; strings, names, numbers and inline images decode',()=>{
 const s='%c\nBT /F#201 12 Tf .5 -3 4. Td (a\\(b\\)\\\\\\101\\\nc(d)) Tj <48 65 6c6> Tj [(x) -120 <0001>] TJ ET BI /W 1 ID \x00EI\xff EI Q';
 const t=tokenize(s),pick=(type)=>t.filter(x=>x.t===type);
 assert.deepEqual(pick('name').map(x=>x.v),['F 1','W']);
 assert.deepEqual(pick('num').map(x=>x.v),[12,.5,-3,4,-120,1]);
 assert.deepEqual(pick('str').map(x=>[x.v,x.hex]),[['a(b)\\Ac(d)',false],['Hel`',true],['x',false],['\x00\x01',true]]);
 for(const x of t)if(x.t==='str'||x.t==='num')assert.equal(s.slice(x.start,x.end),x.raw,'offsets give the raw token');
 assert.ok(t.some(x=>x.t==='data'&&s.slice(x.start,x.end)==='\x00EI\xff '),'inline image data skipped up to a free-standing EI');
 const ops=parseOps(t).map(o=>o.op);assert.deepEqual(ops,['BT','Tf','Td','Tj','Tj','TJ','ET','BI','ID','EI','Q']);
 const tj=parseOps(t).find(o=>o.op==='TJ');assert.equal(s.slice(tj.start,tj.end),'[(x) -120 <0001>] TJ');
 assert.deepEqual(tj.args[0].v.map(v=>v.t),['str','num','str']);
 const bdc=parseOps(tokenize('/Span <</ActualText (x) /MCID 3>> BDC'))[0];assert.equal(bdc.args[1].t,'dict');assert.equal(bdc.args[1].v.MCID.v,3);
});

test('string codes round-trip in hex and literal form',()=>{
 assert.deepEqual(codesOf('\x00\x13\x0b\x84',2),[0x13,0xb84]);assert.equal(codesOf('\x01',2),null);assert.deepEqual(codesOf('AB',1),[65,66]);
 assert.equal(encodeCodes([0x13,0xb84],2,true,true),'<00130B84>');assert.equal(encodeCodes([0x13,0xb84],2,true),'<00130b84>');
 const literal=encodeCodes([40,41,92,10,233,65],1,false);assert.equal(literal,'(\\(\\)\\\\\\012\\351A)');
 assert.deepEqual(codesOf(tokenize(literal)[0].v,1),[40,41,92,10,233,65]);
});

test('ToUnicode maps: single codes, ranges, arrays, ligatures and surrogates',()=>{
 const {map,size}=parseToUnicode(`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
 1 begincodespacerange <0000> <FFFF> endcodespacerange
 3 beginbfchar <0003> <0020> <0B84> <20AC> <0050> <00660069> endbfchar
 1 beginbfchar <0051> <D835DC00> endbfchar
 2 beginbfrange <0013> <0015> <0030> <0020> <0022> [<0041> <00E9> <0043>] endbfrange endcmap end end`);
 assert.equal(size,2);
 assert.deepEqual([3,0xb84,0x13,0x14,0x15,0x20,0x21,0x22,0x50].map(c=>map.get(c)),[' ','€','0','1','2','A','é','C','fi']);
 assert.equal(map.get(0x51),'𝐀');
 assert.equal(parseToUnicode('begincodespacerange <00> <FF> endcodespacerange 1 beginbfchar <41> <0041> endbfchar').size,1);
});

test('the edited span, and which edge of a run stays',()=>{
 assert.deepEqual(splitEdit([...'3 412,85'],[...'3 421,85']),{p:3,s:3});
 assert.deepEqual(splitEdit([...'2 845,00'],[...'12 845,00']),{p:0,s:8});
 assert.deepEqual(splitEdit([...'aaa'],[...'aa']),{p:2,s:0});
 const row=(left,right,top)=>({left,right,top,bottom:top+10});
 // Amounts in a column end at x=520; labels start at x=120.
 const amount={...row(485,520,100),text:'2 845,00',size:9},others=[row(492,520,118),row(470,520,136),row(120,240,100),row(120,210,118)];
 assert.equal(alignsRight(amount,others),true);
 assert.equal(alignsRight({...row(120,180,136),text:'Carte du Parc',size:9},others),false);
 // Same width, both edges line up: amounts go right, words left.
 assert.equal(alignsRight({...row(56,78,100),text:'02/10',size:9},[row(56,78,118)]),true);
 assert.equal(alignsRight({...row(56,78,100),text:'Date',size:9},[row(56,78,118)]),false);
 assert.equal(alignsRight(amount,[row(485,520,100)]),false,'a run on the same line is not its column');
});

test('glyphs are placed with the fewest numbers, the original ones kept where they still fit',()=>{
 // k: one TJ unit is 0.01 page units; advances 5; the pen must end where it did.
 const g=(code,x,before)=>({code,x,adv:5,before});
 assert.deepEqual(placeGlyphs(0,15,.01,[g(1,0),g(2,5),g(3,10)]),[{codes:[1,2,3]}]);
 assert.deepEqual(placeGlyphs(0,14.8,.01,[g(1,0),g(2,4.8,[{raw:'20.0',v:20}]),g(3,9.8)]),[{codes:[1]},{n:20,raw:'20.0'},{codes:[2,3]}]);
 // A right-aligned edit: everything starts 5 earlier, and the pen still ends at 15.
 assert.deepEqual(placeGlyphs(5,15,.01,[g(9,0),g(1,5),g(2,10)]),[{n:500,raw:'500'},{codes:[9,1,2]}]);
 // A wider left-aligned edit leaves the pen 5 further: a trailing number brings it back.
 assert.deepEqual(placeGlyphs(0,10,.01,[g(1,0),g(2,5),g(3,10)]),[{codes:[1,2,3]},{n:500,raw:'500'}]);
 const pieces=[{n:-250.5,raw:'-250.5'},{codes:[65,66]}];
 assert.equal(showOp('Tj',[{codes:[65]}],{size:1,hex:false}),'(A) Tj');
 assert.equal(showOp('Tj',pieces,{size:1,hex:false}),'[-250.5 (AB)] TJ');
 assert.equal(showOp('TJ',[{codes:[0x13]}],{size:2,hex:true,upper:true}),'[<0013>] TJ');
 assert.equal(showOp("'",[{codes:[65]}],{size:1,hex:false}),"(A) '");assert.equal(showOp("'",pieces,{size:1,hex:false}),'T* [-250.5 (AB)] TJ');
 assert.equal(showOp('"',[{codes:[65]}],{size:1,hex:false,aw:'2',ac:'0'}),'2 0 (A) "');assert.equal(showOp('"',pieces,{size:1,hex:true,aw:'2',ac:'0.5'}),'2 Tw 0.5 Tc T* [-250.5 <4142>] TJ');
});

// --- In-place edits on invented pages ---------------------------------------
const helvetica=new mupdf.Font('Helvetica'),width=(text,size)=>[...text].reduce((w,c)=>w+helvetica.advanceGlyph(helvetica.encodeCharacter(c),0),0)*size;
// A PDF from content streams. `fonts` are standard Helvetica variants (not embedded); `forms` are Form XObjects.
function build(pages,{encoding='WinAnsiEncoding',forms={},box=[0,0,400,200]}={}){
 const doc=new mupdf.PDFDocument(),F1=doc.addObject({Type:'Font',Subtype:'Type1',BaseFont:'Helvetica',Encoding:encoding}),F2=doc.addObject({Type:'Font',Subtype:'Type1',BaseFont:'Helvetica-Bold',Encoding:'WinAnsiEncoding'});
 const xobjects=Object.fromEntries(Object.entries(forms).map(([name,content])=>[name,doc.addStream(content,{Type:'XObject',Subtype:'Form',BBox:box,Resources:{Font:{F1,F2}}})]));
 for(const content of pages){const streams=[content].flat(),page=doc.addPage(box,0,{Font:{F1,F2},XObject:xobjects},streams[0]);if(streams.length>1)page.put('Contents',streams.map(s=>doc.addStream(s,{})));doc.insertPage(-1,page);}
 const out=doc.saveToBuffer(''),bytes=out.asUint8Array().slice();out.destroy();doc.destroy();return bytes;
}
const pixels=(bytes,i=0)=>{const d=mupdf.Document.openDocument(bytes,'application/pdf'),p=d.loadPage(i),x=p.toPixmap(mupdf.Matrix.scale(2,2),mupdf.ColorSpace.DeviceRGB,false,true);try{return x.getPixels().slice();}finally{x.destroy();p.destroy();d.destroy();}};
const differing=(a,b,i=0)=>{const A=pixels(a,i),B=pixels(b,i);assert.equal(A.length,B.length);let n=0;for(let k=0;k<A.length;k+=3)if(A[k]!==B[k]||A[k+1]!==B[k+1]||A[k+2]!==B[k+2])n++;return n;};
const contents=(bytes,i=0)=>{const d=mupdf.Document.openDocument(bytes,'application/pdf'),c=d.loadPage(i).getObject().get('Contents'),all=[];(c.isArray()?[...Array(c.length).keys()].map(k=>c.get(k)):[c]).forEach(s=>all.push(s.readStream().asString()));return all.join('\n');};
// Edit the detected line containing `from` on page `index`; returns the new bytes, or the fallback reason.
async function edit(bytes,from,to,index=0,nth=0){
 const source=await importBytes(bytes,'page.pdf'),region=detectPdfText(source.id,index).regions.filter(r=>r.text.includes(from))[nth];
 assert.ok(region,`a line with ${from}`);const result=await replacePdfText(source.id,index,region.id,region.text.replace(from,to));
 return 'fallback' in result?result.fallback:Buffer.from(result.data,'base64');
}

test('a literal Tj string in standard Helvetica is rewritten with its own escapes',async()=>{
 const page=t=>`BT /F1 12 Tf 40 120 Td (${t}) Tj ET`,out=await edit(build([page('Total \\(net\\): 1 234,56 EUR')]),'1 234,56','1 243,56');
 assert.equal(differing(out,build([page('Total \\(net\\): 1 243,56 EUR')])),0);
 assert.match(contents(out),/\(Total \\\(net\\\): 1 243,56 EUR\) Tj/);
});

test("TJ gaps, ' and \" keep their meaning; a wider value keeps the pen where it was",async()=>{
 const page=(a,b,c)=>`BT /F1 12 Tf 14 TL 40 160 Td [(Total:) -900 (${a})] TJ (Amount ${b}) ' 3 0 (Paid on ${c}) " (Next line) ' ET`;
 let out=await edit(build([page('1 234,56','99,00','12/10')]),'1 234,56','1 243,56');
 assert.equal(differing(out,build([page('1 243,56','99,00','12/10')])),0);assert.match(contents(out),/\[\(Total:\) -900 \(1 243,56\)\] TJ/);
 out=await edit(build([page('1 234,56','99,00','12/10')]),'99,00','199,00');
 assert.equal(differing(out,build([page('1 234,56','199,00','12/10')])),0);assert.match(contents(out),/T\* \[\(Amount 199,00\) [\d.]+\] TJ/);
 out=await edit(build([page('1 234,56','99,00','12/10')]),'12/10','2/10');
 assert.equal(differing(out,build([page('1 234,56','99,00','2/10')])),0,'word spacing from " still applies');assert.match(contents(out),/3 Tw 0 Tc T\* \[/);
});

test('text in a Form XObject is edited in the form; a form other pages or draws share falls back',async()=>{
 const form=t=>`BT /F1 12 Tf 40 120 Td (Invoice total ${t}) Tj ET`;
 const out=await edit(build(['q /Fm Do Q'],{forms:{Fm:form('480,00')}}),'480,00','840,00');
 assert.equal(differing(out,build(['q /Fm Do Q'],{forms:{Fm:form('840,00')}})),0);assert.equal(contents(out),'q /Fm Do Q');
 assert.match(await edit(build(['q /Fm Do Q','q /Fm Do Q'],{forms:{Fm:form('480,00')}}),'480,00','840,00'),/other pages share/);
 assert.match(await edit(build(['q /Fm Do Q q 1 0 0 1 0 -60 cm /Fm Do Q'],{forms:{Fm:form('480,00')}}),'480,00','840,00'),/drawn more than once/);
});

test('the same text twice: the tapped occurrence changes',async()=>{
 const page=(a,b)=>`BT /F1 12 Tf 40 150 Td (Amount ${a}) Tj ET BT /F1 12 Tf 40 100 Td (Amount ${b}) Tj ET`;
 const out=await edit(build([page('12,50','12,50')]),'12,50','21,50',0,1);
 assert.equal(differing(out,build([page('12,50','21,50')])),0);
});

test('page contents in several streams, and a page box away from the origin',async()=>{
 const page=t=>['q 1 0 0 1 10 0 cm BT /F1 10 Tf',`120 180 Td (Due ${t}) Tj ET Q`],box=[100,100,500,300];
 const out=await edit(build([page('14/11/2026')],{box}),'14/11','15/11');
 assert.equal(differing(out,build([page('15/11/2026')],{box})),0);
});

test('MacRoman and /Differences codes are found for new characters',async()=>{
 const mac=t=>`BT /F1 14 Tf 40 120 Td (${t}) Tj ET`;
 let out=await edit(build([mac('Caf\\216 cr\\217me')],{encoding:'MacRomanEncoding'}),'Café','Cafè');
 assert.equal(differing(out,build([mac('Caf\\217 cr\\217me')],{encoding:'MacRomanEncoding'})),0);assert.match(contents(out),/Caf\\217/);
 const differences={BaseEncoding:'WinAnsiEncoding',Differences:[200,'Lslash']};
 out=await edit(build([mac('Office Lodz')],{encoding:differences}),'Lodz','Łodz');
 assert.equal(differing(out,build([mac('Office \\310odz')],{encoding:differences})),0);assert.match(contents(out),/Office \\310odz/);
 assert.match(await edit(build([mac('Office Lodz')]),'Lodz','Łodz'),/no “Ł”/,'plain WinAnsi has no Ł');
});

test('a right-aligned amount keeps its right edge; text that runs on, or would collide, falls back',async()=>{
 const table=a=>`BT /F1 9 Tf ${(300-width(a,9)).toFixed(3)} 150 Td (${a}) Tj ET BT /F1 9 Tf ${(300-width('120,00',9)).toFixed(3)} 132 Td (120,00) Tj ET BT /F1 9 Tf 40 150 Td (Rent) Tj ET`;
 const out=await edit(build([table('9 450,00')]),'9 450,00','19 450,00');
 assert.equal(differing(out,build([table('19 450,00')])),0);
 // A bold amount inside a sentence: the words after it would have to move.
 const sentence=v=>`BT /F1 12 Tf 40 120 Td (Total: ) Tj /F2 12 Tf (${v}) Tj /F1 12 Tf ( EUR due) Tj ET`;
 assert.match(await edit(build([sentence('42')]),'42','142'),/would have to move/);
 const same=await edit(build([sentence('42')]),'42','43');assert.equal(differing(same,build([sentence('43')])),0,'the same width needs no move');
 const columns=`BT /F1 12 Tf 40 120 Td (Label) Tj ET BT /F1 12 Tf 110 120 Td (Value) Tj ET`;
 assert.match(await edit(build([columns]),'Label','Label with more words'),/run into/);
});

test('pdfkit kerning is reused from the page for the new letters',async()=>{
 const make=name=>new Promise(resolve=>{const doc=new PDFKit({size:[400,200],margin:20}),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.registerFont('R','src/browser/fonts/LiberationSans-Regular.ttf');doc.font('R').fontSize(14).text('Grand Total: AVA Tours',30,30).text(`Pay to: ${name}`,30,70);doc.end();});
 const original=await make('Acme');assert.match(contents(original),/\] TJ/,'pdfkit kerns with TJ numbers');
 const out=await edit(original,'Acme','Tours');
 assert.equal(differing(out,await make('Tours')),0,'the same kerning as pdfkit gives the new word');
});
