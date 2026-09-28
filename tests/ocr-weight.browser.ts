import {inkDensity,estimateOcrBold} from '../src/ocr-weight';
import {ensureFont} from '../src/fonts';
async function run(){
 await ensureFont('Liberation Sans');
 let count=0;
 for(const family of ['Liberation Sans','Arial','Segoe UI'])for(const size of [24,48])for(const weight of ['normal','bold'])for(const light of [false,true]){
  const text='Sample 2468 text',c=document.createElement('canvas'),ctx=c.getContext('2d')!;
  const font=`${weight} ${size}px "${family}"`;ctx.font=font;const m=ctx.measureText(text);
  c.width=Math.ceil(m.actualBoundingBoxLeft+m.actualBoundingBoxRight);c.height=Math.ceil(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);
  ctx.fillStyle=light?'#172432':'#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.font=font;ctx.fillStyle=light?'#ffffff':'#000000';ctx.fillText(text,m.actualBoundingBoxLeft,m.actualBoundingBoxAscent);
  const density=inkDensity(ctx.getImageData(0,0,c.width,c.height).data,light?[23,36,50]:[255,255,255]);
  if(estimateOcrBold(text,family,c.height,density)!==(weight==='bold'))throw Error(`${family} ${size} ${weight} ${light} misclassified`);
  count++;
 }
 document.body.textContent=`PASS: ${count} rendered regular/bold samples across three fonts, two sizes and both polarities.`;
}
run().catch(e=>document.body.textContent='FAIL: '+e.message);
