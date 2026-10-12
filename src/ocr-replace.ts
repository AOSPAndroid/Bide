// Replacing detected image text: each line is rebuilt from the image's own
// letters when asked and possible, otherwise it becomes editable text in the
// OCR font over a cleaned background.
import type {Canvas,FabricObject} from 'fabric';
import type {Textbox} from './text-appearance';
import type {Page} from './model';
import type {TextRegion} from './text-regions';
import type {OcrSettings} from './TextDetectionBar';
import {detectedTextbox,coverOcrText,pageInkLevel,glyphEditPatch} from './detected-text';

export type OcrEdit={region:TextRegion;text?:string};

// Everything is rendered before the page is touched; `apply` then adds the
// result to the page's serialized objects (clearing the background under
// font-rendered lines first), so the caller can commit it as one undo step.
export async function planOcrReplacement(c:Canvas,page:Page,items:OcrEdit[],{settings,pageRegions,others,letters}:{settings:OcrSettings;pageRegions:TextRegion[];others:TextRegion[];letters:boolean}){
 const patches:FabricObject[]=[],fonts:OcrEdit[]=[];
 for(const item of items){const patch=letters&&item.text!==undefined?await glyphEditPatch(c,page,item.region,item.text,pageRegions):undefined;if(patch)patches.push(patch);else fonts.push(item);}
 const transparent=fonts.length>0&&settings.background==='transparent';
 if(transparent&&page.source)throw new Error('Unlock Original PDF first to clear scanned text to transparency.');
 const pageInk=settings.style==='auto'?await pageInkLevel(pageRegions,settings.font):undefined,texts:Textbox[]=[];
 for(const item of fonts){const {text}=await detectedTextbox(item.region,{ocrFont:settings.font,ocrStyle:settings.style,pageInk,matchBlur:settings.matchBlur&&items.length===1});if(item.text!==undefined&&item.text!==item.region.text){text.set({text:item.text});text.initDimensions();}texts.push(text);}
 return {letters:patches.length,fonts:texts.length,transparent,
  async apply(objects:unknown[],onProgress?:(fraction:number)=>void){
   if(fonts.length)await coverOcrText(c,page,fonts.map(f=>f.region),objects,{mode:settings.background,color:settings.color,padding:settings.padding,others,onProgress});
   objects.push(...patches.map(p=>p.toObject()),...texts.map(t=>t.toObject()));
  }};
}

// Toast after a letters-first edit.
export const lettersNote=(letters:number,fonts:number)=>letters&&!fonts?'Edited with the image\'s own letters. Undo restores the original.':letters?`${letters} line${letters===1?'':'s'} edited with the image's own letters; ${fonts} needed letters not found on the page and use the OCR font.`:'Some letters do not appear on the page, so the OCR font was used. Check font and spacing.';
