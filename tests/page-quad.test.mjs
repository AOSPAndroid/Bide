import {test} from 'node:test';import assert from 'node:assert/strict';
import {findSheet,sheetSize} from '../tmp/page-quad.mjs';
import {unwarpPixels,mapSquare} from '../tmp/perspective.mjs';

// A white quad (with dark text bars) on a grey desk.
function photo(corners,{width=400,height=300,desk=70}={}){
 const rgba=new Uint8ClampedArray(width*height*4);
 const inside=(x,y)=>corners.every((b,i)=>{const c=corners[(i+1)%4];return (c.x-b.x)*(y-b.y)-(c.y-b.y)*(x-b.x)>=0;});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const o=(y*width+x)*4,paper=inside(x+.5,y+.5),text=paper&&y%20<4&&x%9<6&&inside(x-30,y-30)&&inside(x+30,y+30);
  rgba[o]=rgba[o+1]=rgba[o+2]=text?30:paper?245:desk;rgba[o+3]=255;}
 return rgba;
}
const near=(a,b,tolerance)=>a.every((p,i)=>Math.hypot(p.x-b[i].x,p.y-b[i].y)<=tolerance);

test('a sheet photographed at an angle is found by its four corners',()=>{
 const corners=[{x:60,y:40},{x:350,y:20},{x:380,y:270},{x:30,y:250}];
 const found=findSheet(photo(corners),400,300);
 assert.ok(found&&near(found,corners,3),JSON.stringify(found));
 const size=sheetSize(corners);assert.ok(Math.abs(size.width-350)<2&&Math.abs(size.height-251)<2,JSON.stringify(size));
});

test('no sheet: a plain page, an upright panel, or a dark page',()=>{
 const full=[{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}];
 assert.equal(findSheet(photo(full),400,300),undefined,'a scan that is all page');
 const panel=[{x:40,y:30},{x:360,y:30},{x:360,y:270},{x:40,y:270}];
 assert.equal(findSheet(photo(panel),400,300),undefined,'an upright white panel in a screenshot');
 // White space below a dark card, with a thin white strip down the side.
 const rgba=new Uint8ClampedArray(400*300*4);for(let i=0;i<400*300;i++){const x=i%400,y=Math.floor(i/400),white=y>120||x>394;rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=white?255:28;rgba[i*4+3]=255;}
 assert.equal(findSheet(rgba,400,300),undefined,'an L-shaped white area');
});

test('the sheet is pulled out to a rectangle, and points map back onto the photo',()=>{
 const corners=[{x:60,y:40},{x:350,y:20},{x:380,y:270},{x:30,y:250}],src={width:400,height:300,data:photo(corners)};
 const flat=unwarpPixels(src,corners,200,150);
 // Corners of the flattened image are paper, not desk.
 for(const [x,y] of [[2,2],[197,2],[197,147],[2,147]])assert.ok(flat[(y*200+x)*4]>200,`${x},${y} is paper`);
 const back=mapSquare(corners,1,1);assert.ok(Math.abs(back.x-380)<1e-6&&Math.abs(back.y-270)<1e-6);
});
