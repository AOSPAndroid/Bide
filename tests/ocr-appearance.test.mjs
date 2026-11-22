import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contrastCoverage,coreGain,coverageEdgeWidth,coverageFit,matchedInkColor,pageInk} from '../tmp/ocr-appearance.mjs';
const coverage=(fill)=>{const width=28,height=16,data=new Float32Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=fill(x,y);return {width,height,data};};
const glyphs=(x,y)=>y>=4&&y<12&&((x>=5&&x<7)||(x>=11&&x<14)||(y<6&&x>=5&&x<14))?1:0;
const soft=coverage((x,y)=>{let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=glyphs(x+dx,y+dy)*(dx===0?2:1)*(dy===0?2:1);return sum/16;});

test('physical edge width distinguishes crisp glyphs from their blurred fringes',()=>{
 const crisp=coverage(glyphs),sharpWidth=coverageEdgeWidth(crisp),softWidth=coverageEdgeWidth(soft);
 assert.equal(sharpWidth,0);assert.ok(softWidth>sharpWidth+1);
 // The padded pixels outside the half-contrast glyph mask still contribute.
 const clipped={...soft,data:soft.data.map(v=>v<.5?0:v)};
 assert.ok(coverageEdgeWidth(clipped)<softWidth);
});
test('edge width normalizes colour strength without changing the measured softness',()=>{
 const width=coverageEdgeWidth(soft);
 for(const gain of [.8,.42])assert.equal(coverageEdgeWidth({...soft,data:soft.data.map(v=>v*gain)}),width);
});
test('edge width rejects weak, empty or insufficient glyph evidence',()=>{
 assert.equal(coverageEdgeWidth(coverage(()=>0)),undefined);
 assert.equal(coverageEdgeWidth({...soft,data:soft.data.map(v=>v*.1)}),undefined);
 assert.equal(coverageEdgeWidth(coverage((x,y)=>x===5&&y===5?1:0)),undefined);
 assert.equal(coverageEdgeWidth({width:2,height:2,data:new Float32Array(4).fill(1)}),undefined);
});
test('continuous matching distinguishes soft edges from crisp glyphs at the same ink strength',()=>{
 const original={...soft,data:soft.data.map(v=>v*.72)},crisp=coverage(glyphs);
 const fit=coverageFit(original,soft);assert.ok(fit.score>.999);assert.ok(Math.abs(fit.gain-.72)<1e-6);
 assert.ok(coverageFit(original,crisp).score<fit.score-.1);
 // Excessive blur cannot win by inventing ink darker than black.
 const weak={...soft,data:soft.data.map(v=>v*.1)};assert.ok(coverageFit(original,weak).score<.5);
});
test('matching recovers alignment independently of the colour and rejects empty samples',()=>{
 const crisp=coverage(glyphs),moved=coverage((x,y)=>glyphs(x-1,y)*.8);
 assert.ok(coverageFit(moved,crisp,1,0).score>.999);
 assert.ok(coverageFit(moved,crisp,0,0).score<.8);
 assert.equal(coverageFit(coverage(()=>0),crisp).score,0);
});
test('coverage handles coloured dark-mode letters, transparency and background noise',()=>{
 const pixels=new Uint8ClampedArray([22,22,22,255,182,102,22,255,255,255,255,0]);
 const mask=contrastCoverage(pixels,3,1,[20,20,20]);
 assert.equal(mask.data[0],0);assert.ok(Math.abs(mask.data[1]-162/255)<1e-6);assert.equal(mask.data[2],0);
 assert.equal(matchedInkColor('#444444','#ffffff',.8),'#333333');
 assert.equal(matchedInkColor('#d0d0d0','#202020',.8),'#ececec');
 assert.equal(matchedInkColor('invalid','#ffffff',.8),'invalid');
});
test('ink strength comes from the stroke cores, not from how well the shapes overlap',()=>{
 // The same grey letters, a pixel off and with one stroke a little wider: the
 // least-squares gain shrinks with the mismatch, the core ratio does not.
 const crisp=coverage(glyphs),grey=coverage((x,y)=>(glyphs(x-1,y)||(y>=4&&y<12&&x===14))*.7);
 assert.ok(coverageFit(grey,crisp).gain<.5);
 assert.ok(Math.abs(coreGain(grey,crisp)-.7)<.01);
 assert.ok(Math.abs(coreGain({...soft,data:soft.data.map(v=>v*.6)},soft)-.6)<.01);
 assert.equal(coreGain(crisp,crisp),1);assert.equal(coreGain(crisp,coverage(()=>0)),0);
});
test('coverage blurred by a Gaussian keeps its ink and spreads a line as the kernel says',async()=>{
 const {blurCoverage}=await import('../tmp/ocr-appearance.mjs');
 const w=41,h=31,data=new Float32Array(w*h);for(let y=5;y<26;y++)data[y*w+20]=1;// a 1 px vertical line, clear of the edges
 const c={data,width:w,height:h};
 assert.equal(blurCoverage(c,0),c,'no softness: unchanged');
 const b=blurCoverage(c,1),sum=a=>a.reduce((s,v)=>s+v,0);
 assert.ok(Math.abs(sum(b.data)-sum(data))<1e-3*sum(data),'ink kept away from the edges');
 const centre=b.data[15*w+20],side=b.data[15*w+21];
 assert.ok(Math.abs(centre-.4)<.01,`centre ${centre}: a Gaussian of 1 px peaks at 0.40`);
 assert.ok(Math.abs(side-.24)<.01,`next column ${side}`);
});

test('a pale thin line takes the colour of a surer line of the same hue',()=>{
 const line=(id,color,height,inkDensity=.2,background='#d33a80')=>({id,kind:'ocr',color,background,height,confidence:95,inkDensity});
 const thin=line('tel','#fcc7e4',44),title=line('name','#fff0fc',61),heavy=line('s1','#fbfffe',45,.32),alsoThin=line('mail','#fcc8e5',46);
 // White, from the lines with thicker strokes; its strength over this line's background.
 const ink=pageInk(thin,[thin,alsoThin,title,heavy]);
 assert.equal(ink.color,'#fbfffe');assert.ok(Math.abs(ink.gain-196/255)<.01);
 // Lines as thin as it are no reference, nor a line of another hue, nor a weaker colour.
 assert.equal(pageInk(thin,[thin,alsoThin]),undefined);
 assert.equal(pageInk(thin,[thin,line('x','#20ff30',70)]),undefined);
 assert.equal(pageInk(heavy,[heavy,title]),undefined);
 // Further than 40% short of it: another colour (grey notes beside black text stay grey).
 const grey=line('note','#9a9a9a',20,.2,'#ffffff'),black=line('body','#1c1c1e',30,.2,'#ffffff');
 assert.equal(pageInk(grey,[grey,black]),undefined);
 // Two inks along one hue: the nearer one.
 const label=line('l','#627564',22,.2,'#e8ecdd'),head=line('h','#3b5d4a',66,.2,'#e8ecdd'),date=line('d','#213b2f',56,.2,'#e8ecdd');
 assert.equal(pageInk(label,[label,head,date]).color,'#3b5d4a');
});
