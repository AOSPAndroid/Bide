// Fail a source build clearly if its offline engines have not been prepared.
import {access} from 'node:fs/promises';
const required = ['office/runtime/soffice.js','office/runtime/soffice.wasm','office/runtime/soffice.data','office/runtime/soffice.data.js.metadata','diagrams/runtime/index.html','diagrams/runtime/js/app.min.js','diagrams/runtime/bide-build.json'];
for (const path of required) {
  try {await access(new URL('../public/' + path, import.meta.url));}
  catch {throw new Error(`Missing bundled asset: ${path}. For a source build, run npm run assets:office and npm run assets:diagrams. Use the prebuilt bide-browser.zip to launch with no downloads.`);}
}
