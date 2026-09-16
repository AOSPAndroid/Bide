# Browser edition: local launch or hosting

## Local Windows launch

Extract the entire ZIP to a writable local folder. Run **Install Dependencies.bat** once, then **launch bide.bat**. Setup downloads a private, checksum-verified Node.js runtime into `.runtime`; it does not require admin rights or modify the system PATH. In a source checkout it also downloads and verifies the Office runtime, installs npm dependencies, and builds the editor; the prebuilt ZIP needs only the runtime download. Python and installed Office software are never needed. The launcher opens a localhost address, so no external website host is necessary for this mode. Local launch and conversion work offline after setup. Keep the `scripts` and `site` folders next to the BAT files.

## Hosted website

The work PC only needs current Edge or Chrome and access to the website. No Python, Node.js, Office, LibreOffice, extension, administrator rights, conversion API, or account is required on that PC.

The `dist` directory is a complete static website. Host it on an HTTPS web server (a company intranet is suitable). The server only delivers application files; documents are processed in browser memory, with no uploads. All engine files and fonts are bundled. There are no runtime CDN dependencies.

## Required response headers

Serve all files, including the `office` subdirectory, with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

The first two headers enable browser threads for the Office engine. Serve `.wasm` as `application/wasm`, `.js` as JavaScript, and `.html` as HTML. Open the site as a top-level tab. Double-clicking `index.html` will not work: the `file:` protocol cannot run the Office worker correctly. A company browser policy disabling WebAssembly or shared memory will prevent Office conversion.

The `_headers` file provides these headers on compatible static hosts. Otherwise configure equivalent response headers. Enable gzip/Brotli and static-file caching. The Office runtime is approximately 262 MB unpacked, about 53 MB with the vendor's Brotli compression. It loads only when an Office file is opened. PDF engine and fonts load separately. Offline startup is not implemented.

## Development preview

```powershell
npm ci --ignore-scripts
npm run assets:office
npm run build
npm run serve
```

Open `http://127.0.0.1:8766`. Node is only a development file server; it is not involved in conversions and is not required on work PCs using the hosted site. The preview server listens on localhost only.

## Package contents

`bide-browser.zip` contains `site`, source code, dependency lockfile and hosting instructions. Publish the contents of `site` at the chosen website path. Source and dependency notices accompany the package. The local preview address is not reachable from another PC; a hosted URL still needs to be assigned.

The earlier Python prototype remains in the source project for reference. The new BAT launchers use the static server and browser engines. The ZIP includes these launchers and their helper scripts at its top level.
