import {ensureFont} from '../src/fonts';
import {detectedTextbox} from '../src/detected-text';
import {matchOcrAppearance,applyOcrAppearance} from '../src/browser/ocr-appearance';
import {contrastCoverage,alphaCoverage,coverageEdgeWidth} from '../src/ocr-appearance';
import type {Textbox} from '../src/text-appearance';
import type {TextRegion} from '../src/text-regions';

const result=document.querySelector('#result')!;
function outputEdges(text:Textbox,width:number,height:number){
 const hi=document.createElement('canvas');hi.width=width*4;hi.height=height*4;
 const ctx=hi.getContext('2d')!;ctx.scale(4,4);text.render(ctx);
 const native=document.createElement('canvas');native.width=width;native.height=height;const c=native.getContext('2d')!;c.drawImage(hi,0,0,width,height);
 return coverageEdgeWidth(alphaCoverage(c.getImageData(0,0,width,height).data,width,height));
}
document.querySelector('#run')!.addEventListener('click',async()=>{
 try{
  const results=[];
  for(const [family,softness,weight,background,color] of [['Liberation Mono',0,'normal','#fafafa','#202020'],['Roboto',.6,'normal','#fafafa','#202020'],['Roboto',.6,'bold','#202020','#fafafa']] as const){
   await ensureFont(family);
   // Independent Canvas text, not the editable Textbox renderer under test.
   const canvas=document.createElement('canvas');canvas.width=380;canvas.height=70;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,380,70);
   ctx.font=`${weight} 24px "${family}"`;ctx.fillStyle=color;ctx.filter=`blur(${softness}px)`;ctx.fillText('Quarterly report',20.25,42.25);ctx.filter='none';
   const pixels=ctx.getImageData(0,0,380,70),coverage=contrastCoverage(pixels.data,380,70,background==='#fafafa'?[250,250,250]:[32,32,32]);
   let x0=380,y0=70,x1=0,y1=0;for(let y=0;y<70;y++)for(let x=0;x<380;x++)if(coverage.data[y*380+x]>.4){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
   const region:TextRegion={id:'fixture',text:'Quarterly report',left:x0,top:y0,width:x1-x0+1,height:y1-y0+1,size:24,baseline:42.25,fontName:'Image',bold:weight==='bold',italic:false,color,background,kind:'ocr',confidence:99};
   const makeText=async(r:TextRegion,font:string)=>(await detectedTextbox(r,{ocrFont:font,ocrStyle:weight==='bold'?'bold':'regular'})).text;
   const diagnostics:unknown[]=[];
   const fitted=await matchOcrAppearance(canvas,region,[region],'Liberation Sans',{autoFont:true,matchBlur:true,makeText,onFit:f=>diagnostics.push(f)});
   if(!fitted||fitted.family!==family)throw Error(`Font mismatch for ${family}: ${JSON.stringify({fitted,region,diagnostics})}`);
   if(softness===0&&fitted.softness>.2)throw Error('Crisp source was unnecessarily blurred');
   if(softness>0&&fitted.softness<.2)throw Error(`Soft source was converted to crisp text: ${JSON.stringify({family,weight,fitted,diagnostics})}`);
   const replacement=await makeText(region,fitted.family);applyOcrAppearance(replacement,region,fitted);
   const sourceEdges=coverageEdgeWidth(coverage),replacementEdges=outputEdges(replacement,380,70);
   if(softness>0&&sourceEdges!==undefined&&replacementEdges!==undefined&&replacementEdges>sourceEdges+.15)throw Error(`Replacement edges are too soft: ${JSON.stringify({family,weight,sourceEdges,replacementEdges,fitted})}`);
   const manual=await matchOcrAppearance(canvas,region,[region],family,{autoFont:false,matchBlur:false,makeText});
   if(!manual||manual.family!==family||manual.softness!==0)throw Error('Manual font/crisp override was ignored');
   results.push({family,weight,sourceSoftness:softness,sourceEdges,replacementEdges,fit:fitted,manual});document.body.append(canvas);
  }
  // A small clear name beside a softer label must keep its own edge clarity.
  await ensureFont('Inter');const canvas=document.createElement('canvas');canvas.width=280;canvas.height=50;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fafafa';ctx.fillRect(0,0,280,50);ctx.font='normal 12px "Inter"';ctx.fillStyle='#202020';
  ctx.filter='blur(.2px)';ctx.fillText('Dalil',20.25,25.25);ctx.filter='blur(.8px)';ctx.fillText('REDOUANE',80.25,25.25);ctx.filter='none';
  const regions=[['name','Dalil',0,65],['label','REDOUANE',65,160]].map(([id,text,x0,x1])=>{
   const left=Number(x0),width=Number(x1)-left,pixels=ctx.getImageData(left,0,width,50),coverage=contrastCoverage(pixels.data,width,50,[250,250,250]);
   let a=width,b=50,c=0,d=0;for(let y=0;y<50;y++)for(let x=0;x<width;x++)if(coverage.data[y*width+x]>.4){a=Math.min(a,x);b=Math.min(b,y);c=Math.max(c,x);d=Math.max(d,y);}
   return {id:String(id),text:String(text),left:left+a,top:b,width:c-a+1,height:d-b+1,size:12,baseline:25.25,fontName:'Image',bold:false,italic:false,color:'#202020',background:'#fafafa',kind:'ocr',confidence:99} as TextRegion;
  });
  const makeText=async(r:TextRegion,font:string)=>(await detectedTextbox(r,{ocrFont:font,ocrStyle:'regular'})).text;
  const fitted=await matchOcrAppearance(canvas,regions[0],regions,'Inter',{autoFont:false,matchBlur:true,makeText});
  if(!fitted)throw Error('Small name could not be matched');
  const text=await makeText(regions[0],fitted.family);applyOcrAppearance(text,regions[0],fitted);
  const sourcePixels=ctx.getImageData(0,0,65,50),sourceEdges=coverageEdgeWidth(contrastCoverage(sourcePixels.data,65,50,[250,250,250])),replacementEdges=outputEdges(text,65,50);
  if(sourceEdges===undefined||replacementEdges===undefined||replacementEdges>sourceEdges+.15)throw Error(`Soft neighbour blurred the name: ${JSON.stringify({sourceEdges,replacementEdges,fitted})}`);
  results.push({case:'Small name beside soft label',sourceEdges,replacementEdges,fit:fitted});document.body.append(canvas);
  result.textContent=JSON.stringify({passed:true,results},null,2);
 }catch(error){result.textContent=String(error);}
});
