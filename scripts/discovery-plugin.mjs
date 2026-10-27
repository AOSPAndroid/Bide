import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {renderMarketingPage, writeMarketingSite} from '../marketing/site.mjs';
import defaults from '../discovery.config.json' with {type:'json'};

const escaped = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const json = value => JSON.stringify(value).replaceAll('<','\\u003c');

export function discoveryOptions(mode, env = {}) {
  const supplied = env.VITE_SITE_ORIGIN || defaults.origin;
  const url = new URL(supplied);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_SITE_ORIGIN must be an HTTPS origin, without credentials, path, query or fragment.');
  }
  const ga = env.VITE_GA_MEASUREMENT_ID || defaults.gaMeasurementId || '';
  if (ga && !/^G-[A-Z0-9]+$/.test(ga)) throw new Error('The analytics measurement ID must be a GA4 G-… identifier.');
  return {
    origin:url.origin,
    mode:mode === 'saas' ? 'saas' : 'demo',
    priceLabel:env.VITE_PRICE_LABEL || '',
    googleVerification:env.VITE_GOOGLE_SITE_VERIFICATION || defaults.googleSiteVerification || '',
    bingVerification:env.VITE_BING_SITE_VERIFICATION || defaults.bingSiteVerification || '',
    gaMeasurementId:ga,
  };
}

export function editorHtml(html, options) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, '<title>Bide editor — PDF, images &amp; diagrams</title>')
    .replace('<head>', `<head><base href="/"><meta name="robots" content="noindex,follow"><meta name="description" content="Open the Bide document editor. Edit, merge and compress PDFs on your device."><link rel="canonical" href="${escaped(options.origin)}/app/">`)
    .replace('</head>', `<script id="bide-measurement-config" type="application/json">${json({measurementId:options.gaMeasurementId,page:'app'})}</script><script defer src="/measurement.js"></script></head>`);
}

export function discoveryPlugin(mode, env = {}) {
  const options = discoveryOptions(mode, env);
  let outDir, building=false;
  return {
    name:'bide-public-discovery',
    configResolved(config) {outDir = resolve(config.root, config.build.outDir);building=config.command==='build';},
    transformIndexHtml(html, context) {return ['/index.html','/app/'].includes(context.path)?editorHtml(html,options):html;},
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!['GET','HEAD'].includes(req.method || '')) return next();
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        try {
          if (pathname === '/app' || pathname === '/app/') {
            if (pathname === '/app') {res.writeHead(308,{Location:`/app/${new URL(req.url, 'http://localhost').search}`});res.end();return;}
            const original = await readFile(resolve('index.html'),'utf8');
            const html = await server.transformIndexHtml('/app/', original);
            res.setHeader('Content-Type','text/html; charset=utf-8');
            res.end(req.method === 'HEAD' ? '' : html);return;
          }
          if (pathname === '/marketing/site.css' || pathname === '/marketing/site.js') {
            res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
            res.setHeader('Cache-Control','no-store');
            res.end(req.method === 'HEAD' ? '' : await readFile(resolve('.'+pathname)));return;
          }
          if (pathname === '/measurement.js') {
            res.setHeader('Content-Type','text/javascript; charset=utf-8');
            res.end(req.method === 'HEAD' ? '' : await readFile(resolve('public/measurement.js')));return;
          }
          const html = renderMarketingPage(pathname, options);
          if (html) {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.method === 'HEAD' ? '' : html);return;}
          next();
        } catch (error) {next(error);}
      });
    },
    closeBundle:{order:'post',sequential:true,async handler() {
      if (!building) return;
      const html = await readFile(join(outDir,'index.html'),'utf8');
      if (!html.includes('<div id="root"></div>')) throw new Error('Refusing to replace the editor with a non-editor build.');
      await mkdir(join(outDir,'app'),{recursive:true});
      await writeFile(join(outDir,'app/index.html'),html);
      await writeMarketingSite({...options,outDir});
      await cp('public/measurement.js',join(outDir,'measurement.js'));
      const key=defaults.indexNowKey;
      if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('Invalid public IndexNow ownership key.');
      await writeFile(join(outDir,`${key}.txt`),key);
    }},
  };
}
