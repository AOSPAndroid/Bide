import {readFile} from 'node:fs/promises';
import config from '../discovery.config.json' with {type:'json'};

// Run only AFTER the matching public build has been deployed. No account login
// or private credential is involved; the key is deliberately served publicly.
const origin=new URL(process.env.VITE_SITE_ORIGIN||config.origin).origin;
const sitemap=await readFile(new URL('../out/sitemap.xml',import.meta.url),'utf8');
const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
if (!urls.length || urls.some(url=>new URL(url).origin!==origin)) throw new Error('Sitemap URLs must match the deployed origin.');
const keyLocation=`${origin}/${config.indexNowKey}.txt`;
const verification=await fetch(keyLocation,{signal:AbortSignal.timeout(20000)});
if(!verification.ok||(await verification.text()).trim()!==config.indexNowKey) throw new Error('The public IndexNow key is not live. Deploy first.');
const response=await fetch('https://api.indexnow.org/indexnow',{
  method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},
  body:JSON.stringify({host:new URL(origin).hostname,key:config.indexNowKey,keyLocation,urlList:urls}),
  signal:AbortSignal.timeout(20000),
});
console.log(JSON.stringify({status:response.status,submittedUrls:urls.length,body:(await response.text()).slice(0,1500)}));
if(!response.ok) process.exitCode=1;
