// Validate the paid artifact before it is sent to a static-assets host.
import {access, readFile, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';

const root='dist-saas',maxBytes=25*2**20;
const required=['index.html','_headers','brand-logo.svg','licenses/mupdf-LICENSE',
  'ocr/worker.min.js','ocr/lang/eng.traineddata.gz','ocr/lang/fra.traineddata.gz',
  'ai/ort/ort-wasm-simd-threaded.jsep.mjs','ai/ort/ort-wasm-simd-threaded.jsep.wasm'];
for (const file of required) await access(join(root,file));
const manifest=JSON.parse(await readFile('public/ai/manifest.json','utf8'));
for (const [name,entry] of Object.entries(manifest.files)) {
  const target=join(root,'ai/models',name),bytes=entry.output?.bytes??entry.bytes;
  if (name.endsWith('.onnx')&&bytes>24*2**20) {
    const parts=JSON.parse(await readFile(`${target}.parts.json`,'utf8'));
    if (parts.size!==bytes||parts.parts!==Math.ceil(bytes/(20*2**20))) throw new Error(`Invalid parts manifest for ${name}`);
    let total=0;
    for (let i=0;i<parts.parts;i++) total+=(await stat(`${target}.part${i}`)).size;
    if (total!==bytes) throw new Error(`Incomplete model parts for ${name}`);
  } else if ((await stat(target)).size!==bytes) throw new Error(`Incomplete model: ${name}`);
}
let count=0;
async function inspect(directory){
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const file=join(directory,entry.name);
    if (entry.isDirectory()) await inspect(file);
    else {
      if ((await stat(file)).size>maxBytes) throw new Error(`Asset exceeds the 25 MiB hosting limit: ${file}`);
      count++;
    }
  }
}
await inspect(root);
if (await stat(join(root,'office/runtime')).then(()=>true,()=>false)) throw new Error('The hosted paid build must not include the unsupported Office runtime.');
if (await stat(join(root,'diagrams')).then(()=>true,()=>false)) throw new Error('The retired diagram workspace must not be bundled.');
console.log(`Checked ${count} hosted assets, model parts and required engines.`);
