// Fail a source build clearly if its offline engines have not been prepared.
import {access} from 'node:fs/promises';
const required = ['ocr/worker.min.js','ocr/lang/eng.traineddata.gz','ocr/lang/fra.traineddata.gz','ocr/spell/en.dic','ocr/spell/fr.dic',...['','-simd','-lstm','-simd-lstm'].flatMap(s=>[`ocr/core/tesseract-core${s}.wasm.js`,`ocr/core/tesseract-core${s}.wasm`]),'office/runtime/soffice.js','office/runtime/soffice.wasm','office/runtime/soffice.data','office/runtime/soffice.data.js.metadata',...['lama','realesr-general-x4v3','ppocr-det','ppocr-latin-rec'].map(m=>`ai/models/${m}.onnx`),'ai/models/ppocr-latin-dict.json','ai/ort/ort-wasm-simd-threaded.jsep.mjs','ai/ort/ort-wasm-simd-threaded.jsep.wasm'];
for (const path of required) {
  try {await access(new URL('../public/' + path, import.meta.url));}
  catch {throw new Error(`Missing bundled asset: ${path}. For a source build, run npm run assets:office and npm run assets:ai. Use the prebuilt bide-browser.zip to launch with no downloads.`);}
}
