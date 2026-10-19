// Build-time preparation only. All OCR assets are local in the distributed ZIP.
// The integer "best" LSTM models give the same results as the larger standard
// tessdata (which also carries the unused legacy engine) at a fraction of the size.
// Restrict the bundle with OCR_LANGUAGES=eng,fra,deu (English and French are always included).
import {mkdir,cp,readdir,rm,writeFile} from 'node:fs/promises';
const available={eng:'English',fra:'Français',deu:'Deutsch',spa:'Español',ita:'Italiano',nld:'Nederlands',por:'Português'};
const requested=process.env.OCR_LANGUAGES?.split(',').map(s=>s.trim()).filter(Boolean)??Object.keys(available);
for(const code of requested)if(!(code in available))throw new Error(`Unknown OCR language "${code}". Available: ${Object.keys(available).join(', ')}`);
const languages=[...new Set(['eng','fra',...requested])];
await rm('public/ocr/lang',{recursive:true,force:true});
await mkdir('public/ocr/core',{recursive:true});await mkdir('public/ocr/lang',{recursive:true});
await cp('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');
for(const name of await readdir('node_modules/tesseract.js-core'))if(name.endsWith('.wasm')||name.endsWith('.wasm.js'))await cp('node_modules/tesseract.js-core/'+name,'public/ocr/core/'+name);
for(const code of languages)await cp(`node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`,`public/ocr/lang/${code}.traineddata.gz`);
await writeFile('public/ocr/lang/languages.json',JSON.stringify(languages.map(code=>({code,name:available[code]})))+'\n');
await cp('node_modules/tesseract.js/LICENSE.md','public/licenses/tesseract-LICENSE.txt');await cp('node_modules/tesseract.js-core/LICENSE','public/licenses/tesseract-core-LICENSE.txt');
// Spelling dictionaries for OCR proofreading (Hunspell format, read by nspell).
await mkdir('public/ocr/spell',{recursive:true});
for(const [code,pkg] of [['en','dictionary-en'],['fr','dictionary-fr']]){for(const ext of ['aff','dic'])await cp(`node_modules/${pkg}/index.${ext}`,`public/ocr/spell/${code}.${ext}`);await cp(`node_modules/${pkg}/license`,`public/licenses/${pkg}-LICENSE.txt`);}
