// Windows launcher using the installed Node runtime; no PowerShell or policy changes.
import {stopRegisteredServers} from './server-control.mjs';
import {spawn, spawnSync} from 'node:child_process';
import {openSync, closeSync} from 'node:fs';
import {mkdir, readFile, writeFile, stat, copyFile} from 'node:fs/promises';
import {dirname, join, resolve, delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {get} from 'node:http';
import {connect} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = join(projectRoot, '.runtime');
const releaseUrl = 'https://github.com/AOSPAndroid/Bide/releases/download/v0.8.3/bide-browser.zip';
const officeFiles = ['soffice.js', 'soffice.wasm', 'soffice.data', 'soffice.data.js.metadata'];
const exists = async path => { try { return (await stat(path)).isFile(); } catch { return false; } };
const jsonFile = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const samePath = (a, b) => typeof a === 'string' && (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

async function siteRoot() {
  for (const folder of ['dist', 'site']) {
    const root = join(projectRoot, folder);
    if (!await exists(join(root, 'index.html'))) continue;
    for (const file of officeFiles) if (!await exists(join(root, 'office', 'runtime', file))) {
      throw new Error(`The bundled Office engine is incomplete (${file} missing). Extract the complete bide-browser.zip.\n${releaseUrl}\nNo downloads were attempted.`);
    }
    for (const file of ['index.html','js/app.min.js','js/bootstrap.js','bide-build.json']) if (!await exists(join(root,'diagrams','runtime',file))) {
      throw new Error(`The bundled diagram editor is incomplete (${file} missing). Extract the complete bide-browser.zip.\n${releaseUrl}\nNo downloads were attempted.`);
    }
    for(const file of ['ocr/worker.min.js','ocr/lang/eng.traineddata.gz','ocr/lang/fra.traineddata.gz',...['','-simd','-lstm','-simd-lstm'].flatMap(s=>[`ocr/core/tesseract-core${s}.wasm.js`,`ocr/core/tesseract-core${s}.wasm`])])if(!await exists(join(root,file)))throw new Error('The bundled OCR engine is incomplete. Extract the complete bide-browser.zip. No downloads were attempted.');
    return root;
  }
  throw new Error(`This folder contains source code or an incomplete app. It is not the ready-to-run package.\nGet bide-browser.zip from:\n${releaseUrl}\nExtract the entire ZIP into a new folder and run the BAT files beside the site folder.\nNo downloads were attempted. Developers can explicitly run Install Dependencies.bat --build-source to build from source (network access may be needed).`);
}

function run(file, args, options = {}) {
  return new Promise((yes, no) => {
    const child = spawn(file, args, {cwd:projectRoot, stdio:'inherit', windowsHide:true, ...options});
    child.once('error', no);
    child.once('exit', (code, signal) => code === 0 ? yes() : no(new Error(`${signal ? 'Process stopped: ' + signal : 'Process exited with code ' + code}. See the message above.`)));
  });
}

async function buildSource() {
  if (!await exists(join(projectRoot, 'package.json'))) throw new Error('This is the prebuilt package. No source build or dependency installation is needed.');
  const candidates = [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const found = spawnSync('where.exe', ['npm.cmd'], {encoding:'utf8', windowsHide:true});
  for (const path of (found.stdout || '').trim().split(/\r?\n/).filter(Boolean)) candidates.push(join(dirname(path), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  let npm;
  for (const path of candidates) if (await exists(path)) { npm = path; break; }
  if (!npm) throw new Error('A source build needs installed npm next to Node or on PATH. Use the prebuilt ZIP to launch without npm.');
  console.log('Source build explicitly requested. Missing Office/diagram assets and npm packages may be downloaded.');
  const target = join(projectRoot, 'public', 'office', 'runtime');
  const bundled = join(projectRoot, '..', 'site', 'office', 'runtime');
  for (const name of officeFiles) if (!await exists(join(target, name)) && await exists(join(bundled, name))) {
    await mkdir(target, {recursive:true}); await copyFile(join(bundled, name), join(target, name));
  }
  const env = {...process.env, PATH:dirname(process.execPath) + delimiter + (process.env.PATH || ''), npm_config_cache:join(runtime, 'npm-cache'), npm_config_update_notifier:'false'};
  await run(process.execPath, [join(projectRoot, 'scripts', 'fetch-office.mjs')], {env});
  await run(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {env});
  await run(process.execPath, [join(projectRoot, 'scripts', 'fetch-diagrams.mjs')], {env});
  await run(process.execPath, [npm, 'run', 'build'], {env});
}

function status(port, path = '/__bide/status') {
  return new Promise(yes => {
    const req = get({hostname:'127.0.0.1', port, path, timeout:700}, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', part => { body += part; if (body.length > 8192) { req.destroy(); yes(null); } });
      res.on('error', () => yes(null));
      res.on('end', () => { try { yes(res.statusCode === 200 ? JSON.parse(body) : null); } catch { yes(null); } });
    });
    req.on('timeout', () => { req.destroy(); yes(null); });
    req.on('error', () => yes(null));
  });
}

function busy(port) {
  return new Promise(yes => {
    const socket = connect({host:'127.0.0.1',port});
    socket.setTimeout(250);
    socket.on('connect', () => { socket.destroy(); yes(true); });
    socket.on('timeout', () => { socket.destroy(); yes(false); });
    socket.on('error', () => { socket.destroy(); yes(false); });
  });
}

async function launch(root, noBrowser) {
  const statePath = join(runtime, 'server.json');
  let ports = Array.from({length:20}, (_, i) => 8766 + i);
  try { const previous = Number((await jsonFile(statePath)).port); if (ports.includes(previous)) ports = [previous, ...ports.filter(p => p !== previous)]; } catch {}
  let port, reuse = false;
  for (const candidate of ports) {
    if (!await busy(candidate)) { port = candidate; break; }
    const info = await status(candidate) || await status(candidate, '/__folio/status');
    if (['bide-browser', 'folio-studio-browser'].includes(info?.application) && samePath(info.root, root) && info.stopSupported) { port = candidate; reuse = true; break; }
  }
  if (!port) throw new Error('All local ports 8766-8785 are busy. Close another local preview and try again.');
  if (!reuse) {
    const output = openSync(join(runtime, 'server.log'), 'w'), error = openSync(join(runtime, 'server-error.log'), 'w');
    let child;
    try { child = spawn(process.execPath, [join(projectRoot, 'scripts', 'serve.mjs')], {cwd:projectRoot, env:{...process.env, BIDE_ROOT:root, BIDE_PORT:String(port)}, detached:true, windowsHide:true, stdio:['ignore', output, error]}); }
    finally { closeSync(output); closeSync(error); }
    let failed;
    child.once('error', error => { failed = error; });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (failed || child.exitCode !== null) break;
      const info = await status(port);
      if (info?.application === 'bide-browser' && samePath(info.root, root) && info.stopSupported) { ready = true; break; }
      await delay(250);
    }
    if (!ready) { child.kill(); child.unref(); throw new Error('The local server did not start. See .runtime/server-error.log.'); }
    child.unref();
    await writeFile(statePath, JSON.stringify({port, root, pid:child.pid}, null, 2));
  }
  const url = `http://127.0.0.1:${port}`;
  console.log(`bide is running at ${url}`);
  console.log('The launcher can close. Run Stop bide.bat to stop local and shared servers from this folder.');
  if (!noBrowser && process.platform === 'win32') {
    const opener = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url], {windowsHide:true, detached:true, stdio:'ignore'});
    opener.on('error', () => console.log(`Open ${url} in your browser.`)); opener.unref();
  }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use your installed Node.js 22 or newer. Nothing was downloaded.');
  console.log(`Using installed Node.js ${process.version} (${process.execPath}).`);
  process.chdir(projectRoot);
  const [action, ...args] = process.argv.slice(2);
  if (!['install', 'launch', 'share', 'stop'].includes(action)) throw new Error('Use Install Dependencies.bat, launch bide.bat, share bide.bat or Stop bide.bat.');
  if(action==='stop'){const result=await stopRegisteredServers(projectRoot);console.log(result.stopped?`Stopped ${result.stopped} bide server(s) from this folder.`:'No running bide servers registered by this version in this folder.');if(result.stale)console.log('Removed stale server records.');if(result.failed)throw new Error('Some servers could not be stopped. Close their sharing windows and try again.');console.log('Other Node applications were not stopped. Servers started by older versions must be closed separately.');return;}
  if (action === 'install' && args.includes('--build-source')) { await mkdir(runtime, {recursive:true}); await buildSource(); }
  const root = await siteRoot();
  if (action === 'install') { console.log('Ready. No downloads or npm installation are needed for this built app.\nRun launch bide.bat or share bide.bat.'); return; }
  await mkdir(runtime, {recursive:true});
  if (action === 'share') {
    const port = args.find(arg => arg !== '--no-pause');
    if (port !== undefined && (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)) throw new Error('Choose a LAN port from 1024 to 65535.');
    await run(process.execPath, [join(projectRoot, 'scripts', 'serve.mjs'), '--lan', ...(port ? ['--port', port] : [])], {env:{...process.env, BIDE_ROOT:root}});
  } else await launch(root, args.includes('--no-browser'));
}

main().catch(error => { console.error(`\nbide: ${error.message}`); process.exitCode = 1; });
