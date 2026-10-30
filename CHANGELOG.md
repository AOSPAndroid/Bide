# Changelog

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
