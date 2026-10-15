export type TextRegion={id:string;text:string;left:number;top:number;width:number;height:number;size:number;baseline:number;fontName:string;bold:boolean;italic:boolean;color:string;kind:'pdf'|'ocr';quads?:number[][];fontId?:string;fontData?:string;confidence?:number;background?:string;inkDensity?:number;words?:{text:string;inkDensity?:number;inkMass?:number;width?:number}[];blur?:number;glyphs?:{ch:string;x0:number;x1:number}[];line?:{words:{text:string;inkDensity?:number;inkMass?:number;width?:number}[];start:number;count:number}};
export function fallbackFont(name:string){return /courier|mono|consolas/i.test(name)?'Cousine':/times|serif|georgia|garamond/i.test(name)?'PT Serif':/poppins/i.test(name)?'Poppins':'Lato';}

// Use the original face's style when an embedded subset cannot render new text.
// The embedded face itself stays normal to avoid synthesizing bold twice.
export function pdfFallbackStyle(o:{pdfFontBold?:boolean;pdfFontItalic?:boolean;pdfOriginalFont?:string}){
 return {fontWeight:(o.pdfFontBold??/bold|black|heavy|demi|semibold/i.test(o.pdfOriginalFont||''))?'bold':'normal',fontStyle:(o.pdfFontItalic??/italic|oblique/i.test(o.pdfOriginalFont||''))?'italic':'normal'};
}
// Size OCR replacement text from metrics measured at 100px. Width (the whole
// line's inked extent) sets the size as since 0.8.6; height is only trusted
// when it agrees within 3%, because it hinges on extreme glyphs (brackets,
// descenders) that differ between fonts and made lines ~9% too tall. Letter
// spacing (Fabric charSpacing, 1/1000 em, within ±60) then takes up the
// remaining width difference. Glyphs are never stretched.
export function fitOcrText(region:{width:number;height:number;size:number},metrics:{width:number;actualBoundingBoxAscent:number;actualBoundingBoxDescent:number},characters=0){
 const height=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
 const bySize=height>0?region.height*100/height:region.size,byWidth=metrics.width>0?region.width*100/metrics.width:region.size;
 const size=Math.max(4,Math.abs(bySize/byWidth-1)<=.03?bySize:byWidth);
 const gaps=characters-1,missing=region.width-metrics.width*size/100;
 const charSpacing=gaps>0&&metrics.width>0?Math.max(-60,Math.min(60,missing/gaps/size*1000)):0;
 return {size,ascent:metrics.actualBoundingBoxAscent*size/100,charSpacing};
}
