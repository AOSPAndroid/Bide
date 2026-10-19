import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {cp, mkdir} from 'node:fs/promises';
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig(({mode}) => ({
  base: './', publicDir: mode === 'demo' ? false : 'public',
  // Use our explicitly located runtime, avoiding a second emitted WASM copy.
  resolve:{conditions:['onnxruntime-web-use-extern-wasm','module','browser','development|production']},
  plugins: [react(), ...(mode === 'demo' ? [{name:'bide-demo-assets', async closeBundle() {
    // Hosted AI downloads verified, pinned models on demand. Runtime and OCR
    // dictionaries stay on this origin; the local edition bundles every model.
    await mkdir('out', {recursive:true});
    for (const name of ['diagrams','licenses','favicon.svg','brand-logo.svg','_headers']) await cp(`public/${name}`, `out/${name}`, {recursive:true});
    // OCR always requests OEM 1: these two scripts embed their WASM and cover
    // SIMD and non-SIMD browsers. Legacy cores and separate binaries are unused.
    await cp('public/ocr','out/ocr',{recursive:true,filter:path=>!path.replaceAll('\\','/').includes('/ocr/core/')||/tesseract-core(?:-simd)?-lstm\.wasm\.js$/.test(path)});
    await cp('public/ai/ort','out/ai/ort',{recursive:true});
    await mkdir('out/ai/models',{recursive:true});
    for(const script of ['latin','cyrillic','greek','arabic','korean','cjk'])await cp(`public/ai/models/ppocr-${script}-dict.json`,`out/ai/models/ppocr-${script}-dict.json`);
  }}] : [])],
  build: {target:'esnext',outDir:mode === 'demo' ? 'out' : 'dist'},
  // Lazily imported deps are listed so the dev server doesn't reload the page mid-session on first use.
  optimizeDeps: {exclude:['mupdf'], include:['docx','fflate','onnxruntime-web/webgpu','nspell','pdf-lib','pdfkit','svg-to-pdfkit'], esbuildOptions:{target:'esnext'}},
  worker: {format:'es'}, server:{headers}, preview:{headers},
}));
