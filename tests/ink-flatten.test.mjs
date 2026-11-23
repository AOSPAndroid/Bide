import {test} from 'node:test';
import assert from 'node:assert/strict';
import {busyBackground,flattenInk,inpaint} from '../tmp/ink-flatten.mjs';

// A dark bar (the "letter") across a page that is cream on the left and has a peach band on the right.
const W=40,H=20,ink=[39,50,78],paper=[255,247,232],peach=[255,201,168];
const page=(withInk)=>{const d=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const o=(y*W+x)*4,bg=x>=20?peach:paper,c=withInk&&y>=8&&y<12&&x>=6&&x<34?ink:bg;d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255;}return d;};

test('a drawing behind a line is told from its ink, and carried on under it',()=>{
 const data=page(true),clean=page(false);
 assert.equal(busyBackground(data,W,H,ink,paper),true);
 assert.equal(busyBackground(page(true).map((v,i)=>{const x=(i>>2)%W;return x>=20?paper[i%4]??255:v;}),W,H,ink,paper),false,'plain paper is not busy');
 // A plain page with soft letters (their edges are neither ink nor paper) is not busy.
 const softPage=new Uint8ClampedArray(60*16*4);for(let y=0;y<16;y++)for(let x=0;x<60;x++){const o=(y*60+x)*4,d=Math.min(Math.abs((x%6)-3),Math.abs(y-8)/2),a=Math.max(0,Math.min(1,1.2-d/1.5));for(let c=0;c<3;c++)softPage[o+c]=paper[c]+(ink[c]-paper[c])*a;softPage[o+3]=255;}
 assert.equal(busyBackground(softPage,60,16,ink,paper),false,'soft letters on plain paper are not a drawing');
 const {under,alpha,flat}=flattenInk(data,W,H,ink,paper);
 // The page without the bar: the band's edge is kept where the bar crossed it.
 let worst=0;for(let i=0;i<W*H*4;i++)worst=Math.max(worst,Math.abs(under[i]-clean[i]));
 assert.ok(worst<=60,`the drawing is carried on under the ink (off by ${worst} at most, at the band's edge)`);
 const at=(x,y)=>y*W+x;
 assert.equal(alpha[at(10,10)],1);assert.equal(alpha[at(30,10)],1);assert.equal(alpha[at(30,3)],0,'the band alone is no ink');
 // On plain paper: the bar on cream, the band gone.
 assert.deepEqual([...flat.slice(at(30,3)*4,at(30,3)*4+3)],paper);assert.deepEqual([...flat.slice(at(30,10)*4,at(30,10)*4+3)],ink);
});

test('inpainting fills a hole from its rim',()=>{
 const d=new Uint8ClampedArray(9*9*4).fill(200),mask=new Uint8Array(81);for(let y=3;y<6;y++)for(let x=3;x<6;x++){mask[y*9+x]=1;d[(y*9+x)*4]=0;}
 inpaint(d,9,9,mask);assert.equal(d[(4*9+4)*4],200);
});
