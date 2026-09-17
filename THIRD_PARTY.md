# Bundled components

This browser edition includes dependencies with their own licenses. License copies are shipped in `public/licenses` (deployed as `licenses`).

- MuPDF.js 1.28.1: AGPL-3.0-or-later, with a commercial licensing option from Artifex. Source: https://github.com/ArtifexSoftware/mupdf and https://github.com/ArtifexSoftware/mupdf.js
- ZetaOffice browser runtime: unmodified files downloaded on 2026-09-16 from https://cdn.zetaoffice.net/zetaoffice_latest/ . These are the LibreOffice engine compiled to WebAssembly, not a native installation. Brotli transport encoding was decoded for static hosting. See https://zetaoffice.net and https://github.com/LibreOffice/core for the engine and source information. LibreOffice's COPYING file records its licensing and third-party components.
- ZetaJS: MIT, from https://github.com/allotropia/zetajs . `zetaHelper.ts` was compiled to ES2022 JavaScript; the helper source is included in `vendor-source`. The app's Office bridge is in `public/office`.
- Liberation Sans, Serif and Mono: SIL Open Font License 1.1. Unmodified fonts extracted from the bundled Office runtime. Source: https://github.com/liberationfonts/liberation-fonts
- ag-psd 31.0.2: MIT, from https://github.com/Agamnentzar/ag-psd . PSD read/write is limited by bide's raster-layer implementation; it is not Photoshop feature parity. pako and base64-js license copies are included.
- Fabric.js, React, React DOM, PDFKit, SVG-to-PDFKit, fflate, docx and Lucide: see the package lockfile and bundled license copies.
- @noble/hashes 1.8.0: MIT, from https://github.com/paulmillr/noble-hashes . SHA-256 fallback for PDF source integrity on HTTP intranet addresses; license included in `public/licenses`.
- draw.io 31.4.5: Apache-2.0, from https://github.com/jgraph/drawio/tree/v31.4.5 . Static browser assets extracted from the official `draw.war` release, pinned by SHA-256 in `public/diagrams/manifest.json`. No Java/server installation is used. `index.html` adds a policy restricting the iframe to local assets. bide appends its marked overrides to `PreConfig.js` and `PostConfig.js` to disable remote integrations, forward Ctrl+K, select the light theme and load the local white/blue stylesheet at `public/diagrams/theme.css`. The Apache license is in `public/licenses/drawio-LICENSE.txt`; upstream asset licenses remain in the bundled `img`, `shapes`, `stencils`, `templates`, and `js/libavoid-js` directories. Shape-library trademarks belong to their respective owners. Build with `npm run assets:diagrams`; prebuilt runtime files are shipped in `site/diagrams/runtime`.

`public/office/manifest.json` records exact hashes and sizes of the Office runtime and wrapper files used by this build. The runtime's upstream `latest` URL can change; the delivered files are pinned by that manifest. Keep the matching runtime and metadata together when updating.

The source bundle accompanies this local handoff. Public or commercial redistribution must follow the upstream licenses, including MuPDF's AGPL or commercial terms. The GitHub repository contains application source, lockfiles and the asset manifests/bootstrap. Large Office and draw.io runtime assets are included in the prebuilt release ZIP, rather than Git history.

- Tesseract.js 6.0.1 and tesseract.js-core: Apache-2.0; bundled local OCR worker and WASM. See public/licenses/tesseract-LICENSE.txt and tesseract-core-LICENSE.txt. English and French tessdata is packaged from @tesseract.js-data/eng and @tesseract.js-data/fra 1.0.0 (package MIT; trained data from the Tesseract project). OCR runs locally; no third-party OCR service receives documents.

- Carlito and Caladea: SIL Open Font License 1.1, unmodified static TTFs from https://github.com/google/fonts/tree/main/ofl/carlito and https://github.com/google/fonts/tree/main/ofl/caladea . License copies are bundled in public/licenses.
