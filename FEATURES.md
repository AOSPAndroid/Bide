# bide feature coverage

Checked against the [Photopea manual](https://www.photopea.com/learn/) and [iLovePDF tool catalogue](https://www.ilovepdf.com/) on 2026-09-16, and against the actual bide code and verification results.

**bide is a local visual editor with integrated PDF tools and a bundled draw.io workspace. It does not currently provide full feature parity with Photopea or iLovePDF.** This is a capability audit, not a promise that all file variants or workflows work identically. “Implemented” means the described bide operation exists; it does not mean the entire competitor subsystem has been reproduced. “Missing” means there is no finished, supported workflow. Nothing marked missing is represented as a working tool in the UI.

## Visual editor compared with Photopea

| Feature family | bide status | Actual scope / remaining work |
|---|---|---|
| Local GUI, canvas navigation, command search | Implemented | Browser editor, zoom, pan, Ctrl+K palette and keyboard shortcuts |
| Draggable/resizable/rotatable text | Implemented | Text boxes, typography controls, color, alignment, property inspector |
| Layers | Partial | Ordering, names, groups, visibility, lock, duplication and 16 blend modes on design pages; no Photoshop layer-effect stack |
| Transform and alignment | Partial | Move, scale, rotate, flip, page alignment and snapping; no perspective/warp transform |
| Shapes and paths | Partial | Rectangles, ellipses, lines, brush strokes; no Pen tool, node editing or Boolean operations |
| Raster image import, resizing and crop | Partial | Common image formats; object crop/resize; no full raster editing engine |
| Adjustments and filters | Partial | Brightness, contrast, saturation, blur, grayscale, sepia, invert; no curves, levels, adjustment layers or full filter gallery |
| Selections | Missing | No marquee, lasso, magic wand, subject selection, edge refinement or selection masks |
| Masks and clipping masks | Partial | Ellipse and rounded-rectangle object masks; no painted masks or Photoshop-compatible mask stacks |
| Smart objects | Missing | No linked/embedded smart-object editing |
| Retouching | Missing | No clone stamp, healing, content-aware fill, liquify, dodge/burn or advanced brush engine |
| PSD / PSB workflows | Partial | 8-bit RGB PSD raster layers import/export, positions, names, opacity and supported blend modes; complex PSDs use saved composites; no PSB, native text/vector/Photoshop effect round-trip |
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

bide 0.4.0 includes the actual draw.io 31.4.5 browser editor, served locally from the release ZIP. It does not embed the hosted diagrams.net website. The design/PDF editor remains bide's separate Fabric.js implementation.

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
