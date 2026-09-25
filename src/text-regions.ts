export type TextRegion={id:string;text:string;left:number;top:number;width:number;height:number;size:number;baseline:number;fontName:string;bold:boolean;italic:boolean;color:string;kind:'pdf'|'ocr';quads?:number[][];fontId?:string;fontData?:string;confidence?:number;background?:string};
export function fallbackFont(name:string){return /courier|mono|consolas/i.test(name)?'Cousine':/times|serif|georgia|garamond/i.test(name)?'PT Serif':/poppins/i.test(name)?'Poppins':'Lato';}

// Use the original face's style when an embedded subset cannot render new text.
// The embedded face itself stays normal to avoid synthesizing bold twice.
export function pdfFallbackStyle(o:{pdfFontBold?:boolean;pdfFontItalic?:boolean;pdfOriginalFont?:string}){
 return {fontWeight:(o.pdfFontBold??/bold|black|heavy|demi|semibold/i.test(o.pdfOriginalFont||''))?'bold':'normal',fontStyle:(o.pdfFontItalic??/italic|oblique/i.test(o.pdfOriginalFont||''))?'italic':'normal'};
}
export function fitOcrText(region:{width:number;height:number;size:number},metrics:{width:number;actualBoundingBoxAscent:number;actualBoundingBoxDescent:number}){
 const height=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
 const size=Math.max(4,Math.min(height>0?region.height*100/height:region.size,metrics.width>0?region.width*100/metrics.width:region.size));
 return {size,ascent:metrics.actualBoundingBoxAscent*size/100};
}
