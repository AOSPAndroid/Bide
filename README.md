# bide — Browser Edition

A Photopea-inspired visual editor with an integrated PDF toolkit. Editing and conversion run locally inside the browser. It needs no installed Office, LibreOffice, Python, extensions or conversion service.

**This is not full Photopea or iLovePDF feature parity.** See [FEATURES.md](FEATURES.md) for the checked feature matrix and remaining work across both areas.

## Start on Windows

1. Get the [prebuilt bide-browser.zip](https://github.com/AOSPAndroid/Bide/releases/download/v0.3.3/bide-browser.zip) and extract the entire ZIP into a **new writable folder**. The app and conversion engines are already included. You should see a `site` folder beside the BAT files.
2. Use your existing **Node.js 22 or newer**. bide detects `C:\devhome\tools\node24\current\node.exe` or `node.exe` on PATH. With this ZIP, **Install Dependencies.bat is optional**: it only checks your installation and bundled files, with no downloads.
3. Double-click **launch bide.bat**. It starts the local server in the background and opens the editor in your default browser (use Edge or Chrome).

Keep the BAT files with their `scripts` and `site` folders. No Node runtime is downloaded or installed by bide. For a different Node location, set `BIDE_NODE` to the full path to `node.exe`; this overrides automatic detection. No administrator rights or system PATH changes are needed. The launcher reuses the running server, starting at port 8766 and choosing another local port if occupied. Logs and server state are in `.runtime`. The server runs until Windows shuts down; closing the browser does not stop it. No startup task or Windows service is installed.

The BAT files run directly through Node: **PowerShell and execution-policy changes are not needed.** Normal setup and launch never download dependencies. If the built app is missing, the launcher prints the ready-to-run ZIP link and stops.

GitHub's **Code → Download ZIP** creates a source folder such as `Bide-main`. A source build must be explicitly requested with `"Install Dependencies.bat" --build-source`; it needs npm packages and the browser Office runtime, which may require network access. Use the prebuilt release ZIP on a PC where proxy authentication blocks dependency downloads. Its root launchers run offline using your existing Node; the `source` folder is only for rebuilding.

The local edition works without internet after setup. A hosted edition needs only a browser and no Node runtime on the work PC; see [HOSTING.md](HOSTING.md). This build has not been published to an external host. The previous `Setup.cmd` and `start bide.cmd` now forward to these BAT files.

## Share internally using IP:port

After setup, run **share bide.bat** on the hosting PC. It displays addresses such as `http://192.168.1.20:8786`. Send colleagues the address on your shared work network; their PCs only need Edge or Chrome. Keep the sharing window open and the host awake. Close the window or press Ctrl+C to stop sharing. For another port, run `"share bide.bat" 9090` from Command Prompt.

PDF and image editing runs over HTTP, but browsers may block downloads from HTTP addresses. **Use trusted HTTPS for team use: Office-to-PDF conversion on other PCs requires it**, because the browser Office engine uses shared memory. The sharing server supports HTTPS with an IT-issued certificate; see [HOSTING.md](HOSTING.md) for configuration, firewall guidance and troubleshooting. `launch bide.bat` continues to support Office conversion locally through localhost.

Every visitor has an independent workspace stored in their own browser. Sharing the app does not share documents or provide live collaboration. This is an internal static server without user accounts; use it on your trusted LAN/VPN, with no router port forwarding.

## Editor

- Add text boxes; drag, resize and rotate using handles. Double-click to edit, or use the properties panel.
- Add images, rectangles, ellipses, lines, highlights, brush strokes and drawn/typed visual signatures.
- Style text, colors, opacity, strokes and alignment. Crop images; adjust brightness, contrast and saturation; apply grayscale, sepia or invert.
- Order, rename, hide, lock, duplicate and group layers. Apply 16 blend modes on design pages, ellipse/rounded-rectangle shape masks, and image blur. Shift-click for multiple selection.
- Zoom, pan with Space, snap to page edges/center and undo/redo. Drag page thumbnails to reorder.
- Ctrl+K opens the command palette; Ctrl+O opens files; Ctrl+S saves a project; Ctrl+E exports; Ctrl+0 fits the page.

Basic 8-bit RGB PSD import preserves raster layer names, positions, opacity and supported blend modes. Complex documents use their saved composite preview with an explicit notice. PSD export writes the current design page as raster layers; text, groups and shapes are not native Photoshop objects. `.bide` retains the editable editor objects. PSB and 16/32-bit or non-RGB PSD files are not supported.

## Conversions

| Operation | Support |
|---|---|
| PDF editing | Editable overlays for text, shapes, images and visual signatures |
| Merge / split / extract / rotate | Combine and reorder pages; export ranges or separate PDFs in a ZIP |
| Numbering / watermarks | Editable text across selected pages, numbering templates and starting numbers |
| Crop PDF | Trim the current page boundary; reversible with Undo, not redaction |
| Unlock / protect PDF | Open with a known password; optional AES-256 encryption on PDF export |
| Compression | Lossless stream optimization; balanced/small presets downsample large opaque images |
| Office to PDF | DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS/ODP and RTF through bundled browser WebAssembly |
| Images/text to PDF | PNG/JPEG/WebP, BMP/TIFF, SVG, TXT and Markdown as plain text |
| PDF to images | PNG/JPEG at 72, 144 or 300 DPI; SVG; ZIP download |
| PDF to Word/text | Reading-order text in DOCX or TXT, with page breaks |

Office uses the ZetaOffice/LibreOffice engine compiled for the browser. It loads on first use and converts document layouts, including tables and page geometry. Fonts and unsupported features can change appearance. DOCX, XLSX and PPTX have been exercised in the browser; older Office and OpenDocument formats use the engine's filters but have not all been individually tested.

Exports retain source text and vector artwork and bake visible annotations/fields into the page. **Interactive forms become static; bookmarks, internal links and existing digital signatures are not preserved.** External web/email links are retained. Visual signatures do not cryptographically sign a PDF.

## Projects and privacy

`.bide` projects embed original PDFs/images and editable layers. IndexedDB also autosaves the workspace. Save a project before clearing browser storage or moving computers. Original PDF sources are restored from the project on reload. Undo history is session-only.

No document uploads, analytics or conversion APIs are used. The website only serves application assets. Office uses an in-memory filesystem, with macro execution and external-link updates disabled during import. All fonts and engine files are bundled; no runtime CDN is needed.

## Scope and limitations

This is a working first version, not Photopea feature parity. Full PSD/PSB compatibility, painted masks, smart objects, raster selections, advanced retouching, OCR and certificate signing are not implemented. Existing PDF text cannot be directly rewritten or reflowed: text tools create overlays. PDF-to-DOCX extracts text rather than reconstructing page layouts. Scans require OCR for text extraction.

Rotation incorporates overlays into the PDF background; Undo restores them. Font exports use bundled Liberation Sans/Serif/Mono equivalents, so other families and unusual glyphs may substitute. Compression savings depend on the source; smaller presets reduce image quality. Page dimensions are points (72 per inch); use A4/Letter for documents. Large photo canvases are capped at a 5000-unit longest side. Password-protected PDFs prompt for a password on import. Unlocked workspace/project copies are unencrypted; passwords are not included in projects. Cropping hides off-page content and does not remove it. Pages containing blend effects rasterize on PDF/image export to preserve appearance, so their design text is no longer searchable in that export.

Office conversion needs HTTPS (or localhost) and cross-origin isolation response headers. The BAT launcher supplies the necessary local server configuration. Offline startup of the remotely hosted website is not implemented; the local BAT edition reads its assets from disk and works offline after setup.

## Development

```powershell
npm ci --ignore-scripts
npm run assets:office
npm run build
npm run serve
npm test
```

React, TypeScript and Fabric.js provide the editor. MuPDF WebAssembly handles PDF parsing/rendering/composition; PDFKit and SVG-to-PDFKit produce vector overlays with embedded fonts. ZetaOffice performs Office conversion in a separate browser worker. The earlier Python prototype remains for reference and is not used by the BAT launchers.

The tests cover import/render, source and accented overlay text, links, merge order, rotation, ranges, split, image/SVG/DOCX/TXT output, project integrity and blocked external SVG resources. Browser verification covers Word/Excel/PowerPoint conversion, text dragging/resizing, downloads and image compression. `THIRD_PARTY.md` records engine provenance and license locations.

bide is independent and is not affiliated with Photopea or iLovePDF. The repository retains its existing Apache-2.0 LICENSE; bundled components retain their own licenses, documented in THIRD_PARTY.md.
