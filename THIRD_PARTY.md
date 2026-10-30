# Bundled components

This browser edition includes dependencies with their own licenses. License copies are shipped in `public/licenses` (deployed as `licenses`).

- MuPDF.js 1.28.1: AGPL-3.0-or-later, with a commercial licensing option from Artifex. Source: https://github.com/ArtifexSoftware/mupdf and https://github.com/ArtifexSoftware/mupdf.js
- ZetaOffice browser runtime: unmodified files downloaded on 2026-09-16 from https://cdn.zetaoffice.net/zetaoffice_latest/ . These are the LibreOffice engine compiled to WebAssembly, not a native installation. Brotli transport encoding was decoded for static hosting. See https://zetaoffice.net and https://github.com/LibreOffice/core for the engine and source information. LibreOffice's COPYING file records its licensing and third-party components.
- ZetaJS: MIT, from https://github.com/allotropia/zetajs . `zetaHelper.ts` was compiled to ES2022 JavaScript; the helper source is included in `vendor-source`. The app's Office bridge is in `public/office`.
- Liberation Sans, Serif and Mono: SIL Open Font License 1.1. Unmodified fonts extracted from the bundled Office runtime. Source: https://github.com/liberationfonts/liberation-fonts
- ag-psd 31.0.2: MIT, from https://github.com/Agamnentzar/ag-psd . PSD read/write is limited by bide's raster-layer implementation; it is not Photoshop feature parity. pako and base64-js license copies are included.
- Fabric.js, React, React DOM, PDFKit, SVG-to-PDFKit, fflate, docx and Lucide: see the package lockfile and bundled license copies.
- @noble/hashes 1.8.0: MIT, from https://github.com/paulmillr/noble-hashes . SHA-256 fallback for PDF source integrity on HTTP intranet addresses; license included in `public/licenses`.

`public/office/manifest.json` records exact hashes and sizes of the Office runtime and wrapper files used by this build. The runtime's upstream `latest` URL can change; the delivered files are pinned by that manifest. Keep the matching runtime and metadata together when updating.

The source bundle accompanies this local handoff. Public or commercial redistribution must follow the upstream licenses, including MuPDF's AGPL or commercial terms. The GitHub repository contains application source, lockfiles and the asset manifests/bootstrap. Large Office runtime assets are included in the prebuilt release ZIP, rather than Git history.

- Tesseract.js 6.0.1 and tesseract.js-core: Apache-2.0; bundled local OCR worker and WASM. See public/licenses/tesseract-LICENSE.txt and tesseract-core-LICENSE.txt. English, French, German, Spanish, Italian, Dutch and Portuguese tessdata (integer "best" LSTM models) is packaged from @tesseract.js-data/eng, fra, deu, spa, ita, nld and por 1.0.0 (package MIT; trained data from the Tesseract project, Apache-2.0). OCR runs locally; no third-party OCR service receives documents.

- Carlito and Caladea: SIL Open Font License 1.1, unmodified static TTFs from https://github.com/google/fonts/tree/main/ofl/carlito and https://github.com/google/fonts/tree/main/ofl/caladea . License copies are bundled in public/licenses.

- Cutive Mono and Courier Prime: SIL Open Font License 1.1 (Copyright 2012 The Cutive Project Authors; Copyright 2015 The Courier Prime Project Authors). Converted from the WOFF files of @fontsource/cutive-mono 5.3.0 and @fontsource/courier-prime 5.3.0 (Latin and Latin Extended subsets merged) to TTF with fontTools; glyphs and names unchanged. License copies in public/licenses/CutiveMono-OFL.txt and CourierPrime-OFL.txt. Used for Courier-family PDF text when New font is chosen: Cutive Mono for regular Courier (same stroke weight), Courier Prime for bold.

- Light, Medium and SemiBold faces of Roboto, Inter, Open Sans, Montserrat, Poppins, Source Sans 3 and Noto Sans: SIL Open Font License 1.1 (licenses in public/licenses/fonts, as for the extended library). Converted from the WOFF files of @fontsource 5.3 packages (Latin and Latin Extended subsets merged) to TTF with fontTools; glyph outlines and metrics unchanged. The Source Sans 3 weight derivatives use the distinct Bide Sans 3 Light, Medium and SemiBold family names, both internally and in the font picker, respecting the reserved name in their OFL. PDF names from the original family map to those corresponding weights. Other internal names are unchanged. Lato is not included: its license reserves the name for unmodified fonts. Used when a PDF line in that weight is set in a font (New font text box).

- Extended font library: 63 additional families from Google Fonts, SIL Open Font License 1.1. Per-family licenses are in public/licenses/fonts. scripts/font-library-manifest.json records the upstream revision, source URLs and output hashes. Variable fonts are instantiated into static faces at build preparation time with fontTools. The extended library is subset to Latin/Latin Extended, punctuation, currencies, arrows and mathematics; derivatives have internal bide-prefixed names. End users need no font installation or downloads.
- pdf-lib 1.17.1 (MIT): creates fillable form fields in exported PDFs (and flattens them on request); loaded only when a document has form fields.
- @pdf-lib/fontkit 1.1.1 (MIT as declared upstream): embeds the existing Liberation Sans font for Latin, Greek and Cyrillic form values. Its upstream README and package attribution are in public/licenses/pdf-lib-fontkit-README.md and pdf-lib-fontkit-NOTICE.txt; pdf-lib's license is in public/licenses/pdf-lib-LICENSE.txt.
- nspell 2.1.5 (MIT) checks OCR spelling offline in a worker, with Hunspell dictionaries from dictionary-en 4.0.0 (MIT AND BSD, from SCOWL / en_US) and dictionary-fr 3.0.0 (MPL-2.0, from Grammalecte). Copies are in public/ocr/spell; licenses in public/licenses/dictionary-en-LICENSE.txt and dictionary-fr-LICENSE.txt.
- ONNX Runtime Web 1.23.2 (Microsoft): MIT; runs the bundled AI models locally in a worker (WebGPU when available, otherwise WebAssembly). Its WebAssembly files are copied to ai/ort/ at build time.
- AI models, downloaded at build time by scripts/prepare-ai.mjs, pinned by URL, size and SHA-256 in public/ai/manifest.json, and bundled in the ZIP (no runtime downloads):
  - LaMa inpainting (Carve/LaMa-ONNX export of advimman/lama): Apache-2.0. Converted at build time to float16 weights (float32 computation; identical output, half the size) by scripts/onnx-fp16.mjs, using onnx-proto (MIT).
  - Real-ESRGAN realesr-general-x4v3 (ONNX export of xinntao/Real-ESRGAN): BSD-3-Clause.
  - ISNet general-use (xuebinqin/DIS, Apache-2.0; ONNX export from the rembg project, MIT; dynamic int8 build from Ko033/isnet-general-use-onnx, Apache-2.0) for Select subject and Remove background.
  - PaddleOCR PP-OCRv5 mobile and server text detection, and mobile recognition for Latin, Cyrillic, Greek, Arabic, Korean and Chinese/Japanese (official PaddlePaddle ONNX exports): Apache-2.0. The server detector is converted to float16 weights at build time, like LaMa.
  - SlimSAM-77 (Segment Anything, Apache-2.0; uniform int8 ONNX export from Xenova/slimsam-77-uniform) for Object select.
  - PaddleX PP-LCNet_x1_0_doc_ori (page orientation) and UVDoc (flattening photographed pages), official PaddlePaddle ONNX exports: Apache-2.0.

