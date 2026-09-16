import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {cp, mkdir} from 'node:fs/promises';
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig(({mode}) => ({
  base: './', publicDir: mode === 'demo' ? false : 'public',
  plugins: [react(), ...(mode === 'demo' ? [{name:'bide-demo-assets', async closeBundle() {
    await mkdir('out', {recursive:true});
    for (const name of ['diagrams','licenses','favicon.svg','barclays-eagle.svg','_headers']) await cp(`public/${name}`, `out/${name}`, {recursive:true});
  }}] : [])],
  build: {target:'esnext',outDir:mode === 'demo' ? 'out' : 'dist'},
  worker: {format:'es'}, server:{headers}, preview:{headers},
}));
