import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {cp, mkdir, readdir, readFile, writeFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
// Static hosts such as Sites (Cloudflare Static Assets) refuse files over
// 25 MiB: large AI models are written as 20 MiB parts plus a manifest, which
// the AI worker joins again.
async function splitLargeFiles(dir:string, limit=24*2**20, part=20*2**20) {
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const file = join(dir, name);
    if (!name.endsWith('.onnx') || (await stat(file)).size <= limit) continue;
    const bytes = await readFile(file), parts = Math.ceil(bytes.length / part);
    for (let i = 0; i < parts; i++) await writeFile(`${file}.part${i}`, bytes.subarray(i * part, (i + 1) * part));
    await writeFile(`${file}.parts.json`, JSON.stringify({size: bytes.length, parts}));
    await rm(file);
  }
}
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig(({mode}) => {
  // The subscription build (npm run build:saas) must carry the licence server's public key.
  if (mode === 'saas' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_LICENCE_PUBLIC_KEY) throw new Error('Set VITE_LICENCE_PUBLIC_KEY (from node cloud/keys.mjs) to build the subscription version.');
  return {
  base: './', publicDir: mode === 'demo' ? false : 'public',
  plugins: [react(), ...(mode === 'saas' ? [{name:'bide-split-models', async closeBundle() { await splitLargeFiles('dist-saas/ai/models'); }}] : []), ...(mode === 'demo' ? [{name:'bide-demo-assets', async closeBundle() {
    // The AI model pack (LaMa alone is 106 MB) is left out of the hosted demo; AI actions hide when it is absent.
    await mkdir('out', {recursive:true});
    for (const name of ['ocr','licenses','favicon.svg','brand-logo.svg','_headers']) await cp(`public/${name}`, `out/${name}`, {recursive:true});
  }}] : [])],
  build: {target:'esnext',outDir:mode === 'demo' ? 'out' : mode === 'saas' ? 'dist-saas' : 'dist'},
  // Lazily imported deps are listed so the dev server doesn't reload the page mid-session on first use.
  optimizeDeps: {exclude:['mupdf'], include:['docx','fflate','onnxruntime-web/webgpu','nspell','pdf-lib','pdfkit','svg-to-pdfkit'], esbuildOptions:{target:'esnext'}},
  worker: {format:'es'}, server:{headers}, preview:{headers},
};});
