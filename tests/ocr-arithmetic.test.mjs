import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseAmount,sumFixes} from '../tmp/ocr-arithmetic.mjs';
// A region ending at x=500, with one doubted character (index among the inked ones).
const line=(text,top,doubted=-1)=>{const inked=Array.from(text).filter(c=>/\S/.test(c));return {text,left:500-inked.length*10,top,width:inked.length*10,height:12,glyphs:inked.map((ch,i)=>({ch,x0:i*10,x1:i*10+10,p:i===doubted?.6:.99}))};};
test('amounts are read in cents, with thousands separators and currency signs',()=>{
 assert.equal(parseAmount('1 482,36 €').cents,148236);assert.equal(parseAmount('€ 2103.00').cents,210300);assert.equal(parseAmount('12,50').cents,1250);
 assert.equal(parseAmount('Total 12,50'),undefined);assert.equal(parseAmount('12'),undefined);
});
test('a doubted digit that alone makes the column add up is corrected',()=>{
 // 64,00 + 17,80 + 9,50 + 52,50 = 143,80; the 1 of 17,80 was read 7 (77,80) and doubted.
 const rows=[line('64,00 €',10),line('77,80 €',30,0),line('9,50 €',50),line('52,50 €',70),line('143,80 €',100)];
 assert.deepEqual(sumFixes(rows),[{index:1,text:'17,80 €'}]);
 // The total's own digit doubted instead.
 const t=[line('64,00 €',10),line('17,80 €',30),line('9,50 €',50),line('52,50 €',70),line('148,80 €',100,2)];
 assert.deepEqual(sumFixes(t),[{index:4,text:'143,80 €'}]);
});
test('nothing changes when the sum holds, when no digit was doubted, or when two changes would do',()=>{
 assert.deepEqual(sumFixes([line('64,00 €',10),line('17,80 €',30,0),line('81,80 €',60)]),[]);
 assert.deepEqual(sumFixes([line('64,00 €',10),line('77,80 €',30),line('81,80 €',60)]),[],'not doubted');
 // 60 + 20 = 90 as read: either doubted tens digit could be the wrong one.
 assert.deepEqual(sumFixes([line('60,00 €',10,0),line('20,00 €',30,0),line('90,00 €',60)]),[],'ambiguous');
 // Amounts in another column are not part of the sum.
 const other={...line('999,99 €',40),left:100,width:80};
 assert.deepEqual(sumFixes([line('64,00 €',10),other,line('77,80 €',30,0),line('81,80 €',60)]),[{index:2,text:'17,80 €'}]);
});
test('net plus tax: a column whose last amount is the sum of the two before it is left alone; two possible sums change nothing',()=>{
 assert.deepEqual(sumFixes([line('10,00 €',10),line('30,00 €',30),line('100,00 €',60),line('20,00 €',80),line('120,00 €',100,1)]),[],'net + tax holds');
 // 170 as read: 160 (all lines) or 120 (the last two) would both add up.
 assert.deepEqual(sumFixes([line('10,00 €',10),line('30,00 €',30),line('100,00 €',60),line('20,00 €',80),line('170,00 €',100,1)]),[],'ambiguous');
});
