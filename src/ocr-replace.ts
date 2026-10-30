// Replacing detected image text: each line is rebuilt from the image's own
// letters when requested. A substitute font is used only in explicit font mode.
import type {Canvas,FabricObject} from 'fabric';
import type {Textbox} from './text-appearance';
import type {Page} from './model';
import type {TextRegion} from './text-regions';
import type {OcrSettings} from './TextDetectionBar';
import {detectedTextbox,matchedDetectedTextbox,coverOcrText,pageInkLevel,glyphEditPatch,fitOneLine,type LetterSource,letterEditBlocker} from './detected-text';

export type OcrEdit={region:TextRegion;text?:string};
// An edit the line's own letters cannot rebuild: nothing changes, and the
// reason says why (which letters the line lacks, or that it has none to reuse).
export class LetteringError extends Error{
 constructor(readonly reason:string){super(`Cannot preserve the original lettering for this edit: ${reason} Nothing was changed. Choose New font explicitly to allow a replacement font.`);}
}

// Everything is rendered before the page is touched; `apply` then adds the
// result to the page's serialized objects (clearing the background under
// font-rendered lines first), so the caller can commit it as one undo step.
export async function planOcrReplacement(c:Canvas,page:Page,items:OcrEdit[],{settings,pageRegions,others,letters,autoFont}:{settings:OcrSettings;pageRegions:TextRegion[];others:TextRegion[];letters:boolean;autoFont:boolean;otherPages?:LetterSource[]}){
 const patches:FabricObject[]=[],fonts:OcrEdit[]=[],edits:{region:TextRegion;text?:string;layer:string;letters:boolean}[]=[];
 for(const item of items){
  if(letters){
   // Back to the text as read: the field shows the original again (no layer).
   if(item.text===item.region.text){edits.push({region:item.region,text:item.text,layer:'',letters:true});continue;}
   // Neighbouring lines/pages may use another face or weight. Preserve this
   // line's own pixels instead of borrowing unverified lettering.
   const patch=item.text!==undefined?await glyphEditPatch(c,page,item.region,item.text):undefined;
   if(!patch)throw new LetteringError(letterEditBlocker(item.region,item.text??item.region.text));
   patches.push(patch);edits.push({region:item.region,text:item.text,layer:(patch as FabricObject&{id:string}).id,letters:true});
  }else fonts.push(item);
 }
 const transparent=fonts.length>0&&settings.background==='transparent';
 if(transparent&&page.source)throw new Error('Unlock Original PDF first to clear scanned text to transparency.');
 // Explicit single font edits keep the native-pixel
 // appearance fit and its edge-clarity guard. Bulk conversion stays crisp and
 // uses the scan's suggested face without re-ranking every line on the page.
 const single=items.length===1&&items[0].text!==undefined,pageInk=!single&&settings.style==='auto'?await pageInkLevel(pageRegions,settings.font):undefined,texts:Textbox[]=[];
 for(const item of fonts){const {text}=single
  ?await matchedDetectedTextbox(item.region,c,page,pageRegions,{ocrFont:settings.font,ocrStyle:settings.style,matchBlur:settings.matchBlur,autoFont,appearanceRegions:others})
  :await detectedTextbox(item.region,{ocrFont:settings.font,ocrStyle:settings.style,pageInk,matchBlur:false});
  if(item.text!==undefined&&item.text!==item.region.text){text.set({text:item.text});fitOneLine(text);}texts.push(text);edits.push({region:item.region,text:item.text,layer:(text as Textbox&{id:string}).id,letters:false});}
 return {letters:patches.length,fonts:texts.length,transparent,edits,
  async apply(objects:unknown[],onProgress?:(fraction:number)=>void){
   if(fonts.length)await coverOcrText(c,page,fonts.map(f=>f.region),objects,{mode:settings.background,color:settings.color,padding:settings.padding,others,onProgress});
   objects.push(...patches.map(p=>p.toObject()),...texts.map(t=>t.toObject()));
  }};
}

// Toast after a letters-first edit.
export const lettersNote=(letters:number,_fonts:number)=>letters?'Edited with the image\'s own letters. Undo restores the original.':'No text was changed.';
