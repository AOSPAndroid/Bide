import {test} from 'node:test';import assert from 'node:assert/strict';
import {fontFileName} from '../tmp/extra-fonts.mjs';
test('a font file name gives its family and style',()=>{
 const cases={'Raleway-BoldItalic.ttf':['Raleway','BoldItalic',false],'My Brand Font Bold.otf':['My Brand Font','Bold',false],'OpenSans-Regular.woff2':['Open Sans','Regular',false],
  'Inter[wght].ttf':['Inter','Regular',true],'Nunito-Italic[wght].ttf':['Nunito','Italic',true],'brand_sans-SemiBold.woff':['brand sans','Bold',false],'Gotham-Book.otf':['Gotham','Regular',false],'Helvetica.ttf':['Helvetica','Regular',false]};
 for(const [name,[family,style,variable]] of Object.entries(cases))assert.deepEqual(fontFileName(name),{family,style,variable},name);
 assert.equal(fontFileName('notes.txt'),undefined);assert.equal(fontFileName('.ttf'),undefined);
});
