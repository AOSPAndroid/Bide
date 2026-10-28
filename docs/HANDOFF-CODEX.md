# Handoff to Codex: phones and the open → edit → download flow

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
- Digital PDFs are edited in place, in their own font. Tapping a PDF field opens the New text dialog; Apply rewrites the line's own text operators (Tj/TJ/'/") with the font's own codes and the producer's kerning, verifies the result (new glyphs where predicted, every other character and every pixel outside the line unchanged) and reloads the page. Against regenerated invented documents at 144 dpi: pdf-lib Helvetica 4,091 → 0 differing pixels, a pdfkit subset 942 → 0, a Chromium-printed invoice 2,383 → 0; right-aligned amounts keep their right edge. Characters the font cannot draw, Type 3 fonts, shared forms etc. fall back to a text box with the reason in the toast; that text box uses a metric-compatible face (Liberation Sans for Helvetica/Arial, Liberation Serif for Times, Carlito, Caladea). (`src/pdf-content.ts`, `src/browser/pdf-inplace.ts`, `replacePdfText`; `tests/e2e/pdf-text-inplace.e2e.mjs`.)
- OCR measured field by field, on 490 invented fields:
  - fully right fields: 418 → 425;
  - fields split into several taps: 8 → 1.

  The changes behind this:
  - phone and reference numbers stay one field;
  - tilts of 0.2–0.5° are straightened;
  - unsure lines are re-read;
  - photos are read at 3600 px.

  Typographic marks are judged from their own ink: ’, − before amounts, – (which the recognizer lacks: "10–12" read as "1012") and —; exact text 447 → 463 of 490, fields wrong only by typography 22 → 6. Unread symbols such as ★ keep a letter cell, so a letter edit keeps their pixels; a coloured badge next to a label is its own field. (`src/ocr-typography.ts`; `tests/e2e/ocr-typography.e2e.mjs`.)

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
  - a pinch whose second finger lands late leaves nothing behind, including with the mask brush.
- Chrome:
  - phones get a grouped tool rail (one button per group, a flyout for the rest) that never scrolls; desktop and tablets keep the full rail (`src/ToolRail.tsx`);
  - the command palette opens without raising the keyboard on touch;
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
  - redact matches in context, now at every size;
  - single-page exports are named as the file they save on touch ("PNG image", not "· ZIP");
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

1. `npm test`: 262 unit tests, 256 pass, 6 platform skips.
2. `npm run test:e2e`: 31 browser test files, 93 tests, all passing on the branch head. The new ones:
   - `edit-flow`: live fields, Undo, Rescan, the Helvetica fallback, the scanner text layer;
   - `tilted-edit`: original-letter edits on a tilted photo, a tilted scan and two angled sheets;
   - `pdf-text-inplace`: in-place PDF text on pdf-lib, pdfkit and Chromium PDFs;
   - `ocr-typography`: ’ − – and a ★ kept through a letter edit;
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
   6. Open a digital PDF invoice, change an amount and download: the amount is in the PDF's own font (select it in a viewer: it is real text, not a layer).
   7. On a phone, the tool rail fits the screen without scrolling.

## 4. Not done yet (do not assume it is)

- In-place PDF edits keep a centred line's start, not its centre.
- Original letters only reuse the edited line's own letters (your rule): an edit needing a character the line lacks is refused. Borrowing from matching lines on the page is not built.
- Small table digits can have misaligned letter cells, so a letter edit there may drop a neighbouring comma; Proofread still lists such fields.
- veraPDF was not run on the Factur-X PDFs.

Privacy: never commit anything from `tests/real/` (private user documents; git-ignored). All test documents are invented.
