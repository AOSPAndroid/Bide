# Bide: SEO & marketing plan

Full plan: [Bide SEO & marketing plan](https://cursor.com/canvas/store-b786b916-a351-4320-8a39-527620ff239f/20b95e35-54ed-43a1-98a6-1c8bb9d5cc41)

## Team roles

| Who | Role |
|---|---|
| Claude | Coding |
| Codex | GitHub and project management |
| Ananas | SEO and marketing |

## Positioning

**Your files never leave your device.** Edit, merge, compress and sign PDFs, fix text in images and create e-invoices in the browser. No uploads, works offline.

Smallpdf, iLovePDF, Sejda, PDF24 Online and Adobe online upload files to their servers. Stirling PDF is private but needs Docker. New no-upload sites (NearPDF, PDFMergely, LocalPDFTool, docstack) are the closest rivals, so Bide wins on breadth: real PDF text editing, OCR, Office to PDF, a photo editor and Factur-X in one app.

## Priority keywords (UK / FR)

No verified search volumes; priorities are relative.

| Priority | Cluster | Example queries |
|---|---|---|
| High | Merge PDF, private | merge pdf without uploading, merge pdf offline, fusionner pdf sans téléchargement |
| High | Compress PDF, private | compress pdf offline, compress pdf no upload, compresser pdf hors ligne |
| High | Edit PDF text | edit pdf text free, edit text in pdf no upload, modifier texte pdf |
| High (FR) | Factur-X / e-invoicing | créer facture Factur-X gratuit, facture électronique 2027 TPE, logiciel Factur-X |
| Medium | Sign PDF | sign pdf without uploading, signer pdf gratuit |
| Medium | Office to PDF | word to pdf offline, convertir word en pdf |
| Medium | Comparisons | smallpdf alternative, ilovepdf alternative private, stirling pdf without docker |
| Low | Photo editor / head terms | photopea alternative, merge pdf, pdf editor |

## Site structure: per-tool landing pages

| URL | Title tag | Meta description |
|---|---|---|
| `/` | Private PDF & Image Editor, No Uploads \| [Brand] | Edit, merge, compress and sign PDFs in your browser. Your files never leave your device. Works offline. |
| `/merge-pdf` | Merge PDF Without Uploading, Free & Offline \| [Brand] | Combine PDFs and reorder pages on your own device. No upload, no sign-up. |
| `/compress-pdf` | Compress PDF Offline, No Upload \| [Brand] | Shrink PDFs in your browser. Files never leave your device. |
| `/edit-pdf` | Edit PDF Text Free, In Your Browser \| [Brand] | Retype existing PDF text in its original font. OCR for scans. Nothing uploaded. |
| `/sign-pdf` | Sign PDF Without Uploading \| [Brand] | Draw or type a signature on any PDF, privately in your browser. |
| `/split-pdf` | Split PDF & Extract Pages Privately \| [Brand] | Split by range or extract pages to a ZIP, locally. |
| `/word-to-pdf` | Word, Excel & PowerPoint to PDF, No Upload \| [Brand] | Convert Office files to PDF in your browser. |
| `/pdf-to-word` | PDF to Word Free, No Upload \| [Brand] | Extract PDF text to DOCX or TXT on your device. |
| `/protect-pdf` | Password Protect PDF (AES-256), Offline \| [Brand] | Add or remove a PDF password locally. |
| `/ocr-pdf` | OCR PDF & Images, Edit Scanned Text \| [Brand] | Recognise and edit text in scans and photos in your browser. |
| `/fr/facture-factur-x` | Créer une facture Factur-X gratuite, conforme 2026 \| [Brand] | Créez et vérifiez vos factures Factur-X (EN 16931). Vos données restent sur votre appareil. |
| `/vs/smallpdf`, `/vs/ilovepdf`, `/vs/stirling-pdf` | [Brand] vs Smallpdf: Private Alternative | Uploads, limits, features and price compared. |
| `/privacy-proof` | How We Never See Your Files \| [Brand] | Turn off wifi or open the Network tab: nothing is uploaded. |

Each tool page: tool above the fold, 3-step how-to, privacy section, FAQ with schema, hreflang en-GB / fr-FR, related-tool links.

## Launch plan by week

| Week | Channel | Action |
|---|---|---|
| 0 | Rebrand + domain | New name and domain, en/fr tool pages live, Search Console and Bing set up |
| 1 | AlternativeTo + directories | List against Smallpdf, iLovePDF, Sejda, Acrobat, Photopea; SaaSHub, privacy tool lists |
| 2 | Reddit | Helpful posts in r/privacy, r/selfhosted, r/sideproject (follow each sub's rules) |
| 2 | Hacker News | Show HN: browser PDF editor that never uploads your files |
| 3 | Product Hunt | Launch 08:01 London time with the wifi-off demo |
| 3-6 | French SMB forums / LinkedIn | Answer Factur-X and 2027 questions, link the free tool |
| Ongoing | Content | Two guides a month |
| Spring 2027 | FR push | Peak e-invoicing interest before 1 Sept 2027; small Google Ads test |

## French Factur-X timing

- Since **1 Sept 2026** every French business must be able to receive e-invoices.
- From **1 Sept 2027** SMEs and micro-businesses must issue them.
- Invoices must be transmitted through an approved platform (plateforme agréée). Bide's claim is **create and validate Factur-X**, not transmit.

## Blocker: rebrand away from "Barclays"

The repo describes Bide as "Barclays Image & Document Editor". Barclays is a bank's registered trademark: legal, app-store, ad-platform and phishing-flag risk. Nothing launches until this is fixed.

Repo items developers must update:

- [ ] GitHub repo description
- [ ] README title, tagline and any "Barclays" mentions
- [ ] App title, wordmark and B monogram (if the name changes)
- [ ] Demo URL / hosted site name
- [ ] Screenshots in `docs/screenshots`
- [ ] Mobile app IDs and names (Capacitor config, MOBILE.md)
- [ ] HOSTING.md, FEATURES.md and docs/discovery.md references

## Status and next steps

- [x] Keyword research and positioning (Ananas)
- [x] Site structure, titles and metas drafted (Ananas)
- [x] Homepage copy draft (see full plan)
- [ ] Choose new name; check UK IPO, INPI, EUIPO and domain
- [ ] Rebrand repo items above (Claude / Codex)
- [ ] Build tool landing pages, en and fr (Claude)
- [ ] Host with large-file support so Office to PDF works online (Claude)
- [ ] Set up Search Console and privacy-friendly analytics (Ananas)
- [ ] Week 1 directory listings (Ananas)
