// The billing/authentication regression suite does not need large editor assets.
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
for (const [entry, name] of [['cloud/worker.ts','cloud'],['cloud/store.ts','cloud-store'],['src/licence.ts','licence']]) {
  await build({entryPoints:[entry],bundle:true,packages:'external',format:'esm',platform:'neutral',outfile:`tmp/${name}.mjs`});
}
const result=spawnSync(process.execPath,['--test','tests/cloud.test.mjs'],{stdio:'inherit'});
if (result.error) throw result.error;
process.exitCode=result.status??1;
