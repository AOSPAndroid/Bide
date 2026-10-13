import {ensureFont} from '../src/fonts';
import {detectedTextbox} from '../src/detected-text';
import {matchOcrAppearance} from '../src/browser/ocr-appearance';
import {contrastCoverage} from '../src/ocr-appearance';
import type {TextRegion} from '../src/text-regions';

const result=document.querySelector('#result')!;
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
   if(softness>0&&fitted.softness<.2)throw Error('Soft source was converted to crisp text');
   const manual=await matchOcrAppearance(canvas,region,[region],family,{autoFont:false,matchBlur:false,makeText});
   if(!manual||manual.family!==family||manual.softness!==0)throw Error('Manual font/crisp override was ignored');
   results.push({family,weight,sourceSoftness:softness,fit:fitted,manual});document.body.append(canvas);
  }
  result.textContent=JSON.stringify({passed:true,results},null,2);
 }catch(error){result.textContent=String(error);}
});
