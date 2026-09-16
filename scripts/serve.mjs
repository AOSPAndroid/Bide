// Development/demo static host. Work PCs only need the website URL.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.env.BIDE_ROOT||'dist'),port=Number(process.env.BIDE_PORT||8766);
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json','.png':'image/png'};
createServer(async(req,res)=>{
 try{
  if(req.url==='/__bide/status'){
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({application:'bide-browser',root}));return;
  }
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(path!==root&&!path.startsWith(root+sep))throw new Error('Invalid path');
  const file=(await stat(path)).isDirectory()?resolve(path,'index.html'):path;
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-cache'});
  res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`bide browser edition: http://127.0.0.1:${port} (static files only; no conversion API)`));
