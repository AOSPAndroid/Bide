import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, copyFile, readdir, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const windows = process.platform === 'win32';
const commandPrompt = join(process.env.SystemRoot || 'C:\\Windows','System32','cmd.exe');

async function fixture(t, built = true) {
  const base = await mkdtemp(join(tmpdir(),'bide installed node test-'));
  assert.ok(resolve(base).startsWith(resolve(tmpdir(),'bide installed node test-')));
  t.after(() => rm(base,{recursive:true,force:true}));
  await mkdir(join(base,'scripts'));
  for (const name of ['scripts/windows.mjs','scripts/server-control.mjs','scripts/serve.mjs','scripts/bide.cmd','Install Dependencies.bat','launch bide.bat','share bide.bat','Stop bide.bat']) await copyFile(new URL('../'+name,import.meta.url),join(base,name));
  // Any download attempt is an error. Node/npm/PowerShell are absent from PATH.
  await writeFile(join(base,'no-network.mjs'), `
    import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
    import {syncBuiltinESMExports} from 'node:module';
    const blocked = () => {throw new Error('TEST: network request forbidden');};
    globalThis.fetch = http.get = http.request = https.get = https.request = net.connect = net.createConnection = blocked;
    syncBuiltinESMExports();
  `);
  if (built) {
    for(const file of ['ocr/worker.min.js','ocr/lang/eng.traineddata.gz','ocr/lang/fra.traineddata.gz',...['','-simd','-lstm','-simd-lstm'].flatMap(s=>[`ocr/core/tesseract-core${s}.wasm.js`,`ocr/core/tesseract-core${s}.wasm`])]){await mkdir(join(base,'site',file,'..'),{recursive:true});await writeFile(join(base,'site',file),'test fixture');}
    await mkdir(join(base,'site','office','runtime'),{recursive:true});
    await writeFile(join(base,'site','index.html'),'<title>bide launcher fixture</title>');
    for (const name of ['soffice.js','soffice.wasm','soffice.data','soffice.data.js.metadata']) await writeFile(join(base,'site','office','runtime',name),'test fixture');
    await mkdir(join(base,'site','diagrams','runtime','js'),{recursive:true});
    for (const name of ['index.html','js/app.min.js','js/bootstrap.js','bide-build.json']) await writeFile(join(base,'site','diagrams','runtime',name),'test fixture');
  } else await writeFile(join(base,'package.json'),'{}');
  return base;
}

function check(base,nodePath,command = 'call "Install Dependencies.bat" --no-pause') {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env.PATH = join(process.env.SystemRoot,'System32'); env.BIDE_NODE = nodePath;
  env.NODE_OPTIONS = '--import "' + pathToFileURL(join(base,'no-network.mjs')).href + '"';
  return spawnSync(commandPrompt,['/d','/s','/c',command], {cwd:base,env,encoding:'utf8',timeout:15000,windowsHide:true,windowsVerbatimArguments:true});
}

test('prebuilt BAT uses existing Node without PATH, PowerShell, npm or network requests', {skip:!windows}, async t => {
  const base = await fixture(t), result = check(base,process.execPath);
  assert.equal(result.status,0,result.stdout + result.stderr);
  assert.ok(result.stdout.includes(process.execPath));
  assert.match(result.stdout,/No downloads or npm installation/);
  assert.equal((await readdir(base)).includes('.runtime'),false);
});

test('a missing explicit Node path stops clearly without downloading a runtime', {skip:!windows}, async t => {
  const base = await fixture(t), result = check(base,join(base,'missing-node.exe'));
  assert.equal(result.status,1,result.stdout + result.stderr);
  assert.match(result.stdout,/Nothing was downloaded/);
  assert.equal((await readdir(base)).includes('.runtime'),false);
});

test('an incomplete diagram bundle stops without downloading assets', {skip:!windows}, async t => {
  const base=await fixture(t);
  await rm(join(base,'site','diagrams','runtime','js','app.min.js'));
  const result=check(base,process.execPath);
  assert.equal(result.status,1);
  assert.match(result.stderr,/diagram editor is incomplete/);
  assert.match(result.stderr,/No downloads were attempted/);
  assert.doesNotMatch(result.stderr,/network request forbidden/);
});

test('source checkout install and launch give the prebuilt link without attempting downloads', {skip:!windows}, async t => {
  const base = await fixture(t,false);
  for (const command of ['call "Install Dependencies.bat" --no-pause','call "launch bide.bat" --no-browser','call "share bide.bat" --no-pause']) {
    const result = check(base,process.execPath,command);
    assert.equal(result.status,1,result.stdout + result.stderr);
    assert.match(result.stderr,/not the ready-to-run package/);
    assert.match(result.stderr,/https:\/\/github.com\/AOSPAndroid\/Bide\/releases\/download\/v[\d.]+\/bide-browser.zip/);
    assert.match(result.stderr,/No downloads were attempted/);
    assert.doesNotMatch(result.stderr,/network request forbidden/);
  }
  assert.equal((await readdir(base)).includes('.runtime'),false);
});

test('Stop BAT works without built assets or a running server and never downloads', {skip:!windows}, async t=>{const base=await fixture(t,false);const result=check(base,process.execPath,'call "Stop bide.bat" --no-pause');assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/No running bide servers registered/);});

test('Stop BAT shuts down an actual locally launched server', {skip:!windows}, async t=>{
 const base=await fixture(t);const child=spawn(process.execPath,[join(base,'scripts','serve.mjs')],{cwd:base,env:{...process.env,BIDE_ROOT:join(base,'site'),BIDE_PORT:'0'},windowsHide:true,stdio:'ignore'});t.after(()=>child.kill());
 let ready=false;for(let i=0;i<100;i++){try{if((await readdir(join(base,'.runtime','servers'))).length){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,30));}assert.ok(ready,'Server registered its control endpoint');
 const env={...process.env,BIDE_NODE:process.execPath};delete env.NODE_OPTIONS;const result=spawnSync(commandPrompt,['/d','/s','/c','call "Stop bide.bat" --no-pause'],{cwd:base,env,encoding:'utf8',timeout:15000,windowsHide:true,windowsVerbatimArguments:true});assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/Stopped 1 bide server/);for(let i=0;i<50&&child.exitCode===null;i++)await new Promise(r=>setTimeout(r,20));assert.equal(child.exitCode,0);
});
