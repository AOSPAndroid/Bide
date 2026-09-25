import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitOcrText,pdfFallbackStyle} from '../tmp/text-regions.mjs';
test('OCR keeps 0.8.6 aspect-preserving fit and measures the selected weight',()=>{
 const region={width:220,height:30,size:40};
 const regular=fitOcrText(region,{width:600,actualBoundingBoxAscent:70,actualBoundingBoxDescent:10});
 const bold=fitOcrText(region,{width:660,actualBoundingBoxAscent:72,actualBoundingBoxDescent:10});
 assert.equal(regular.size,220*100/600);assert.equal(bold.size,220*100/660);
 assert.ok(bold.size<regular.size);assert.ok(bold.size*82/100<=region.height);
 assert.equal(bold.ascent,72*bold.size/100);
});
test('embedded PDF fallback keeps bold and italic without needing a descriptive font name',()=>{
 assert.deepEqual(pdfFallbackStyle({pdfFontBold:true,pdfFontItalic:true,pdfOriginalFont:'ABCDEF+F1'}),{fontWeight:'bold',fontStyle:'italic'});
 assert.deepEqual(pdfFallbackStyle({pdfFontBold:false,pdfFontItalic:false,pdfOriginalFont:'MisleadingBoldItalic'}),{fontWeight:'normal',fontStyle:'normal'});
});
test('older saved projects recover bold and italic fallback from the original font name',()=>{
 assert.deepEqual(pdfFallbackStyle({pdfOriginalFont:'ABCDEF+Arial-BoldItalic'}),{fontWeight:'bold',fontStyle:'italic'});
 assert.deepEqual(pdfFallbackStyle({pdfOriginalFont:'Helvetica'}),{fontWeight:'normal',fontStyle:'normal'});
});
