# Handoff to Codex: phones and the open → edit → download flow

**Current update (for the next merge).** `main` already has everything through `004ccf5` (your merges 8e99a5b, f496efa, 30ff666). What is left on `claude/lucid-fermat-jvmf9l`: the OCR typography work (`eb9418a`, `4d016f3`), clearer original-letter refusals (`ec39302`), the font-edit colour fix, the typewriter (Courier) PDF work and the same-family PDF fallback (below), and this note. The branch already contains `main` up to 757f630, so the merge has no conflicts:

```
git fetch origin && git merge origin/claude/lucid-fermat-jvmf9l
```

- Typographic marks are judged from their own ink: ’, − before amounts, – (the recognizer has no en dash: "10–12" read as "1012") and —. On 490 invented fields: exact text 447 → 463, fields wrong only by typography 22 → 6, no field that was right broken. Unread symbols such as ★ keep a letter cell, so an original-letters edit keeps their pixels (the line's own pixels, per your rule). A coloured badge next to a label ("Livret A" + "NOUVEAU") is its own field. Files: new `src/ocr-typography.ts` (run at the end of `recognizeLevel`), `glyph-edit.ts` (`UNREAD` placeholder cells, `withUnread`), `browser/ocr.ts` (`wordBackground`, `splitAtBackgrounds`, `typesetRegions`), `detected-text.ts` `glyphEditPatch`, `ocr-segmentation.ts`, one line in `ai-tools.ts`, `doubtfulLetters` and `ocrMatchRect` skip placeholders. Tests: `tests/ocr-typography.test.mjs`, `tests/e2e/ocr-typography.e2e.mjs`.
- Refused original-letter edits (your rule is unchanged) now say why inside the edit dialog: which characters the line lacks ("“5” does not appear in this line, and only its own letters are reused") or that it has no letter positions. The typed text stays, and a **Use a font for this edit** button sets that one line in the OCR font as an explicit choice. Find & replace and Proofread keep the error box, with the reason added. (`letterEditBlocker`/`missingLetters`, `LetteringError` in `ocr-replace.ts`; `tests/e2e/ocr-replace.e2e.mjs` was updated for the in-dialog refusal, and `edit-flow` covers the font button.)
- A line set in a font (Use a font for this edit, or New font) came out lighter than the original ink: grey #4d4d4d became #565656. `applyOcrAppearance` takes the fill from `matchedInkColor(region.color, background, fit.gain)`, and `fit.gain` was the least-squares gain of the shape fit, which shrinks whenever the new letters do not overlap the old ones exactly. The gain is now `coreGain` (`src/ocr-appearance.ts`), the ratio of the darkest pixels of the original and of the render at the chosen placement, computed once per sample. On invented 200 dpi pages, #000000, #333333, #4d4d4d and #777777 come out exact. Original-letters edits are not affected (they reuse pixels). Tests: `tests/ocr-appearance.test.mjs` (`coreGain`), `tests/e2e/edit-flow.e2e.mjs` (grey ink, fails on the old code).
- Typewriter-style PDF text, from invented parcel slips (pdf-lib standard Courier, pdfkit and Chromium subsets of FreeMono):
  - `pdf-inplace.ts`: an unseen letter pair no longer refuses when the font is monospaced (every used and new code has one width) and no pair in that font on the page is adjusted. Standard Courier "LYON" → "LYON CEDEX" is now in place, identical to the regenerated slip.
  - `text-regions.ts` `fallbackFont`: Courier, Nimbus Mono and FreeMono map to Cutive Mono, or Courier Prime when the name is bold, instead of Cousine. `fallbackCharSpacing` sets Cutive Mono (0.6055 em per character) onto Courier's 0.6 em. Mean ink per glyph: FreeMono 0.068 em², Cutive Mono 0.073, Courier Prime 0.116, Cousine 0.131. Both fonts are OFL, converted from @fontsource WOFF to TTF with fontTools (`THIRD_PARTY.md`, `public/licenses`).
  - `detected-text.ts` `fitOneLine`: a text box for a longer value widens instead of wrapping by letter (`splitByGrapheme`) onto the next line. It is used by the PDF New font text box and by image text set in a font (`ocr-replace.ts`).
  - `App.tsx` `editPdfText`: a refused in-place edit sets `textEditRefusal` (shown in the dialog) instead of `fail(...)`. `pdf-text-inplace` d and `edit-flow` were updated for that.
  - `ocr-regions.ts` `fieldBox`: the 8 × 10 px minimum tap target grows evenly around the line; it grew downward from the line's top, overlapping the next line when zoomed out.
  - Tests: `pdf-text-inplace` g and h (both fail on the old code), `ocr-regions.test.mjs`, `text-weight.test.mjs`, `browser-engine.test.mjs`.
- PDF New font text box in the PDF's own family and weight. On an invented receipt, a Roboto Light merchant line (its subset holds only that word's letters) became Liberation Sans Regular; now Roboto Light, identical to the regenerated receipt (`pdf-text-inplace` i, fails on the old code).
  - `text-regions.ts` `fallbackFont(name, families)`: the longest bundled family whose name prefixes the PDF font name, followed only by style words; then its "Light", "Medium" or "SemiBold" family when bundled. Otherwise the existing metric-compatible rules. `detected-text.ts` passes `bundledFonts`.
  - `src/font-weights.ts` (21 faces in `src/browser/fonts/weights`): each weight is its own family ("Roboto Light", Regular face), so canvas text and `svg-pdf.ts` export pick it by family with no change. Its bold flag is dropped (MuPDF reports SemiBold as bold). Lato left out (its license reserves the name for unmodified fonts).
  - `detectedTextbox`: a PDF text box is placed with Fabric's own first-baseline offset (`_fontSizeMult × (1 − _fontSizeFraction)`, 0.879 em) and half its stroke width, instead of 0.93 em. OCR placement is unchanged (the appearance fit sets it).
- Verified on the branch head before this merge of main: `npm test` 262 tests, 256 pass, 6 Windows-only skips; `npm run test:e2e` 31 files, 93 tests, all pass; `npm run bench:ocr -- ai`: 1.0% line error, 97.2% words found, 98.1% right. Rerun them after merging.
- **Please check:** your benchmark on main (1.217% / 96.28% / 97.31%) is below ours on the same OCR code (1.0% / 97.2% / 98.1%), with the same model files (sha256 of ppocr-det, ppocr-latin-rec, ppocr-det-server, doc-ori and uvdoc match your manifest). Ours runs on WebAssembly with 4 threads (no GPU here). `src/browser/ai.worker.ts` uses WebGPU whenever `navigator.gpu` exists: if your run used WebGPU, run the benchmark once with WebGPU off (force the `wasm` backend) and compare. If WebGPU reads worse, hosted users with a GPU get the lower accuracy, and the AI OCR should use the wasm backend (or WebGPU only for LaMa/ESRGAN).
- Known limits: on a soft scan (blur about 1.4 px at 200 dpi), a regular line set in a font can come out bold, about 40% more ink than the original. `estimateOcrBold` blurs its reference letters by `region.blur`, and `blurFromEdgeWidth` reads only about 0.6 of a canvas blur's radius (0 at 0.5 px), so blurred regular strokes look bold. Rescaling the reference blur alone flipped bold lines to regular; fitting the edited line in both weights fixed one of two invented pages but added 1.2 to 7 s per edit, so neither was kept. Original-letters edits are not affected. In-place PDF edits keep a centred line's start, not its centre; small table digits can have misaligned letter cells (a letter edit of "4,8" → "5,8" lost its comma in one invented case); on a page with a clear ’, a deliberately straight ' after a letter also becomes ’.

`main` (9e37c66) already has the OCR, scanned-PDF and pinch-zoom work up to 6be8fcf, and your original-letters rule. Everything below is on `claude/lucid-fermat-jvmf9l` and not on `main` yet.

## 1. Merge

The branch already contains `main` up to 9e37c66 (merged in efd2f13; the conflicts in `App.tsx`, `ocr-replace.ts` and `TextEditDialogs.tsx` were resolved keeping your rule). If `main` has not moved since, the merge is a fast-forward:

```
git fetch origin && git merge origin/claude/lucid-fermat-jvmf9l
```

Merge the whole branch: the phone fixes depend on each other and on their tests.

## 2. What it brings

The owner's target flow: open a file → it is scanned with the best method, no settings to touch → zoom and tap the fields to change → download the same file.

**The flow**
- After an edit, the other fields stay tappable at once. A rescan used to take 4 to 8 s, and on a scanned PDF it read the old digits again. Editing a field again starts from the page's original letters. Undo and Redo bring their fields back without a rescan. Fields appear before the font is matched. (`App.tsx`: `keptRegions`, keyed by the page's layer list; `ocr-regions.ts`: `regionsAfterEdit`.)
- A page opened from a PNG, JPEG or WebP downloads by default as the same kind of file, at its own pixel size: untouched PNG pixels are identical and transparency is kept. It used to download as a PDF, or as a ZIP of 144 dpi renders. (`src/image-export.ts`; `Page.file`.)
- Scanned PDFs with the scanner's own invisible text layer: in the download, the old words under each edit are removed from that layer and the new text is written invisibly, so search and copy give the new amount. (`pdf-core.ts`: `hideEditedText`; `PageSpec.edits`.)
- Digital PDFs: when the PDF's own font cannot draw the new text, the line uses a metric-compatible face: Liberation Sans for Helvetica/Arial, Liberation Serif for Times, Carlito, Caladea. It used to be Lato for every sans font, which differed about 4 times more. (`text-regions.ts`: `fallbackFont`.)
- OCR measured field by field, on 490 invented fields:
  - fully right fields: 418 → 425;
  - fields split into several taps: 8 → 1.

  The changes behind this:
  - phone and reference numbers stay one field;
  - tilts of 0.2–0.5° are straightened;
  - unsure lines are re-read;
  - photos are read at 3600 px.

  Fields to check are flagged with a reason (IBAN check digits, impossible dates, SIREN/SIRET checksums, amount grouping, AI confidence < 93, unsure letters): 14 of the 23 still misread are flagged, with 6.6% false flags. Proofread lists them first. (`src/ocr-checks.ts`.)

- Tilted scans and phone photos keep their letter cells (as a level box turned with the line, `TextRegion.angle`), so "Original letters" works on them: invoice photo 0/38 → 38/38 regions with letters, an angled sheet 0/35 → 35/35. Level pages are byte-identical to before. (`browser/ocr.ts`, `detected-text.ts` `glyphEditPatch`/`levelRaster`, one `transform` on the overlay buttons in `App.tsx`; `tests/e2e/tilted-edit.e2e.mjs`.)
- Your rule from 9e37c66 is merged and kept: Original letters only reuses the edited line's own pixels, a refused edit changes nothing, and a font needs New font. The live-fields code follows it (a refused re-edit puts the earlier edit back).

**Phones and tablets** (60 audited findings; details in `FEATURES.md`, "Unreleased — Phones and tablets")
- The interface never pinch-zooms (`index.html` `maximum-scale=1`, `mobile-shell.css`, `main.tsx`).
- Canvas:
  - tap to edit small text;
  - the page stays visible at any zoom (`canvas-backing.ts`);
  - one-finger scroll;
  - long press opens the layer menu;
  - a pinch whose second finger lands late leaves nothing behind.
- Chrome:
  - workspace names under the icons, and phones start on the PDF tools home;
  - landscape phones fit the screen, no sticky hover on touch, Add to Home Screen icons;
  - Menu sheet;
  - 44 px targets;
  - the OCR bar folds behind More, and its settings sheet has a Done button;
  - drawers;
  - Clone/Heal source by tap.
- Dialogs:
  - signatures keep their shape;
  - sticky dialog actions;
  - touch warp handles;
  - redact matches in context;
  - Organize pages by touch;
  - a single page saves as the file itself (and via the share sheet).
- Documents:
  - the iPhone date-field overlap is fixed;
  - a summary bar with the total, the checks and Issue;
  - 16 px fields;
  - delete with Undo;
  - system Back returns to the list;
  - phone keyboards for SIREN/IBAN/postcode.
- The phone CSS lives in `src/mobile-{canvas,chrome,dialogs,documents,shell}.css` only, inside phone and touch media queries. Desktop screenshots were pixel-compared before and after.

## 3. Verify before deploying

1. `npm test`: 243 unit tests, 237 pass, 6 platform skips.
2. `npm run test:e2e`: 29 browser test files. The new ones:
   - `edit-flow`: live fields, Undo, Rescan, the Helvetica fallback, the scanner text layer;
   - `tilted-edit`: original-letter edits on a tilted photo, a tilted scan and two angled sheets;
   - `image-download`;
   - `invoice-layout`;
   - `mobile-canvas`, `mobile-chrome`, `mobile-dialogs`, `mobile-documents`, `mobile-shell`;
   - `touch`.
3. `npm run bench:ocr -- ai`: line error rate 1.0%, words found 97.2%, words right 98.1%. A drop means part of the OCR chain was lost in the merge.
4. On the deployed site:
   1. On a phone, open the invoice editor: the date fields sit in their columns.
   2. Pinch on the top bar: nothing zooms.
   3. Open `tests/fixtures/scanned-quote-ocr-layer.pdf` and change "1 947,80" to "1 974,80 €". The next amount can be tapped at once.
   4. Download the PDF and search it: you find 1 974,80, not 1 947,80.
   5. Open a PNG, edit a line and download it: you get a PNG of the same size.

## 4. Not done yet (do not assume it is)

- Native PDF in-place editing was subsequently implemented in `c1519a8` / `30b0fc9` and integrated below. Unsupported fonts, glyphs, layouts or uncertain new letter-pair spacing still require refusal or an explicit replacement-font choice.
- Typographic ’ − – — and unread symbols: done on the branch (see the current update at the top).
- veraPDF was not run on the Factur-X PDFs.

Privacy: never commit anything from `tests/real/` (private user documents; git-ignored). All test documents are invented.

## Codex integration — 2026-10-28

- The whole branch through `cf52f68` was merged into main in `8e99a5b`, without cherry-picking or merge conflicts. The pinned model downloader, authenticated model source, SHA checks, all model entries and the AI OCR default were retained.
- Scanner-text downloads now remove the whole old OCR field, even when the visible edit patch covers only a changed suffix. The download regression compares every extracted token, including unchanged neighbouring text, and covers deletion.
- Explicit Export PDF and Protect PDF commands still select PDF; the general download button keeps the new same-kind image default.
- Font fidelity takes priority over making an edit succeed: scans reuse only their own line's pixels. Native PDF text requires a usable original embedded font unless the user explicitly chooses New font. Newly typed characters missing from an embedded font are kept with an error; export is blocked until the user removes them or explicitly chooses another font. No automatic substitute is allowed at download time.
- The native PDF rewrite was unbuilt at this earlier integration; the subsequent native PDF integration below addresses that gap. A metric-compatible replacement remains available through an explicit New font choice.
- On all four tilted fixtures, the edited line was measured at 300% both before and after editing. Edge-width changes were -0.24%, -8.67%, +2.44% and +2.32%; the comparison with a different reference line can otherwise suggest blur that was already present in the edited line. Existing pixel, angle, size and sharpness assertions were retained.
- Final validation: 244 unit tests, 238 passed and six existing Windows-only platform skips; all 79 browser cases across the 29 files passed in partitions, including the new native-font guard case. No browser case was skipped or disabled. Three phone OCR settings cases also passed again after the font guard.
- `npm run bench:ocr -- tesseract ai` completed all 17 pages for each engine. AI: 1.2170% line character error, 96.2760% words found, 97.3113% right; Tesseract: 12.1440%, 81.0209%, 91.1600%. Both AI angle pages found and correctly read all words. All AI outputs matched the earlier AI-only run; font safeguards do not alter recognition. These recognition scores do not measure the appearance of an edit; the image-patch and 300% checks above do.

## Native PDF integration — 2026-10-28

- The whole branch through `6c8d676` is integrated with the preceding original-letter, scanner-text, export and licence safeguards. The native editor changes PDF text operators in their original font instead of rasterizing or substituting a font.
- Default Apply never falls back automatically. If the edit is unsafe, the PDF and typed input stay intact. New font text box gives explicit consent for that field and uses the current typed text without changing the global mode; global New font remains available too. Existing text layers still keep unsupported typed input and block download until repaired or a new font is chosen.
- Shared content checks follow other pages and annotation appearances, including nested Forms; incomplete depth/work checks refuse. This prevents an edit on one page from changing another page through shared objects.
- New adjacent letter pairs require observed spacing in the same font. A PDF does not necessarily retain the producer's complete kerning tables; defaulting unseen pairs to zero produced visible spacing errors for AV and To. Those edits now refuse atomically. Numeric edits use original glyph advances and observed spacing, and successful reference comparisons are measured separately; they are not a universal guarantee for arbitrary text or producer typography.
- Preserve every pixel-reference assertion and compare original font resources, embedded font-program bytes and ToUnicode maps in the PDF download. No private document belongs in the source tree or public build.
- Validation for this integration: 263 unit tests, 257 passed and six existing Windows-only skips. All nine native-PDF/edit-flow browser cases passed; the Helvetica, pdfkit, Chromium and wider right-aligned examples each had zero differing pixels at 144 dpi, with unchanged original font programs and Unicode maps. The build and discovery checks passed.
- The 17-page benchmark ran with both Tesseract and AI. All 34 recognized outputs were identical to the preceding integration. AI: 1.2170% character error, 96.2760% words found, 97.3113% right; Tesseract: 12.1440%, 81.0209%, 91.1600%. Recognition scores are separate from the font and rendered-edit checks.

## Phone and desktop follow-up — 2026-10-28

- The whole additional branch batch through `004ccf5` is included: grouped phone tool rail with keyboard/accessibility support, mask-brush rollback on a late second finger, a touch palette that does not raise the keyboard until tapped, single-file export labels and desktop redaction previews with surrounding words.
- The original-font and scanned-text safeguards remain. Explicit Export PDF and Protect PDF still select PDF, while the general image download keeps its original-format default.
- Export labels count selected page entries, including duplicates. A range such as `1,1` exports two pages and must say ZIP; deduplicating the range for labels incorrectly promised a single file. The new mobile regression preserves the original single-page, multi-page, range and desktop assertions.
- The additional batch was merged in an isolated checkout so its source changes could not reload the native PDF tests already running. Affected UI tests are rechecked on the final batch; no test is disabled to obtain a pass.
- Merge commits: `f496efa` brings in the native PDF branch through `6c8d676`; `30ff666` brings in the entire subsequent branch batch through `004ccf5`. Only `App.tsx` required a manual merge conflict resolution: retain native in-place editing together with the strict original-font guard and explicit per-field replacement-font consent. The additional UI batch merged cleanly.
- Model loading still tries the local pack, then `VITE_MODEL_BASE` only when configured (with bearer licence), then pinned Hugging Face for the public demo. Every source and cached copy is SHA-256 checked; access denial is terminal. All 15 ONNX models, six recognition dictionaries, spelling dictionaries and seven Tesseract languages remain available. AI OCR and original-letter editing remain the defaults; recognition thresholds were not changed.
- Extra landscape checks found clipped grouped tools at 740 px and on narrower phones. The compact rail keeps 44 px targets in two columns at 740 px and three columns on narrow landscape phones, with the page tabs beside the canvas zoom controls. Regressions cover 390×844, 360×740, 844×390, 740×360, 740×390, 568×320 and 600×360, all 21 tools, canvas space, flyout bounds and footer reachability without overlaps. The outside-tap check measures a real uncovered scrim point and still asserts dismissal without drawing a layer.
- Production checks additionally caught the demo notice consuming enough height to clip Color at 844×390 and Clone/Color at 568×320. The compact two-column rule now covers the full coarse-pointer landscape range, and narrow landscape removes only the rail's eight vertical padding pixels. A separate demo-mode regression checks all seven viewports with the actual notice both visible and dismissed, including 44 px targets, hit testing, footer overlap and rail/canvas bounds.
- Hosted native-PDF checks on three invented producers retained the original font programs and Unicode maps and had zero differing pixels from regenerated references at 144 dpi. The scanner fixture kept original-letter pixels, removed the old searchable value completely, and matched the comparison line's 300% edge width within 0.01%; the PNG download retained its dimensions with zero changed pixels outside its edited field. Private input and private validation artifacts are excluded from the source and public build.
- The hosted site and downloadable edition have separate delivery paths. Download bide follows the latest published stable release (`v0.8.16`, source `8cf3008` when checked); no new release was published or existing release replaced for this integration. The subscription/paywall rules remain unchanged.
- Final pre-deployment verification: 257 unit tests passed, with six existing Windows-only platform skips (263 total). All 98 unique browser cases across the 30 configured files passed in partitions; no browser test was skipped or disabled. The native integration's full 84-case coverage was followed by all nine affected desktop cases and all 45 affected mobile cases for the subsequent Claude batch. The landscape fixes passed another 15 focused cases, including the four new permanent landscape regressions and the three rail layouts' keyboard behavior. The public-demo follow-up then passed six focused cases, including all 14 notice/layout states in the new permanent demo regression. The build and discovery checks passed. OCR benchmark outputs remain identical for all 17 pages in each of the two engines; the detailed recognition and rendered-PDF results above remain applicable.
