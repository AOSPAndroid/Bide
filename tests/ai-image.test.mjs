import {test} from 'node:test';import assert from 'node:assert/strict';
import {tilePlan,toPlanar,dbBoxes,ctcDecode,ctcWords,trimToInk,inkBand,inpaintWindows} from '../tmp/ai-image.mjs';
test('tiles cover the image once and read padded context',()=>{
 const tiles=tilePlan(300,130,128,8),covered=new Uint8Array(300*130);
 for(const {read,inner} of tiles){assert.ok(read.x<=inner.x&&read.y<=inner.y&&read.x+read.width>=inner.x+inner.width);for(let y=inner.y;y<inner.y+inner.height;y++)for(let x=inner.x;x<inner.x+inner.width;x++)covered[y*300+x]++;}
 assert.equal(tiles.length,6);assert.ok(covered.every(v=>v===1));assert.deepEqual(tiles[4].read,{x:120,y:120,width:144,height:10});
});
test('planar tensors normalize per channel and can swap to BGR',()=>{
 const px=[255,0,51,255, 0,255,0,255];
 assert.deepEqual([...toPlanar(px,2,1)].map(v=>+v.toFixed(4)),[1,0,0,1,.2,0]);
 assert.deepEqual([...toPlanar(px,2,1,{mean:[.5,.5,.5],std:[.5,.5,.5],bgr:true})].map(v=>+v.toFixed(2)),[-.6,-1,-1,1,1,-1]);
});
test('DB boxes: components above threshold, confident, grown by unclip',()=>{
 const w=40,h=20,prob=new Float32Array(w*h);for(let y=5;y<11;y++)for(let x=4;x<24;x++)prob[y*w+x]=.9;for(let y=14;y<16;y++)for(let x=30;x<38;x++)prob[y*w+x]=.9;prob[0]=.5;
 const boxes=dbBoxes(prob,w,h);assert.equal(boxes.length,1,'thin and weak blobs are dropped');
 const b=boxes[0],d=20*6*1.5/(2*26);assert.ok(Math.abs(b.x0-(4-d))<1e-9&&Math.abs(b.x1-(24+d))<1e-9&&Math.abs(b.y0-(5-d))<1e-9);
});
test('CTC decoding collapses repeats, skips blanks, maps the last class to a space',()=>{
 const dict=['a','b'],C=4,frames=[[0,.9],[1,.8],[1,.7],[0,.9],[1,.6],[3,.9],[2,.95],[0,.9]];
 const data=new Float32Array(frames.length*C);frames.forEach(([c,p],t)=>{data.fill((1-p)/3,t*C,t*C+C);data[t*C+c]=p;});
 const r=ctcDecode(data,frames.length,C,dict);assert.equal(r.text,'aa b');assert.deepEqual(r.chars.map(c=>c.t),[1,4,5,6]);
 const words=ctcWords(r.chars,4,32);assert.deepEqual(words.map(w=>w.text),['aa','b']);assert.equal(words[0].x1,words[1].x0);assert.equal(words[0].x1,(4+6+1)/2*4);
});
test('word boxes trim to inked columns',()=>{assert.deepEqual(trimToInk([0,0,1,2,0,3,0,0],0,8),{x0:2,x1:6});assert.deepEqual(trimToInk([0,0,0],0,3),{x0:0,x1:3});});
test('inpaint windows group nearby holes and keep 512px context inside the image',()=>{
 const w=inpaintWindows([{x:100,y:100,width:200,height:20},{x:100,y:130,width:180,height:20},{x:1500,y:900,width:50,height:20}],1600,1000);
 assert.equal(w.length,2);assert.equal(w[0].rects.length,2);
 for(const {crop,rects} of w){assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1600&&crop.y+crop.height<=1000);assert.equal(crop.width,512);for(const r of rects)assert.ok(r.x>=crop.x&&r.x+r.width<=crop.x+crop.width&&r.y>=crop.y&&r.y+r.height<=crop.y+crop.height);}
 const small=inpaintWindows([{x:10,y:10,width:50,height:10}],300,200);assert.deepEqual(small[0].crop,{x:0,y:0,width:300,height:200});
 const wide=inpaintWindows([{x:0,y:0,width:900,height:30}],1200,800);assert.ok(wide[0].crop.width>=900+64);
});
test('line band keeps accents but drops the neighbouring line in a padded box',()=>{
 // rows: neighbour line (0-3), gap (4-7), accent (8), gap (9), line (10-19), gap, next line (24-27)
 const rows=[3,3,3,3,0,0,0,0,2,0,...Array(10).fill(9),0,0,0,0,4,4,4,4];
 assert.deepEqual(inkBand(rows,14),{x0:8,x1:20});assert.deepEqual(inkBand(rows,9),{x0:8,x1:20},'centre on an empty row snaps to ink');
});
test('bilinear resize keeps flat colours, aligns pixel centres and interpolates',async()=>{
 const {resizeBilinear}=await import('../tmp/ai-image.mjs');
 const flat=resizeBilinear(new Uint8ClampedArray(4*4).fill(200),2,2,5,3);assert.ok(flat.every(v=>v===200));
 const ramp=resizeBilinear([0,0,0,255, 255,255,255,255],2,1,4,1);assert.deepEqual([...ramp].filter((_,i)=>i%4===0),[0,64,191,255]);
 assert.deepEqual([...resizeBilinear([10,20,30,40],1,1,2,2)],[10,20,30,40,10,20,30,40,10,20,30,40,10,20,30,40]);
});
test('word boundaries snap to the nearest real gap between words',async()=>{
 const {snapToGap}=await import('../tmp/ai-image.mjs');
 // "Daliil" ink 0-29, 1-px letter gaps, a 5-px space, then "R..." from 35.
 const cols=Array.from({length:60},(_,x)=>x<30?(x%6===5?0:3):x<35?0:3);
 assert.equal(snapToGap(cols,36,3,13),32,'boundary inside R moves back to the space (blank 29-34)');
 assert.equal(snapToGap(cols,20,3,13),32);assert.equal(snapToGap(cols,58,3,5),58,'no gap within reach: unchanged');
});
test('CTC: a letter split between its accented forms still beats the blank',()=>{
 // classes: blank, e, é, t. Step 1: blank .4, é .35, e .25 (the accents together win).
 const dict=['e','é','t'],C=4,steps=[[.05,0,0,.95],[.4,.25,.35,0],[.05,0,0,.95]],data=new Float32Array(steps.flat());
 assert.equal(ctcDecode(data,3,C,dict).text,'tét');
 // A weak blank between two of the same letter still separates them (t and T together outweigh it).
 const upper=['e','é','t','T'],tt=new Float32Array([[.05,0,0,.95,0],[.45,0,0,.3,.25],[.05,0,0,.95,0]].flat());
 assert.equal(ctcDecode(tt,3,5,upper).text,'tt');
});
test('a space the recognizer left out is found where the ink gap matches the spaces it read',async()=>{
 const {lostSpaces}=await import('../tmp/ai-image.mjs');
 // Letters 6 columns wide, 2 apart; ' ' is a space that was read (9 blank
 // columns), '|' one that was not, '~' a gap one column short of a space,
 // '^' a 6-column gap inside a word.
 const line=(spec,{space=9,offset=0}={})=>{
  const columns=[0,0,0],words=[{text:'',chars:[]}];let gap=0;
  for(const ch of spec){
   if(ch===' '){words.push({text:'',chars:[]});gap=space;continue;}
   if(ch==='|'||ch==='^'||ch==='~'){gap=ch==='^'?6:ch==='~'?space-1:space;continue;}
   const w=words.at(-1),blank=gap||(w.chars.length?2:0),prev=w.chars.at(-1);gap=0;
   for(let i=0;i<blank;i++)columns.push(0);
   const a=columns.length,mid=offset+a-blank/2;for(let i=0;i<(ch==='.'?2:6);i++)columns.push(5);
   // The cells of a word meet midway between two letters.
   if(prev)prev.x1=mid;w.text+=ch;w.chars.push({x0:prev?mid:offset+a,x1:offset+columns.length});
  }
  columns.push(0,0,0);return {words,columns};
 };
 const find=(spec,o)=>{const l=line(spec,o);return lostSpaces(l.words,l.columns,20,o?.offset);};
 assert.deepEqual(find('ab cd ef|gh'),[{word:2,after:1}]);
 assert.deepEqual(find('ab|cd ef|gh ij'),[{word:0,after:1},{word:1,after:1}]);
 assert.deepEqual(find('ab cd ef|gh',{offset:300}),[{word:2,after:1}],'cells in page columns');
 assert.deepEqual(find('abcd ef gh'),[],'nothing to add');
 assert.deepEqual(find('ef|gh'),[],'no space was read on the line: nothing to compare with');
 assert.deepEqual(find('ab cd e^f|gh'),[],'a gap between a letter gap and a space: the line is unclear');
 assert.deepEqual(find('ab cd ef|.'),[],'never before a full stop');
 assert.deepEqual(find('ab c|d|e|f'),[],'more spaces than the line has plus one: letter-spaced text');
 assert.deepEqual(find('ab cd 1|8 2|,5 3,|4'),[],'inside a number a gap proves nothing');
 assert.deepEqual(find('ab cd 1|h'),[{word:2,after:0}],'after a 1 a full space is one');
 assert.deepEqual(find('ab cd ef g|h1~h',{space:10}),[{word:3,after:0}],'but not a gap just short of one, which would do after another letter');
 assert.deepEqual(find('ab cd ef g~h',{space:10}),[{word:3,after:0}]);
 assert.deepEqual(find('ab cd ef|gh',{space:2}),[],'spaces too narrow for the letter height to judge by');
 const l=line('ab cd ef|gh');l.words[0].chars=undefined;assert.deepEqual(lostSpaces(l.words,l.columns,20),[{word:2,after:1}],'a word without cells is skipped');
});
test('a full stop between digits is a comma when the comma was the recognizer\'s second choice',async()=>{
 const {softCommas}=await import('../tmp/ai-image.mjs');
 const read=(text,alts={})=>Array.from(text).map((ch,i)=>({ch,t:i,p:.8,...alts[i]?{alt:{ch:alts[i][0],p:alts[i][1]}}:{}})),text=chars=>chars.map(c=>c.ch).join('');
 assert.equal(text(softCommas(read('104.68',{3:[',',.25]}))),'104,68');
 assert.equal(text(softCommas(read('1.397 4.8',{1:[',',.11],7:[',',.3]}))),'1,397 4,8','thousands too');
 assert.equal(text(softCommas(read('104.68',{3:[',',.07]}))),'104.68','a full stop it hardly doubted');
 assert.equal(text(softCommas(read('104.68',{3:['-',.3]}))),'104.68','another second choice');
 assert.equal(text(softCommas(read('a.5 4. .5',{1:[',',.3],5:[',',.3],7:[',',.3]}))),'a.5 4. .5','only between two digits');
 const same=read('12.5');assert.equal(softCommas(same),same,'a line without one is returned as it is');
 assert.equal(softCommas(read('4.8',{1:[',',.2]}))[1].p,.8,'it stays a doubtful letter');
 // The decoder keeps each character's second choice.
 const r=ctcDecode(new Float32Array([[.02,.7,.28,0],[.98,.01,.01,0]].flat()),2,4,['.',',']);
 assert.equal(r.text,'.');assert.equal(r.chars[0].alt.ch,',');assert.ok(Math.abs(r.chars[0].alt.p-.28)<1e-6);
});
