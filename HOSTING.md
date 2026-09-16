# Browser edition: local launch or hosting

## Local Windows launch

Extract the entire prebuilt **bide-browser.zip** to a writable local folder and run **launch bide.bat**. The launcher uses your existing **Node.js 22 or newer**; it detects `C:\devhome\tools\node24\current\node.exe` first, then `node.exe` on PATH. **Install Dependencies.bat is optional for the prebuilt ZIP** and checks the installation without downloading anything. Python and installed Office software are never needed. There are no administrator requirements or system PATH changes. The launcher opens a localhost address, so no external website host is necessary. Local launch and conversion work offline. Keep the `scripts` and `site` folders next to the BAT files.

For an existing Node installation in another folder, launch from Command Prompt with:

```bat
set "BIDE_NODE=D:\Tools\Node\node.exe"
"launch bide.bat"
```

The same variable works with **share bide.bat** and **Install Dependencies.bat**. An invalid override produces an error and never triggers a download. A missing or old Node version also stops with an explanatory message.

The BAT launchers use Node directly. They do not invoke PowerShell, change execution policy, require signed `.ps1` files or install runtimes. Normal setup and launch never attempt dependency downloads. An incomplete app or a source-only folder produces a direct link to the ready-to-run ZIP.

The release's `source` folder and GitHub's source ZIP (`Bide-main`) are for developers. Only an explicit `"Install Dependencies.bat" --build-source` uses your installed Node and npm to download missing Office assets, install locked npm dependencies and build the app. For a work PC with a `407 Proxy Authentication Required` or `fetch failed` error, extract the **prebuilt bide-browser.zip into a new folder** and use its root BAT files beside `site`. All app dependencies and conversion engines are included, so these launchers do not contact download servers. The earlier private `.runtime/node` installation is no longer used by new launches.

## Share from a Windows PC using IP:port

1. Extract the prebuilt ZIP on the host and ensure Node.js 22 or newer is installed, as above.
2. Double-click **share bide.bat**. The server binds to all IPv4 interfaces on port **8786** and lists their addresses with adapter names.
3. Give colleagues the address for the adapter connected to the same work network, for example `http://192.168.1.20:8786`. Avoid virtual-machine adapter addresses. Their PCs need only Edge or Chrome.
4. Keep the sharing window open and the host awake. Ctrl+C or closing the sharing window stops the shared server. The local background server started by `launch bide.bat` is separate.

Use `"share bide.bat" 9090` in Command Prompt to choose another port. For persistent settings, copy `lan-settings.example.json` to `.runtime/lan.json` and edit its `port` or `bind`. To listen on just the work adapter, set `bind` to that adapter's IPv4 address. A command-line port overrides the settings file. The server reports an occupied port rather than silently changing the shared URL.

Windows Firewall or your company network may block incoming connections. If the Windows prompt appears, allow the server only on your trusted work network. For managed PCs, ask IT to allow inbound TCP on your chosen port, scoped to the work subnet and Domain/Private network profile. bide does not change firewall rules. Colleagues must be on a reachable LAN or company VPN; Wi-Fi client isolation can prevent access. No router port forwarding is needed. The server has no user accounts and is intended for a trusted internal network.

**HTTP IP addresses support the PDF and image tools. Office conversion on another PC needs trusted HTTPS.** Browsers restrict shared memory to secure, cross-origin-isolated contexts. `http://localhost` is treated specially; `http://192.168.x.x` is not. See [MDN's SharedArrayBuffer requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer). The app displays this limitation and explains it if an Office file is opened over LAN HTTP. The hosting PC can use `launch bide.bat` for local Office conversion.

**Use HTTPS for routine team use.** Browsers can also warn about or block downloads initiated by an HTTP page, even when the app generates the file locally. During verification, PDF import and editing worked on the HTTP LAN address but the in-app browser left the PDF download unconfirmed. Configure trusted HTTPS instead of weakening browser download protections. See [Chrome's download guidance](https://support.google.com/chrome/answer/6261569).

Each colleague gets their own workspace and processes documents on their own computer. Documents are not uploaded to the hosting PC. Autosaves belong to the exact browser origin (protocol, host and port), so save a `.bide` project before changing the address or moving to HTTPS. Share a saved project separately if you want another person to edit the same document.

### Enable HTTPS for Office conversion on the LAN

The included Node server supports TLS directly. No additional server software or installed Office is required. Obtain a server certificate and matching **unencrypted PEM private key** from work IT. Clients must trust the issuing certificate authority. The certificate must cover the hostname or IP address colleagues will use; an IP URL requires that IP in the certificate's subject alternative names. A company DNS hostname is usually easier to keep stable.

Place the certificate chain and private key under `.runtime/tls/` (never under `site`, `dist` or `public`). Create `.runtime/lan.json`:

```json
{
  "port": 8786,
  "bind": "0.0.0.0",
  "publicHost": "bide.your-company.example",
  "tls": {
    "cert": ".runtime/tls/fullchain.pem",
    "key": ".runtime/tls/private-key.pem"
  }
}
```

Replace `publicHost` with your IT-configured hostname or certified IPv4 address. It controls the displayed URL; it does not create a DNS record. Relative certificate paths are resolved from the folder containing the BAT files. Restart **share bide.bat**, then use `https://bide.your-company.example:8786` (or your certified IP). The server adds the required isolation headers automatically. The private runtime folder is excluded from Git and distribution packages. Keep private keys local to the host; never commit them or send them with a project.

The browser must accept the certificate normally. If it reports a certificate error, have IT correct the trust, validity or address mismatch. The test certificate under `tests/fixtures/tls` is only for automated tests and must not be used for hosting.

### Connection checks

- If the hosting PC cannot open its displayed address, check the sharing window for a startup error or occupied port.
- If the host can open the address but another PC cannot, check the firewall, subnet/VPN routing and Wi-Fi client isolation with IT.
- If the app opens but Office conversion is unavailable, check HTTPS certificate trust, the headers below and browser policy.
- If an export is ready but no file appears, inspect the browser's Downloads panel. HTTP download restrictions are resolved by serving the app over trusted HTTPS; company download policies may also apply.
- If the PC's IP changes, use the newly displayed address or ask IT for a DHCP reservation or DNS name. Keep the host awake while people use it.

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

`bide-browser.zip` contains `site`, source code, dependency lockfile and hosting instructions. Publish the contents of `site` at the chosen website path, or run **share bide.bat** to serve them from this PC. Source and dependency notices accompany the package. **launch bide.bat** remains local-only; **share bide.bat** explicitly enables network access.

The earlier Python prototype remains in the source project for reference. The new BAT launchers use the static server and browser engines. The ZIP includes these launchers and their helper scripts at its top level.

## Bundled diagram workspace

The prebuilt package includes draw.io static assets under `site/diagrams/runtime`, including shapes, stencils and the math renderer. Keep the full directory. No Java, draw.io desktop, online diagrams.net service, npm installation or runtime download is required. The embedded editor is configured for local assets; its content policy prevents external services and image/font requests. It uses the same host and port as bide. Every visitor has an independent diagram draft in their browser. For local exports and file downloads, the same HTTPS guidance above applies.

## Public Sites demo

The demo at https://bide-demo.dalilooksk.chatgpt.site serves `out/`, built with Vite mode `demo`. `npm run build` produces both the full local `dist/` and the hosted `out/`; `npm run build:demo` rebuilds only the demo. The `.openai/hosting.json` manifest identifies this Site.

The demo bundles PDF/image tools and draw.io. It excludes the Office runtime: soffice.wasm and soffice.data exceed Cloudflare Static Assets' 25 MiB per-file limit. Office imports show an immediate local-edition explanation rather than attempting a missing download. The regular local build keeps Office support. Static isolation headers are in `_headers`. No documents, credentials, autosaves or local runtime state are deployed. Public access lets anyone visit the app, not other visitors' documents.

On narrow phones the demo starts on the PDF tools home. Tap Workspaces to switch sections; landscape or desktop gives more room for detailed editing. Supported browsers can also use the optional WebMCP get_workspace/open_workspace navigation tools.
