// Replacing detected image text: each line is rebuilt from the image's own
// letters when requested. A substitute font is used only in explicit font mode.
import type {Canvas,FabricObject} from 'fabric';
import type {Textbox} from './text-appearance';
import type {Page} from './model';
import type {TextRegion} from './text-regions';
import type {OcrSettings} from './TextDetectionBar';
import {detectedTextbox,matchedDetectedTextbox,coverOcrText,pageInkLevel,glyphEditPatch,type LetterSource} from './detected-text';

export type OcrEdit={region:TextRegion;text?:string};

// Everything is rendered before the page is touched; `apply` then adds the
// result to the page's serialized objects (clearing the background under
// font-rendered lines first), so the caller can commit it as one undo step.
export async function planOcrReplacement(c:Canvas,page:Page,items:OcrEdit[],{settings,pageRegions,others,letters,autoFont}:{settings:OcrSettings;pageRegions:TextRegion[];others:TextRegion[];letters:boolean;autoFont:boolean;otherPages?:LetterSource[]}){
 const patches:FabricObject[]=[],fonts:OcrEdit[]=[];
 for(const item of items){
  if(letters){
   if(item.text===item.region.text)continue;
   // Neighbouring lines/pages may use another face or weight. Preserve this
   // line's own pixels instead of borrowing unverified lettering.
   const patch=item.text!==undefined?await glyphEditPatch(c,page,item.region,item.text):undefined;
   if(!patch)throw new Error('Cannot preserve the original lettering for this edit. Nothing was changed. Choose New font explicitly to allow a replacement font.');
   patches.push(patch);
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
  if(item.text!==undefined&&item.text!==item.region.text){text.set({text:item.text});text.initDimensions();}texts.push(text);}
 return {letters:patches.length,fonts:texts.length,transparent,
  async apply(objects:unknown[],onProgress?:(fraction:number)=>void){
   if(fonts.length)await coverOcrText(c,page,fonts.map(f=>f.region),objects,{mode:settings.background,color:settings.color,padding:settings.padding,others,onProgress});
   objects.push(...patches.map(p=>p.toObject()),...texts.map(t=>t.toObject()));
  }};
}

// Toast after a letters-first edit.
export const lettersNote=(letters:number,_fonts:number)=>letters?'Edited with the image\'s own letters. Undo restores the original.':'No text was changed.';
