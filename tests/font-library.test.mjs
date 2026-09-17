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
