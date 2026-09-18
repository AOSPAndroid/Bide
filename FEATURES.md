## v0.4.7 — Searchable command palette

- Workspace aliases: visio/draw/diagram/drawio/flowchart, photoshop/photopea, PDF/ilovepdf. Exact aliases rank first; search accepts multiple words and punctuation.
- Expanded document commands: pages, layers, selection, masks, alignment, fonts, brushes, filters, blend modes, settings and every supported export format. Dynamic page/layer names are searchable.
- Native local draw.io actions: undo/redo, selection, grouping, alignment, ordering, zoom, fit, grid, guides, sizing and properties, alongside its file/export commands.
- Commands reflect the active workspace. Unavailable commands explain the required selection or state and cannot execute. Draw.io validates availability again at execution. Specialized draw.io dialogs retain their own controls.
- 37 automated tests, including alias ranking and diagram command origin/availability checks.

## v0.4.6 — Clearer workspace layout

- Visible Photo editor, PDF MasterTool and Diagrams navigation, alongside the animated workspace dock.
- Labeled Select, Create, Draw and Insert tools with active states and shortcut hints.
- Direct Open files, Save project and Export file actions; clearer diagram export labels.
- PDF tools grouped by task, with category counts, search and filter reset.
- More readable properties and layers; page/property drawers on small screens.
- Existing editing and conversion capabilities are unchanged.

# bide feature coverage

Checked against the [Photopea manual](https://www.photopea.com/learn/) and [iLovePDF tool catalogue](https://www.ilovepdf.com/) on 2026-09-16, and against the actual bide code and verification results.

**bide is a local visual editor with integrated PDF tools and a bundled draw.io workspace. It does not currently provide full feature parity with Photopea or iLovePDF.** This is a capability audit, not a promise that all file variants or workflows work identically. “Implemented” means the described bide operation exists; it does not mean the entire competitor subsystem has been reproduced. “Missing” means there is no finished, supported workflow. Nothing marked missing is represented as a working tool in the UI.

## Visual editor compared with Photopea

| Feature family | bide status | Actual scope / remaining work |
|---|---|---|
| Local GUI, canvas navigation, command search | Implemented | White/blue interface, animated three-workspace dock, searchable PDF tools, zoom, pan, Ctrl+K palette and keyboard shortcuts |
| Draggable/resizable/rotatable text | Implemented | Text boxes, typography controls, color, alignment, property inspector |
| Layers | Partial | Ordering, names, groups, visibility, lock, duplication and 16 blend modes on design pages; no Photoshop layer-effect stack |
| Transform and alignment | Partial | Move, scale, rotate, flip, page alignment and snapping; no perspective/warp transform |
| Shapes and paths | Partial | Rectangles, ellipses, lines, brush strokes; no Pen tool, node editing or Boolean operations |
| Raster image import, resizing and crop | Partial | Common image formats; object crop/resize; no full raster editing engine |
| Adjustments and filters | Partial | Brightness, contrast, saturation, blur, grayscale, sepia, invert; no curves, levels, adjustment layers or full filter gallery |
| Selections | Partial | Rectangular and freehand lasso selections create reversible masks or copied cutouts on a selected layer; no magic wand, subject selection, edge refinement or multi-selection Boolean operations |
| Masks and clipping masks | Partial | Ellipse, rounded-rectangle and selection-path masks, including inverse masks; no feathering, painted masks or Photoshop-compatible mask stacks |
| Smart objects | Missing | No linked/embedded smart-object editing |
| Retouching | Missing | No clone stamp, healing, content-aware fill, liquify, dodge/burn or advanced brush engine |
| PSD / PSB workflows | Partial | 8-bit RGB PSD raster layers and supported group hierarchy import/export, positions, names, opacity and supported blend modes; complex PSDs use saved composites; no PSB, native text/vector/Photoshop effect round-trip |
| RAW, advanced design formats | Missing | No RAW development, AI/CDR/XD/Sketch compatibility guarantee |
| Color management | Missing | No editable ICC/CMYK/Lab workflow, channels, or 16/32-bit editing |
| Text layout | Partial | Basic multiline boxes; no advanced OpenType, text-on-path or font import workflow |
| Artboards and guides | Partial | Multiple pages and page snapping; no full artboard/guide system |
| Animation / video | Missing | No timeline, frame animation, video editing or animated exports |
| Automation / actions / scripts | Missing | Command palette is interactive; no recorded macros or batch action engine |
| Templates, cloud storage, collaboration | Missing | Local project save/autosave only |

## PDF toolkit compared with iLovePDF

The catalogue includes [organization, conversion, editing, security and intelligence tools](https://www.ilovepdf.com/). The statuses below describe bide, not iLovePDF's service guarantees.

| Tool / workflow | bide status | Actual scope / remaining work |
|---|---|---|
| Merge PDF | Implemented | Import and combine documents, then reorder their pages |
| Split PDF | Implemented | Separate page PDFs in a ZIP |
| Remove / extract / organize pages | Implemented | Delete, duplicate, reorder and export ranges |
| Compress PDF | Implemented | Stream optimization and large opaque-image downsampling; savings depend on input |
| Word to PDF | Partial | DOCX tested with heading/table; DOC/RTF/ODT use engine filters but are not individually validated |
| PowerPoint to PDF | Partial | PPTX tested; PPT/ODP use engine filters but are not individually validated |
| Excel to PDF | Partial | XLSX tested, including formula recalculation; XLS/ODS filters not individually validated |
| JPG / images to PDF | Partial | Image import and PDF export; no dedicated margin/orientation batch wizard |
| HTML / URL to PDF | Missing | No webpage capture or HTML conversion workflow |
| PDF to JPG / PNG / SVG | Partial | Page rendering/export works; no extract-embedded-images workflow |
| PDF to Word | Partial | Extracted text with page breaks only; no layout reconstruction or OCR |
| PDF to PowerPoint | Missing | No editable slide reconstruction |
| PDF to Excel | Missing | No table detection or structured spreadsheet conversion |
| PDF to PDF/A | Missing | No archival-profile validation or certified conversion |
| Scan to PDF | Missing | No camera/scanner capture workflow |
| OCR PDF | Missing | No local OCR engine or searchable scan reconstruction |
| Repair PDF | Missing | Parser recovery may open some files, but no dedicated repair/recovery workflow |
| Rotate PDF | Partial | Rotate current page and undo; no multi-document batch rotation panel |
| Page numbers | Implemented | Editable numbering layers across selected pages; template, start number and header/footer controls |
| Watermarks | Partial | Batch editable text watermarks with angle, opacity, color and page range; image placement is manual |
| Crop PDF | Partial | Current-page crop margins with dimension preview and Undo; crop hides content and does not redact it |
| Edit PDF | Partial | Editable overlays, text, images, shapes and freehand marks; original text is not directly rewritten |
| PDF forms | Missing | No form-field authoring/detection/filling; exported interactive fields are flattened |
| Unlock / protect PDF | Implemented | Known-password import with retry/cancel; AES-256 password PDF export; no password recovery/cracking or permission-policy editor |
| Sign PDF | Partial | Drawn/typed visual marks only; no certificate signing, signature requests or audit trail |
| Redact PDF | Missing | Overlay rectangles do not remove underlying content and must not be treated as redaction |
| Compare PDF | Missing | No visual/text comparison workflow |
| AI summaries / translation | Missing | No AI model/service integration |
| PDF to Markdown | Missing | Plain text export does not reconstruct Markdown structure |
| Reusable workflows | Missing | No saved multi-step or folder-batch conversion pipelines |

## Diagrams: bundled draw.io

bide 0.4.1 includes the actual draw.io 31.4.5 browser editor, served locally from the release ZIP. It does not embed the hosted diagrams.net website. The design/PDF editor remains bide's separate Fabric.js implementation.

| Workflow | Status | Scope |
|---|---|---|
| Shape editing and connectors | Bundled draw.io | Drag, resize, rotate, connect shapes, edit labels, group, align, arrange and undo/redo |
| Flowchart / UML / network libraries | Bundled draw.io | Local shape libraries and More Shapes panel; specialized libraries are not each individually tested |
| Pages and layers | Bundled draw.io | Native diagram pages/layers retained in `.drawio` |
| Templates | Implemented | Blank, process flow, team structure and system overview starters; not a clone of the entire online template gallery |
| Native files and autosave | Implemented | Open/save `.drawio` or XML, independent IndexedDB draft; PNG exports also embed diagram XML |
| SVG / PNG / PDF | Implemented | Current-page exports; SVG with HTML labels, PNG at 2x scale, PDF with rasterized diagram (not searchable text) |
| Place diagram into PDF/design | Implemented | Image layer carrying editable source; Edit diagram reopens it and updates the layer on placement; `.bide` preserves the source |
| Command palette | Implemented | Context-specific commands, including Ctrl+K from the diagram iframe |
| Cloud / AI / remote integrations | Unavailable | No cloud storage, hosted collaboration, remote icon search, remote fonts/images or server-only converters; local diagram work requires no internet |

## Verified locally

- v0.4.1: production build and 30 automated tests pass. Browser checks cover white/blue editor and draw.io themes, bottom-edge hover reveal/hide, keyboard dock navigation, all three workspace routes, PDF search/category filters and compression dialog, preserved document/layers, and the PDF tool grid at a narrower viewport.

- v0.4.0: 30 automated tests pass. Curved translucent marker paths and embedded diagram source survive serialization; export replies are matched to their requests; source-folder/incomplete-bundle launchers stop without network requests. Production TypeScript/Vite build passes.
- Browser: zoom buttons and exact percentage visibly resize the artboard; marker creates a Path layer; native `.drawio`, PNG, SVG and PDF exports produce files; a placed diagram reopens and updates its existing layer with an edited label. Diagram PDF was opened/rendered and its dimensions checked.

- LAN sharing: `share bide.bat`, configurable IP/port, HTTP editing/import/autosave restoration, static HTTPS with a trusted test client, isolation headers, blocked uploads and private-path protection. Browser DOCX conversion and PDF download verified through the sharing server's localhost address. LAN HTTP downloads may be blocked by the browser; use trusted HTTPS for team use. A second work PC and company-issued certificate have not been available for verification.
- Automated PDF tests: source and accented overlay text, links (including rotated geometry), merge/ranges, rotation, split, PNG/JPEG/SVG, text/DOCX extraction, source integrity, rejection of external SVG resources, AES-256 export/unlock (including punctuation and Unicode passwords), and crop/reimport dimensions.
- PSD tests: raster data, layer names/order/position/opacity/blending, unsupported-format guards and composite fallback detection. Fabric 7 coordinate-anchor regression check.
- Browser checks: text editing, dragging and resizing, layer controls, signature placement, palette, project save/load, PDF merge/export, DOCX/XLSX/PPTX conversion and image compression.
- Windows setup: direct Node launch without PowerShell; existing Node detection on PATH, managed work-PC location or explicit override; prebuilt validation and launch without setup downloads; explicit source build, server reuse and paths containing spaces. Source-only folders stop with a prebuilt download link before attempting any network access.

These checks use representative fixtures. They do not establish identical behavior on every document, font, Photoshop feature, damaged PDF or Office version.

## Work remaining toward parity

Both the visual editor and PDF toolkit have equal priority. The numbered groups below organize remaining work; they are not a commitment to finish one product before the other.

1. PDF completeness: proper redaction, embedded-image extraction, OCR, forms, richer password permissions, and batch crop/image-watermark workflows.
2. Conversion fidelity: document corpus tests, layout-preserving PDF-to-Office, PDF/A validation and repair workflows.
3. Raster editing foundation: selections, painted masks, layer effects, brush/retouch tools and color management.
4. Full PSD/PSB compatibility, smart objects, advanced typography/paths, animation and automation.
5. Separate decisions for cloud collaboration, remote signature requests and AI tools, which need services or substantial local models beyond the current offline editor.

There is no full-parity completion claim or committed delivery date. The checklist should be updated only when each workflow is implemented and verified.

### v0.4.2 — Visio and page actions

- Diagram workspace Open accepts modern `.vsdx` files and converts them locally using the bundled draw.io importer. Imported shapes and text are editable; save as `.drawio`. No Visio export. Older `.vsd`, `.vdx` and stencil formats are not supported by this import path. Complex formatting, fonts and connectors may differ.
- Right-click a photo/PDF page thumbnail, or use its three-dot button, to duplicate, rotate clockwise/counterclockwise, move to beginning/end, or remove it. Actions target the clicked page; the last page cannot be removed. Undo restores changes. Rotation flattens current overlay layers into the PDF background; Undo restores editable layers.
- Verified local import, text editing and .drawio saving with the Microsoft 365 PnP react-visio sample Drawing1.vsdx. Verified inactive-page rotation, dimensions, Undo restoring 14 layers, and inactive-page removal.

### v0.4.3 — Drawing and Open shortcut

- Ctrl+O (Cmd+O on Mac) opens the appropriate local file picker in the photo editor, PDF home/editor and diagram workspace, including focus inside the draw.io iframe. Successful document imports show the editor.
- Round, square, spray and dotted brushes have adjustable 1–200 size and 5–100% opacity. B selects Brush; E selects Eraser; [ and ] adjust drawing-tool size.
- The freehand eraser removes parts of overlay artwork beneath it, with a 1–200 size. Erasures are undoable compositing layers, preserved in .bide projects and PDF/image export. A pale stroke previews the gesture; the erased result appears on release. Original imported PDF/image backgrounds are not erased. This is not PDF redaction.
- Verified all four brushes in the browser, partial-stroke erasure, exported PDF pixels retaining the erased gap, PDF-home and embedded-diagram Ctrl+O, and 31 automated tests including brush configuration and eraser serialization.

### v0.4.4 — Branding and selection masks

- Barclays eagle logo stored locally, with “Barclays Image & Document Editor” beneath bide.
- M selects rectangular selection; Q selects freehand lasso. Select an unlocked layer first, then draw on the canvas. Keep inside / Hide inside apply a reversible mask; Copy to layer creates an independently editable cutout without changing the source layer. Each action replaces that layer's previous mask. Choose Shape mask → None to recover the original pixels, or Undo.
- Masks follow layer rotation, scale and flipping and persist in .bide projects. This is a foundation for photo compositing, not Photoshop feature parity. Original PDF page content is not a selectable image layer.
- Browser verified mask placement, mask removal, copying a cutout and hiding the source. Automated geometry checks cover rotated, scaled and flipped layers and serialized inverse masks.
- A file opened while local autosave restoration is finishing takes priority over the restored project.

PSD focus for v0.4.4: normal groups and simple pass-through groups retain their editable hierarchy on import, and supported groups retain hierarchy on export. Unsupported effects, masks, smart objects, or pass-through groups with interacting blend modes still use the saved PSD composite. Eraser/compositing operations unsupported by PSD now export a merged appearance rather than becoming visible black strokes; save .bide for full editability.

Verified a real browser import/export of the generated grouped PSD: hierarchy, two named layers, exact position and pixel colors, multiply blend and opacity retained. Verified an erased pixel remains transparent in the exported merged PSD. 33 automated tests pass.

### v0.4.5 — Offline text fonts

- Photo/PDF text toolbar offers 19 choices: 12 bundled families plus the 7 existing system-font choices. Bundled families: Lato, Poppins, PT Sans, PT Serif, Crimson Text, Cousine, Pacifico, Lobster, Bebas Neue, Abril Fatface, Great Vibes and Sacramento.
- All font files and their SIL Open Font Licenses ship in the app. No internet or font installation is needed at runtime. Six body-text families include real regular, bold, italic and bold-italic faces; display/script families use regular faces with synthesized bold/italic when requested. Existing system fonts still depend on the device.
- Font selection waits for loading before measuring canvas text; project restoration and multipage exports load fonts before rendering. New text boxes use the last font selected in that session.
- PDF export embeds the selected bundled fonts and retains searchable text on pages without rasterizing effects. 34 tests pass, including font identity and searchable accented text in exported PDFs.

## 0.6.0 text recognition and editing

Automatic native PDF text regions and local English OCR for image/scanned pages; click a region to create a directly editable layer. Usable embedded TrueType/OpenType fonts survive project save and PDF export. Unsupported fonts or missing glyphs use a stated fallback. Native PDF replacements remove source text while retaining surrounding artwork; image replacements use adjustable background patches. Rotated/native complex layouts and exact image font recognition are not fully supported.

## 0.6.1
English + French offline OCR, including accented and mixed-language text. Five additional offline font families (17 total), all with regular/bold/italic/bold-italic faces; an OCR replacement-font selector before conversion.

## 0.7.0
80 bundled offline font families, alphabetically listed throughout the editor and OCR selector and searchable in the command palette. Available regular/bold/italic faces are embedded on PDF export.

## 0.7.1
Reduce the extended font library to Latin/Latin Extended characters and common symbols, retaining English/French coverage while fitting the public demo hosting limit.

## 0.8.0
Defer PDF export dependencies until needed; load page previews near the visible page list; cap editor thumbnails to 200 pixels; render OCR inputs directly at up to 2400 pixels; skip cancelled queued OCR jobs; allow browser caching of hashed local assets. These changes reduce unnecessary loading and rendering without changing document/export resolution.

## 0.8.1
Unlock Original PDF from Layers, the selection toolbar or command palette. The current page background becomes an unlocked image beneath existing overlays, supporting Marquee/Lasso and retouch tools. Undo restores the original PDF. Conversion rasterizes original text, vectors and links (up to 3x, longest edge 3500px); existing overlay text remains editable.

## 0.8.3 — sharper text editing
PDF previews adapt to zoom and screen density, with a 16-megapixel memory budget. PDF unlock rasterizes at up to 300 DPI (large pages are capped). Replacement text renders directly and OCR text uses measured font ascent for vertical placement. Native PDF text editing retains vector content; scanned text still requires a matching font and a background patch.

## 0.8.4 — match text softness
Text properties include a 0–2 px softness control, Slightly soft preset and Crisp reset, also accessible from the command palette. Text stays editable in .bide projects. Softened text alone exports as a transparent raster image; zero-softness text retains vector export. This is manual appearance matching, not automatic scan reconstruction. Browser pixel/export/reload verification: open /tests/text-appearance.html under the Vite development server.

## 0.8.5 — text box context menus
Right-click an editable text box on the canvas or its Layers entry to edit text, font, size, color, softness, formatting, duplicate, arrange, lock/unlock or delete. Context clicks work with drawing tools active and do not draw. Locked layers expose Unlock while editing actions are disabled. Soft text serialization also retains names and embedded font metadata.

## 0.8.6 — Transparent text replacement

- OCR replacement backgrounds: sampled color, chosen solid color, or clear to transparent. Clear removes the rectangular OCR area from intersecting unlocked image layers, rasterizing those layers; Undo restores the originals. Scanned PDFs must first be unlocked as images.
- Text boxes support a color background or transparent background, including a right-click action.
- Export selected text or the editable page as a transparent PNG using the command palette. Text export also appears in Properties and the right-click menu. Opaque pixels in images stay opaque; page export removes only the page background. Native PDF backgrounds must first be unlocked.
- Checkerboard preview shows page transparency. PNG exports keep alpha; .bide keeps editable layers.

## 0.8.7 — Better text replacement

- OCR samples actual foreground lettering and multiple background pixels instead of assuming black or white text.
- Repair smooth background reconstructs gentle gradients from borders above and below the text, as a separate undoable patch. Detailed textures still need Clone or Healing.
- Cleanup padding is adjustable from 0 to 20 page pixels; horizontal fitting better matches the original OCR line width without shrinking its height.
- Letter spacing is adjustable in Text Properties and accessible from the command palette.
- Property changes exit inline text editing before checking the layer lock, fixing false locked-layer messages during replacement.
