// Local IPC only: never exposes shutdown over the HTTP/LAN server.
import {createServer, createConnection} from 'node:net';
import {randomUUID, randomBytes} from 'node:crypto';
import {mkdir, writeFile, readFile, readdir, realpath, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const socketFor=id=>process.platform==='win32'?String.raw`\\.\pipe\bide-${id}`:join(tmpdir(),`bide-${id}.sock`);
const validId=id=>/^[a-f0-9-]{36}$/.test(id);
export async function registerServerControl(server,projectRoot){
  const root=await realpath(projectRoot),directory=join(root,'.runtime','servers'),id=randomUUID(),token=randomBytes(32).toString('hex'),socketPath=socketFor(id),record=join(directory,id+'.json');
  await mkdir(directory,{recursive:true});
  let stopping;
  const stopHttp=()=>stopping??=(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(record,{force:true});})();
  const sockets=new Set();
  const control=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(2000,()=>socket.destroy());let data='',handled=false;
    socket.on('data',chunk=>{
      if(handled)return;data+=chunk;if(data.length>2048){socket.destroy();return;}if(!data.includes('\n'))return;handled=true;
      let request;try{request=JSON.parse(data);}catch{socket.end('{"error":"Invalid request"}\n');return;}
      if(request.token!==token||request.root!==root||request.action!=='stop'){socket.end('{"error":"Unauthorized"}\n');return;}
      stopHttp().then(()=>{socket.end(JSON.stringify({application:'bide',stopped:true,root})+'\n');control.close();for(const other of sockets)if(other!==socket)other.destroy();}).catch(()=>socket.end('{"error":"Could not stop server"}\n'));
    });
  });
  await new Promise((yes,no)=>{control.once('error',no);control.listen(socketPath,yes);});
  try{await writeFile(record,JSON.stringify({id,token,root}),{mode:0o600,flag:'wx'});}catch(error){control.close();throw error;}
  return async()=>{await stopHttp();for(const socket of sockets)socket.destroy();await new Promise(resolve=>control.close(resolve));};
}
function requestStop(record){return new Promise((resolve,reject)=>{
  const socket=createConnection(socketFor(record.id));let body='';socket.setTimeout(2500,()=>socket.destroy(Object.assign(new Error('Stop request timed out'),{code:'ETIMEDOUT'})));socket.on('error',reject);
  socket.on('connect',()=>socket.write(JSON.stringify({action:'stop',token:record.token,root:record.root})+'\n'));
  socket.on('data',chunk=>{body+=chunk;if(body.length>2048)socket.destroy(new Error('Invalid stop response'));});
  socket.on('end',()=>{try{const response=JSON.parse(body);if(response.application!=='bide'||response.stopped!==true||response.root!==record.root)throw new Error('Server did not confirm shutdown');resolve();}catch(error){reject(error);}finally{socket.destroy();}});
});}
export async function stopRegisteredServers(projectRoot){
  const root=await realpath(projectRoot),directory=join(root,'.runtime','servers');let names;try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')return {stopped:0,stale:0,failed:0};throw error;}
  const result={stopped:0,stale:0,failed:0};
  for(const name of names){if(!name.endsWith('.json')||!validId(name.slice(0,-5)))continue;const path=join(directory,name);
    try{const record=JSON.parse(await readFile(path,'utf8'));if(record.id!==name.slice(0,-5)||record.root!==root||!/^\w{64}$/.test(record.token))throw new Error('Invalid server record');await requestStop(record);result.stopped++;}
    catch(error){if(['ENOENT','ECONNREFUSED'].includes(error.code)){await rm(path,{force:true});result.stale++;}else result.failed++;}
  }
  return result;
}
