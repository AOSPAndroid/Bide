// Build-time preparation of the offline AI models (no runtime downloads).
// Models are pinned by URL, size and SHA-256 in public/ai/manifest.json and kept
// out of Git (LaMa exceeds GitHub's file limit); this verifies or fetches them,
// copies the ONNX Runtime WebAssembly files and extracts the OCR dictionary.
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,rm,stat,cp} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {dirname} from 'node:path';
import {weightsToFloat16} from './onnx-fp16.mjs';

const manifest=JSON.parse(await readFile('public/ai/manifest.json','utf8'));
async function verified(path,entry){
 try{if((await stat(path)).size!==entry.bytes)return false;const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex')===entry.sha256;}
 catch(e){if(e.code==='ENOENT')return false;throw e;}
}
// PaddleOCR keeps its character list in YAML: plain or single-quoted ('' = ').
export function characterDict(yaml){
 const lines=yaml.split(/\r?\n/),start=lines.findIndex(l=>/^\s*character_dict:\s*$/.test(l));if(start<0)throw new Error('No character_dict in OCR model config.');
 const chars=[];for(const line of lines.slice(start+1)){const m=/^\s+- (.*)$/.exec(line);if(!m)break;const v=m[1];chars.push(v.startsWith("'")&&v.endsWith("'")?v.slice(1,-1).replaceAll("''","'"):v);}
 return chars;
}
async function convert(name,entry,source){
 if(entry.convert!=='fp16-weights')throw new Error(`Unknown conversion ${entry.convert} for ${name}.`);
 console.log(`Converting ${name} to float16 weights...`);
 const {bytes}=weightsToFloat16(await readFile(source)),target=`public/ai/models/${name}`;
 await writeFile(target,bytes);
 if(!await verified(target,entry.output))throw new Error(`Converted ${name} differs from the tested build. Update public/ai/manifest.json only after testing.`);
}
if(process.argv[1]?.endsWith('prepare-ai.mjs'))try{
 await mkdir('public/ai/models',{recursive:true});
 for(const [name,entry] of Object.entries(manifest.files)){
  // Converted models (LaMa: float16 weights, half the size, identical output)
  // are downloaded to a cache, verified, converted and verified again.
  const target=entry.convert?`node_modules/.cache/bide-ai/${name}`:`public/ai/models/${name}`;
  if(entry.convert&&await verified(`public/ai/models/${name}`,entry.output))continue;
  await mkdir(dirname(target),{recursive:true});
  if(await verified(target,entry)){if(entry.convert)await convert(name,entry,target);continue;}
  const url=new URL(entry.url);if(url.protocol!=='https:'||url.hostname!=='huggingface.co')throw new Error(`Unrecognized model source for ${name}.`);
  console.log(`Downloading ${name} (${(entry.bytes/1e6).toFixed(1)} MB)...`);
  const temporary=`${target}.${process.pid}.part`;
  try{const response=await fetch(url,{signal:AbortSignal.timeout(900000)});if(!response.ok||!response.body)throw new Error(`Download failed: HTTP ${response.status}`);
   await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));
   if(!await verified(temporary,entry))throw new Error(`${name} differs from the tested model. Update public/ai/manifest.json only after testing a new upstream version.`);
   await rename(temporary,target);}finally{await rm(temporary,{force:true});}
  if(entry.convert)await convert(name,entry,target);
 }
 await writeFile('public/ai/models/ppocr-latin-dict.json',JSON.stringify(characterDict(await readFile('public/ai/models/ppocr-latin-rec.yml','utf8'))));
 await mkdir('public/ai/ort',{recursive:true});
 for(const file of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])await cp(`node_modules/onnxruntime-web/dist/${file}`,`public/ai/ort/${file}`);
 console.log('bide AI models are ready.');
}catch(e){console.error(e.message);process.exitCode=1;}
