// Build-time preparation only. All OCR assets are local in the distributed ZIP.
import {mkdir,cp,readdir} from 'node:fs/promises';
await mkdir('public/ocr/core',{recursive:true});await mkdir('public/ocr/lang',{recursive:true});
await cp('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');
for(const name of await readdir('node_modules/tesseract.js-core'))if(name.endsWith('.wasm')||name.endsWith('.wasm.js'))await cp('node_modules/tesseract.js-core/'+name,'public/ocr/core/'+name);
for(const language of ['eng','fra'])await cp(`node_modules/@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`,`public/ocr/lang/${language}.traineddata.gz`);
await cp('node_modules/tesseract.js/LICENSE.md','public/licenses/tesseract-LICENSE.txt');await cp('node_modules/tesseract.js-core/LICENSE','public/licenses/tesseract-core-LICENSE.txt');
