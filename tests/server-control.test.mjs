import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {registerServerControl,stopRegisteredServers} from '../scripts/server-control.mjs';
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'bide-stop-test-'));assert.ok(resolve(root).startsWith(resolve(tmpdir(),'bide-stop-test-')));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function serve(t,root){const server=createServer((req,res)=>res.end('fixture'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const stop=await registerServerControl(server,root);t.after(stop);return server;}
test('stop shuts down only servers from the selected installation and is repeatable',async t=>{const a=await fixture(t),b=await fixture(t);const local=await serve(t,a),shared=await serve(t,a),other=await serve(t,b);assert.deepEqual(await stopRegisteredServers(a),{stopped:2,stale:0,failed:0});assert.equal(local.listening,false);assert.equal(shared.listening,false);assert.equal(other.listening,true);assert.deepEqual(await stopRegisteredServers(a),{stopped:0,stale:0,failed:0});});
test('unauthorized local requests cannot stop a server',async t=>{const root=await fixture(t),server=await serve(t,root),dir=join(root,'.runtime','servers');const record=JSON.parse(await readFile(join(dir,(await readdir(dir))[0]),'utf8'));const path=process.platform==='win32'?String.raw`\\.\pipe\bide-${record.id}`:join(tmpdir(),`bide-${record.id}.sock`);const response=await new Promise((yes,no)=>{const socket=createConnection(path);let data='';socket.on('error',no);socket.on('connect',()=>socket.write(JSON.stringify({action:'stop',root:record.root,token:'wrong'})+'\n'));socket.on('data',part=>data+=part);socket.on('end',()=>yes(JSON.parse(data)));});assert.equal(response.error,'Unauthorized');assert.equal(server.listening,true);});
test('stale control records are removed without signaling a PID',async t=>{const root=await fixture(t),dir=join(root,'.runtime','servers'),id=randomUUID();await mkdir(dir,{recursive:true});await writeFile(join(dir,id+'.json'),JSON.stringify({id,token:'a'.repeat(64),root:await realpath(root),pid:process.pid}));assert.deepEqual(await stopRegisteredServers(root),{stopped:0,stale:1,failed:0});assert.deepEqual(await readdir(dir),[]);});
