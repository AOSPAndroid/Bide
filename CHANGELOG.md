# Changelog

## 2026-11-22 — Your fonts and on-demand open fonts

- Merge the complete Claude branch through `57fc922`, including font uploads, on-demand matching and the new flyer/poster appearance fixtures.
- Add local TTF, OTF, WOFF and WOFF2 files from File → Add font files or OCR settings. Uploaded fonts remain in this browser, appear in font lists and are considered when matching scanned text.
- Serve Claude’s full index of 1,817 open font families. Download shortlisted families only when needed, using pinned revisions, exact sizes and SHA-256 checks; the downloadable app keeps its offline default.
- Use Claude’s corrected ink-based index and expanded shortlist, preserving the existing bundled fonts and their appearance safeguards.
- Preserve downloaded and uploaded fonts across reloads, protect existing font names, and require a saved custom font before rendering or exporting its text. Original letters remain the default and replacement fonts still require an explicit choice.
- Keep the previous font-weight, spacing, sharpness and model-delivery safeguards while expanding font choices.

## 2026-11-22 — Editor-first interface and clearer phone flow

- Merge the complete Claude branch through `b6bf947`: open directly in the Photo editor on the web and phones; links to individual PDF tools still open those tools.
- Add a first-use welcome card with Open a file and Explore the example, a short text-editing guide and plainer edit-dialog wording.
- Open imported scans, photos and PDFs at a readable width from the top of the page. Keep manual Fit page and Ctrl+0 consistent with the existing whole-page fit.
- Give phone pages more vertical space and show a one-time hint to tap recognized text. Keep font and size controls visible when a text box is selected.
- Keep Undo and Redo clicks made while an edited page reloads, applying them when the canvas is ready.
- Preserve original-letter defaults, explicit replacement-font choices, page-loading guards, selected-area reading and all verified OCR/model delivery assets.

## 2026-11-22 — Reliable hosted AI model delivery

- Serve the existing, verified LaMa model directly from the hosted site in 21 files no larger than 5 MiB. This avoids the observed timeout downloading the larger upstream model during AI background edits.
- Validate the prepared model against its existing size and SHA-256 before packaging; keep runtime integrity checks, local-first loading and the pinned external fallback.
- Retain every OCR and AI model, dictionary, editing default and subscription boundary. Include the model licence and preparation notice with the hosted assets.

## 2026-11-22 — Broader font matching and proportional digits

- Render OCR samples, image downloads and scanned-PDF overlays in exact page coordinates, independent of editor zoom and pan. This prevents window-size-dependent resampling from changing font weight or sharpness.
- Keep later OCR text edits on one line in both the sidebar and canvas, preserving the chosen font, size and softness. Manual text boxes and intentional newlines retain their normal layout.
- Merge the full Claude branch through `226925b`, including `d0439d4` and `5a27dfe`.
- Rank explicit font edits against 60 bundled text families plus available system fonts; add display-serif candidates such as DM Serif Display and Playfair Display. All existing font assets remain available.
- Compare the current family's fitted stroke weight before switching faces, so a matching Light face is retained when a heavier alternative scores better on shape alone.
- Use measured digit geometry to distinguish proportional and tabular figures. Additional clearance guards protect short number runs and the preceding word when replacement digits become wider.
- Keep safe digit swaps in their original positions within each number group. Changes to the group's figure widths retain proportional reflow, avoiding collisions and wide gaps.
- Keep original-letter editing, explicit font consent, manual style choices and the previous font-weight and sharpness safeguards.


## 2026-11-21 — Original-letter spacing and crisp font fitting

- Merge the complete Claude branch through `5cac356`, including `dfe8624` and `35b18f4`.
- Position proportional original letters from their measured ink and observed gaps, improving spacing when inserting characters or moving words. Preserve the existing planner for intentional edge spaces, unreadable symbols and compact text deletions.
- Choose the automatic font weight before refining size and position for explicit font edits on crisp text, within the existing matched size by 1.5%. Soft text retains its previous fitting path.
- Add a local comparison kit that exports invented documents and references for manual editor comparisons. Failed, unread and unmeasured edits cannot count as successful comparisons.
- Measure edits of text recognized with a different apostrophe or dash, while preserving literal matching, whitespace handling and rejection of unchanged benchmark requests.
- Verify all 121 browser cases and 288 edit cases: eleven appearance improvements and no newly failing cases against the prior hosted revision. Original-letter edits remain the default; replacement fonts require explicit consent.

## 2026-11-21 — Crisp edits on low-resolution scanned PDFs

- Merge the complete Claude branch through `ed92f91` in `306554c`.
- For explicit New font edits, prevent short, crisp text on a low-resolution scanned PDF from being rendered unnecessarily soft and pale when the edge-width estimate is noisy. Added softness must also match the original letter shapes.
- Add 96 dpi screen-capture and scanned-PDF benchmark fixtures. Original-letter editing, explicit font consent, manual font/style choices and OCR defaults remain intact.

## 2026-11-21 — Hosted web integration

- Integrate the complete Claude branch through `3c441bc`, including the fixes for a clipped final letter, background fill on coloured or textured pages, and matching weights across verified lines.
- Improve original-letter placement and verified reuse across matching lines, ink colour, soft-text weight and explicit font rendering. Restore compatible GPU execution with CPU fallbacks.
- Add 18 display-weight faces alongside the previous 26 document-font assets. Auto style compares nearby weights and matching lines; explicit font/style choices remain intact.
- Restore **Read selected area → Read text → Copy text** on desktop and phones. Small PDF crops retain detail without rendering a whole large page; reading leaves the document and existing edits unchanged.
- Guard scan-density selection against invisible, clipped and ambiguous images while retaining the existing resolution and memory limits.
- Keep typed text and Cancel available while a page opens; Apply becomes available when the page is ready. Selected-area reading respects erasers, blend modes and the current page colour, and retains exact source pixels at fit-to-screen zoom.
- Verify that each edit-benchmark request actually changes its intended field, including collapsed or Unicode whitespace, before grading the exported result.

Original letters remain the default. A replacement font requires an explicit choice; the edit benchmark's combined letters/font result measures those two choices, not an automatic font fallback. Verification and remaining limits are recorded in [the integration handoff](docs/HANDOFF-CODEX.md).

## 2026-11-20 — Edits that match the page; AI on the graphics card

Historical branch measurements below predate the corrected field-request harness. Four earlier requests silently did nothing because whitespace differed; those results are retained as history, not the final hosted acceptance figures. The corrected 248-edit verification is recorded in the November 21 handoff.

Measured on 16 invented documents (an invoice, a letter, a parcel slip, a meter table, a booking screen) scanned clean, soft, tilted, at low resolution, as phone shots and as scanned PDFs, 215 edits typed and compared with the document regenerated with the new text (`npm run bench:edit`). In the default flow (the page's own letters, a font when they cannot make the edit): 146 → 207 edits with no visible difference, 56 → 4 visible, fields that could not be read 13 → 4.

- **The page's own letters** (166 of the 215 edits, 98% of them without a visible difference, against 92 and 81%):
  - A letter the line lacks is borrowed only from a line proven to be in the same lettering by its own pixels: the letters the two lines share must have the same shape and the same amount of ink. Bold, italic, another face or a size 8% larger do not pass. A table cell sharing no letter with the one that has the needed letter is linked through a third line ("4,8" → "5,8" takes its 5 from "1 205", verified through "1 482").
  - A digit for a digit is drawn exactly where the old one stood; text at one pitch keeps its grid; right-aligned amounts keep their right edge, and a new digit takes a digit's advance.
  - A letter keeps the soft fringe around it and the paper's grain, instead of a flat patch.
  - On a soft scan, letters whose ink runs together ("rm") are taken last: a cut through the blot could leave half an m ("18 nai" for "18 mai").
- **Text set in a font** is 6 times faster: matching a soft scan drew every candidate blur with the browser's blur filter (26 s for one line of a letter, up to 100 s on a 300 dpi PDF); the blur is now computed on the candidate's coverage. Median 1.6 s → 0.27 s per edit, slowest 100 s → 1.2 s.
- **Regular text on soft scans was set bold** (43 of 60 soft-scan font edits had the wrong weight): the weight came from ink over peak compared with references blurred by the scan's blur estimate, which reads about half the real blur. A line's weight is now decided by drawing its words in both weights at the scan's own blur and comparing the stroke cores and darkest pixels (all 60 right); a heavier face than the one chosen no longer reads as bold.
- **Text set in a font takes the original's weight**: cards, flyers and ads are set in light and heavy display weights. 18 are now bundled (Raleway ExtraLight to Black, Nunito Light to Black, Montserrat, Poppins and Inter ExtraBold and Black, Open Sans ExtraBold, Roboto Black), Raleway, Nunito and Poppins are among the faces a scan is matched with, and the matched family's other weights are tried, keeping the one whose ink is closest to the original's. Lines proven to be in the same lettering are matched together, so the lines of one list get one face and weight. On an invented tradesman's card (gradient, Raleway Light, Nunito ExtraBold): font edits 21% → 82% without a visible difference, default flow 15 → 26 of 33; a Roboto Light title is no longer set in Roboto Regular.
- **Faces outside the usual dozen**: a font edit is ranked against every bundled text face (63 families), and display serifs (DM Serif Display, Playfair Display…) are among the faces matched. An invented ticket's Manrope dates were set in Lora and its DM Serif Display title in Caladea bold: font edits there 6 → 23 of 30 without a visible difference; 17 better and none worse over all 316 font edits of the benchmark (median 0.6 → 1 s).
- **Digits of proportional faces** (Manrope, Raleway) are no longer drawn over their neighbours when changed with the page's own letters ("2031" → "2009"): a line's figures are judged tabular or proportional from the line itself.
- **Letters moved or inserted** are laid by their ink and the gaps the line shows, not by their cells (two words swapped, "1 " inserted).
- **A line set in a font that grew lost its last letter** ("Zin" for "Zinc"): Fabric wraps by slightly wider word widths than the line it measures, and the last letter went to a hidden second line. The box now widens until the text is one line.
- **Room left by a shorter line** in the page's own letters is filled with the paper just above and below it, so a gradient or picture behind the text carries on (it left a lighter smudge on a pink-to-purple card).
- **Text set in a font** (when the letters cannot make the edit; 60% → 89% without a visible difference): soft text is blurred at four times the page's resolution and drawn reduced (the browser's blur steps in whole pixels: at a picture's own size nothing under 0.8 px, then a 3 px box, so soft lines came out sharp or pale); on scanned PDFs it is fitted at the scan's own resolution and exported as pixels on the scan's grid (high-resolution scans 13 → 27 of 27, 200 dpi scans 13 → 22 of 26), and placed on the edited line's own letters rather than its neighbours' (edits 2-3 px off: 20 → 10). Regular text read as bold on soft scans remains the main fault.
- **Reading** (192 of 196 fields exactly, from 182): spaces the AI recognizer dropped on soft scans ("Le4 février") are put back from the ink; a decimal comma read as a full stop on small soft digits is corrected from the recognizer's second choice; a 0 or O between capitals and digits follows the page's own letters.
- **High accuracy OCR** read nothing on a scanned letter: small text is enlarged before reading, and on an enlarged scan the server detector took the paper's grain for text. It now finds lines at the page's own size (that page: 100% line errors → 0.4%; all 17 benchmark pages: 1.4%).
- **AI on the graphics card**: the hosted site never used it. ONNX Runtime's WebGPU build expected a runtime file the app does not ship, every WebGPU start failed, and every visitor ran the models on the CPU. Text detection, sharpening, background removal and page flattening now use the graphics card where WebGPU offers one. Each model was compared with the CPU (on a software WebGPU adapter): the same text on the hardest OCR pages, sharpening and flattening within one level, background removal on all but 0.2% of edge pixels. Object selection gave a wrong mask on WebGPU, and AI fill and the High accuracy detector do not run there, so they stay on the CPU, as do the text recognizers. A software adapter, offered where there is no usable graphics card, is not used: it was minutes per page slower.

## 2026-11-20 — Shared on the office network

- Text detection works for colleagues opening a shared bide at its network address. On plain HTTP the browser offers no `crypto.subtle`, and checking the AI models failed with "Text detection unavailable" for everyone except the hosting PC; the check now hashes in JavaScript there.
- The sharing server marks every file with its version (ETag, Last-Modified), so a return visit revalidates instead of downloading, and sends scripts, fonts and WebAssembly compressed (the ONNX runtime from 24 MB to under 6 MB, MuPDF from 10 MB to under 5 MB).
- A colleague's browser keeps the AI models it has used in its own storage, verified on every load: they are too large for a browser's HTTP cache, so each visit downloaded them again. One colleague, one scanned page: first visit 70 MB → 38 MB, later visits 54 MB → almost nothing, scan after a reload 8.6 s → 5.5 s (the hosting PC's speed).
- HOSTING.md explains the per-colleague Chrome/Edge setting that gives an HTTP address the capabilities of `localhost` (Office conversion, AI threads, GPU, reliable downloads) when HTTPS is not available.

## 2026-10-30 — Hosted web reliability

- Recover from an interrupted AI runtime download with Rescan, without reloading the page or losing the document. Failed runtimes are discarded; stale worker events cannot affect the replacement.
- Keep scanned-PDF edits sharp for larger text by cutting original letters at the PDF render density, within the existing page-size and memory limits. Image editing still uses the image's original pixels.

## 2026-10-30 — PDF lettering and editing

- Extend safe Courier/typewriter text in its original PDF font, including new letter pairs when the font's monospacing and spacing checks permit it.
- Improve explicit Courier replacements with Cutive Mono for regular text and Courier Prime for bold, with Courier-compatible character spacing.
- Match explicit PDF replacements to a bundled family and its Light, Medium or SemiBold weight. Add 21 weight faces across seven document families; the Source-derived weights use the distinct Bide Sans 3 names.
- Align replacement PDF text with its original baseline. Longer single-line PDF and OCR font edits widen their text box instead of wrapping onto the next line.
- Keep PDF refusal reasons inside the edit dialog and retain the typed value.
- Centre small-field tap targets on their actual text. When nearby targets overlap at low zoom, open the line nearest the tap's original text bounds; keyboard activation keeps the focused field.
- Preserve spacing safety for proportional fonts with equal-width letters; a font name or PDF fixed-pitch flag alone does not permit an unsafe edit.
- Refuse unsupported characters in bundled PDF replacement faces before altering the source. Later unsupported edits keep their text and font and block export, including styled text inside groups.
- Queue signature placement while the selected page is opening, retaining the drawn ink or typed name. Place once, preserve the original page objects, and cancel safely when the target changes or the dialog closes.
- Make quick taps on Place signature reliable, while ignoring drags and cancelled touches and retaining mouse and keyboard activation.

Original-letter editing remains the default. Replacement fonts still require explicit consent. All OCR models, dictionaries, integrity checks and recognition defaults are retained.

The new document-weight faces are upright; italic styles can be synthesized. Explicit replacement fonts can still look too bold on very soft scans. These limits do not change original-letter edits, which reuse the scan's own pixels.

This is a hosted update, not a new downloadable release. The existing release and subscription rules are unchanged. Verification details are recorded in [the integration handoff](docs/HANDOFF-CODEX.md).
