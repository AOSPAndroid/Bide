import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {cp, mkdir} from 'node:fs/promises';
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig(({mode}) => ({
  base: './', publicDir: mode === 'demo' ? false : 'public',
  plugins: [react(), ...(mode === 'demo' ? [{name:'bide-demo-assets', async closeBundle() {
    // The AI model pack (LaMa alone is 208 MB) is left out of the hosted demo; AI actions hide when it is absent.
    await mkdir('out', {recursive:true});
    for (const name of ['ocr','diagrams','licenses','favicon.svg','barclays-eagle.svg','_headers']) await cp(`public/${name}`, `out/${name}`, {recursive:true});
  }}] : [])],
  build: {target:'esnext',outDir:mode === 'demo' ? 'out' : 'dist'},
  // Lazily imported deps are listed so the dev server doesn't reload the page mid-session on first use.
  optimizeDeps: {exclude:['mupdf'], include:['docx','fflate','onnxruntime-web/webgpu'], esbuildOptions:{target:'esnext'}},
  worker: {format:'es'}, server:{headers}, preview:{headers},
}));
