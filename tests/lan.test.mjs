import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {webcrypto, createHash} from 'node:crypto';
import {get as httpsGet} from 'node:https';
import * as mupdf from 'mupdf';
import {createBideServer, readLanSettings} from '../scripts/serve.mjs';
import {digest, uuid} from '../tmp/browser-crypto.mjs';
import {importBytes, restore, exportDocument} from '../tmp/browser-core.mjs';

test('PDF import, project validation, export and IDs work without secure-context crypto', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {value:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}, configurable:true});
  try {
    assert.equal(Buffer.from(await digest(new TextEncoder().encode('abc'))).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const ids = new Set(Array.from({length:100}, uuid));
    assert.equal(ids.size, 100);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const imported = await importBytes(new TextEncoder().encode('bide HTTP intranet test'), 'test.txt');
    assert.equal(imported.id, createHash('sha256').update(Buffer.from(imported.data,'base64')).digest('hex'));
    await restore({[imported.id]:imported.data});
    await assert.rejects(restore({bad:imported.data}), /corrupted/);
    const result = await exportDocument({pages:[{...imported.pages[0],source:imported.id,svg:''}],title:'LAN',format:'pdf',compression:'lossless',range:'',dpi:72});
    const doc = mupdf.Document.openDocument(result.bytes, 'pdf'), page = doc.loadPage(0), text = page.toStructuredText('');
    assert.match(text.asText(), /bide HTTP intranet test/);
    text.destroy(); page.destroy(); doc.destroy();
  } finally { Object.defineProperty(globalThis, 'crypto', previous); }
});

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'bide-lan-test-'));
  // Only delete this test's unique, resolved temporary directory.
  assert.ok(resolve(base).startsWith(resolve(tmpdir(), 'bide-lan-test-')));
  t.after(() => rm(base, {recursive:true, force:true}));
  const root = join(base,'site');
  await mkdir(root); await mkdir(join(base,'.runtime')); await mkdir(join(root,'office'));
  await writeFile(join(root,'index.html'), '<title>bide</title>');
  await writeFile(join(root,'office','engine.wasm'), new Uint8Array([0,97,115,109]));
  return {base, root};
}

async function listen(t, server) {
  await new Promise((yes,no) => {server.once('error',no); server.listen(0,'127.0.0.1',yes);});
  t.after(() => new Promise(done => {server.close(done); server.closeAllConnections();}));
  return server.address().port;
}

test('HTTP serves streaming assets and isolation headers, supports HEAD, rejects uploads and private paths', async t => {
  const {base,root} = await fixture(t);
  await writeFile(join(base,'.runtime','secret.txt'), 'must stay private');
  await symlink(join(base,'.runtime'), join(root,'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const server = await createBideServer({root}), port = await listen(t,server), origin = `http://127.0.0.1:${port}`;
  const response = await fetch(origin);
  assert.equal(response.status,200); assert.equal(await response.text(),'<title>bide</title>');
  assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin');
  assert.equal(response.headers.get('cross-origin-embedder-policy'),'require-corp');
  const wasm = await fetch(origin + '/office/engine.wasm', {method:'HEAD'});
  assert.equal(wasm.headers.get('content-type'),'application/wasm'); assert.equal(wasm.headers.get('content-length'),'4'); assert.equal(await wasm.text(),'');
  assert.equal((await fetch(origin,{method:'POST',body:'a document'})).status,405);
  for (const path of ['/linked/secret.txt','/.runtime/secret.txt','/%2e%2e%5c.runtime/secret.txt','/%00','/missing']) assert.equal((await fetch(origin+path)).status,404,path);
  assert.deepEqual(await (await fetch(origin+'/__bide/status')).json(), {application:'bide-browser',root,stopSupported:false});
});

test('LAN configuration has explicit defaults and validated custom ports', async t => {
  const {base,root} = await fixture(t);
  assert.deepEqual(await readLanSettings(base,root), {port:8786,host:'0.0.0.0',publicHost:undefined,tls:undefined});
  await writeFile(join(base,'.runtime','lan.json'), JSON.stringify({port:9090,bind:'127.0.0.1'}));
  assert.equal((await readLanSettings(base,root)).port,9090);
  assert.equal((await readLanSettings(base,root,'8787')).port,8787);
  for (const invalid of ['0','-1','65536','1.2','abc']) await assert.rejects(readLanSettings(base,root,invalid), /LAN port/);
});

test('HTTPS serves the app with a certificate explicitly trusted by the test client', async t => {
  const {base,root} = await fixture(t);
  const cert = await readFile(new URL('./fixtures/tls/test-only.crt',import.meta.url));
  await writeFile(join(base,'.runtime','cert.pem'),cert);
  await writeFile(join(base,'.runtime','key.pem'),await readFile(new URL('./fixtures/tls/test-only.key',import.meta.url)));
  await writeFile(join(base,'.runtime','lan.json'),JSON.stringify({tls:{cert:'.runtime/cert.pem',key:'.runtime/key.pem'}}));
  const settings = await readLanSettings(base,root);
  const server = await createBideServer({root,tls:settings.tls}), port = await listen(t,server);
  const response = await new Promise((yes,no) => {
    httpsGet({hostname:'127.0.0.1',port,path:'/',ca:cert},res => {let text='';res.on('data',part=>text+=part);res.on('end',()=>yes({text,status:res.statusCode,headers:res.headers}));}).on('error',no);
  });
  assert.equal(response.status,200); assert.equal(response.text,'<title>bide</title>');
  assert.equal(response.headers['cross-origin-embedder-policy'],'require-corp');
  await writeFile(join(root,'private-key.pem'),'test placeholder');
  await writeFile(join(base,'.runtime','lan.json'),JSON.stringify({tls:{cert:'.runtime/cert.pem',key:'site/private-key.pem'}}));
  await assert.rejects(readLanSettings(base,root), /outside the served site/);
});
