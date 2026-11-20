# Changelog

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
