## v0.8.13 — Independent branding and editor improvements

- Original B logo and favicon, warm white/graphite interface, burnt-orange accents, and “Image & Document Editor” tagline. Retired bank logo assets are removed.
- Compact workspace layout and shorter tool rail, with navigation in the header and more room for documents.
- OCR appearance matching and original-letter replacement, Find & replace, better bold/symbol weights, and a guard against making replacement text blurrier than the source. Exact matching still depends on the source image and available glyphs/fonts.
- Offline AI OCR, image removal/fill, sharpening and subject selection in the full Windows package; seven bundled OCR languages. The hosted demo omits the AI model pack and Office engine.
- Magic wand, combined selections, colour range/refine, layer styles, gradients, paint bucket and paintable masks.
- Pen and path editing, rulers/guides, crop/straighten, image/canvas size, perspective and named History steps.
- Prebuilt ZIP retains install, launch, LAN sharing and Stop BAT files and uses existing Node.js 22+ without setup downloads.

## Current app identity

- Original B monogram and independent warm white, graphite, and burnt-orange identity, with “Image & Document Editor” beneath bide.

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
| Local GUI, canvas navigation, command search | Implemented | Warm white/graphite compact interface with burnt-orange accents, workspace switcher in the header, searchable PDF tools, zoom, pan, Ctrl+K palette and keyboard shortcuts |
| Draggable/resizable/rotatable text | Implemented | Text boxes, typography controls, color, alignment, property inspector |
| Layers | Partial | Ordering, names, groups, visibility, lock, duplication and 16 blend modes on design pages; layer styles (drop shadow, inner shadow, outer and inner glow, stroke outside/center/inside, colour and gradient overlays) rendered live and kept in .bide, PSD and image exports, and as pixels in PDF/SVG; no clipping masks between layers or adjustment layers |
| Painting tools | Partial | Brush styles, highlighter and eraser; Gradient tool (G: linear or radial, drawing colour to a second colour or to transparent, limited to the selection) as an editable vector layer; Paint bucket (K: tolerance, contiguous, all layers, opacity) as a new layer; no pattern fills or blend-mode painting |
| Transform and alignment | Partial | Move, scale, rotate, skew X/Y, flip, page alignment, snapping to the page and to guides; nine-point Warp and four-corner Perspective (rasterize the layer); no live (non-destructive) distort |
| Shapes and paths | Partial | Rectangles, ellipses, lines, brush strokes; Pen tool (P: click for corners, drag for curves, close on the first point, Enter to finish; fill and stroke) and point editing of anchors and Bézier handles; no Boolean operations |
| Raster image import, resizing and crop | Partial | Common image formats; object crop/resize; Image size (resample page and layers), Canvas size with anchor, Crop tool (C) with straighten angle, crop to selection, trim to content; PDF pages crop by margins |
| Adjustments and filters | Partial | Brightness, contrast, saturation, blur, grayscale, sepia, invert; no curves, levels, adjustment layers or full filter gallery |
| Selections | Implemented | Marquee, lasso and magic wand (tolerance, contiguous, anti-alias, all layers or one); Shift adds, Alt subtracts, Shift+Alt intersects (or New/Add/Subtract/Intersect buttons); select all, inverse (Ctrl Shift I), colour range with live preview and screen eyedropper, layer pixels, and AI Select subject (ISNet); Refine: feather, expand, contract, smooth; marching-ants outline. Selections are soft pixel masks; no quick mask mode or saved channels |
| Masks and clipping masks | Partial | Raster layer masks from any selection (Keep inside / Hide inside) or added blank, painted with the Mask brush (Q: Hide / Reveal, size, soft edge, opacity), inverted, applied or deleted; soft edges kept, following the layer when moved or scaled; AI Remove background as a mask; ellipse and rounded-rectangle shape masks; no clipping masks between layers or Photoshop-compatible mask stacks |
| Smart objects | Missing | No linked/embedded smart-object editing |
| Retouching | Partial | Clone Stamp and basic color-matched Healing Brush (Alt-click to sample, size/softness/opacity) on separate patch layers; warp; no content-aware fill, liquify, dodge/burn or advanced brush engine |
| PSD / PSB workflows | Partial | 8-bit RGB PSD raster layers and supported group hierarchy import/export, positions, names, opacity and supported blend modes; complex PSDs use saved composites; no PSB, native text/vector/Photoshop effect round-trip |
| RAW, advanced design formats | Missing | No RAW development, AI/CDR/XD/Sketch compatibility guarantee |
| Color management | Missing | No editable ICC/CMYK/Lab workflow, channels, or 16/32-bit editing |
| Text layout | Partial | Basic multiline boxes; no advanced OpenType, text-on-path or font import workflow |
| Artboards and guides | Partial | Multiple pages, artboard presets, layout grid; rulers that follow zoom and scroll (Ctrl R); guides dragged from the rulers, moved or dragged off to delete, saved per page, with snapping (Ctrl ; hides them) |
| Animation / video | Missing | No timeline, frame animation, video editing or animated exports |
| History | Implemented | History tab beside Layers names each step (move, transform, add, delete, style, mask, crop, resize…); click a step to go back or forward; 45 steps |
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
| OCR PDF | Partial | Local offline OCR (English, French, German, Spanish, Italian, Dutch, Portuguese) turns image and scanned-page text into editable text layers; no searchable invisible-text PDF output |
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

1. PDF completeness: proper redaction, embedded-image extraction, searchable OCR PDF output, forms, richer password permissions, and batch crop/image-watermark workflows.
2. Conversion fidelity: document corpus tests, layout-preserving PDF-to-Office, PDF/A validation and repair workflows.
3. Raster editing foundation: selections, painted masks, layer effects, advanced brush/retouch tools (content-aware fill, dodge/burn) and color management.
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

## 0.8.8 — Restore 0.8.6 replacement defaults and fix bold handling

- Restores 0.8.6 OCR sizing without horizontal stretching, original color sampling, sampled-color cover and automatic cleanup margin. Smooth repair remains an explicit option. Leave cleanup padding blank for Auto.
- Select OCR weight (Regular, Bold, Italic or Bold italic) before clicking image text. The chosen face is loaded and measured before replacement; OCR does not automatically infer its weight. Native PDF text still uses its detected font.
- Preserves original PDF bold/italic metadata when a subset embedded font must switch to a bundled fallback for new characters, including on export and after saving a project. Embedded bold faces are not artificially emboldened twice.

## 0.8.9 — Workplace fonts and separate chat text regions

- Smart OCR grouping splits large gaps between avatar initials and adjacent message text. Choose Individual words for precise edits, or Whole lines for legacy grouping. French accents remain supported.
- Adds 15 installed workplace font choices to both text and OCR menus: Segoe UI variants, Aptos variants, Calibri, Calibri Light, Cambria, Candara, Corbel, Constantia, Consolas, Tahoma and Arial Narrow. These are local system fonts, not redistributed font files. Missing fonts show a message with a bundled alternative.
- Workplace-font text exports as an image within PDF/SVG so the export engine does not substitute a different font. Other text stays vector-based; .bide retains editable text. Recipients need the same installed font to edit .bide with the same appearance.

### OCR stroke matching (0.8.10)

OCR weight defaults to Auto (match strokes), comparing foreground coverage with regular and bold renderings in the selected font before sizing the replacement. Regular, Bold, Italic and Bold italic remain manual overrides. This estimates weight, not the original font; complex backgrounds, mixed weights and low-resolution scans may require manual adjustment. Existing replacement layers are unchanged; undo and select the detected region again to apply Auto. Text softness remains adjustable in Properties.

### Mobile UI fonts (0.8.11)

Roboto and Inter are already bundled for offline text and OCR editing. SF Pro, SF Pro Text and SF Pro Display are now offered as installed-font choices in both font menus and the command palette. Apple font files are not bundled or downloaded; use requires a local installation and compliance with Apple licensing. Missing SF Pro fonts report an error recommending bundled Inter instead of silently substituting a different face. Installed-font text retains the existing raster-text PDF/SVG export behavior.

## Unreleased — OCR accuracy, languages and font matching

- Small text is enlarged before recognition, based on line height measured from the image (lines under 24 px, up to 3x), and light-on-dark images are inverted. Already-large text is left at native size: enlarging it or stretching contrast measurably hurt accents and ß. PDF pages are rendered for OCR at up to 3600 px. On rendered test text at 72 DPI, character errors fell from about 18% to 0–3% at 9 pt and from about 92% to under 8% at 7 pt.
- Replacement text color comes from the glyph pixels and the background from a ring around the region, instead of black/white text and a single corner pixel.
- Low-confidence punctuation-only "words" (borders, icons, specks) are dropped. Regions whose least certain word is below 70% confidence get a dashed amber outline and a tooltip; the status bar counts them.
- OCR languages: English and French by default; German, Spanish, Italian, Dutch and Portuguese are bundled and can be enabled in the detection bar (stored per browser). The bundle uses integer "best" LSTM models, which give identical results to the previous standard data: the seven languages take 13 MB, less than English and French did before (17 MB). `OCR_LANGUAGES` restricts a build.
- OCR scan: Thorough (slower) adds a sparse-text second pass for isolated labels and keeps only lines the first pass missed. It is off by default; on synthetic UI layouts the standard pass already found every label.
- After a scan, the clearest regions (≥85% confidence) are compared with 12 common faces by rendered glyph shape, and the closest pre-selects OCR font unless one was chosen. In Chromium it identified all 12 at 14–32 px, including bold, blurred and light-on-dark text; misread characters reduce accuracy.
- Auto weight is estimated per word, so a bold label and a regular value on one line ("**Nom du client:** Dalil") keep both weights in the editable text and in exports. On generated pages mixing bold and regular words (5 fonts, 14 and 20 px, light and dark) every word kept its weight (750/750, previously 576/750: bold labels in mixed lines turned regular). List bullets that OCR misreads as e, «, *, + or ¢ are restored as •. Installed system fonts common in screenshots (SF Pro, Segoe UI, Arial, Calibri, Aptos and others) join the font comparison when present.
- Soft or blurred originals: the blur of each region is measured from its glyph edges. **Match blur** (on by default) gives a single replacement the same softness so it blends in. **Convert all** replaces every detected line at once with crisp text (one undo step), for a sharp page. Bold detection on soft text compares each word's total ink, which blur does not change, against regular and bold renderings; the text colour is darkened to that measured ink level, since blurred letters never reach their true colour.
- Bundled AI models, running offline in a worker through ONNX Runtime Web (WebGPU when available, else multithreaded WebAssembly): PaddleOCR PP-OCRv5 as an alternative OCR engine (word boxes recovered from its character timing), LaMa inpainting for an AI fill background and Remove with AI on selections, ISNet (int8, 46 MB; its masks match the float16 model to 99.8% IoU) for Select subject and Remove background, and Real-ESRGAN for Sharpen with AI (2×) and optional sharpening before OCR. Measured on a 4-thread CPU: LaMa ~9 s to load and ~11 s per 512 px area; Real-ESRGAN ~0.6 s per 128 px tile; PaddleOCR well under a second per line. The hosted demo omits the ~171 MB model pack and hides these actions. AI OCR is the default engine when the models are present: across 4 fonts, 2 sizes, blur and dark mode its character error rate was 0.44% against 1.62% for Tesseract (worst case 0.4% vs 10.9%), and it was faster (0.64 s vs 0.95 s per image). Tesseract stays available as Standard, with the language picker and Thorough scan.
- Edit with original letters (default): character cells are segmented from inked column runs (matched to the recognizer's character positions by an ordered alignment, so drifting positions and detached dots are handled), and an edit is rebuilt from the original pixels: unchanged text before the first change stays, the rest of the line is redrawn at its new positions. Ink is assigned to lines by connectivity, so overlapping neighbouring lines are not disturbed. Missing letters come from same-size text elsewhere on the page; otherwise the OCR font is used. Find & replace applies this to every matching line in one undo step. On the user's booking screenshot, 'Daliil' -> 'Dalil' is indistinguishable from the original.
- Replaced font text keeps its original line length: width sets the size (height only when it agrees within 3%) and letter spacing absorbs the rest.
- Image preparation runs in a worker and the status bar shows recognition progress.
- `npm run test:e2e` drives the app in Chromium: imports a rendered PNG, waits for OCR, checks the suggested font and the thorough pass, replaces a region (text layer and background patch), and verifies that enabling German re-scans ß and umlauts correctly. The Vite dev server now loads the PDF engine (mupdf is excluded from dependency pre-bundling).

### OCR accuracy and language release (0.8.12)

Merged claude/lucid-fermat-jvmf9l: better preparation for small and dark-mode text, progress reporting, optional thorough scan, uncertain-region indicators, suggested bundled font matching and selectable offline English, French, German, Spanish, Italian, Dutch and Portuguese models. OCR geometry maps back to the original page and replacement sizing keeps proportional fitting. Source-map-js build dependency updated to the patched 1.2.2 release.
