import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inkDensity,chooseBold} from '../tmp/ocr-weight.mjs';
function patch(coverage,light){return Uint8ClampedArray.from(Array.from({length:100},(_,i)=>[...(i<coverage?(light?[255,255,255]:[0,0,0]):(light?[0,0,0]:[255,255,255])),255]).flat());}
test('stroke coverage is independent of foreground polarity',()=>{
 for(const light of [true,false]){
  const bg=light?[0,0,0]:[255,255,255];
  assert.equal(inkDensity(patch(25,light),bg),.25);
  assert.equal(inkDensity(patch(45,light),bg),.45);
  assert.equal(chooseBold(inkDensity(patch(25,light),bg),.25,.45),false);
  assert.equal(chooseBold(inkDensity(patch(45,light),bg),.25,.45),true);
 }
});
test('stroke cores count by their nearness to the peak, whatever the ink',()=>{
 // 100 pixels on white: 10 at the ink, 10 at 80% of it, 10 at 60%, 10 at 30%.
 // The core share counts them 1, 0.5, 0 and 0: 15 of 100.
 for(const ink of [255,150,90]){
  const pixels=Uint8ClampedArray.from(Array.from({length:100},(_,i)=>{const v=255-Math.round(ink*(i<10?1:i<20?.8:i<30?.6:i<40?.3:0));return [v,v,v,255];}).flat());
  assert.ok(Math.abs(inkDensity(pixels,[255,255,255])-.15)<.006,`ink ${ink}: ${inkDensity(pixels,[255,255,255])}`);
 }
});
test('blank or ambiguous samples do not invent bold',()=>{
 assert.equal(inkDensity(patch(0,true),[0,0,0]),undefined);
 assert.equal(chooseBold(undefined,.2,.4),false);
 assert.equal(chooseBold(.5,.4,.4),false);
 assert.equal(chooseBold(.3,.25,.4),false);
});
test('per-word ink picks out a bold label even when blur hides stroke width',async()=>{
 const {classifyWordWeights,wordInk}=await import('../tmp/ocr-weight.mjs');
 // Reference areas per char: regular 10, bold 14.5; bold words carry ~1.45x the ink.
 const word=(text,bold,ink=.9)=>{const n=[...text].length,reg={area:10*n,width:8*n},hv={area:14.5*n,width:9*n};return wordInk(text,(bold?14.5:10)*n*ink*1.04**(n%3),(bold?9:8)*n,reg,hv);};
 const line=[word('Nom',true),word('client:',true),word('Dalil',false),word('REDOUANE',false),word('pour',false)];
 const r=classifyWordWeights(line,false);
 assert.deepEqual(r.bold,[true,true,false,false,false]);assert.ok(Math.abs(r.ink-.9)<.1,'ink level '+r.ink);
 // One weight: the line-level estimate decides, unless regular would need ink beyond black.
 assert.deepEqual(classifyWordWeights([word('Les',false),word('repas',false),word('compris',false)],false).bold,[false,false,false]);
 assert.deepEqual(classifyWordWeights([word('Titre',true,.95),word('entièrement',true,.95)],false).bold,[true,true]);
 assert.equal(classifyWordWeights([word('Titre',true),undefined],false).bold[1],undefined,'unmeasured words stay undefined');
});
test('the page ink level settles a single-weight line that blur leaves ambiguous',async()=>{
 const {classifyWordWeights,wordInk}=await import('../tmp/ocr-weight.mjs');
 const word=(text,bold,ink=.9)=>{const n=[...text].length,reg={area:10*n,width:8*n},hv={area:14.5*n,width:9*n};return wordInk(text,(bold?14.5:10)*n*ink,(bold?9:8)*n,reg,hv);};
 const regularLine=[word('Tout',false),word('regular',false),word('sans',false)];
 assert.deepEqual(classifyWordWeights(regularLine,true).bold,[true,true,true],'the line-level guess alone says bold');
 assert.deepEqual(classifyWordWeights(regularLine,true,.9).bold,[false,false,false],'page ink 0.9 matches the regular reading');
 const boldLine=[word('Titre',true),word('épais',true)];
 assert.deepEqual(classifyWordWeights(boldLine,false,.9).bold,[true,true]);
});
test('a weight settled by the strokes stands against ink levels',async()=>{
 const {classifyWordWeights,wordInk}=await import('../tmp/ocr-weight.mjs');
 const word=(text,bold,ink=.9)=>{const n=[...text].length,reg={area:10*n,width:8*n},hv={area:14.5*n,width:9*n};return wordInk(text,(bold?14.5:10)*n*ink,(bold?9:8)*n,reg,hv);};
 // A page set in a face heavier than the one chosen for the text: its regular
 // lines carry more ink than the chosen face's regular can, at any colour.
 const heavyFace=[word('Texte',false,1.2),word('courant',false,1.2)];
 assert.deepEqual(classifyWordWeights(heavyFace,false).bold,[true,true],'ink alone: regular would need ink beyond black');
 assert.deepEqual(classifyWordWeights(heavyFace,false,undefined,true).bold,[false,false]);
 assert.deepEqual(classifyWordWeights([word('Tout',false),word('regular',false)],true,.9,true).bold,[true,true],'nor does the page ink overrule it');
 // Words of two weights are still told apart.
 assert.deepEqual(classifyWordWeights([word('Nom',true),word('client:',true),word('Dalil',false),word('REDOUANE',false)],false,undefined,true).bold,[true,true,false,false]);
});

// A synthetic face for the stroke model: words of upright stems on a baseline
// bar, `stroke` px thick (Arial at 22 px: about 2.1 regular, 3.1 bold), as
// coverage with anti-aliased edges, laid out as drawWords lays words out.
function stems(stroke,words=2,pad=12){
 const height=16+pad*2,pitch=8,count=7,wordWidth=count*pitch+pad*2,width=wordWidth*words,alpha=new Float32Array(width*height),slots=[];
 const fill=(x0,x1,y0,y1)=>{for(let y=y0;y<y1;y++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++)alpha[y*width+x]=Math.max(alpha[y*width+x],Math.min(1,Math.min(x+1,x1)-Math.max(x,x0)));};
 for(let w=0;w<words;w++){
  const left=w*wordWidth+pad;slots.push({x0:w*wordWidth,x1:(w+1)*wordWidth});
  for(let i=0;i<count;i++)fill(left+i*pitch,left+i*pitch+stroke,pad,pad+16);
  fill(left,left+(count-1)*pitch+stroke,pad+16-Math.round(stroke),pad+16);
 }
 return {alpha,width,height,slots};
}
const inked=s=>s.alpha.reduce((a,b)=>a+b,0);
// What the scanner's code measures on a scan of the strokes: the core share
// of each word in its tight box (its pixels over a contrast of 60), the blur
// estimate and the contrast of the sampled colour.
async function scanOf(strokes,sigma,ink){
 const {scanned,inkDensity}=await import('../tmp/ocr-weight.mjs'),{edgeWidth,blurFromEdgeWidth,estimateTextColor}=await import('../tmp/ocr-image.mjs');
 const p=scanned(strokes,sigma,ink),white=[255,255,255],whole={x0:0,y0:0,x1:p.width,y1:p.height},dark=(x,y)=>255-p.data[(y*p.width+x)*4]>60;
 const shares=strokes.slots.map(({x0,x1})=>{
  let l=x1,r=x0,t=p.height,b=0;
  for(let y=0;y<p.height;y++)for(let x=x0;x<x1;x++)if(dark(x,y)){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  const w=r-l+1,h=b-t+1,box=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)box.set(p.data.subarray(((t+y)*p.width+l)*4,((t+y)*p.width+l+w)*4),y*w*4);
  return inkDensity(box,white);
 });
 return {shares,blur:blurFromEdgeWidth(edgeWidth(p,whole,white)),peak:(255-estimateTextColor(p,whole,white)[0])/255};
}
test('stroke cores tell regular from bold whatever the blur and the ink',async()=>{
 const {weightEvidence}=await import('../tmp/ocr-weight.mjs'),regular=stems(2.1),bold=stems(3.1),ratio=inked(bold)/inked(regular);
 for(const sigma of [0,.5,.8,1.4,2])for(const ink of [.9,.6])for(const heavy of [false,true]){
  const scan=await scanOf(heavy?bold:regular,sigma,ink),label=`${heavy?'bold':'regular'} at blur ${sigma}, ink ${ink}`;
  // Ink mass over each weight's glyph area: the true weight gives the true ink.
  const implied=heavy?[ink*ratio,ink]:[ink,ink/ratio];
  const known=weightEvidence(scan.shares,[7,7],scan.blur,[regular,bold],scan.peak,implied),unknown=weightEvidence(scan.shares,[7,7],scan.blur,[regular,bold],scan.peak);
  assert.equal(known>.5,heavy,`${label}: evidence ${known}`);
  assert.equal(unknown>.5,heavy,`${label}, ink mass unknown: evidence ${unknown}`);
  if(sigma<2)assert.ok(Math.abs(known)>2,`${label}: a clear answer (${known})`);
 }
});
test('darkness and coverage cannot tell the weight of soft text, stroke cores can',async()=>{
 // The defect the stroke model answers: soft regular text in black ink and
 // soft bold text in lighter ink have the same darkest pixels and, per stroke,
 // the same ink mass (so the same ink over peak, the old coverage).
 const thin=stems(2.1,1),thick=stems(3.1,1),ink=.9*inked(thin)/inked(thick),regular=await scanOf(thin,1.4,.9),bold=await scanOf(thick,1.4,ink);
 assert.ok(Math.abs(Math.log(regular.peak/bold.peak))<.12,`peaks ${regular.peak} and ${bold.peak}`);
 assert.ok(bold.shares[0]>regular.shares[0]*1.25,`core shares ${regular.shares[0]} and ${bold.shares[0]}`);
});
test('the scan blur is read back from its estimate, which is not the blur',async()=>{
 const {scanBlur}=await import('../tmp/ocr-weight.mjs');
 for(const stroke of [2.1,3.1])for(const sigma of [.8,1.4,2]){
  const strokes=stems(stroke),{blur}=await scanOf(strokes,sigma,.85),read=scanBlur(strokes,blur);
  assert.ok(blur<sigma*.9,`the estimate ${blur} reads less than the blur ${sigma}`);
  assert.ok(Math.abs(read-sigma)<.15,`stroke ${stroke}, blur ${sigma}: read back ${read}`);
 }
});
test('words without a measured core give no evidence',async()=>{
 const {weightEvidence}=await import('../tmp/ocr-weight.mjs');
 assert.equal(weightEvidence([undefined,undefined],[7,7],.5,[stems(2.1),stems(3.1)],.6),undefined);
});
