// Verify the actual deployable output, including the editor moved below /app/.
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {loadEnv} from 'vite';
import {discoveryOptions} from './discovery-plugin.mjs';
import config from '../discovery.config.json' with {type:'json'};

const folder=resolve(process.argv[2]||'out');
const mode=folder.endsWith('dist-saas')?'saas':'demo';
const options=discoveryOptions(mode,{...loadEnv(mode,process.cwd(),'VITE_'),...process.env});
const paths=['/','/pdf-editor/','/merge-pdf/','/compress-pdf/','/pricing/','/privacy/','/help/'];
const titles=new Set();
for (const path of paths) {
  const html=await readFile(join(folder,path,'index.html'),'utf8');
  assert.equal((html.match(/<h1\b/g)||[]).length,1,`${path}: one visible top-level heading`);
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert(title && !titles.has(title),`${path}: unique descriptive title`);titles.add(title);
  assert(/<meta\b[^>]*name="description"[^>]*content="[^"\n]{30,}"/.test(html),`${path}: useful description`);
  assert(html.includes(`href="${options.origin}${path}"`),`${path}: absolute canonical URL`);
  assert(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html),`${path}: public page must be indexable`);
  assert(html.includes('/app/?tool='),`${path}: working editor entry`);
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const link=match[1];
    if (link.startsWith('//')) continue;
    await access(join(folder,link,link.endsWith('/')?'index.html':''));
  }
}
const editor=await readFile(join(folder,'app/index.html'),'utf8');
assert(editor.includes('<div id="root"></div>'),'editor app mount survives');
assert(editor.includes('<base href="/">'),'editor relative assets resolve from the origin');
assert(/name="robots" content="noindex,follow"/.test(editor),'editor is excluded from search');
for (const match of editor.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)) await access(join(folder,match[1]));
assert(editor.includes('src="/measurement.js"'),'editor has the shared measurement adapter');
const sitemap=await readFile(join(folder,'sitemap.xml'),'utf8');
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.deepEqual(new Set(urls),new Set(paths.map(p=>options.origin+p)),'sitemap includes exactly the canonical public pages');
const robots=await readFile(join(folder,'robots.txt'),'utf8');
assert(robots.includes(`Sitemap: ${options.origin}/sitemap.xml`),'robots advertises the sitemap');
assert(!/^Disallow:\s*\/\s*$/m.test(robots),'public crawling must not be blocked');
assert.equal(await readFile(join(folder,`${config.indexNowKey}.txt`),'utf8'),config.indexNowKey,'IndexNow ownership key matches');
await access(join(folder,'404.html'));
console.log(`Discovery checks passed: ${paths.length} public pages, editor, linked assets, metadata, sitemap, crawler access and IndexNow key.`);
