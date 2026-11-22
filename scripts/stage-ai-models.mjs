import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';

// Static hosts refuse files over 25 MiB. Paid builds keep their existing
// 20 MiB pieces; the public demo uses smaller pieces for its on-origin LaMa.
export async function splitLargeFiles(dir, limit=24*2**20, part=20*2**20) {
  for (const name of await readdir(dir).catch(() => [])) {
    const file = join(dir, name);
    if (!name.endsWith('.onnx') || (await stat(file)).size <= limit) continue;
    const bytes = await readFile(file), parts = Math.ceil(bytes.length / part);
    for (let i = 0; i < parts; i++) await writeFile(`${file}.part${i}`, bytes.subarray(i * part, (i + 1) * part));
    await writeFile(`${file}.parts.json`, JSON.stringify({size: bytes.length, parts}));
    await rm(file);
  }
}

export async function stageDemoLama(source, destination) {
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  const output = manifest.files?.['lama.onnx']?.output;
  if (!Number.isSafeInteger(output?.bytes) || output.bytes <= 0 || !/^[a-f0-9]{64}$/.test(output?.sha256 ?? '')) {
    throw new Error('Prepared LaMa output size and SHA-256 are required in the AI manifest.');
  }
  const bytes = await readFile(join(source, 'models/lama.onnx'));
  if (bytes.length !== output.bytes) throw new Error('Prepared LaMa output size did not match the AI manifest.');
  if (createHash('sha256').update(bytes).digest('hex') !== output.sha256) {
    throw new Error('Prepared LaMa output SHA-256 integrity check failed.');
  }
  // Write the verified bytes, and only this model, into the demo build.
  const models = join(destination, 'models');
  await mkdir(models, {recursive:true});
  await writeFile(join(models, 'lama.onnx'), bytes);
  await splitLargeFiles(models, 5*2**20, 5*2**20);
}
