# Bundled components

This browser edition includes dependencies with their own licenses. License copies are shipped in `public/licenses` (deployed as `licenses`).

- MuPDF.js 1.28.1: AGPL-3.0-or-later, with a commercial licensing option from Artifex. Source: https://github.com/ArtifexSoftware/mupdf and https://github.com/ArtifexSoftware/mupdf.js
- ZetaOffice browser runtime: unmodified files downloaded on 2026-09-16 from https://cdn.zetaoffice.net/zetaoffice_latest/ . These are the LibreOffice engine compiled to WebAssembly, not a native installation. Brotli transport encoding was decoded for static hosting. See https://zetaoffice.net and https://github.com/LibreOffice/core for the engine and source information. LibreOffice's COPYING file records its licensing and third-party components.
- ZetaJS: MIT, from https://github.com/allotropia/zetajs . `zetaHelper.ts` was compiled to ES2022 JavaScript; the helper source is included in `vendor-source`. The app's Office bridge is in `public/office`.
- Liberation Sans, Serif and Mono: SIL Open Font License 1.1. Unmodified fonts extracted from the bundled Office runtime. Source: https://github.com/liberationfonts/liberation-fonts
- ag-psd 31.0.2: MIT, from https://github.com/Agamnentzar/ag-psd . PSD read/write is limited by bide's raster-layer implementation; it is not Photoshop feature parity. pako and base64-js license copies are included.
- Fabric.js, React, React DOM, PDFKit, SVG-to-PDFKit, fflate, docx and Lucide: see the package lockfile and bundled license copies.

`public/office/manifest.json` records exact hashes and sizes of the Office runtime and wrapper files used by this build. The runtime's upstream `latest` URL can change; the delivered files are pinned by that manifest. Keep the matching runtime and metadata together when updating.

The source bundle accompanies this local handoff. Public or commercial redistribution must follow the upstream licenses, including MuPDF's AGPL or commercial terms. The private GitHub repository contains application source, lockfiles and the Office asset manifest/bootstrap. It does not contain the large Office runtime binaries.
