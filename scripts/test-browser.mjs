import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['src/browser/pdf-core.ts'],bundle:true,packages:'external',loader:{'.ttf':'dataurl'},format:'esm',platform:'node',outfile:'tmp/browser-core.mjs'});
await build({entryPoints:['src/browser/psd.ts'],bundle:true,packages:'external',format:'esm',platform:'node',outfile:'tmp/psd-core.mjs'});
await build({entryPoints:['src/browser/crypto.ts'],bundle:true,packages:'external',format:'esm',platform:'node',outfile:'tmp/browser-crypto.mjs'});
for (const name of ['editor-tools','diagram-data','brushes','selection-mask','command-search','retouch-pixels','design-layout']) await build({entryPoints:[`src/${name}.ts`],bundle:true,packages:'external',format:'esm',platform:'node',outfile:`tmp/${name}.mjs`});
const result=spawnSync(process.execPath,['--test','tests/browser-engine.test.mjs','tests/psd.test.mjs','tests/lan.test.mjs','tests/windows-launcher.test.mjs','tests/editor-tools.test.mjs','tests/command-palette.test.mjs','tests/retouch.test.mjs','tests/design-layout.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status||0;
