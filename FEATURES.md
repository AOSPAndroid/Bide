## Hosted update — preserve scanned lettering

- Original letters mode reuses pixels from the edited line. It never switches to an OCR font or borrows unverified lettering from another line or page. If it cannot reconstruct an edit, the original stays unchanged and the typed text remains available.
- New font remains an explicit choice. Find & replace and proofreading follow the same original-letter safeguard; an unsupported replacement does not silently change the page's typography.

## Unreleased — Open, edit, download

- Tilted scans and phone photos are edited with the page's own letters. A line on a page read straightened keeps its letter cells, as a level box turned with the line, and its tap target is drawn along the line. An edit is rebuilt on the page levelled the same way and turned back, so the new text keeps the line's angle, weight and baseline and changes only pixels inside the line's box (these lines had no letter cells, so every edit used a level font over a flat patch). Regions with letter cells: invoice photo (−2.5°) 0/38 → 38/38, scanned letter (1.2°) 0/9 → 9/9, poster photo 0/5 → 5/5. Tap targets cover the tilted ink: median 0.86–0.91 → 0.98–1.00. On the invoice photo, '2,203.20' → '2,302.20' stays bold and on its slant, changes no pixel outside the line, and is as sharp as the untouched lines (edge 8.8 vs 9.1 px at 300%) (`tests/e2e/tilted-edit.e2e.mjs`).
- Sheets photographed at an angle get the same edit: each line comes back from the flattened sheet as a box turned along the line, with its letter cells mapped along it (invoice at an angle 0/35 → 35/35, letter at an angle 0/9 → 9/9).
- With New font chosen, a tilted line is set turned, over a turned background patch, and the closest font is matched on level words (invoice photo: Carlito → Liberation Sans for an Arial page).
- Redaction boxes on a tilted line cover the turned letters (a level box missed part of the line's ink).
- Fields to check are flagged with their reason, and listed first in Proofread with an Edit button: an IBAN whose check digits fail, a date that does not exist, a SIREN or SIRET failing its checksum, an amount without the thousands space the page's other amounts use, an AI OCR confidence under 93 (70 for Tesseract) or a hard-to-read letter. Text is only checked, never changed. On the 490 invented fields, 14 of the 23 still misread are flagged (6 before), with 6.6% of the correct fields flagged.
- Fields stay tappable after an edit: only the edited field changes and shows its new text; the page is no longer reloaded and rescanned (the next field took 4 to 8 s to come back, and on a scanned PDF the rescan read the old digits again). Editing a field again starts from the page's original letters and replaces the earlier edit. Undo and Redo bring their fields back at once. The first fields appear before the font is matched. An explicit Rescan of a PDF page reads the edits drawn over it (`tests/e2e/edit-flow.e2e.mjs`).
- Digital PDFs: a line whose own font cannot draw the new text is set in a metric-compatible bundled face, so it keeps its width and look: Liberation Sans for Helvetica and Arial, Liberation Serif for Times, Carlito for Calibri, Caladea for Cambria (it was Lato for every sans, which differed about 4x more from the original). Fonts bundled by name (PT Sans, PT Serif, Poppins, Lato) are used as such.
- Scanned PDFs with the scanner's own invisible text layer: the downloaded PDF's searchable text follows the edits. The old words under each edit are removed from the layer (text only: the scan and drawings stay) and the new text written invisibly in their place, so search and copy give the new amount, not the old one; the rest of the scanner's text is kept.
- Pictures download as the same kind of file: a page opened from a PNG, JPEG or WebP exports by default as "Same as the original", at its own pixel size, instead of a PDF or a ZIP of 144 dpi renders. Untouched PNG pixels are identical and transparency is kept; a JPEG is re-encoded at quality 95 (`tests/e2e/image-download.e2e.mjs`).
- OCR, measured field by field on 490 invented fields (24 documents: scanned quotes as JPG and PDF with and without a scanner's text layer, a phone photo of a form, a banking screenshot, the 17 benchmark pages): fully right fields 418 → 425, fields split into several taps 8 → 1. Benchmark: words right 97.8% → 98.1%, found 96.9% → 97.2%, line errors 1.1% → 1.0%.
  - Phone numbers, cheque and reference numbers in monospace or digit text ("06 12 34 56 78", "n° 0004127") are one field: gaps are compared with the character pitch as well as the letter height.
  - Scans tilted by less than half a degree are straightened when their lines drift 6 px or more across the page (at 0.4° a long line drifted half its height and was misread).
  - Lines the AI is still unsure of after the wider re-read are read again with more and less room, stretched contrast, sharpened and 30% wider; the surest reading wins.
  - Photos and screenshots are read at up to 3600 px instead of 2400 px.
  - Measured and left off: High accuracy by default (8 fewer right fields, 5x slower), Tesseract voting, dictionary auto-correction (it turned Harbour into Barbour), the scanner's own OCR layer as a second opinion.

## Unreleased — Phones and tablets

- The interface never pinch-zooms: only the page does. A pinch on the toolbars, the tool rail, the zoom bar, the PDF home or a dialog used to zoom the whole app (up to 5x), with no way back once the fingers reached the canvas.
- Phones and tablets: tap a selected text box again to edit it where you tapped, even small one-line labels. Text boxes have no top/bottom stretch handles on touch screens, so dragging a label moves it. A new text box from the Text tool opens ready to type over "Your text".
- Phones and tablets: editing small text zooms in until the letters are readable (16 px) and scrolls the text above the on-screen keyboard; the app no longer shifts up when the keyboard opens.
- Phones and tablets: the page stays visible at any zoom, including 12 MP photos at 800%. The canvas lowers its pixel density instead of exceeding browser limits; exports are unaffected. Pinching is smooth: the page is scaled while the fingers move and redrawn once when they lift.
- Phones and tablets: one finger scrolls a zoomed page. To move a layer, tap it first, then drag.
- Phones and tablets: a pinch never leaves a stray brush stroke, shape or text box, and never moves the object under the first finger, even when the second finger lands late.
- Phones and tablets: a finger inside a small shape or label moves it; the larger handles resize it from just outside.
- Phones and tablets: a long press on a layer opens its menu (edit text, arrange, duplicate, lock, delete…), the same menu right-click opens.
- Phones and tablets: zoom buttons and tool buttons are 44 px finger targets. The tool rail shows a shadow while more tools are scrolled out of view. Pages open larger: an A4 page fills the width of a phone.
- **Phones: a Menu button** next to a labelled **Find a tool…** button opens File, Edit, Image, View, Layer, Select, Insert, Page, PDF and Help as a full-width sheet, one group at a time. Unavailable commands say why. On touch the command palette drops its keyboard hints and uses a 16px search field.
- **Phones: touch-sized chrome.** Header, file actions, tool rail, tool options and the bottom bar use 44px targets. The workspaces show their names (PHOTO, PDF, DOCS) and chrome text is at least 11px. The document name shares a row with the file actions and the empty status bar is gone, so the page gets about 36px more on an iPhone. Save project is in Menu › File and the Export dialog.
- **Phones: Pages and Properties sit in the bottom bar** next to the zoom, below the drawers they open, so the same button closes a drawer. A tap beside an open drawer closes it and no longer selects a layer underneath. The Properties drawer gives Layers and History half its height with 44px rows, and Design & layout wraps inside the panel instead of running off screen.
- **Phones: tool options** no longer repeat the zoom. Snap to page moved to Menu › View. The options bar and tool rail show edge shadows when they scroll.
- **OCR bar on phones**: Edit detected text, the status and a **More** button fit one row. More shows the full status plus Proofread, Find & replace, Convert all, OCR settings and Rescan. On tablets the bar wraps instead of covering the Properties panel. OCR settings chosen from the command palette no longer open the Properties drawer.
- **Clone Stamp and Healing Brush on touch screens**: **Set source** makes the next tap pick the spot to copy from (on by default when there is no source), and a cross marks it. Alt-click still works with a mouse.
- Invoice editor on iPhones: the date fields keep to their column. Safari drew them wider and taller than the other fields, over the next field, with the date centred (`tests/e2e/invoice-layout.e2e.mjs` checks every field at 320 to 430 px wide).
- **Documents on phones and tablets:** below 980 px a bar at the bottom of the invoice editor keeps the total (or amount due), "N to fix" (jumps to the next field to fix) and Issue in view; issued invoices offer their PDF there. It stays on screen in phone landscape too.
- Deleting a draft, a received invoice or a saved client can be undone from the toast for 6 s (all screen sizes); on touch screens Delete sits further from Duplicate.
- System Back (Android button, iOS swipe) closes the open invoice and returns to the list instead of leaving bide; Forward reopens it. Invoice changes are saved as soon as the page is hidden.
- Opening an invoice on a phone: the reading status floats at the bottom of the screen wherever the list is scrolled, and a second file cannot be started while one is read (no more duplicate drafts).
- Invoice editor on touch screens: 16 px field text (iOS no longer zooms in on each field), 44 px fields and buttons, 13–17 px labels, totals and checks, and the "VAT paid on invoicing" box next to its label. Lines show Remove beside the description and the line total on the right (4 rows on phones, 3 on tablets). Long descriptions, names and mentions wrap instead of being cut off, also on read-only invoices. On phones the VAT number, e-invoicing address and payment method take the whole row, SIREN and French postcodes open the number pad, IBAN/BIC/VAT numbers type in capitals without autocorrect, and only your own business details are offered for autofill (`tests/e2e/mobile-documents.e2e.mjs`).
- The toast fits a phone's width, sits low and no longer blocks taps on what is under it.
- **Phones and tablets, dialogs:** a dialog's buttons stay pinned to its bottom edge on phones and landscape phones, so Apply warp, Place signature, Export PDF and Crop are on screen without scrolling. In landscape the warp grid and signature pad shrink to fit, and scrolling a dialog no longer moves the page behind it.
- Drawn signatures keep their shape on phones: the pad's bitmap follows its displayed size and pixel ratio. Before, signatures came out 41-55% too wide. The placed image is trimmed to the ink. Only one finger or pen draws, so a second finger or a resting palm adds no stray lines and does not cut the stroke.
- Warp and Perspective on touch screens: a finger grabs the nearest handle within 24 px and drags it without a jump. Tall or wide layers no longer drift from the finger.
- Find & redact on phones and tablets shows each match with the words around it, wrapped, so an email, phone number or IBAN at the end of a long line is visible before redacting. **Redact** is a proper primary button.
- Organize pages opens the page strip on phones and tablets, with a finger-sized page menu (⋯) and touch wording instead of "right-click".
- Touch screens get 44 px close buttons, dialog buttons, option rows and colour swatches, and 40 px spelling suggestions. Checkbox explanations that desktop shows as tooltips are written out under the option. A notice toast no longer blocks taps.
- PDF to images and Split & extract on a touch screen save a single page as the PNG, JPEG, SVG or PDF itself, not a ZIP, and offer the system share sheet where the browser has one (Save Image, Files…). Desktop keeps the ZIP.
- PDF home on phones: no label under 11 px, no Ctrl O badge on touch screens, and 16 px text inputs in phone dialogs.
- The OCR bar folds its actions behind More but keeps the Straighten hint in view; on small tablets the bottom bar shows Pages and the page number beside the zoom; Properties section headers are touch-sized and Design & layout fits the inspector on any touch screen.
- **Phones and tablets:** the workspace switcher shows PHOTO, PDF and DOCS under its icons as 44px targets. Phones, upright or on their side, start on the PDF tools home in every edition.
- **Landscape phones:** the editor fits the screen instead of scrolling past its 570px desktop height. The status bar stays visible, and the Properties/Layers panel scrolls as one column.
- **Touch screens:** a tapped button no longer keeps its hover colour (an orange button turned pale and looked disabled, a tapped icon looked active); hover looks apply only where a real hover exists (src/touch-hover.ts).
- **Demo notice on phones:** the close button is 44px and the links 40px. The Windows download is not offered on touch screens, and in landscape the notice takes one line.
- **Subscription build on phones:** the trial-ended card wraps long email addresses instead of running off the screen; sign-in cards scroll when taller than the screen (landscape, keyboard open); the account pill is 40px tall and covers no tool, and its menu has 44px buttons and closes on the first tap outside it, without that tap reaching the canvas.
- **Add to Home Screen:** a web app manifest and bide icons (home screen, maskable, apple-touch-icon). The shortcut opens in the browser.

## v0.8.16 — Sharp text edits on scanned PDFs

- Includes Claude's higher-resolution sharpness measurement for scanned PDF text. Font, size and position are fitted at page scale; softness is measured on a finer render so crisp scans do not acquire unnecessary blur.
- Measures candidate blur in page units, preserving stronger scan blur instead of clipping it during the higher-resolution comparison.
- Adds end-to-end coverage for crisp, mildly blurred and heavily blurred scans. The regression opens the current /app/ editor route. Existing appearance checks compare rendered edge clarity in both directions instead of requiring the renderers to use the same blur setting.
- Retains Documents, invoices, the hidden-PDF-text OCR fix, the complete offline OCR/model and Office packs, and download links that follow the latest stable release.

## v0.8.15 — Documents, OCR fixes and current downloads

- Replaces the Diagrams workspace with Documents for PDF forms and electronic invoices. The retired diagram engine is excluded from this release.
- Includes the latest OCR, searchable export, proofreading, image editing and mobile source updates described below.
- Scanned PDFs with invisible or clipping-only text layers now use fresh OCR instead of treating stale hidden text as visible, editable PDF text.
- Website, editor and launcher download links now follow the latest stable release. The ZIP includes the full offline model and Office packs, complete corresponding source, and a VERSION.txt identifying its source commit.

## v0.8.15 details — Documents and advanced editing

- **Documents workspace**: the bundled draw.io Diagrams workspace was removed and replaced by a Documents workspace (forms and e-invoices), making the app about 150 MB smaller. Diagrams already placed in a project stay as images.
- **E-invoices** (Documents → New invoice): invoices, prepayment invoices and credit notes as Factur-X (PDF/A-3b with the CII XML embedded, EN 16931 profile), UBL 2.1 or CII. Live checks cover EN 16931 business rules and the French 2026 reform (SIREN/SIRET/VAT checksums, SIREN-based electronic address, invoicing frame B1/S1/M1, mandatory payment mentions, VATEX exemption codes including VATEX-FR-FRANCHISE). Issued invoices are frozen and numbered in sequence; corrections are credit notes. Your business details, clients and payment settings are remembered in the browser.
  - Conformance (`node scripts/einvoice-conformance.mjs`): six sample invoices in both formats are valid against the official Factur-X and UBL schemas and the European Commission's EN 16931 schematron (12/12), and every broken variant the schematron rejects is also refused by the editor. The reference `factur-x` Python library reads each PDF as Factur-X EN 16931. PDF/A-3 conformance of the PDF itself has not been checked with veraPDF yet.
  - Sending to business clients is left to the user's approved platform (plateforme agréée); bide does not transmit invoices.
- **Open an invoice** (Documents): a received Factur-X / ZUGFeRD PDF, UBL or CII file is read exactly and kept read only with its original, and checked against the same rules, so a supplier's mistakes show. Invoice-level discounts and charges, rounding and "not subject to VAT" lines are supported; the sender's stated totals are compared with the recomputed ones. All 32 example invoices of the European Commission's EN 16931 artefacts (CII and UBL, several countries) are read with matching totals.
  - A PDF without invoice data, a photo or a scan is read with OCR into a draft: number, dates, SIREN/SIRET and VAT numbers (checksums), parties by column, IBAN/BIC, table rows (quantity × price = amount decides between "1 450,00" and "1 | 450.00"), discounts, charges, deposits and totals. What was not found is listed on the draft. On our sample invoices rendered to images every field comes back and the totals match; on the benchmark's English invoice all 4 lines and the client are found.
- Invoice-level discounts and charges in the editor, PDF and XML (BG-20/BG-21); zero-rated lines no longer carry an exemption reason (BR-Z-10).
- Workspace tabs have accessible names on phones, where only their icons show.
- **Phones and tablets:** two fingers pinch-zoom the page around their midpoint and pan it at the same time; one finger keeps working the current tool (its touch is held back 90 ms, so a pinch never draws, selects or moves anything); one finger on the grey margin scrolls; the hand and zoom tools work with touch. The browser's own pinch zoom is blocked over the canvas only, so the toolbars no longer grow with a pinch.
- **Editing scanned PDFs, no more blur or doubled text** (tested on an invented scanned quote, `tests/fixtures/scanned-quote*.pdf`, built by `scripts/make-scan-fixture.mjs`):
  - A scan carrying the scanner's invisible OCR text layer (render mode 3, e.g. Tesseract's GlyphLessFont; detected with a MuPDF device that counts visible and invisible text) is now read by bide's own OCR. Before, that layer was edited as if it were the page's text: only the invisible text was removed and the new text was drawn over the scanned digits, which stayed in the image. Such pages count as already searchable, so export adds no second layer.
  - "Original letters" edits on PDF pages cut the letters from a render where the line is about 32 px tall (a whole multiple of the page units) and place the result scaled back. They were cut at the page's 72 dpi and came out as a blurry bitmap: edge width at 300% went from 3.8 px to 1.3 px, the same as the untouched scan (1.33 px).
- Text converted on a scanned PDF page no longer comes out blurred. Its softness was measured at the PDF's 72 dpi units, where any small scanned text looks soft (a crisp 300 dpi scan got 0.4 pt of blur). Font, size and position are still fitted at page scale; softness is now measured on a render with ~32 px letters: crisp scan 0.4 → 0.12 pt, a scan blurred by 0.35 pt → 0.38 pt.
- **iOS and Android apps** (Capacitor 8, `npm run build:app`, see MOBILE.md): the web app in a native shell. People subscribe on the website and sign in in the app, which shows no price or purchase (App Store 3.1.3(f), Google Play consumption-only). Saving opens the share sheet; the camera can photograph documents and invoices; the essential AI models are bundled (about 41 MB) and the large ones are downloaded from the server with the user's licence and cached. Office import is not available in the apps. Tested as a build in Chromium, not yet on devices.
- **Delete account** (account menu, web and apps): deletes the Stripe customer (cancelling any subscription), the account and its sessions. Only a hash of the email and its trial end are kept, so re-registering gives no second trial.
- Licence server: the app origins are allowed across origins (APP_ORIGINS), and the gated models also accept the licence as a bearer token.
- **Make PDF searchable**: PDF export can add an invisible OCR text layer at each line's position, so scanned pages can be searched, copied and read by screen readers. TXT and Word export of scanned pages use the same text. Pages that already have real PDF text are left alone.
- OCR benchmark (`npm run bench:ocr`, scripts/ocr-bench.mjs): 17 pages with known text (letter, invoice table, receipt, two columns, small print, dark screenshot, poster, map, a full A4 report, plus scan, phone photo, fax, low-resolution and photographed-at-an-angle versions), scored by line error rate, words found and words right. Fixes from it:
  - A sheet photographed at an angle on a darker surface is found by its four corners (the largest bright region, checked for four real edges) and read flattened to a rectangle; regions are carried back onto the photo. Letter photographed at an angle: 87.5% → 100% of words found (Tesseract 93% → 99%); angled invoice 78% → 100%. In the editor the **Straighten** hint then offers to flatten the page, which takes the sheet's size; no AI needed.
  - Tilt is measured from ink that contrasts with both sides of it, so the edge of a sheet on a dark desk no longer counts as a text line.
  - CTC decoding: a step where a letter's accented forms (e, é, è) together outweigh the blank keeps the letter, unless it repeats the previous one.
  - Tilted pages are read straightened. The AI recognizer cuts each line out as a level rectangle, so 1.2° of tilt had cut words found on a scan from 100% to 24%. Regions are mapped back onto the original image.
  - Small text is enlarged before AI OCR (1.5×, or up to 3× for tiny print).

  - Unsure lines (confidence under 0.93) are read again 15% wider, and the clearly surer reading is kept. Words found in tiny print: 76% → 85%.
  - Detector boxes that split one line (busy backgrounds, text shadows) are joined before recognition. Photographed poster: 92% → 96% of words found, 85% → 100% right.
  Also measured and rejected, so the defaults stay:
  - Real-ESRGAN sharpening before OCR: words found fell from 88% to 25% on the photo, because it invents letter shapes.
  - Classic unsharp masking.
  - The PP-OCRv5 server recognizer: it drops word spaces in Latin text and was 11x slower.
  - Dictionary auto-correction: its gain was too small to justify silently changing names.

  The server detector ("High accuracy") helps only on text over pictures: map 91% → 96%, photographed poster 92% → 100%.
  AI OCR over the 17-page benchmark: 1.1% line error rate, 96.9% of words found, 97.8% of the words it returns right, 2.3 s per page (first 14 pages, before these fixes: 17.5% and 82.6%; scanned letter 26% → 99%, phone photo 47% → 88%, tiny print 51% → 85%, angled letter 100%). Tesseract: 11.4% and 83.0%.
- **Subscription build** (`npm run build:saas`): sign-in with an emailed code, a 7-day free trial without a card, then €2/month through Stripe Checkout (Apple Pay, Google Pay, cards), with the customer portal for changes. The licence server (`cloud/`, a Workers-style handler with D1) signs licences that the app checks offline for up to 3 days, and serves the AI models and engines only with a valid licence. The editor stays open under the paywall if a licence runs out mid-session. AI models over 24 MiB are split into parts for hosts with a 25 MiB file limit. Setup and the remaining launch steps are in cloud/README.md.
- The AI worker downloads a model once for its WebGPU and CPU attempts, and creates one session at a time (concurrent WebGPU sessions failed with "Session mismatch").
- Code structure: App.tsx's canvas event handlers moved to canvas-events.ts, the command palette and menu commands to editor-commands.ts, and shared types and the tool list to editor-types.ts. Each gets its dependencies through a typed interface generated from the compiler's own types. App.tsx went from 1,421 to 1,118 lines.
- **Object select (AI)** (A): click an object and SlimSAM (Segment Anything, int8, 14 MB) selects it. Shift-click adds another, Alt-click removes one, and the selection works with every selection action (Keep, Hide, To layer, Redact…). The page is encoded once per version of its layers, starting as soon as the tool is picked; each click then takes a fraction of a second. On a test picture it selected a 200 px circle to within 1% of its area.
- PDF forms: **Form fields** in page properties lists a PDF's own text fields, checkboxes, dropdowns and radio buttons and fills them in place. **Add form field** (Text, Checkbox, Dropdown, Radio button) adds fields of bide's own, which can be dragged and resized on the page, renamed and given options. Export draws the values into the page, or with **Keep form fields fillable** recreates every field with pdf-lib so the PDF stays fillable, password protection included.
- Adjustment layers: **Levels**, **Curves** (monotone curve through shadow, midtone and highlight points; drag them on the graph) and **Hue/Saturation**, from the Layer menu or the command palette. Each is a click-through layer that re-processes everything below it whenever the page renders, so the layers underneath stay editable. Opacity weakens the effect and hiding the layer compares before and after. Saved in projects; SVG and PDF export flatten the page to pixels, like blend modes.
- True redaction: **Redact** on the selection bar, or **Find & redact**, which searches the page's text for words and for email addresses, phone numbers, IBANs (mod-97 checked) and card numbers (Luhn checked); matches are listed to review first. On PDF pages MuPDF removes the text, image pixels and drawings under each box, plus links and annotations touching it, and draws a black box. Every layer under a box is burned in: rasterized with the box painted black, or deleted if it lies entirely inside. Sources no page uses are dropped, so a saved project holds no unredacted copy, and the page's cached OCR text is discarded and rescanned.
- Straighten before OCR: after a scan, an image page that is tilted (measured from its text lines, without AI, to 0.1°) or turned 90/180/270° (PP-LCNet orientation model) gets a **Straighten** button in the text bar. One undoable step rotates every layer, swaps width and height for quarter turns, and scans again. **Straighten page** in the command palette works on any image page. **Flatten photographed page (AI)** runs UVDoc on the main image layer to remove perspective and page curl; on a test photo it turned "Ivoice total 14 EUR" into "Invoice total 1284 EUR".
- More alphabets in AI OCR: PP-OCRv5 recognizers for Cyrillic, Greek, Arabic, Korean, and Chinese & Japanese, next to Latin. **Alphabet: Auto** (default) reads Latin and tries the other alphabets when a line comes back unsure, empty or with non-Latin letters. The page's alphabet, once found, is tried first. Arabic is put in reading order with numbers kept as they read. Original-letter editing and spelling stay with the separate-letter Latin, Cyrillic and Greek alphabets. Searchable PDFs carry these alphabets: a Type0 font subset from MuPDF's built-in CJK font, or ActualText for Arabic (about 10 KB per document).
- **High accuracy** (AI OCR setting) finds text with the PP-OCRv5 server detector, stored with float16 weights (44 MB): better on busy photos, small print and low contrast, but slower.
- Per-letter confidence: both OCR engines report how sure they are of each character. Letters under 60% are underlined on the page, and the line's tooltip says to check them.
- Offline spelling suggestions (English and French, Hunspell dictionaries in a worker): the edit dialog offers corrections for doubtful words, including typical OCR confusions such as rn→m, l→I and 0→O. **Proofread** lists every line with a suspect word and fixes it with one click, using the image's own letters.
- Original-letter edits borrow a missing letter from any line of the same x-height, aligned on the baseline (lines with descenders used to be excluded), and from other pages of the document when this page doesn't have it.
- Font-text replacement fits size and position on crisp renders first, then tries blur only around the best size, and skips fonts that trail far behind. The matched result is the same as before, 4–8× faster: about 15 s instead of more than 2 minutes in headless Chromium.

## v0.8.14 — Searchable documents, forms and advanced editing

- Latest OCR improvements: searchable PDF/TXT/DOCX export, English/French proofreading dictionaries, character confidence, cross-page letter borrowing, faster appearance matching, additional AI OCR alphabets and a high-accuracy detector.
- Page straightening/orientation and AI flattening; SlimSAM click-based object selection; editable Levels, Curves and Hue/Saturation layers.
- PDF redaction and Find & redact, existing PDF form filling, new movable text/checkbox/dropdown/radio fields, and fillable or flattened PDF export.
- Release fixes remove redacted native field values and intersecting vector paths, sanitize retained project PDF sources, honor chosen match occurrences, read current visible text for searchable export, preserve adjustments in masked rendering/PSD fallback, fix Arabic reading order and radio switching.
- Searchable export reads the current visible composite; the original OCR scan remains only an appearance reference. Rasterized softened/system-font text is OCR'd; native text is not duplicated.
- Redaction rebuilds project PDF sources from retained pages. Supported form fields are recreated with the export appearance; unsupported widgets flatten. Original form styling/signatures are not preserved through this destructive cleanup. Undo retains originals while the document remains open.
- Form export supports the bundled Liberation Sans glyphs, including French, Greek and Cyrillic. Other unsupported scripts report a clear font-coverage error rather than silently changing values.
- Full offline model pack and seven Tesseract languages are bundled in the ZIP. Hosted demo omits Office and AI model assets.

## v0.8.13 — Independent branding and editor improvements

- Original B logo and favicon, warm white/graphite interface, burnt-orange accents, and “Image & Document Editor” tagline. Retired bank logo assets are removed.
- Compact workspace layout and shorter tool rail, with navigation in the header and more room for documents.
- OCR appearance matching and original-letter replacement, Find & replace, better bold/symbol weights, and a guard against making replacement text blurrier than the source. Exact matching still depends on the source image and available glyphs/fonts.
- Offline AI OCR, image removal/fill, sharpening and subject selection in the full Windows package; seven bundled OCR languages. The hosted demo runs AI OCR and image actions with verified models downloaded on demand and cached in the browser. It still omits the Office engine.
- Magic wand, combined selections, colour range/refine, layer styles, gradients, paint bucket and paintable masks.
- Pen and path editing, rulers/guides, crop/straighten, image/canvas size, perspective and named History steps.
- Prebuilt ZIP retains install, launch, LAN sharing and Stop BAT files and uses existing Node.js 22+ without setup downloads.

## Current app identity

- Original B monogram and independent warm white, graphite, and burnt-orange identity, with “Image & Document Editor” beneath bide.

## v0.4.7 — Searchable command palette

- Workspace aliases: visio/draw/diagram/drawio/flowchart, photoshop/photopea, PDF/ilovepdf. Exact aliases rank first; search accepts multiple words and punctuation.
- Expanded document commands: pages, layers, selection, masks, alignment, fonts, brushes, filters, blend modes, settings and every supported export format. Dynamic page/layer names are searchable.
- Native local draw.io actions: undo/redo, selection, grouping, alignment, ordering, zoom, fit, grid, guides, sizing and properties, alongside its file/export commands.
- Commands reflect the active workspace. Unavailable commands explain the required selection or state and cannot execute. Draw.io validates availability again at execution. Specialized draw.io dialogs retain their own controls.
- 37 automated tests, including alias ranking and diagram command origin/availability checks.

## v0.4.6 — Clearer workspace layout

- Visible Photo editor, PDF MasterTool and Diagrams navigation, alongside the animated workspace dock.
- Labeled Select, Create, Draw and Insert tools with active states and shortcut hints.
- Direct Open files, Save project and Export file actions; clearer diagram export labels.
- PDF tools grouped by task, with category counts, search and filter reset.
- More readable properties and layers; page/property drawers on small screens.
- Existing editing and conversion capabilities are unchanged.

# bide feature coverage

Checked against the [Photopea manual](https://www.photopea.com/learn/) and [iLovePDF tool catalogue](https://www.ilovepdf.com/) on 2026-09-16, and against the actual bide code and verification results.

**bide is a local visual editor with integrated PDF tools. It does not currently provide full feature parity with Photopea or iLovePDF.** This is a capability audit, not a promise that all file variants or workflows work identically. “Implemented” means the described bide operation exists; it does not mean the entire competitor subsystem has been reproduced. “Missing” means there is no finished, supported workflow. Nothing marked missing is represented as a working tool in the UI.

## Visual editor compared with Photopea

| Feature family | bide status | Actual scope / remaining work |
|---|---|---|
| Local GUI, canvas navigation, command search | Implemented | Warm white/graphite compact interface with burnt-orange accents, workspace switcher in the header, searchable PDF tools, zoom, pan, Ctrl+K palette and keyboard shortcuts |
| Draggable/resizable/rotatable text | Implemented | Text boxes, typography controls, color, alignment, property inspector |
| Layers | Partial | Ordering, names, groups, visibility, lock, duplication and 16 blend modes on design pages; layer styles (drop shadow, inner shadow, outer and inner glow, stroke outside/center/inside, colour and gradient overlays) rendered live and kept in .bide, PSD and image exports, and as pixels in PDF/SVG; no clipping masks between layers or adjustment layers |
| Painting tools | Partial | Brush styles, highlighter and eraser; Gradient tool (G: linear or radial, drawing colour to a second colour or to transparent, limited to the selection) as an editable vector layer; Paint bucket (K: tolerance, contiguous, all layers, opacity) as a new layer; no pattern fills or blend-mode painting |
| Transform and alignment | Partial | Move, scale, rotate, skew X/Y, flip, page alignment, snapping to the page and to guides; nine-point Warp and four-corner Perspective (rasterize the layer); no live (non-destructive) distort |
| Shapes and paths | Partial | Rectangles, ellipses, lines, brush strokes; Pen tool (P: click for corners, drag for curves, close on the first point, Enter to finish; fill and stroke) and point editing of anchors and Bézier handles; no Boolean operations |
| Raster image import, resizing and crop | Partial | Common image formats; object crop/resize; Image size (resample page and layers), Canvas size with anchor, Crop tool (C) with straighten angle, crop to selection, trim to content; PDF pages crop by margins |
| Adjustments and filters | Partial | Brightness, contrast, saturation, blur, grayscale, sepia, invert; no curves, levels, adjustment layers or full filter gallery |
| Selections | Implemented | Marquee, lasso and magic wand (tolerance, contiguous, anti-alias, all layers or one); Shift adds, Alt subtracts, Shift+Alt intersects (or New/Add/Subtract/Intersect buttons); select all, inverse (Ctrl Shift I), colour range with live preview and screen eyedropper, layer pixels, and AI Select subject (ISNet); Refine: feather, expand, contract, smooth; marching-ants outline. Selections are soft pixel masks; no quick mask mode or saved channels |
| Masks and clipping masks | Partial | Raster layer masks from any selection (Keep inside / Hide inside) or added blank, painted with the Mask brush (Q: Hide / Reveal, size, soft edge, opacity), inverted, applied or deleted; soft edges kept, following the layer when moved or scaled; AI Remove background as a mask; ellipse and rounded-rectangle shape masks; no clipping masks between layers or Photoshop-compatible mask stacks |
| Smart objects | Missing | No linked/embedded smart-object editing |
| Retouching | Partial | Clone Stamp and basic color-matched Healing Brush (Alt-click to sample, size/softness/opacity) on separate patch layers; warp; no content-aware fill, liquify, dodge/burn or advanced brush engine |
| PSD / PSB workflows | Partial | 8-bit RGB PSD raster layers and supported group hierarchy import/export, positions, names, opacity and supported blend modes; complex PSDs use saved composites; no PSB, native text/vector/Photoshop effect round-trip |
| RAW, advanced design formats | Missing | No RAW development, AI/CDR/XD/Sketch compatibility guarantee |
| Color management | Missing | No editable ICC/CMYK/Lab workflow, channels, or 16/32-bit editing |
| Text layout | Partial | Basic multiline boxes; no advanced OpenType, text-on-path or font import workflow |
| Artboards and guides | Partial | Multiple pages, artboard presets, layout grid; rulers that follow zoom and scroll (Ctrl R); guides dragged from the rulers, moved or dragged off to delete, saved per page, with snapping (Ctrl ; hides them) |
| Animation / video | Missing | No timeline, frame animation, video editing or animated exports |
| History | Implemented | History tab beside Layers names each step (move, transform, add, delete, style, mask, crop, resize…); click a step to go back or forward; 45 steps |
| Automation / actions / scripts | Missing | Command palette is interactive; no recorded macros or batch action engine |
| Templates, cloud storage, collaboration | Missing | Local project save/autosave only |

## PDF toolkit compared with iLovePDF

The catalogue includes [organization, conversion, editing, security and intelligence tools](https://www.ilovepdf.com/). The statuses below describe bide, not iLovePDF's service guarantees.

| Tool / workflow | bide status | Actual scope / remaining work |
|---|---|---|
| Merge PDF | Implemented | Import and combine documents, then reorder their pages |
| Split PDF | Implemented | Separate page PDFs in a ZIP |
| Remove / extract / organize pages | Implemented | Delete, duplicate, reorder and export ranges |
| Compress PDF | Implemented | Stream optimization and large opaque-image downsampling; savings depend on input |
| Word to PDF | Partial | DOCX tested with heading/table; DOC/RTF/ODT use engine filters but are not individually validated |
| PowerPoint to PDF | Partial | PPTX tested; PPT/ODP use engine filters but are not individually validated |
| Excel to PDF | Partial | XLSX tested, including formula recalculation; XLS/ODS filters not individually validated |
| JPG / images to PDF | Partial | Image import and PDF export; no dedicated margin/orientation batch wizard |
| HTML / URL to PDF | Missing | No webpage capture or HTML conversion workflow |
| PDF to JPG / PNG / SVG | Partial | Page rendering/export works; no extract-embedded-images workflow |
| PDF to Word | Partial | Extracted text with page breaks only; no layout reconstruction or OCR |
| PDF to PowerPoint | Missing | No editable slide reconstruction |
| PDF to Excel | Missing | No table detection or structured spreadsheet conversion |
| PDF to PDF/A | Missing | No archival-profile validation or certified conversion |
| Scan to PDF | Missing | No camera/scanner capture workflow |
| OCR PDF | Partial | Local offline OCR (English, French, German, Spanish, Italian, Dutch, Portuguese) turns image and scanned-page text into editable text layers; **Make PDF searchable**: export adds an invisible OCR text layer at each line's position (search, copy, screen readers), also used by TXT/Word export of scanned pages |
| Repair PDF | Missing | Parser recovery may open some files, but no dedicated repair/recovery workflow |
| Rotate PDF | Partial | Rotate current page and undo; no multi-document batch rotation panel |
| Page numbers | Implemented | Editable numbering layers across selected pages; template, start number and header/footer controls |
| Watermarks | Partial | Batch editable text watermarks with angle, opacity, color and page range; image placement is manual |
| Crop PDF | Partial | Current-page crop margins with dimension preview and Undo; crop hides content and does not redact it |
| Edit PDF | Partial | Editable overlays, text, images, shapes and freehand marks; original text is not directly rewritten |
| PDF forms | Implemented | A PDF's text, checkbox, dropdown and radio fields are listed under Form fields and filled in place (MuPDF). New fields can be added, dragged, resized, renamed and given options. Export flattens the values into the page, or keeps every field fillable (pdf-lib, MIT) |
| Unlock / protect PDF | Implemented | Known-password import with retry/cancel; AES-256 password PDF export; no password recovery/cracking or permission-policy editor |
| Sign PDF | Partial | Drawn/typed visual marks only; no certificate signing, signature requests or audit trail |
| Redact PDF | Implemented | Selection or Find & redact (text, emails, phones, IBANs, cards); removes PDF text, image pixels and drawings under the box, burns layers in |
| Compare PDF | Missing | No visual/text comparison workflow |
| AI summaries / translation | Missing | No AI model/service integration |
| PDF to Markdown | Missing | Plain text export does not reconstruct Markdown structure |
| Reusable workflows | Missing | No saved multi-step or folder-batch conversion pipelines |

## Verified locally

- v0.4.1: production build and 30 automated tests pass. Browser checks cover white/blue editor and draw.io themes, bottom-edge hover reveal/hide, keyboard dock navigation, all three workspace routes, PDF search/category filters and compression dialog, preserved document/layers, and the PDF tool grid at a narrower viewport.

- v0.4.0: 30 automated tests pass. Curved translucent marker paths and embedded diagram source survive serialization; export replies are matched to their requests; source-folder/incomplete-bundle launchers stop without network requests. Production TypeScript/Vite build passes.
- Browser: zoom buttons and exact percentage visibly resize the artboard; marker creates a Path layer; native `.drawio`, PNG, SVG and PDF exports produce files; a placed diagram reopens and updates its existing layer with an edited label. Diagram PDF was opened/rendered and its dimensions checked.

- LAN sharing: `share bide.bat`, configurable IP/port, HTTP editing/import/autosave restoration, static HTTPS with a trusted test client, isolation headers, blocked uploads and private-path protection. Browser DOCX conversion and PDF download verified through the sharing server's localhost address. LAN HTTP downloads may be blocked by the browser; use trusted HTTPS for team use. A second work PC and company-issued certificate have not been available for verification.
- Automated PDF tests: source and accented overlay text, links (including rotated geometry), merge/ranges, rotation, split, PNG/JPEG/SVG, text/DOCX extraction, source integrity, rejection of external SVG resources, AES-256 export/unlock (including punctuation and Unicode passwords), and crop/reimport dimensions.
- PSD tests: raster data, layer names/order/position/opacity/blending, unsupported-format guards and composite fallback detection. Fabric 7 coordinate-anchor regression check.
- Browser checks: text editing, dragging and resizing, layer controls, signature placement, palette, project save/load, PDF merge/export, DOCX/XLSX/PPTX conversion and image compression.
- Windows setup: direct Node launch without PowerShell; existing Node detection on PATH, managed work-PC location or explicit override; prebuilt validation and launch without setup downloads; explicit source build, server reuse and paths containing spaces. Source-only folders stop with a prebuilt download link before attempting any network access.

These checks use representative fixtures. They do not establish identical behavior on every document, font, Photoshop feature, damaged PDF or Office version.

## Work remaining toward parity

Both the visual editor and PDF toolkit have equal priority. The numbered groups below organize remaining work; they are not a commitment to finish one product before the other.

1. PDF completeness: embedded-image extraction, richer password permissions, and batch crop/image-watermark workflows.
2. Conversion fidelity: document corpus tests, layout-preserving PDF-to-Office, PDF/A validation and repair workflows.
3. Raster editing foundation: selections, painted masks, layer effects, advanced brush/retouch tools (content-aware fill, dodge/burn) and color management.
4. Full PSD/PSB compatibility, smart objects, advanced typography/paths, animation and automation.
5. Separate decisions for cloud collaboration, remote signature requests and AI tools, which need services or substantial local models beyond the current offline editor.

There is no full-parity completion claim or committed delivery date. The checklist should be updated only when each workflow is implemented and verified.

### v0.4.2 — Visio and page actions

- Diagram workspace Open accepts modern `.vsdx` files and converts them locally using the bundled draw.io importer. Imported shapes and text are editable; save as `.drawio`. No Visio export. Older `.vsd`, `.vdx` and stencil formats are not supported by this import path. Complex formatting, fonts and connectors may differ.
- Right-click a photo/PDF page thumbnail, or use its three-dot button, to duplicate, rotate clockwise/counterclockwise, move to beginning/end, or remove it. Actions target the clicked page; the last page cannot be removed. Undo restores changes. Rotation flattens current overlay layers into the PDF background; Undo restores editable layers.
- Verified local import, text editing and .drawio saving with the Microsoft 365 PnP react-visio sample Drawing1.vsdx. Verified inactive-page rotation, dimensions, Undo restoring 14 layers, and inactive-page removal.

### v0.4.3 — Drawing and Open shortcut

- Ctrl+O (Cmd+O on Mac) opens the appropriate local file picker in the photo editor, PDF home/editor and diagram workspace, including focus inside the draw.io iframe. Successful document imports show the editor.
- Round, square, spray and dotted brushes have adjustable 1–200 size and 5–100% opacity. B selects Brush; E selects Eraser; [ and ] adjust drawing-tool size.
- The freehand eraser removes parts of overlay artwork beneath it, with a 1–200 size. Erasures are undoable compositing layers, preserved in .bide projects and PDF/image export. A pale stroke previews the gesture; the erased result appears on release. Original imported PDF/image backgrounds are not erased. This is not PDF redaction.
- Verified all four brushes in the browser, partial-stroke erasure, exported PDF pixels retaining the erased gap, PDF-home and embedded-diagram Ctrl+O, and 31 automated tests including brush configuration and eraser serialization.

### v0.4.4 — Branding and selection masks

- M selects rectangular selection; Q selects freehand lasso. Select an unlocked layer first, then draw on the canvas. Keep inside / Hide inside apply a reversible mask; Copy to layer creates an independently editable cutout without changing the source layer. Each action replaces that layer's previous mask. Choose Shape mask → None to recover the original pixels, or Undo.
- Masks follow layer rotation, scale and flipping and persist in .bide projects. This is a foundation for photo compositing, not Photoshop feature parity. Original PDF page content is not a selectable image layer.
- Browser verified mask placement, mask removal, copying a cutout and hiding the source. Automated geometry checks cover rotated, scaled and flipped layers and serialized inverse masks.
- A file opened while local autosave restoration is finishing takes priority over the restored project.

PSD focus for v0.4.4: normal groups and simple pass-through groups retain their editable hierarchy on import, and supported groups retain hierarchy on export. Unsupported effects, masks, smart objects, or pass-through groups with interacting blend modes still use the saved PSD composite. Eraser/compositing operations unsupported by PSD now export a merged appearance rather than becoming visible black strokes; save .bide for full editability.

Verified a real browser import/export of the generated grouped PSD: hierarchy, two named layers, exact position and pixel colors, multiply blend and opacity retained. Verified an erased pixel remains transparent in the exported merged PSD. 33 automated tests pass.

### v0.4.5 — Offline text fonts

- Photo/PDF text toolbar offers 19 choices: 12 bundled families plus the 7 existing system-font choices. Bundled families: Lato, Poppins, PT Sans, PT Serif, Crimson Text, Cousine, Pacifico, Lobster, Bebas Neue, Abril Fatface, Great Vibes and Sacramento.
- All font files and their SIL Open Font Licenses ship in the app. No internet or font installation is needed at runtime. Six body-text families include real regular, bold, italic and bold-italic faces; display/script families use regular faces with synthesized bold/italic when requested. Existing system fonts still depend on the device.
- Font selection waits for loading before measuring canvas text; project restoration and multipage exports load fonts before rendering. New text boxes use the last font selected in that session.
- PDF export embeds the selected bundled fonts and retains searchable text on pages without rasterizing effects. 34 tests pass, including font identity and searchable accented text in exported PDFs.

## 0.6.0 text recognition and editing

Automatic native PDF text regions and local English OCR for image/scanned pages; click a region to create a directly editable layer. Usable embedded TrueType/OpenType fonts survive project save and PDF export. Unsupported fonts or missing glyphs use a stated fallback. Native PDF replacements remove source text while retaining surrounding artwork; image replacements use adjustable background patches. Rotated/native complex layouts and exact image font recognition are not fully supported.

## 0.6.1
English + French offline OCR, including accented and mixed-language text. Five additional offline font families (17 total), all with regular/bold/italic/bold-italic faces; an OCR replacement-font selector before conversion.

## 0.7.0
80 bundled offline font families, alphabetically listed throughout the editor and OCR selector and searchable in the command palette. Available regular/bold/italic faces are embedded on PDF export.

## 0.7.1
Reduce the extended font library to Latin/Latin Extended characters and common symbols, retaining English/French coverage while fitting the public demo hosting limit.

## 0.8.0
Defer PDF export dependencies until needed; load page previews near the visible page list; cap editor thumbnails to 200 pixels; render OCR inputs directly at up to 2400 pixels; skip cancelled queued OCR jobs; allow browser caching of hashed local assets. These changes reduce unnecessary loading and rendering without changing document/export resolution.

## 0.8.1
Unlock Original PDF from Layers, the selection toolbar or command palette. The current page background becomes an unlocked image beneath existing overlays, supporting Marquee/Lasso and retouch tools. Undo restores the original PDF. Conversion rasterizes original text, vectors and links (up to 3x, longest edge 3500px); existing overlay text remains editable.

## 0.8.3 — sharper text editing
PDF previews adapt to zoom and screen density, with a 16-megapixel memory budget. PDF unlock rasterizes at up to 300 DPI (large pages are capped). Replacement text renders directly and OCR text uses measured font ascent for vertical placement. Native PDF text editing retains vector content; scanned text still requires a matching font and a background patch.

## 0.8.4 — match text softness
Text properties include a 0–2 px softness control, Slightly soft preset and Crisp reset, also accessible from the command palette. Text stays editable in .bide projects. Softened text alone exports as a transparent raster image; zero-softness text retains vector export. This is manual appearance matching, not automatic scan reconstruction. Browser pixel/export/reload verification: open /tests/text-appearance.html under the Vite development server.

## 0.8.5 — text box context menus
Right-click an editable text box on the canvas or its Layers entry to edit text, font, size, color, softness, formatting, duplicate, arrange, lock/unlock or delete. Context clicks work with drawing tools active and do not draw. Locked layers expose Unlock while editing actions are disabled. Soft text serialization also retains names and embedded font metadata.

## 0.8.6 — Transparent text replacement

- OCR replacement backgrounds: sampled color, chosen solid color, or clear to transparent. Clear removes the rectangular OCR area from intersecting unlocked image layers, rasterizing those layers; Undo restores the originals. Scanned PDFs must first be unlocked as images.
- Text boxes support a color background or transparent background, including a right-click action.
- Export selected text or the editable page as a transparent PNG using the command palette. Text export also appears in Properties and the right-click menu. Opaque pixels in images stay opaque; page export removes only the page background. Native PDF backgrounds must first be unlocked.
- Checkerboard preview shows page transparency. PNG exports keep alpha; .bide keeps editable layers.

## 0.8.7 — Better text replacement

- OCR samples actual foreground lettering and multiple background pixels instead of assuming black or white text.
- Repair smooth background reconstructs gentle gradients from borders above and below the text, as a separate undoable patch. Detailed textures still need Clone or Healing.
- Cleanup padding is adjustable from 0 to 20 page pixels; horizontal fitting better matches the original OCR line width without shrinking its height.
- Letter spacing is adjustable in Text Properties and accessible from the command palette.
- Property changes exit inline text editing before checking the layer lock, fixing false locked-layer messages during replacement.

## 0.8.8 — Restore 0.8.6 replacement defaults and fix bold handling

- Restores 0.8.6 OCR sizing without horizontal stretching, original color sampling, sampled-color cover and automatic cleanup margin. Smooth repair remains an explicit option. Leave cleanup padding blank for Auto.
- Select OCR weight (Regular, Bold, Italic or Bold italic) before clicking image text. The chosen face is loaded and measured before replacement; OCR does not automatically infer its weight. Native PDF text still uses its detected font.
- Preserves original PDF bold/italic metadata when a subset embedded font must switch to a bundled fallback for new characters, including on export and after saving a project. Embedded bold faces are not artificially emboldened twice.

## 0.8.9 — Workplace fonts and separate chat text regions

- Smart OCR grouping splits large gaps between avatar initials and adjacent message text. Choose Individual words for precise edits, or Whole lines for legacy grouping. French accents remain supported.
- Adds 15 installed workplace font choices to both text and OCR menus: Segoe UI variants, Aptos variants, Calibri, Calibri Light, Cambria, Candara, Corbel, Constantia, Consolas, Tahoma and Arial Narrow. These are local system fonts, not redistributed font files. Missing fonts show a message with a bundled alternative.
- Workplace-font text exports as an image within PDF/SVG so the export engine does not substitute a different font. Other text stays vector-based; .bide retains editable text. Recipients need the same installed font to edit .bide with the same appearance.

### OCR stroke matching (0.8.10)

OCR weight defaults to Auto (match strokes), comparing foreground coverage with regular and bold renderings in the selected font before sizing the replacement. Regular, Bold, Italic and Bold italic remain manual overrides. This estimates weight, not the original font; complex backgrounds, mixed weights and low-resolution scans may require manual adjustment. Existing replacement layers are unchanged; undo and select the detected region again to apply Auto. Text softness remains adjustable in Properties.

### Mobile UI fonts (0.8.11)

Roboto and Inter are already bundled for offline text and OCR editing. SF Pro, SF Pro Text and SF Pro Display are now offered as installed-font choices in both font menus and the command palette. Apple font files are not bundled or downloaded; use requires a local installation and compliance with Apple licensing. Missing SF Pro fonts report an error recommending bundled Inter instead of silently substituting a different face. Installed-font text retains the existing raster-text PDF/SVG export behavior.

## v0.8.14 details — OCR accuracy, languages and font matching

- Small text is enlarged before recognition, based on line height measured from the image (lines under 24 px, up to 3x), and light-on-dark images are inverted. Already-large text is left at native size: enlarging it or stretching contrast measurably hurt accents and ß. PDF pages are rendered for OCR at up to 3600 px. On rendered test text at 72 DPI, character errors fell from about 18% to 0–3% at 9 pt and from about 92% to under 8% at 7 pt.
- Replacement text color comes from the glyph pixels and the background from a ring around the region, instead of black/white text and a single corner pixel.
- Low-confidence punctuation-only "words" (borders, icons, specks) are dropped. Regions whose least certain word is below 70% confidence get a dashed amber outline and a tooltip; the status bar counts them.
- OCR languages: English and French by default; German, Spanish, Italian, Dutch and Portuguese are bundled and can be enabled in the detection bar (stored per browser). The bundle uses integer "best" LSTM models, which give identical results to the previous standard data: the seven languages take 13 MB, less than English and French did before (17 MB). `OCR_LANGUAGES` restricts a build.
- OCR scan: Thorough (slower) adds a sparse-text second pass for isolated labels and keeps only lines the first pass missed. It is off by default; on synthetic UI layouts the standard pass already found every label.
- After a scan, the clearest regions (≥85% confidence) are compared with 12 common faces by rendered glyph shape, and the closest pre-selects OCR font unless one was chosen. In Chromium it identified all 12 at 14–32 px, including bold, blurred and light-on-dark text; misread characters reduce accuracy.
- Auto weight is estimated per word, so a bold label and a regular value on one line ("**Nom du client:** Dalil") keep both weights in the editable text and in exports. On generated pages mixing bold and regular words (5 fonts, 14 and 20 px, light and dark) every word kept its weight (750/750, previously 576/750: bold labels in mixed lines turned regular). List bullets that OCR misreads as e, «, *, + or ¢ are restored as •. Installed system fonts common in screenshots (SF Pro, Segoe UI, Arial, Calibri, Aptos and others) join the font comparison when present.
- Soft or blurred originals: the blur of each region is measured from its glyph edges. **Match blur** (on by default) gives a single replacement the same softness so it blends in. **Convert all** replaces every detected line at once with crisp text (one undo step), for a sharp page. Bold detection on soft text compares each word's total ink, which blur does not change, against regular and bold renderings; the text colour is darkened to that measured ink level, since blurred letters never reach their true colour.
- Bundled AI models, running offline in a worker through ONNX Runtime Web (WebGPU when available, else multithreaded WebAssembly): PaddleOCR PP-OCRv5 as an alternative OCR engine (word boxes recovered from its character timing), LaMa inpainting for an AI fill background and Remove with AI on selections, ISNet (int8, 46 MB; its masks match the float16 model to 99.8% IoU) for Select subject and Remove background, and Real-ESRGAN for Sharpen with AI (2×) and optional sharpening before OCR. Measured on a 4-thread CPU: LaMa ~9 s to load and ~11 s per 512 px area; Real-ESRGAN ~0.6 s per 128 px tile; PaddleOCR well under a second per line. The hosted demo omits the ~171 MB model pack and hides these actions. AI OCR is the default engine when the models are present: across 4 fonts, 2 sizes, blur and dark mode its character error rate was 0.44% against 1.62% for Tesseract (worst case 0.4% vs 10.9%), and it was faster (0.64 s vs 0.95 s per image). Tesseract stays available as Standard, with the language picker and Thorough scan.
- Edit with original letters (default): character cells are segmented from inked column runs (matched to the recognizer's character positions by an ordered alignment, so drifting positions and detached dots are handled), and an edit is rebuilt from the original pixels: unchanged text before the first change stays, the rest of the line is redrawn at its new positions. Ink is assigned to lines by connectivity, so overlapping neighbouring lines are not disturbed. Missing letters come from same-size text elsewhere on the page; otherwise the OCR font is used. Find & replace applies this to every matching line in one undo step. On the user's booking screenshot, 'Daliil' -> 'Dalil' is indistinguishable from the original.
- Replaced font text keeps its original line length: width sets the size (height only when it agrees within 3%) and letter spacing absorbs the rest.
- Image preparation runs in a worker and the status bar shows recognition progress.
- `npm run test:e2e` drives the app in Chromium: imports a rendered PNG, waits for OCR, checks the suggested font and the thorough pass, replaces a region (text layer and background patch), and verifies that enabling German re-scans ß and umlauts correctly. The Vite dev server now loads the PDF engine (mupdf is excluded from dependency pre-bundling).

### OCR accuracy and language release (0.8.12)

Merged claude/lucid-fermat-jvmf9l: better preparation for small and dark-mode text, progress reporting, optional thorough scan, uncertain-region indicators, suggested bundled font matching and selectable offline English, French, German, Spanish, Italian, Dutch and Portuguese models. OCR geometry maps back to the original page and replacement sizing keeps proportional fitting. Source-map-js build dependency updated to the patched 1.2.2 release.
