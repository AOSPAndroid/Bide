import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, copyFile, readdir, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

const windows = process.platform === 'win32';
const powershell = join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');

async function prebuilt(t) {
  const base = await mkdtemp(join(tmpdir(),'bide installed node test-'));
  assert.ok(resolve(base).startsWith(resolve(tmpdir(),'bide installed node test-')));
  t.after(() => rm(base,{recursive:true,force:true}));
  await mkdir(join(base,'scripts'));
  await copyFile(new URL('../scripts/windows.ps1',import.meta.url),join(base,'scripts','windows.ps1'));
  await mkdir(join(base,'site','office','runtime'),{recursive:true});
  await writeFile(join(base,'site','index.html'),'<title>bide launcher fixture</title>');
  for (const name of ['soffice.js','soffice.wasm','soffice.data','soffice.data.js.metadata']) await writeFile(join(base,'site','office','runtime',name),'test fixture');
  return base;
}

function check(base,nodePath) {
  // No PATH access to Node/npm, and any PowerShell network request fails the test.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env.PATH = join(process.env.SystemRoot,'System32'); env.BIDE_NODE = nodePath;
  const script = join(base,'scripts','windows.ps1').replaceAll("'","''");
  return spawnSync(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command',
    `function Invoke-WebRequest { throw 'TEST: network request forbidden' }; function Invoke-RestMethod { throw 'TEST: network request forbidden' }; & '${script}' -Action Install`],
    {env,encoding:'utf8',timeout:15000,windowsHide:true});
}

test('prebuilt checks use an existing Node outside PATH without npm or network requests', {skip:!windows}, async t => {
  const base = await prebuilt(t), result = check(base,process.execPath);
  assert.equal(result.status,0,result.stdout + result.stderr);
  assert.ok(result.stdout.includes(process.execPath));
  assert.match(result.stdout,/No downloads or npm installation/);
  assert.deepEqual(await readdir(join(base,'.runtime')),[]);
});

test('a missing explicit Node path stops clearly without downloading a runtime', {skip:!windows}, async t => {
  const base = await prebuilt(t), result = check(base,join(base,'missing-node.exe'));
  assert.equal(result.status,1,result.stdout + result.stderr);
  assert.match(result.stdout,/Nothing was downloaded/);
  assert.equal((await readdir(base)).includes('.runtime'),false);
});
