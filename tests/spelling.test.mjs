import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import nspell from 'nspell';
import {findDoubts,confusionVariants,applySuggestion} from '../tmp/spelling.mjs';
const load=code=>nspell(readFileSync(`node_modules/dictionary-${code}/index.aff`),readFileSync(`node_modules/dictionary-${code}/index.dic`));
const en=load('en');

test('OCR confusions come first, then dictionary suggestions',()=>{
 assert.ok(confusionVariants('rnodern').includes('modern'));
 assert.ok(confusionVariants('Daliil').includes('Dalil'),'a letter read twice');
 assert.deepEqual(confusionVariants('cat',new Set([1])).filter(v=>v.length===3).sort(),[],'focus limits the swaps to the doubtful letter');
 const [modern]=findDoubts('A rnodern office',[en]);
 assert.equal(modern.word,'rnodern');assert.equal(modern.suggestions[0],'modern');
 const [revenue]=findDoubts('Reveune grew',[en]);assert.ok(revenue.suggestions.includes('Revenue'));
});

test('known words, numbers and acronyms pass; doubtful letters can still flag a real word',()=>{
 assert.deepEqual(findDoubts('Invoice total 1284 EUR for ABC Ltd',[en]),[]);
 assert.deepEqual(findDoubts('see page 12b',[en]),[],'letters glued to digits are skipped');
 // "cat" is a word, but if its "a" was unclear, "cot"/"cut" etc. are not OCR confusions; "rn" in "barn" can be "bam"?
 const flagged=findDoubts('the clog barked',[en],new Set([4,5]));
 assert.equal(flagged.length,1);assert.equal(flagged[0].word,'clog');assert.ok(flagged[0].suggestions.includes('dog'),flagged[0].suggestions.join());
});

test('applying a suggestion replaces only that word, by code points',()=>{
 const text='Café rnodern ✓',[d]=findDoubts(text,[en,load('fr')]);
 assert.equal(applySuggestion(text,d,'modern'),'Café modern ✓');
});
