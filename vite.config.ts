import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {discoveryPlugin} from './scripts/discovery-plugin.mjs';
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
// The iOS/Android app bundle keeps the models every scan needs; the others
// (object removal, background removal, high-accuracy OCR, page flattening,
// other alphabets) are fetched from the bide server on first use.
export const appModels = ['ppocr-det','ppocr-latin-rec','doc-ori','sam-encoder','sam-decoder','realesr-general-x4v3'];
async function trimForApp(dir:string) {
  for (const name of await readdir(`${dir}/ai/models`).catch(() => [] as string[])) if (name.endsWith('.onnx') && !appModels.includes(name.slice(0, -5))) await rm(`${dir}/ai/models/${name}`);
  // Office conversion needs cross-origin isolation, which app WebViews do not offer.
  await rm(`${dir}/office`, {recursive:true, force:true});
}
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig(({mode,command}) => {
  const env=loadEnv(mode,process.cwd(),'VITE_');
  const publicSite=mode==='demo'||mode==='saas'||(command==='serve'&&mode!=='app');
  // The subscription build (npm run build:saas) must carry the licence server's public key.
  if ((mode === 'saas' || mode === 'app') && !env.VITE_LICENCE_PUBLIC_KEY) throw new Error('Set VITE_LICENCE_PUBLIC_KEY (from node cloud/keys.mjs) to build the subscription version.');
  if(mode==='app'&&!/^https:\/\//.test(env.VITE_LICENCE_API??''))throw new Error('Set VITE_LICENCE_API to the HTTPS licence server for the app build.');
  return {
  base: publicSite ? '/' : './', publicDir: command === 'serve' ? 'public' : mode === 'demo' || mode === 'saas' ? false : 'public',
  // Use our explicitly located runtime, avoiding a second emitted WASM copy.
  resolve:{conditions:['onnxruntime-web-use-extern-wasm','module','browser','development|production']},
  plugins: [react(), ...(mode === 'app' ? [{name:'bide-app-assets', async closeBundle() { await trimForApp('dist-app'); }}] : []), ...(mode === 'saas' ? [{name:'bide-saas-assets', async closeBundle() {
    // Keep the complete on-origin paid engines, but omit unsupported Office files.
    // A local edition's assets may also exist in public; never copy those blindly.
    for (const name of ['licenses','favicon.svg','brand-logo.svg','_headers','ocr','ai']) await cp(`public/${name}`, `dist-saas/${name}`, {recursive:true});
    await splitLargeFiles('dist-saas/ai/models');
  }}] : []), ...(mode === 'demo' ? [{name:'bide-demo-assets', async closeBundle() {
    // Hosted AI downloads verified, pinned models on demand. Runtime and OCR
    // dictionaries stay on this origin; the local edition bundles every model.
    await mkdir('out', {recursive:true});
    for (const name of ['licenses','favicon.svg','brand-logo.svg','_headers']) await cp(`public/${name}`, `out/${name}`, {recursive:true});
    // OCR always requests OEM 1: these two scripts embed their WASM and cover
    // SIMD and non-SIMD browsers. Legacy cores and separate binaries are unused.
    await cp('public/ocr','out/ocr',{recursive:true,filter:path=>!path.replaceAll('\\','/').includes('/ocr/core/')||/tesseract-core(?:-simd)?-lstm\.wasm\.js$/.test(path)});
    await cp('public/ai/ort','out/ai/ort',{recursive:true});
    await mkdir('out/ai/models',{recursive:true});
    for(const script of ['latin','cyrillic','greek','arabic','korean','cjk'])await cp(`public/ai/models/ppocr-${script}-dict.json`,`out/ai/models/ppocr-${script}-dict.json`);
  }}] : []), ...(publicSite ? [discoveryPlugin(mode,env)] : [])],
  build: {target:'esnext',outDir:mode === 'demo' ? 'out' : mode === 'saas' ? 'dist-saas' : mode === 'app' ? 'dist-app' : 'dist'},
  // Lazily imported deps are listed so the dev server doesn't reload the page mid-session on first use.
  optimizeDeps: {exclude:['mupdf'], include:['docx','fflate','onnxruntime-web/webgpu','nspell','pdf-lib','@pdf-lib/fontkit','pdfkit','svg-to-pdfkit','@capacitor/core','@capacitor/filesystem','@capacitor/share'], esbuildOptions:{target:'esnext'}},
  worker: {format:'es'}, server:{headers,allowedHosts:['terminal.local']}, preview:{headers},
};});
