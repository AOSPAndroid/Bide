// The billing/authentication regression suite does not need large editor assets.
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
for (const [entry, name] of [['cloud/worker.ts','cloud'],['cloud/store.ts','cloud-store'],['cloud/measurement.ts','cloud-measurement'],['cloud/billing.ts','cloud-billing'],['src/licence.ts','licence']]) {
  await build({entryPoints:[entry],bundle:true,packages:'external',format:'esm',platform:'neutral',outfile:`tmp/${name}.mjs`});
}
// Running the files directly reports the actual node:test cases in this runtime;
// its outer --test subprocess mode can otherwise report only file-level passes.
for (const file of ['tests/cloud.test.mjs','tests/cloud-measurement.test.mjs']) {
  const result=spawnSync(process.execPath,[file],{stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status!==0) {process.exitCode=result.status??1;break;}
}
