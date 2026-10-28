# Handoff to Codex: bring the live site to parity

The live demo (bide-demo.daaalil.chatgpt.site) runs the AI OCR (PaddleOCR PP-OCRv5) with your verified Hugging Face model downloads (`src/browser/ai-models.ts`, `public/ai/manifest.json`). It was built from a merge of `claude/lucid-fermat-jvmf9l` that reached the Documents and e-invoice work (27 October). Commits made on that branch after that point are not live yet.

## 1. What to merge

Merge `origin/claude/lucid-fermat-jvmf9l` into your branch. Merge the whole branch rather than cherry-picking: the OCR changes depend on each other and on their tests.

Not on the live site yet (newest first):

| Commit | What it does | Files you also changed |
|---|---|---|
| (mobile, see section 4) | Pinch-to-zoom and two-finger pan on the canvas, phone layout fixes | `src/App.tsx`, `src/theme.css` |
| `fa13933` | Scanned PDFs: the softness of replacement text is measured on a finer render (it was measured at 72 dpi, so a crisp scan got 0.4 pt of blur, now 0.12 pt) | `src/detected-text.ts` |
| `638549f` | "Download bide" follows `releases/latest` instead of a fixed version | `src/build-flags.ts` (the live site still links v0.8.14, which still has draw.io) |

Already live, and to be kept through the merge: angled-photo flattening, two-sided ink tilt measurement, the accent-aware CTC decoder, re-reading unsure lines, joining split line boxes, small-text enlargement, automatic script detection, the Documents workspace, invoice import, and OCR of scanned invoices.

### Conflicts to expect

- **`src/browser/ai.worker.ts`:** keep your `ai-models.ts` loader (pinned URLs, sha256, cache) for the website. This branch added a different path in `modelBytes()` for the iOS/Android apps: models missing from the app bundle are fetched from `VITE_MODEL_BASE` with the licence as a bearer token and cached in `bide-models`. Port that path into `ai-models.ts` as one more source, used only when `VITE_MODEL_BASE` is set:
  1. local file;
  2. then `VITE_MODEL_BASE` (apps);
  3. then your pinned Hugging Face URL (demo).

  Keep the sha256 check on all three.
- **`src/browser/ai.ts`:** keep your `PUBLIC_DEMO ? true : HEAD check` for `aiAvailable()`. Keep this branch's `remoteModels()` init fields (`remote`, `licence`).
- **`src/detected-text.ts`:** keep both sides. This branch only changed `matchedDetectedTextbox()` (PDF pages fit font/size/position at page scale, then call `matchOcrSoftness()` on a render with ~32 px letters).
- **`src/App.tsx`, `src/theme.css`:** additive on this branch: the touch gestures are wired after `new Canvas(...)`, and the CSS adds `.canvas-workspace {touch-action:none}` plus phone rules.

## 2. Make sure the best OCR is what users get

- Default engine: `defaultOcrSettings.engine` is `'paddle'` (`src/TextDetectionBar.tsx`). The editor only falls back to Tesseract when `aiReady` is false. On the live site the status bar must read "AI OCR (Latin languages)" after opening an image.
- Every model the OCR uses must be in your manifest:
  - `ppocr-det`, `ppocr-det-server` (High accuracy);
  - `ppocr-latin-rec`, plus `greek`, `cyrillic`, `arabic`, `korean`, `cjk`;
  - `doc-ori` (page orientation), `uvdoc` (flatten photographed page);
  - `realesr-general-x4v3`, `lama`, `isnet`, `sam-encoder`, `sam-decoder`.

  The dictionaries `public/ai/models/ppocr-*-dict.json` must be served next to the app. I checked the live site on 28 October and all of these were present.
- Keep the spelling dictionaries (`public/ocr/spell/*.dic`) and the Tesseract language files: Tesseract is still the fallback and the "thorough" pass.

## 3. How to verify before deploying

Run these on your merged branch:

1. `npm test`: unit tests, 173 at the time of writing, all passing.
2. `npm run test:e2e`: browser tests, 25 at the time of writing. The OCR ones are `ocr-replace`, `ocr-appearance`, `ai`, `alphabets`, `straighten`, `searchable`, `proofread`, `pdf-scan-softness` and `invoices`. The phone ones are `touch` and `invoices` at 390 px.
3. `npm run bench:ocr -- tesseract ai`: the OCR benchmark (17 invented pages). Expected on this branch:

   | Engine | Line error rate | Words found | Words right |
   |---|---|---|---|
   | AI | 1.1% | 96.9% | 97.8% |
   | Tesseract | 11.4% | 83.0% | 91.6% |

   Pages to watch: `letter-angle` and `invoice-angle` at 100% words found (sheet flattening), `invoice-photo` at about 87.5%. A drop on these means a piece of the OCR chain was lost in the merge.
4. On the deployed site (a phone and a desktop):
   1. Open an image of text: the status bar says "AI OCR".
   2. Open a scanned PDF and convert a line to text: the new text is not visibly blurrier than the page.
   3. Photograph a sheet on a desk at an angle: the Straighten hint offers to flatten it.
   4. On a phone, pinch zooms the page (not the toolbars), and two fingers pan it.

## 4. Mobile (this branch, 28 October)

See the "Phones" entries in `FEATURES.md` and `tests/e2e/touch.e2e.mjs`:
- two fingers pinch-zoom around their midpoint and pan at the same time;
- one finger keeps working the current tool, and a pinch never draws or moves anything;
- one finger on the grey margin scrolls;
- the hand and zoom tools work with touch;
- the browser's own page zoom is blocked over the canvas only.

## 5. Not done yet (do not assume it is)

- Scanned PDFs with an invisible OCR text layer ("GlyphLessFont", added by scanners): bide uses that layer as the page's real text. It can be misplaced and has no font to match. Better: detect GlyphLessFont text and run bide's own OCR on the image instead.
- The PDF/A-3 conformance of the Factur-X PDFs has not been checked with veraPDF.
- A new GitHub release is needed before "Download bide" serves the version without draw.io. Note that the owner chose closed source with a subscription: confirm with them before publishing a free ZIP.

Privacy: never commit anything from `tests/real/` (private user documents; git-ignored).
