# Real screenshots (local only)

Put your own screenshots here to check OCR and text editing on real images.
Images and results stay on your computer: everything in this folder except
this README and `example.json` is ignored by Git.

For each image `NAME.png` (or `.jpg`), add `NAME.json`:

```json
{
  "contains": ["Nom du client: Daliil REDOUANE"],
  "edits": [{"find": "Daliil", "replace": "Dalil", "letters": true}]
}
```

- `contains`: text that must be read exactly (as part of one detected line).
- `edits`: find & replace steps run in the editor. `letters: true` requires
  the edit to use the image's own letters (not the OCR font).

Run `npm run test:real`. Each image gets a pass/fail line, and before/after
crops of every edited line are written to `tests/real/out/` for a visual check.
