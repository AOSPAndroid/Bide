// Static application host. Documents and conversions stay in each visitor's browser.
import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {createReadStream} from 'node:fs';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, extname, sep, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerServerControl} from './server-control.mjs';
import {networkInterfaces} from 'node:os';

const types = {'.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.ico':'image/x-icon', '.ttf':'font/ttf', '.woff':'font/woff', '.woff2':'font/woff2', '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.properties':'text/plain; charset=utf-8'};
const within = (root, path) => path === root || path.startsWith(root + sep);
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

export async function createBideServer({root, tls}) {
  root = await realpath(root);
  const handler = async (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {Allow:'GET, HEAD'}); res.end('Method not allowed'); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/__bide/status') {
        res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
        // Local launchers need the root to identify their server; LAN visitors do not.
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({application:'bide-browser', ...(loopback(req.socket.remoteAddress) ? {root,stopSupported:server.bideStopSupported===true} : {})}));
        return;
      }
      const parts = pathname.split(/[\\/]/);
      if (parts.some(part => part.startsWith('.')) || pathname.includes('\0')) throw new Error('Invalid path');
      let file = resolve(root, '.' + pathname);
      if (!within(root, file)) throw new Error('Invalid path');
      file = await realpath(file);
      if (!within(root, file)) throw new Error('Invalid path');
      if ((await stat(file)).isDirectory()) file = await realpath(resolve(file, 'index.html'));
      if (!within(root, file)) throw new Error('Invalid path');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Invalid path');
      if(/^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(pathname))res.setHeader('Cache-Control','public, max-age=31536000, immutable');
      res.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream', 'Content-Length':info.size});
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end(req.method === 'HEAD' ? undefined : 'Not found');
    }
  };
  const server=tls ? createHttpsServer(tls, handler) : createHttpServer(handler);
  return server;
}

export async function readLanSettings(projectRoot, root, portOverride) {
  let config = {};
  const configFile = resolve(projectRoot, '.runtime/lan.json');
  try { config = JSON.parse((await readFile(configFile, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read .runtime/lan.json: ' + error.message); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('LAN settings must be a JSON object.');
  const port = Number(portOverride ?? config.port ?? 8786);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a LAN port from 1024 to 65535.');
  const host = config.bind ?? '0.0.0.0';
  if (typeof host !== 'string' || !host) throw new Error('bind must be an IP address or hostname.');
  const publicHost = config.publicHost;
  if (publicHost !== undefined && (typeof publicHost !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(publicHost))) throw new Error('publicHost must be a hostname or IPv4 address, without a protocol or port.');
  let tls;
  if (config.tls !== undefined) {
    if (!config.tls || !config.tls.cert || !config.tls.key) throw new Error('HTTPS requires both tls.cert and tls.key paths.');
    const siteRoot = await realpath(root);
    const files = await Promise.all(['cert','key'].map(async name => {
      const value = config.tls[name];
      if (typeof value !== 'string') throw new Error('TLS paths must be strings.');
      const path = await realpath(isAbsolute(value) ? value : resolve(projectRoot, value));
      if (within(siteRoot, path)) throw new Error('Keep HTTPS certificate and key files outside the served site folder.');
      return readFile(path);
    }));
    tls = {cert:files[0], key:files[1], minVersion:'TLSv1.2'};
  }
  return {port, host, publicHost, tls};
}

async function main() {
  const lan = process.argv.includes('--lan');
  const portIndex = process.argv.indexOf('--port');
  if (portIndex >= 0 && !process.argv[portIndex + 1]) throw new Error('--port needs a number.');
  let root = process.env.BIDE_ROOT;
  if (!root) { try { await stat('dist/index.html'); root = 'dist'; } catch { root = 'site'; } }
  root = resolve(root);
  const settings = lan ? await readLanSettings(process.cwd(), root, portIndex >= 0 ? process.argv[portIndex + 1] : undefined)
    : {host:'127.0.0.1', port:Number(process.env.BIDE_PORT || 8766)};
  const server = await createBideServer({root, tls:settings.tls});
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(settings.port, settings.host, ready); });
  let stop;try{stop=await registerServerControl(server,process.cwd());server.bideStopSupported=true;}catch(error){server.closeAllConnections();server.close();throw error;}
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop().catch(error=>{console.error(error.message);process.exitCode=1;});});
  const scheme = settings.tls ? 'https' : 'http';
  if (lan) {
    console.log('\nbide is available on your internal network. Keep this window open; Ctrl+C stops sharing.');
    if (settings.publicHost) console.log(`  ${scheme}://${settings.publicHost}:${settings.port}`);
    else if (settings.host !== '0.0.0.0') console.log(`  ${scheme}://${settings.host}:${settings.port}`);
    else for (const [name, addresses] of Object.entries(networkInterfaces())) {
      for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) console.log(`  ${scheme}://${address.address}:${settings.port} (${name})`);
    }
    console.log(`\nUse the address on the same network as your colleagues. Allow inbound TCP ${settings.port} on the trusted work network if Windows Firewall blocks access.`);
    console.log('Each visitor edits their own files in their browser. This does not share your workspace.');
    console.log(settings.tls ? 'Office conversion requires a certificate trusted by visitors and matching the address they open.' : 'HTTP supports editing. Use trusted HTTPS for Office conversion and reliable downloads; see HOSTING.md.');
  } else console.log(`bide browser edition: http://127.0.0.1:${settings.port} (static files only; no conversion API)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.code === 'EADDRINUSE' ? 'bide: This port is already in use. Stop the existing sharing window or choose another port: share bide.bat 8787' : 'bide: ' + error.message);
  process.exitCode = 1;
});
