import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {create} from 'fontkit';
test('extended offline library contains 63 unique, valid licensed families with French glyphs',async()=>{
 const manifest=JSON.parse(await readFile('scripts/font-library-manifest.json','utf8'));
 assert.equal(manifest.families.length,63);assert.equal(new Set(manifest.families.map(f=>f.family)).size,63);
 for(const family of manifest.families){assert.ok(family.faces.some(f=>f.style==='Regular'));
  const slug=family.family.toLowerCase().replace(/[^a-z0-9]/g,'');assert.match(await readFile(`public/licenses/fonts/${slug}-OFL.txt`,'utf8'),/OPEN FONT LICENSE/i);
  for(const face of family.faces){const bytes=await readFile(`src/browser/fonts/library/${face.file}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),face.sha256);const font=create(bytes);for(const char of 'ABCabcéèêëàâçîïôùûüÉÇœ')assert.ok(font.hasGlyphForCodePoint(char.codePointAt(0)),`${family.family} ${face.style}: ${char}`);}
 }
});

test('document-weight faces keep their intended weight, embedding rights and Latin glyphs under licensed names',async()=>{
 const families={Roboto:'roboto',Inter:'inter',OpenSans:'opensans',Montserrat:'montserrat',Poppins:'poppins',SourceSans3:'sourcesans3',NotoSans:'notosans'};
 for(const [file,license] of Object.entries(families)){
  const terms=await readFile(`public/licenses/fonts/${license}-OFL.txt`,'utf8');assert.match(terms,/OPEN FONT LICENSE/i);
  for(const [weight,value] of [['Light',300],['Medium',500],['SemiBold',600]]){
   const font=create(await readFile(`src/browser/fonts/weights/${file}-${weight}.ttf`));assert.equal(font['OS/2'].usWeightClass,value);
   assert.equal(font['OS/2'].fsType.noEmbedding,false);assert.equal(font['OS/2'].fsType.noSubsetting,false);
   for(const char of 'ABCabcéèêëàâçîïôùûüÉÇœ€')assert.ok(font.hasGlyphForCodePoint(char.codePointAt(0)),`${file} ${weight}: ${char}`);
   if(file==='SourceSans3'){assert.equal(font.familyName,`bide Sans 3 ${weight}`);assert.equal(font.postscriptName,`bide-sans3-${weight}`);assert.match(terms,/Reserved Font Name 'Source'/);}
  }
 }
});
