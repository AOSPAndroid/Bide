# bide — Browser Edition

A Photopea-inspired visual editor, PDF toolkit, and bundled draw.io diagram editor in one browser app. Editing and conversion run locally inside the browser. It needs no installed Office, LibreOffice, Python, draw.io desktop, extensions or conversion service.

**This is not full Photopea or iLovePDF feature parity.** Diagrams use the actual open-source draw.io editor with its remote integrations disabled. See [FEATURES.md](FEATURES.md) for supported features and remaining work.

## Start on Windows

1. Get the [prebuilt bide-browser.zip](https://github.com/AOSPAndroid/Bide/releases/download/v0.4.1/bide-browser.zip) and extract the entire ZIP into a **new writable folder**. The app and conversion engines are already included. You should see a `site` folder beside the BAT files.
2. Use your existing **Node.js 22 or newer**. bide detects `C:\devhome\tools\node24\current\node.exe` or `node.exe` on PATH. With this ZIP, **Install Dependencies.bat is optional**: it only checks your installation and bundled files, with no downloads.
3. Double-click **launch bide.bat**. It starts the local server in the background and opens the editor in your default browser (use Edge or Chrome).

Keep the BAT files with their `scripts` and `site` folders. No Node runtime is downloaded or installed by bide. For a different Node location, set `BIDE_NODE` to the full path to `node.exe`; this overrides automatic detection. No administrator rights or system PATH changes are needed. The launcher reuses the running server, starting at port 8766 and choosing another local port if occupied. Logs and server state are in `.runtime`. The server runs until Windows shuts down; closing the browser does not stop it. No startup task or Windows service is installed.

The BAT files run directly through Node: **PowerShell and execution-policy changes are not needed.** Normal setup and launch never download dependencies. If the built app is missing, the launcher prints the ready-to-run ZIP link and stops.

GitHub's **Code → Download ZIP** creates a source folder such as `Bide-main`. A source build must be explicitly requested with `"Install Dependencies.bat" --build-source`; it needs npm packages and the browser Office/diagram runtimes, which may require network access. Use the prebuilt release ZIP on a PC where proxy authentication blocks dependency downloads. Its root launchers run offline using your existing Node; the `source` folder is only for rebuilding.

The local edition works without internet after setup. A hosted edition needs only a browser and no Node runtime on the work PC; see [HOSTING.md](HOSTING.md). A public [bide demo](https://bide-demo.dalilooksk.chatgpt.site) is hosted with Sites. The demo includes the photo editor, PDF tools and draw.io; Office-to-PDF conversion is available only in the local download because the Office assets exceed the host's 25 MiB file limit. Files and drafts stay in each visitor's browser. The previous `Setup.cmd` and `start bide.cmd` now forward to these BAT files.

## Share internally using IP:port

After setup, run **share bide.bat** on the hosting PC. It displays addresses such as `http://192.168.1.20:8786`. Send colleagues the address on your shared work network; their PCs only need Edge or Chrome. Keep the sharing window open and the host awake. Close the window or press Ctrl+C to stop sharing. For another port, run `"share bide.bat" 9090` from Command Prompt.

PDF and image editing runs over HTTP, but browsers may block downloads from HTTP addresses. **Use trusted HTTPS for team use: Office-to-PDF conversion on other PCs requires it**, because the browser Office engine uses shared memory. The sharing server supports HTTPS with an IT-issued certificate; see [HOSTING.md](HOSTING.md) for configuration, firewall guidance and troubleshooting. `launch bide.bat` continues to support Office conversion locally through localhost.

Every visitor has an independent workspace stored in their own browser. Sharing the app does not share documents or provide live collaboration. This is an internal static server without user accounts; use it on your trusted LAN/VPN, with no router port forwarding.

## Workspaces and dock

The interface uses white panels, Barclays blue accents (`#00AEEF`) and navy text (`#00395D`). Move the pointer to the **Workspaces** tab at the bottom center to reveal the animated dock. Its three icons open **Photo editor**, **PDF MasterTool** and **Drawio**. Icons lift and show their labels on hover; the active workspace has a blue icon. Click/tap the tab to keep the dock open, or focus it with Tab and press Up to reach the icons. Escape dismisses keyboard access. Reduced-motion preferences disable the animations.

Photo editor and PDF MasterTool share your current document, layers and undo history. The PDF home has searchable tools grouped under Organize, Convert, Edit and Security; **Continue editing** returns to the document. Drawio keeps its own diagram draft, and **Place in document** returns to the photo/PDF workspace you came from. Ctrl+K can also switch workspaces.

## Editor

- Add text boxes; drag, resize and rotate using handles. Double-click to edit, or use the properties panel.
- Add images, rectangles, ellipses, lines, brush strokes and drawn/typed visual signatures. The **H** highlighter draws freehand curves with separate color, width and opacity controls; each stroke is an editable layer.
- Style text, colors, opacity, strokes and alignment. Crop images; adjust brightness, contrast and saturation; apply grayscale, sepia or invert.
- Order, rename, hide, lock, duplicate and group layers. Apply 16 blend modes on design pages, ellipse/rounded-rectangle shape masks, and image blur. Shift-click for multiple selection.
- Zoom from 10% to 800% using the toolbar percentage (type a value and press Enter), plus/minus buttons, Ctrl +/−, or Ctrl/Alt + mouse wheel. Ctrl+1 resets to 100%, Ctrl+0 fits the page. Wheel zoom keeps the pointer position anchored. Pan with Space, snap to page edges/center and undo/redo. Drag page thumbnails to reorder.
- Ctrl+K opens the command palette; Ctrl+O opens files; Ctrl+S saves a project; Ctrl+E exports; Ctrl+0 fits the page.

Basic 8-bit RGB PSD import preserves raster layer names, positions, opacity and supported blend modes. Complex documents use their saved composite preview with an explicit notice. PSD export writes the current design page as raster layers; text, groups and shapes are not native Photoshop objects. `.bide` retains the editable editor objects. PSB and 16/32-bit or non-RGB PSD files are not supported.

## Diagrams

Choose **Drawio** from the bottom dock. The bundled draw.io 31.4.5 editor supplies draggable/resizable shapes, attached connectors, labels, flowchart/UML/network shape libraries, layers, pages, alignment/layout tools, grouping, undo/redo, and its own zoom/pan controls. Start from a blank canvas, process flow, team structure, or system overview. The **More Shapes** button opens additional bundled libraries.

- Open and save native `.drawio` / draw.io XML files, including multiple pages. The current diagram also autosaves locally, independently of your photo/PDF document.
- Export the current diagram page as SVG, PNG (with editable XML embedded), or PDF. The PDF button produces a high-resolution image PDF; text is not searchable. Use draw.io's File → Print for its browser printing workflow.
- **Place in document** adds a diagram as an image layer to your current PDF/design. Select that layer and choose **Edit diagram** to reopen its source; placing it again updates that layer. `.bide` files retain this editable diagram source.
- **Ctrl+K** opens bide's command palette in all three workspaces, including when the diagram iframe has keyboard focus.

The prebuilt ZIP includes the diagram editor, shape libraries and math renderer. It never loads the online diagrams.net editor. Remote storage, real-time collaboration, AI services, remote icon search, remote fonts/images and server-only conversion services are disabled or unavailable. Native `.drawio` files and local assets work offline. External images referenced by an imported file must be embedded locally to display/export. SVG exports can contain HTML labels (`foreignObject`), which some external viewers do not render; PNG/PDF preserve their appearance. Opening a new diagram replaces the current diagram draft; save a `.drawio` copy to keep separate files.

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
npm run assets:diagrams
npm run build
# dist/ is the complete local app; out/ is the public demo.
npm run serve
npm test
```

React, TypeScript and Fabric.js provide the editor. MuPDF WebAssembly handles PDF parsing/rendering/composition; PDFKit and SVG-to-PDFKit produce vector overlays with embedded fonts. ZetaOffice performs Office conversion in a separate browser worker. The earlier Python prototype remains for reference and is not used by the BAT launchers.

The tests cover import/render, source and accented overlay text, links, merge order, rotation, ranges, split, image/SVG/DOCX/TXT output, project integrity and blocked external SVG resources. Browser verification covers Word/Excel/PowerPoint conversion, text dragging/resizing, downloads and image compression. `THIRD_PARTY.md` records engine provenance and license locations.

bide is independent and is not affiliated with Photopea, iLovePDF or draw.io. The repository retains its existing Apache-2.0 LICENSE; bundled components retain their own licenses, documented in THIRD_PARTY.md.
