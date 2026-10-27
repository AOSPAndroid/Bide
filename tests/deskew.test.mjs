import {test} from 'node:test';import assert from 'node:assert/strict';
import {inkMap,estimateSkew} from '../tmp/deskew.mjs';

// A page of text-like lines (letter strokes with word gaps), turned clockwise
// by `angle` degrees around the centre.
function page(angle,{width=600,height=500,dark=false}={}){
 const rgba=new Uint8ClampedArray(width*height*4).fill(dark?20:250),t=angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
 for(let i=0;i<width*height;i++)rgba[i*4+3]=255;
 for(let y=-150;y<=150;y+=24)for(let x=-220;x<=220;x++){
  if(Math.floor((x+220)/7)%2||((x+300)%64)>52)continue;// strokes and word gaps
  for(let dy=0;dy<11;dy++){const X=Math.round(x*c-(y+dy)*s+width/2),Y=Math.round(x*s+(y+dy)*c+height/2);
   if(X>=0&&Y>=0&&X<width&&Y<height){const o=(Y*width+X)*4;rgba[o]=rgba[o+1]=rgba[o+2]=dark?235:30;}}
 }
 return rgba;
}

test('the tilt of text lines is measured to a tenth of a degree',()=>{
 for(const angle of [0,2.5,-4,7.3,-11]){
  const result=estimateSkew(inkMap(page(angle),600,500),600,500);
  assert.ok(result&&Math.abs(result.angle-angle)<=.1,`${angle}° measured as ${result?.angle}`);
  assert.ok(result.confidence>1.5,'clear text gives a confident peak');
 }
});

test('light text on a dark page is measured too',()=>{
 const result=estimateSkew(inkMap(page(3,{dark:true}),600,500),600,500);
 assert.ok(result&&Math.abs(result.angle-3)<=.1,`measured ${result?.angle}`);
});

test('an empty page has no tilt',()=>{
 const blank=new Uint8ClampedArray(200*100*4).fill(255);
 assert.equal(estimateSkew(inkMap(blank,200,100),200,100),undefined);
});

test('a tilted sheet photographed on a dark desk is measured from its text',()=>{
 const W=600,H=500,rgba=new Uint8ClampedArray(W*H*4);
 for(let i=0;i<W*H;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=60;rgba[i*4+3]=255;}// dark desk
 const sheet=page(-3,{width:W,height:H});// white page with dark text lines
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(y>40&&y<300&&x>50&&x<560){const o=(y*W+x)*4;rgba[o]=sheet[o];rgba[o+1]=sheet[o+1];rgba[o+2]=sheet[o+2];}
 const result=estimateSkew(inkMap(rgba,W,H),W,H);
 assert.ok(result&&Math.abs(result.angle+3)<=.2,`measured ${result?.angle}`);
});
