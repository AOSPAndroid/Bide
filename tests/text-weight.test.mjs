import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitOcrText,pdfFallbackStyle} from '../tmp/text-regions.mjs';
test('OCR fit: width sets the size, height only when it agrees, spacing restores the width',()=>{
 const region={width:220,height:30,size:40};
 // Height and width agree within 3%: height decides, spacing tightens to 220 px.
 const close=fitOcrText(region,{width:595,actualBoundingBoxAscent:70,actualBoundingBoxDescent:10},20);
 assert.equal(close.size,37.5);assert.ok(close.charSpacing<0);
 assert.ok(Math.abs(595*close.size/100+19*close.charSpacing*close.size/1000-220)<1e-9,'line keeps its width');
 // Wider font: width sets the size as since 0.8.6, so no spacing is needed.
 const wide=fitOcrText(region,{width:660,actualBoundingBoxAscent:72,actualBoundingBoxDescent:10},20);
 assert.equal(wide.size,220*100/660);assert.ok(Math.abs(wide.charSpacing)<1e-9);assert.equal(wide.ascent,72*wide.size/100);
 assert.equal(fitOcrText(region,{width:600,actualBoundingBoxAscent:70,actualBoundingBoxDescent:10},1).charSpacing,0,'single character: no spacing');
});
test('embedded PDF fallback keeps bold and italic without needing a descriptive font name',()=>{
 assert.deepEqual(pdfFallbackStyle({pdfFontBold:true,pdfFontItalic:true,pdfOriginalFont:'ABCDEF+F1'}),{fontWeight:'bold',fontStyle:'italic'});
 assert.deepEqual(pdfFallbackStyle({pdfFontBold:false,pdfFontItalic:false,pdfOriginalFont:'MisleadingBoldItalic'}),{fontWeight:'normal',fontStyle:'normal'});
});
test('older saved projects recover bold and italic fallback from the original font name',()=>{
 assert.deepEqual(pdfFallbackStyle({pdfOriginalFont:'ABCDEF+Arial-BoldItalic'}),{fontWeight:'bold',fontStyle:'italic'});
 assert.deepEqual(pdfFallbackStyle({pdfOriginalFont:'Helvetica'}),{fontWeight:'normal',fontStyle:'normal'});
});
test('PDF fonts that cannot draw new text fall back to a metric-compatible bundled face',async()=>{
 const {fallbackFont}=await import('../tmp/text-regions.mjs');
 const cases={'Helvetica':'Liberation Sans','BCDEFG+Helvetica-Bold':'Liberation Sans','ArialMT':'Liberation Sans','Arial,Bold':'Liberation Sans','Times-Roman':'Liberation Serif','TimesNewRomanPS-BoldMT':'Liberation Serif','ABCDEF+Calibri':'Carlito','Cambria-Italic':'Caladea','Courier':'Cousine','Georgia':'PT Serif','MicrosoftSansSerif':'Liberation Sans','DejaVuSans':'Liberation Sans','OpenSans-Regular':'Liberation Sans','Roboto-Bold':'Liberation Sans','Inter-Medium':'Liberation Sans','PTSans-Bold':'PT Sans','Lato-Black':'Lato','Poppins-Medium':'Poppins','Quicksand':'Lato'};
 for(const [font,face] of Object.entries(cases))assert.equal(fallbackFont(font),face,font);
});
