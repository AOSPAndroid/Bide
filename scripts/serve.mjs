// Static application host. Documents and conversions stay in each visitor's browser.
import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {createReadStream} from 'node:fs';
import {brotliCompress, gzip, constants as zlib} from 'node:zlib';
import {promisify} from 'node:util';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, extname, sep, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerServerControl} from './server-control.mjs';
import {networkInterfaces} from 'node:os';

const types = {'.html':'text/html; charset=utf-8', '.js':'application/javascript', '.mjs':'application/javascript', '.onnx':'application/octet-stream', '.css':'text/css', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.ico':'image/x-icon', '.ttf':'font/ttf', '.woff':'font/woff', '.woff2':'font/woff2', '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.properties':'text/plain; charset=utf-8'};
const within = (root, path) => path === root || path.startsWith(root + sep);
// Colleagues on the office network fetch the whole app (scripts, the PDF and
// OCR engines' WebAssembly, fonts) on each visit. Text and WebAssembly are sent
// compressed: the ONNX runtime goes from 24 MB to under 6, MuPDF from 10 MB to
// under 5. AI models and pre-compressed data barely shrink and are sent as they are.
const compressible = new Set(['.html','.js','.mjs','.css','.json','.webmanifest','.svg','.wasm','.ttf','.txt','.xml','.yml','.aff','.dic','.properties','.map']);
const encoders = {br:(bytes) => promisify(brotliCompress)(bytes, {params:{[zlib.BROTLI_PARAM_QUALITY]:5, [zlib.BROTLI_PARAM_SIZE_HINT]:bytes.length}}), gzip:(bytes) => promisify(gzip)(bytes, {level:6})};
// Compressed copies, by file, version and encoding, made once and shared by every visitor.
const compressed = new Map();
let compressedBytes = 0;
function compressedCopy(file, info, encoding) {
  const key = `${file}|${info.size}|${info.mtimeMs}|${encoding}`;
  let entry = compressed.get(key);
  if (!entry) {
    entry = readFile(file).then(bytes => encoders[encoding](bytes)).then(bytes => { compressedBytes += bytes.length; return bytes; });
    entry.catch(() => compressed.delete(key));
    // A shared copy of the app is about 50 MB compressed; start afresh well past that.
    if (compressedBytes > 512e6) { compressed.clear(); compressedBytes = 0; }
    compressed.set(key, entry);
  }
  return entry;
}
// Whether the browser accepts an encoding (Accept-Encoding: "gzip, deflate, br;q=0.9").
const accepted = (header, encoding) => (header ?? '').split(',').some(part => {
  const [name, ...params] = part.trim().toLowerCase().split(';'), q = params.map(p => p.trim()).find(p => p.startsWith('q='));
  return name === encoding && (q === undefined || Number(q.slice(2)) > 0);
});
// A version of each file for the browser's cache: a reload or a second visit
// asks "still this one?" and gets "304 Not Modified" instead of the file again
// (without it, no-cache meant downloading the AI models on every visit).
const versionOf = (info, encoding) => `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}${encoding ? '-' + encoding : ''}"`;
function unchanged(req, tag, info) {
  const match = req.headers['if-none-match'];
  if (match) return match.split(',').some(value => value.trim() === tag || value.trim() === '*');
  const since = Date.parse(req.headers['if-modified-since'] ?? '');
  return Number.isFinite(since) && Math.floor(info.mtimeMs / 1000) * 1000 <= since;
}
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
      const type = types[extname(file)] || 'application/octet-stream', squeeze = compressible.has(extname(file)) && info.size >= 1024;
      if (squeeze) res.setHeader('Vary', 'Accept-Encoding');
      const encoding = squeeze ? ['br', 'gzip'].find(name => accepted(req.headers['accept-encoding'], name)) : undefined, tag = versionOf(info, encoding);
      res.setHeader('ETag', tag); res.setHeader('Last-Modified', new Date(info.mtimeMs).toUTCString());
      if (unchanged(req, tag, info)) { res.writeHead(304); res.end(); return; }
      if (encoding) {
        const bytes = await compressedCopy(file, info, encoding);
        res.writeHead(200, {'Content-Type':type, 'Content-Encoding':encoding, 'Content-Length':bytes.length});
        res.end(req.method === 'HEAD' ? undefined : bytes);
        return;
      }
      res.writeHead(200, {'Content-Type':type, 'Content-Length':info.size});
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
