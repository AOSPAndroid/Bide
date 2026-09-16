import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['src/browser/pdf-core.ts'],bundle:true,packages:'external',loader:{'.ttf':'dataurl'},format:'esm',platform:'node',outfile:'tmp/browser-core.mjs'});
await build({entryPoints:['src/browser/psd.ts'],bundle:true,packages:'external',format:'esm',platform:'node',outfile:'tmp/psd-core.mjs'});
const result=spawnSync(process.execPath,['--test','tests/browser-engine.test.mjs','tests/psd.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status||0;
