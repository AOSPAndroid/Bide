// Build-time only. The prebuilt bide package never downloads these assets at launch.
import {readFile, writeFile, mkdir, access, cp} from 'node:fs/promises';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {unzipSync, strFromU8} from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'public/diagrams');
const target = resolve(base, 'runtime');
const manifest = JSON.parse(await readFile(resolve(base, 'manifest.json'), 'utf8'));
const exists = async p => {try {await access(p); return true;} catch {return false;}};
const ready = async () => {
  try {return JSON.parse(await readFile(resolve(target, 'bide-build.json'), 'utf8')).sha256 === manifest.sha256 && await exists(resolve(target, 'js/app.min.js'));} catch {return false;}
};
if (!await ready()) {
  const bundled = resolve(root, '../site/diagrams/runtime');
  if (await exists(resolve(bundled, 'bide-build.json'))) {
    console.log('Restoring bundled diagram editor.');
    await cp(bundled, target, {recursive:true});
  }
}
if (!await ready()) {
  console.log(`Preparing draw.io ${manifest.version} for offline use...`);
  const cache = resolve(root, `tmp/drawio-v${manifest.version}.war`);
  let bytes;
  if (await exists(cache)) bytes = new Uint8Array(await readFile(cache));
  else {
    const response = await fetch(manifest.url);
    if (!response.ok) throw new Error(`Diagram download failed (${response.status}). Use the prebuilt bide-browser.zip to avoid setup downloads.`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('Diagram archive checksum mismatch.');
  const files = unzipSync(bytes, {filter: entry => !/^(WEB-INF|META-INF|connect)\//.test(entry.name) && !/^(service-worker|workbox)/.test(entry.name)});
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const path = resolve(target, name);
    if (!path.startsWith(target + sep) || name.includes('\\')) throw new Error('Invalid diagram archive path.');
    await mkdir(dirname(path), {recursive:true});
    let output = data;
    if (name === 'index.html') {
      // Restrict this iframe to local assets, including diagrams loaded from a file.
      const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
      output = Buffer.from(strFromU8(data).replace('<head>', `<head>\n<!-- bide modification: local assets only, 2026-09-16 -->\n<meta http-equiv="Content-Security-Policy" content="${csp}">`));
    }
    await writeFile(path, output);
  }
  await writeFile(resolve(target, 'bide-build.json'), JSON.stringify(manifest, null, 2));
}
// Reapply our configuration when rebuilding from an existing or packaged runtime.
for (const name of ['PreConfig.js', 'PostConfig.js']) {
  const path = resolve(target, 'js', name);
  const upstream = (await readFile(path, 'utf8')).split('// bide modifications')[0].trimEnd();
  await writeFile(path, upstream + '\n' + await readFile(resolve(base, name), 'utf8'));
}
console.log(`Local diagram editor ${manifest.version} is ready.`);
