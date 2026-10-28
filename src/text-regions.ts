export type TextRegion={id:string;text:string;script?:string;left:number;top:number;width:number;height:number;size:number;baseline:number;fontName:string;bold:boolean;italic:boolean;color:string;kind:'pdf'|'ocr';quads?:number[][];fontId?:string;fontData?:string;confidence?:number;background?:string;inkDensity?:number;words?:{text:string;inkDensity?:number;inkMass?:number;width?:number}[];blur?:number;glyphs?:{ch:string;x0:number;x1:number;p?:number}[];line?:{words:{text:string;inkDensity?:number;inkMass?:number;width?:number}[];start:number;count:number};
 // An edited field: the region as first read (a new edit starts again from its letters) and the layer showing the new text.
 original?:TextRegion;layer?:string;
 // Why the OCR may have misread this field (see ocr-checks.ts).
 doubt?:string;
 // A line on a tilted page or a sheet photographed at an angle: its box,
 // baseline and letter cells are level, and it lies on the page turned
 // clockwise by this many degrees about the box's centre.
 angle?:number};
// The bundled face replacing a PDF font that cannot draw the new text: a
// metric-compatible one where it exists, so the line keeps its width and look
// (Liberation Sans for Helvetica and Arial, Liberation Serif for Times, Carlito
// for Calibri, Caladea for Cambria). A Helvetica line set in Lato differed 4x more.
export function fallbackFont(name:string){
 const n=name.replace(/^[A-Z]{6}\+/,'');
 const bundled=[['PT Sans',/pt ?sans/i],['PT Serif',/pt ?serif/i],['Poppins',/poppins/i],['Lato',/lato/i]] as const;
 const same=bundled.find(([,pattern])=>pattern.test(n))?.[0];if(same)return same;
 return /courier|mono|consolas/i.test(n)?'Cousine':/helvetica|arial|arimo|nimbus ?sans|liberation ?sans/i.test(n)?'Liberation Sans':/times|tinos|nimbus ?rom|liberation ?serif/i.test(n)?'Liberation Serif':/calibri|carlito/i.test(n)?'Carlito':/cambria|caladea/i.test(n)?'Caladea':/sans|roboto|^inter\b|inter-/i.test(n)?'Liberation Sans':/serif|georgia|garamond/i.test(n)?'PT Serif':'Lato';
}

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
