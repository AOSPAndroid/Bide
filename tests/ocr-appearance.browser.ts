import {ensureFont} from '../src/fonts';
import {detectedTextbox} from '../src/detected-text';
import {matchOcrAppearance,applyOcrAppearance} from '../src/browser/ocr-appearance';
import {contrastCoverage,alphaCoverage,coverageEdgeWidth} from '../src/ocr-appearance';
import type {Textbox} from '../src/text-appearance';
import type {TextRegion} from '../src/text-regions';
import {Canvas,FabricImage} from 'fabric';
import {blankPage} from '../src/model';
import {planOcrReplacement} from '../src/ocr-replace';
import {defaultOcrSettings} from '../src/TextDetectionBar';

const result=document.querySelector('#result')!;
function outputEdges(text:Textbox,width:number,height:number){
 if(!text.textSoftness){const native=document.createElement('canvas');native.width=width;native.height=height;const ctx=native.getContext('2d')!;text.render(ctx);return coverageEdgeWidth(alphaCoverage(ctx.getImageData(0,0,width,height).data,width,height));}
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
   const base=await makeText(region,fitted.family),baseSize=base.fontSize,baseSpacing=base.charSpacing;
   const replacement=await makeText(region,fitted.family);applyOcrAppearance(replacement,region,fitted);
   const sourceEdges=coverageEdgeWidth(coverage),replacementEdges=outputEdges(replacement,380,70);
   // Font size and tracking change the radius needed for equal edge clarity.
   // Compare actual rendered pixels for crisp and soft sources alike; a CSS
   // blur radius alone is not a stable measure across those geometry changes.
   if(sourceEdges===undefined||replacementEdges===undefined||Math.abs(replacementEdges-sourceEdges)>.15)throw Error(`Replacement edge clarity differs: ${JSON.stringify({family,weight,baseSize,baseSpacing,sourceEdges,replacementEdges,fitted,diagnostics})}`);
   const manual=await matchOcrAppearance(canvas,region,[region],family,{autoFont:false,matchBlur:false,makeText});
   if(!manual||manual.family!==family||manual.softness!==0)throw Error('Manual font/crisp override was ignored');
   results.push({family,weight,sourceSoftness:softness,sourceEdges,replacementEdges,fit:fitted,manual});document.body.append(canvas);
  }
  // A neighbour can guide typography without lending its ink colour to the
  // selected amount. Cover both contrast directions and light-on-dark text.
  for(const [background,labelColor,color] of [
   ['#ffffff','#4d4d4d','#4d4d4d'],
   ['#ffffff','#000000','#4d4d4d'],
   ['#ffffff','#4d4d4d','#000000'],
   ['#202020','#fafafa','#b2b2b2'],
   ['#ffffff','#000000','#2355aa'],
  ] as const){
   await ensureFont('Liberation Sans');
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=95;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='normal 28px "Liberation Sans"';
   const regions=[['label','Annual charge before tax',20.25,labelColor],['amount','17 950,24 €',550.25,color]].map(([id,text,x,fill])=>{
    ctx.fillStyle=String(fill);ctx.fillText(String(text),Number(x),54.25);const m=ctx.measureText(String(text));
    return {id:String(id),text:String(text),left:Number(x)-m.actualBoundingBoxLeft,top:54.25-m.actualBoundingBoxAscent,width:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent,size:28,baseline:54.25,fontName:'Image',bold:false,italic:false,color:String(fill),background,kind:'ocr',confidence:99} as TextRegion;
   });
   const selected=regions[1],makeText=async(r:TextRegion,font:string)=>(await detectedTextbox(r,{ocrFont:font,ocrStyle:'regular'})).text;
   const fit=await matchOcrAppearance(canvas,selected,regions,'Liberation Sans',{autoFont:false,matchBlur:false,makeText});
   if(!fit||fit.family!=='Liberation Sans'||fit.softness!==0)throw Error(`Mixed-ink typography changed: ${JSON.stringify({background,labelColor,color,fit})}`);
   const text=await makeText(selected,fit.family);applyOcrAppearance(text,selected,fit);
   const fill=String(text.fill),channels=[1,3,5];
   if(!/^#[0-9a-f]{6}$/i.test(fill)||channels.some(i=>Math.abs(parseInt(fill.slice(i,i+2),16)-parseInt(color.slice(i,i+2),16))>2))throw Error(`Selected amount borrowed its neighbour's ink: ${JSON.stringify({background,labelColor,color,fill,fit})}`);
   results.push({case:'Selected ink colour beside a neighbour',background,labelColor,sourceColor:color,replacementColor:fill,fit});
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
  // Original-letter edits must leave the page unchanged when its letters
  // cannot build the requested text. Font replacement requires an explicit
  // choice, and still uses appearance matching after that choice.
  const scene=new Canvas(document.createElement('canvas'),{width:280,height:50,renderOnAddRemove:false,enableRetinaScaling:false});
  try{
   scene.add(new FabricImage(canvas,{left:0,top:0}));const page=blankPage(280,50),settings={...defaultOcrSettings,font:'Inter',style:'regular',matchBlur:true};
   const before=JSON.stringify(scene.toObject()),pixels=scene.toDataURL(),originalObjects=scene.toObject().objects,unchanged=JSON.stringify(originalObjects);
   let refused:unknown;
   try{
    const blocked=await planOcrReplacement(scene,page,[{region:regions[0],text:'Dali'}],{settings,pageRegions:regions,others:regions,letters:true,autoFont:false});
    await blocked.apply(originalObjects);
   }catch(error){refused=error;}
   if(!(refused instanceof Error)||!/original letter/.test(refused.message)||!/New font explicitly/.test(refused.message))throw Error(`Unmatchable original letters must ask for an explicit font choice: ${String(refused)}`);
   if(JSON.stringify(scene.toObject())!==before||scene.toDataURL()!==pixels||JSON.stringify(originalObjects)!==unchanged)throw Error('A refused original-letter edit changed the page');
   const plan=await planOcrReplacement(scene,page,[{region:regions[0],text:'Dali'}],{settings:{...settings,editMode:'font'},pageRegions:regions,others:regions,letters:false,autoFont:false});
   const objects:unknown[]=[];await plan.apply(objects);const edited=objects.at(-1) as {text:string;fontFamily:string;textSoftness?:number};
   if(plan.letters||plan.fonts!==1||edited.text!=='Dali'||edited.fontFamily!=='Inter'||(edited.textSoftness??0)!==fitted.softness)throw Error(`Explicit font edit lost appearance matching: ${JSON.stringify({edited,fitted})}`);
   const bulk=await planOcrReplacement(scene,page,[{region:regions[0]}],{settings,pageRegions:regions,others:regions,letters:false,autoFont:false});
   const bulkObjects:unknown[]=[];await bulk.apply(bulkObjects);const converted=bulkObjects.at(-1) as {textSoftness?:number};
   if(converted.textSoftness)throw Error('Convert all softened a single-region page');
   results.push({case:'Original lettering refusal, explicit font choice and crisp bulk conversion',originalUnchanged:true,font:edited.fontFamily,softness:edited.textSoftness,bulkSoftness:converted.textSoftness??0});
  }finally{await scene.dispose();}
  result.textContent=JSON.stringify({passed:true,results},null,2);
 }catch(error){result.textContent=String(error);}
});
