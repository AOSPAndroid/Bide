// Replacing detected image text: each line is rebuilt from the image's own
// letters when requested. A substitute font is used only in explicit font mode.
import type {Canvas,FabricObject} from 'fabric';
import type {Textbox} from './text-appearance';
import type {Page} from './model';
import type {TextRegion} from './text-regions';
import type {OcrSettings} from './TextDetectionBar';
import {detectedTextbox,matchedDetectedTextbox,coverOcrText,pageInkLevel,glyphEditPatch,fitOneLine,rightAligned,spacedText,type LetterSource,type LetterFace,letterEditBlocker} from './detected-text';

export type OcrEdit={region:TextRegion;text?:string};
// An edit the line's own letters cannot rebuild: nothing changes, and the
// reason says why (which letters the line lacks, or that it has none to reuse).
export class LetteringError extends Error{
 constructor(readonly reason:string){super(`Cannot preserve the original lettering for this edit: ${reason} Nothing was changed. Choose New font explicitly to allow a replacement font.`);}
}

// Everything is rendered before the page is touched; `apply` then adds the
// result to the page's serialized objects (clearing the background under
// font-rendered lines first), so the caller can commit it as one undo step.
// `mix` (a single edit set in a font): the line keeps its own letters, and
// only those the page cannot lend are drawn in the matched face; the whole
// line is set in the font when that cannot be done.
export async function planOcrReplacement(c:Canvas,page:Page,items:OcrEdit[],{settings,pageRegions,others,letters,autoFont,mix=true,rule=true}:{settings:OcrSettings;pageRegions:TextRegion[];others:TextRegion[];letters:boolean;autoFont:boolean;otherPages?:LetterSource[];mix?:boolean;rule?:boolean}){
 const patches:FabricObject[]=[],fonts:OcrEdit[]=[],edits:{region:TextRegion;text?:string;layer:string;letters:boolean}[]=[],drawn:string[]=[];let borrowed=0;
 for(const item of items){
  if(letters){
   // Back to the text as read: the field shows the original again (no layer).
   if(item.text===item.region.text){edits.push({region:item.region,text:item.text,layer:'',letters:true});continue;}
   // Neighbouring lines may use another face or weight: a letter this line
   // lacks is taken only from a line of the page verified to be in the same
   // lettering (letter-match.ts), never from unverified lettering.
   // The matched face is only a ruler here (where letters laid by their ink
   // go): every pixel is the page's own.
   let face:LetterFace|undefined;
   if(rule&&items.length===1&&item.text!==undefined)try{const made=await matchedDetectedTextbox(item.region,c,page,pageRegions,{ocrFont:settings.font,ocrStyle:settings.style,matchBlur:settings.matchBlur,autoFont,appearanceRegions:others});if('score' in made)face={family:made.text.fontFamily,weight:made.text.fontWeight,style:made.text.fontStyle,size:made.text.fontSize,fill:String(made.text.fill),softness:0,charSpacing:made.text.charSpacing,score:made.score as number,draw:false};}catch{}
   const patch=item.text!==undefined?await glyphEditPatch(c,page,item.region,item.text,pageRegions,[],face):undefined;
   if(!patch)throw new LetteringError(letterEditBlocker(item.region,item.text??item.region.text));
   patches.push(patch);if((patch as FabricObject&{borrowed?:boolean}).borrowed)borrowed++;edits.push({region:item.region,text:item.text,layer:(patch as FabricObject&{id:string}).id,letters:true});
  }else fonts.push(item);
 }
 const transparent=fonts.length>0&&settings.background==='transparent';
 if(transparent&&page.source)throw new Error('Unlock Original PDF first to clear scanned text to transparency.');
 // Explicit single font edits keep the native-pixel
 // appearance fit and its edge-clarity guard. Bulk conversion stays crisp and
 // uses the scan's suggested face without re-ranking every line on the page.
 const single=items.length===1&&items[0].text!==undefined,pageInk=!single&&settings.style==='auto'?await pageInkLevel(pageRegions,settings.font):undefined,texts:Textbox[]=[];
 const whole:OcrEdit[]=[];let fit:number|undefined;
 for(const item of fonts){const made=single
  ?await matchedDetectedTextbox(item.region,c,page,pageRegions,{ocrFont:settings.font,ocrStyle:settings.style,matchBlur:settings.matchBlur,autoFont,appearanceRegions:others})
  :await detectedTextbox(item.region,{ocrFont:settings.font,ocrStyle:settings.style,pageInk,matchBlur:false});
  const {text}=made,score='score' in made?made.score as number:undefined;
  fit=score;
  // (A face that fits the line only roughly was fitted softer than the line is, to make up for its shapes: its letters are drawn no softer than the line was measured.)
  if(single&&mix&&item.text!==item.region.text&&settings.background!=='transparent'){
   const patch=await glyphEditPatch(c,page,item.region,item.text!,pageRegions,[],{family:text.fontFamily,weight:text.fontWeight,style:text.fontStyle,size:text.fontSize,fill:String(text.fill),softness:(score??0)>=.9?text.textSoftness??0:Math.min(text.textSoftness??0,item.region.blur??0),charSpacing:text.charSpacing,score}).catch(()=>undefined);
   if(patch){patches.push(patch);drawn.push(...((patch as FabricObject&{drawn?:string[]}).drawn??[]));edits.push({region:item.region,text:item.text,layer:(patch as FabricObject&{id:string}).id,letters:true});continue;}
  }
  whole.push(item);
  if(item.text!==undefined&&item.text!==item.region.text){
   // A right-aligned line (an amount in a column) keeps its right edge when its length changes.
   const before=text.calcTextWidth(),right=!item.region.angle&&rightAligned(item.region,pageRegions);
   text.set({text:spacedText(item.region,item.text)});fitOneLine(text);
   if(right)text.set({left:text.left-(text.calcTextWidth()-before)});
  }texts.push(text);edits.push({region:item.region,text:item.text,layer:(text as Textbox&{id:string}).id,letters:false});}
 return {letters:patches.length,fonts:texts.length,borrowed,drawn,fit,transparent,edits,
  async apply(objects:unknown[],onProgress?:(fraction:number)=>void){
   if(whole.length)await coverOcrText(c,page,whole.map(f=>f.region),objects,{mode:settings.background,color:settings.color,padding:settings.padding,others,onProgress});
   objects.push(...patches.map(p=>p.toObject()),...texts.map(t=>t.toObject()));
  }};
}

// Toast after a letters-first edit.
// `borrowed`: edits that took a letter from another line of the page.
export const lettersNote=(letters:number,_fonts:number,borrowed=0)=>letters?`Edited with the image's own letters${borrowed?' (a missing one came from another line in the same lettering)':''}. Undo restores the original.`:'No text was changed.';
