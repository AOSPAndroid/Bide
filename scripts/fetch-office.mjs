// Restore the large browser engine without storing binaries in Git history.
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,rename,stat,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const office=resolve(root,'public/office');
const manifest=JSON.parse(await readFile(resolve(office,'manifest.json'),'utf8'));
async function matches(path,entry){
 try {
  if((await stat(path)).size!==entry.bytes)return false;
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex')===entry.sha256;
 }catch(e){if(e.code==='ENOENT')return false;throw e;}
}
try {
 for(const [name,entry] of Object.entries(manifest.files)){
  const relative=name.replaceAll('\\','/');
  if(!/^runtime\/soffice\.(js|wasm|data|data\.js\.metadata)$/.test(relative))continue;
  const target=resolve(office,relative);
  if(await matches(target,entry)){console.log(`Verified ${relative}`);continue;}
  const url=new URL(relative.slice('runtime/'.length),manifest.runtimeSource);
  if(url.protocol!=='https:'||url.hostname!=='cdn.zetaoffice.net')throw new Error('Unrecognized Office engine source.');
  console.log(`Downloading ${relative} from ${url.hostname}...`);
  await mkdir(dirname(target),{recursive:true});
  const temporary=target+`.${process.pid}.part`;
  try {
   const response=await fetch(url,{signal:AbortSignal.timeout(300000)});
   if(!response.ok||!response.body)throw new Error(`Download failed: HTTP ${response.status}`);
   // fetch automatically decodes the vendor's Brotli HTTP transport encoding.
   await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));
   if(!await matches(temporary,entry))throw new Error('Office engine checksum differs from the tested build. Use the packaged ZIP or update the pinned manifest after testing the new upstream release.');
   await rename(temporary,target);
   console.log(`Verified ${relative}`);
  }finally{await rm(temporary,{force:true});}
 }
 console.log('bide Office engine is ready.');
}catch(e){console.error(e.message);process.exitCode=1;}
