import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const MARKETING_ROUTES = ['/', '/pdf-editor/', '/merge-pdf/', '/compress-pdf/', '/pricing/', '/privacy/', '/help/'];
const SOURCE = 'https://github.com/AOSPAndroid/Bide';
const DOWNLOAD = `${SOURCE}/releases/download/v0.8.14/bide-browser.zip`;
const fallbackOrigin = 'https://bide-demo.daaalil.chatgpt.site';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const shield = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3Z" stroke="currentColor" stroke-width="1.5"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function config(options = {}) {
  const url = new URL(options.origin || fallbackOrigin);
  if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Marketing origin must be a public HTTPS origin.');
  const mode = options.mode === 'saas' ? 'saas' : 'demo';
  return {
    ...options,
    origin: url.origin,
    mode,
    priceLabel: typeof options.priceLabel === 'string' ? options.priceLabel.trim() : '',
    gaMeasurementId: /^G-[A-Z0-9]+$/.test(options.gaMeasurementId || '') ? options.gaMeasurementId : '',
  };
}

function appLink(tool = 'edit', label = 'Open PDF editor', secondary = false) {
  return `<a class="button ${secondary ? 'button-secondary' : 'button-primary'}" href="/app/?tool=${tool}" data-bide-event="editor_cta_clicked" data-bide-tool="${tool}">${escape(label)}${arrow}</a>`;
}

function sectionHeading(eyebrow, title, text = '') {
  return `<div class="section-heading"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}</div>`;
}

function documentPreview(kind = 'edit') {
  const details = kind === 'merge'
    ? '<span class="preview-action"><span class="action-dot"></span>Pages in your order</span><span>01 · 02 · 03</span>'
    : kind === 'compress'
      ? '<span class="preview-action"><span class="action-dot"></span>Choose your export</span><span>Balanced quality</span>'
      : '<span class="preview-action"><span class="action-dot"></span>Saved in this browser</span><span>PDF document</span>';
  return `<figure class="document-preview preview-${kind}" aria-label="Illustration of a document being prepared with Bide">
    <div class="preview-top"><span class="preview-app"><img src="/brand-logo.svg" alt="" width="20" height="20">bide</span><span class="preview-file">Project notes.pdf</span><span class="preview-export">Export ${arrow}</span></div>
    <div class="preview-workspace"><div class="preview-rail" aria-hidden="true"><span class="rail-active">↖</span><span>T</span><span>□</span><span>↗</span><span>＋</span></div>
      <div class="preview-pages" aria-hidden="true"><span class="mini-page">01</span><span class="mini-page mini-page-alt">02</span><span class="mini-page">03</span></div>
      <div class="preview-paper"><div class="paper-heading"><span>FIELDNOTES</span><span>01 / 03</span></div><div class="paper-rule"></div><p class="paper-eyebrow">PROJECT NOTES</p><div class="paper-title">A little less<br><span class="${kind === 'edit' ? 'editable-word' : ''}">paperwork.</span></div><p class="paper-body">The details, all in one place.<br>A clear plan for what comes next.</p><div class="paper-graphic" aria-hidden="true"><span></span><span></span><span></span></div><div class="paper-lines" aria-hidden="true"><i></i><i></i><i></i></div><div class="paper-footer"><span>READY FOR THE NEXT STEP</span><span>01</span></div></div>
      ${kind === 'merge' ? '<div class="floating-note"><span class="note-icon">＋</span><span><strong>Bring your pages together</strong><small>Arrange. Review. Export.</small></span></div>' : kind === 'compress' ? '<div class="floating-note"><span class="note-icon">↘</span><span><strong>Find the right balance</strong><small>Original · Balanced · Smaller</small></span></div>' : '<div class="floating-note"><span class="note-icon">T</span><span><strong>Make your changes</strong><small>Text, images & annotations</small></span></div>'}
    </div><div class="preview-status">${details}</div><figcaption>Illustrative document preview. Try the editor with your own file.</figcaption>
  </figure>`;
}

function faq(items) {
  return `<div class="faq-list">${items.map(([q, a]) => `<details><summary>${q}<span aria-hidden="true">＋</span></summary><div class="faq-answer">${a}</div></details>`).join('')}</div>`;
}

function endCta(title = 'Your next PDF, sorted.', tool = 'edit', label = 'Open PDF editor') {
  return `<section class="end-cta wrap"><div><p class="eyebrow">MAKE IT YOURS</p><h2>${title}</h2><p>Open a document. Make your changes. Download the result.</p></div>${appLink(tool, label)}</section>`;
}

function home(c) {
  return `<section class="hero wrap"><div class="hero-copy"><p class="eyebrow"><span class="small-line"></span>YOUR EVERYDAY PDF WORKSPACE</p><h1>Less paperwork.<br><em>More possibility.</em></h1><p class="hero-description">Edit, merge and compress PDFs in your browser. Your documents are processed on your device, so you can get on with the work.</p><div class="hero-actions">${appLink('edit', 'Open PDF editor')}<a class="text-link" href="#tools">Find your tool <span aria-hidden="true">↘</span></a></div><p class="hero-note">${c.mode === 'demo' ? 'Free browser demo · No account required' : 'Browser-based tools · Local document processing'}</p></div>${documentPreview()}</section>
    <div class="principles wrap"><span>${shield}Document processing on your device</span><span><b aria-hidden="true">↗</b>Download the finished PDF</span><span><b aria-hidden="true">⌘</b>No application to install</span></div>
    <section id="tools" class="section wrap tool-section">${sectionHeading('A TOOL FOR THE TASK', 'What would you like to do?', 'Start with the job in front of you. Everything opens in the same PDF workspace.')}<div class="tool-rows">
      <a class="tool-row" href="/pdf-editor/"><span class="tool-number">01</span><span class="tool-symbol">T<span class="symbol-caret"></span></span><span class="tool-copy"><h3>Edit a PDF</h3><p>Update detected text. Add notes, images and visual signatures.</p></span><span class="row-arrow">${arrow}</span></a>
      <a class="tool-row" href="/merge-pdf/"><span class="tool-number">02</span><span class="tool-symbol merge-symbol"><i></i><i></i></span><span class="tool-copy"><h3>Merge PDFs</h3><p>Bring separate files together and put pages in the right order.</p></span><span class="row-arrow">${arrow}</span></a>
      <a class="tool-row" href="/compress-pdf/"><span class="tool-number">03</span><span class="tool-symbol compress-symbol">↘<span>↖</span></span><span class="tool-copy"><h3>Compress a PDF</h3><p>Choose an export that balances file size and image quality.</p></span><span class="row-arrow">${arrow}</span></a>
    </div></section>
    <section class="how-section"><div class="wrap how-layout">${sectionHeading('FROM FILE TO FINISHED', 'A familiar workflow.<br>A little less friction.')}<ol class="steps"><li><span>01</span><div><h3>Open your document</h3><p>Choose a PDF from your device. Bide prepares it in your browser.</p></div></li><li><span>02</span><div><h3>Make it work for you</h3><p>Edit text, combine pages or choose a compression preset. Review the result before exporting.</p></div></li><li><span>03</span><div><h3>Keep the finished file</h3><p>Download your PDF. Save a .bide project as well if you want to return to your editable workspace.</p></div></li></ol></div></section>
    <section class="section wrap privacy-feature"><div class="privacy-mark" aria-hidden="true">${shield}<span>ON YOUR<br>DEVICE.</span></div><div>${sectionHeading('YOUR FILES STAY WITH YOU', 'The document is yours.<br>The processing stays local.', 'Bide processes PDF and image content in your browser. Your workspace can be saved locally, and the final file downloads straight to your device.')}<p class="body-muted">The website still downloads the resources needed to run its tools. Account and payment services, where enabled, handle account information separately from your documents.</p><a class="text-link" href="/privacy/">How Bide handles data ${arrow}</a></div></section>
    <section class="section wrap faq-section">${sectionHeading('A FEW USEFUL ANSWERS', 'Before you begin.')} ${faq([
      ['Do I need to upload my PDF?', '<p>No document upload is needed for editing. Bide reads and processes the file in your browser. It downloads application resources and, for some tools, AI models.</p>'],
      ['Can I edit text that is already in a PDF?', '<p>Yes. Bide detects supported text regions and lets you replace them. Fonts and complex layouts can require adjustment. Scanned pages use OCR, so check recognized text carefully.</p>'],
      ['Will my work still be here when I return?', '<p>The current workspace autosaves in this browser. Download an editable .bide project before clearing browser storage or changing devices. Browser autosave is not a cloud backup.</p>'],
      ['Is the browser demo free?', `<p>${c.mode === 'demo' ? 'Yes. This browser demo currently works without an account or payment.' : 'This is the hosted edition. See the pricing page for the offer available on this site.'} <a href="/pricing/">See pricing and editions.</a></p>`],
    ])}</section>${endCta()}`;
}

const tools = {
  '/pdf-editor/': {
    key: 'edit', name: 'PDF editor', title: 'Edit PDFs in your browser, without uploading your documents | Bide',
    description: 'Edit detected PDF text, add notes, images and visual signatures, then export your document. Bide processes your PDF in your browser.',
    eyebrow: 'BIDE PDF EDITOR', headline: 'Make the changes.<br><em>Keep it your document.</em>',
    intro: 'Correct detected text, add a note, place an image or prepare a document for sharing. Work on your PDF in your browser, with document processing on your device.',
    cta: 'Open PDF editor',
    steps: [['Open the PDF', 'Choose your file from your device. Password-protected documents require their existing password.'], ['Edit and review', 'Click a detected text region to replace it, or add a text box, image, shape or visual signature. Check the page appearance as you go.'], ['Export your work', 'Download the finished PDF. Save a .bide project to keep the original sources and editable layers for later.']],
    detailTitle: 'Useful changes, in one workspace.',
    details: [['Work with existing text', 'Supported PDF text is detected on the page. Bide removes the selected source text and replaces it with an editable layer. Available embedded fonts are reused when possible.'], ['Add the finishing touches', 'Place a note, image, shape or drawn/typed signature. Adjust position, size and appearance, then review your document before exporting.'], ['Bring scanned pages into the workflow', 'Local OCR can recognize text in scanned pages and images. Recognition and background replacement are imperfect, so proofread and inspect the result.']],
    limitations: 'Complex layouts, rotated text, missing fonts and unsupported characters may need manual adjustment. A visual signature is not a cryptographic certificate signature. Exporting can affect existing signatures, bookmarks and internal navigation. Keep your original file.',
    faqs: [['Can Bide exactly match every PDF font?', '<p>No. Bide reuses usable embedded fonts where possible and otherwise offers a substitute. Font metrics, line wrapping and new characters can change the result.</p>'], ['Can I keep form fields fillable?', '<p>Use the <strong>Keep form fields fillable</strong> option when exporting a PDF. Without that option, field values are drawn into the page. Review the export in your intended PDF viewer.</p>'], ['Is a saved project the same as an exported PDF?', '<p>No. A .bide project keeps sources and editable editor layers. A PDF is the document you share or print. Save both if you want to continue editing later.</p>']],
  },
  '/merge-pdf/': {
    key: 'merge', name: 'Merge PDF', title: 'Merge PDF files in your browser, without uploading documents | Bide',
    description: 'Combine PDFs and supported images, reorder pages and download one PDF. Bide merges your documents locally in your browser.',
    eyebrow: 'BIDE PDF MERGER', headline: 'Separate files.<br><em>One clear document.</em>',
    intro: 'Bring a proposal, supporting pages or a collection of scans into one PDF. Arrange the pages in the order you need, with processing on your device.',
    cta: 'Start merging PDFs',
    steps: [['Choose your documents', 'Open the PDFs you want to combine. You can select more than one file and add supported images to the same workspace.'], ['Put pages in order', 'Review the page thumbnails. Drag to reorder them, add more documents or remove pages you do not need.'], ['Download one PDF', 'Export the combined document as a PDF. Open the downloaded file and check the page order before sharing.']],
    detailTitle: 'A document assembled your way.',
    details: [['Combine PDFs and images', 'Bring separate PDF files and supported image formats into one document. The imported pages appear in the editor for review.'], ['Control the page order', 'Use page thumbnails to organize the document. Rotate, duplicate or delete pages through the page menu.'], ['Export the pages you need', 'Download the complete document or enter a page range in the export dialog. Save a .bide project if the document will need more work later.']],
    limitations: 'Exporting creates a new PDF. Existing certificate signatures, bookmarks and internal navigation are not guaranteed to be preserved. Protected documents require their password. The practical size of a job depends on the memory available to your browser.',
    faqs: [['Do the files leave my device?', '<p>The document contents are processed in your browser. The website downloads the resources needed to run, but the merge operation does not upload your PDFs.</p>'], ['Can I change the order after adding files?', '<p>Yes. Drag page thumbnails into the order you want. Check the exported PDF before sending it.</p>'], ['Can I merge a very large document?', '<p>The browser needs enough memory to load and process the selected pages. There is no universal file-size guarantee; for demanding jobs, try smaller groups on a desktop browser.</p>']],
  },
  '/compress-pdf/': {
    key: 'compress', name: 'Compress PDF', title: 'Compress PDFs in your browser with a choice of quality settings | Bide',
    description: 'Choose lossless optimization, balanced compression or a smaller-file preset. Reduce PDF size where possible, with processing on your device.',
    eyebrow: 'BIDE PDF COMPRESSOR', headline: 'Find the balance.<br><em>Size and substance.</em>',
    intro: 'Prepare a PDF for sharing with a choice of export settings. Keep original image quality, or trade some image detail for a smaller file. Processing happens in your browser.',
    cta: 'Open PDF compressor',
    steps: [['Open your PDF', 'Choose the PDF you want to optimize. Keep the original so you can compare it with the result.'], ['Choose a preset', 'Try Original quality for lossless optimization. Balanced and Smaller file can reduce the size and quality of large images.'], ['Download and compare', 'Export the result, check its size and review the pages. If images are too soft, try a higher-quality setting.']],
    detailTitle: 'Three settings. A practical choice.',
    details: [['Original quality', 'Applies lossless optimization to PDF streams. It avoids intentionally reducing image resolution or quality. The output may not be smaller.'], ['Balanced', 'Optimizes large images to balance their detail and file size. A useful starting point when a PDF contains large photos or scans.'], ['Smaller file', 'Reduces large images more aggressively. Review small text and image details carefully before sharing the result.']],
    limitations: 'Compression savings depend on the source. A PDF that is already optimized may stay the same size or become larger after export. Balanced and Smaller file can reduce image quality. No preset guarantees a particular size or percentage reduction.',
    faqs: [['Can I compress without losing image quality?', '<p>Choose <strong>Original quality</strong> for lossless optimization. It may provide little reduction if the PDF is already optimized. The other presets can reduce image quality.</p>'], ['Why is my exported PDF not smaller?', '<p>Some files already use efficient compression. Exporting can also change how a PDF stores its content. Compare the result with your original and keep the version that suits your needs.</p>'], ['Can I guarantee a file below an email limit?', '<p>No. Bide offers quality presets rather than a guaranteed target size. Try a smaller preset, review the result, or export a selected page range if that suits your task.</p>']],
  },
};

function toolPage(t, c) {
  return `<div class="wrap">${breadcrumbs(t.name)}</div><section class="hero tool-hero wrap"><div class="hero-copy"><p class="eyebrow">${t.eyebrow}</p><h1>${t.headline}</h1><p class="hero-description">${t.intro}</p><div class="hero-actions">${appLink(t.key, t.cta)}</div><p class="hero-note">${c.mode === 'demo' ? 'Free browser demo · No account required' : 'Document processing on your device'}</p></div>${documentPreview(t.key)}</section>
    <section class="how-section"><div class="wrap how-layout">${sectionHeading('HOW IT WORKS', `Your ${t.key === 'merge' ? 'combined' : t.key === 'compress' ? 'optimized' : 'edited'} PDF,<br>in three steps.`)}<ol class="steps">${t.steps.map(([title, body], i) => `<li><span>0${i + 1}</span><div><h3>${title}</h3><p>${body}</p></div></li>`).join('')}</ol></div></section>
    <section class="section wrap detail-section">${sectionHeading('KNOW YOUR TOOLS', t.detailTitle)}<div class="feature-columns">${t.details.map(([title, body]) => `<article><h3>${title}</h3><p>${body}</p></article>`).join('')}</div><div class="honest-note"><h3>Worth knowing before you export</h3><p>${t.limitations}</p></div></section>
    <section class="section wrap faq-section">${sectionHeading('QUESTIONS, ANSWERED', `About ${t.key === 'merge' ? 'merging PDFs' : t.key === 'compress' ? 'PDF compression' : 'PDF editing'}.`)}${faq(t.faqs)}</section>
    <section class="related-tools wrap"><h2>Keep working on your PDF</h2><div>${Object.entries(tools).filter(([,v]) => v.key !== t.key).map(([path,v])=>`<a href="${path}">${v.name}${arrow}</a>`).join('')}<a href="/help/">Help & shortcuts${arrow}</a></div></section>${endCta(t.key === 'merge' ? 'Bring your pages together.' : t.key === 'compress' ? 'Ready to try an export?' : 'Make your next edit.', t.key, t.cta)}`;
}

function breadcrumbs(name) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">${escape(name)}</span></nav>`;
}

function pageIntro(eyebrow, title, intro) {
  return `<header class="page-intro"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${intro}</p></header>`;
}

function pricing(c) {
  const isPaid = c.mode === 'saas';
  return `<div class="wrap">${breadcrumbs('Pricing')}${pageIntro('PRICING & EDITIONS', isPaid ? 'A clear place to start.' : 'Start with the free<br><em>browser demo.</em>', isPaid ? 'Use Bide’s browser tools with a hosted account. Document editing still happens on your device.' : 'Try the PDF workspace before deciding how it fits your work. This demo is available without an account or payment.')}
    <section class="pricing-layout" aria-labelledby="edition-title"><article class="price-panel"><p class="eyebrow">${isPaid ? 'HOSTED EDITION' : 'AVAILABLE NOW'}</p><h2 id="edition-title">${isPaid ? 'Bide subscription' : 'Browser demo'}</h2><p class="price">${isPaid ? (c.priceLabel ? escape(c.priceLabel) : 'See the current offer') : 'Free'}${!isPaid ? '<span>No account required</span>' : ''}</p><p>${isPaid ? (c.priceLabel ? 'The price shown here is the advertised subscription offer. Review the final billing amount and terms before subscribing.' : 'The sign-up and checkout screens show the offer available for this deployment before you pay.') : 'Open the editor and work with your files directly in your browser.'}</p><ul class="check-list"><li>PDF text editing and annotations</li><li>Merge, reorder and export pages</li><li>PDF compression presets</li><li>Local document processing</li><li>Editable .bide project downloads</li></ul>${appLink('edit', isPaid ? 'Open Bide' : 'Try the browser demo')}<p class="small-copy">${isPaid ? 'Account access and billing require an internet connection. Documents are processed in your browser.' : 'The demo is provided as it is today. See Help for supported features and limitations.'}</p></article>
    <div class="edition-notes"><article><span class="line-icon">↓</span><h2>Prefer the local edition?</h2><p>The downloadable Windows package runs from your own computer with Node.js. It includes the Office conversion engine, which is not part of the hosted website.</p><a class="text-link" href="${DOWNLOAD}">Get the local download ${arrow}</a><p class="small-copy"><a href="${SOURCE}#start-on-windows">Read setup requirements</a> before downloading.</p></article><article><span class="line-icon">${shield}</span><h2>Your files, on your device</h2><p>Both editions process document content locally. Browser autosave stays with the browser you use; save a .bide project to move your work.</p><a class="text-link" href="/privacy/">Read the data explanation ${arrow}</a></article>${!isPaid ? '<article class="coming-note"><h2>About the paid edition</h2><p>A subscription edition is being prepared. Subscriptions are not available on this demo. Its final offer and terms will be shown before sign-up when it becomes available.</p></article>' : ''}</div></section>
    <section class="section faq-section">${sectionHeading('THE DETAILS', 'Choose with the facts in view.')} ${faq([
      ['Does the hosted version include Office conversion?', '<p>No. Word, Excel and PowerPoint conversion is part of the local download. The hosted website supports PDF tools and its supported image/text workflows.</p>'],
      ['Do I get a cloud document library?', '<p>No. Documents and editable workspace data stay in your browser. Save a .bide project and keep your own backups when you want to continue on another device.</p>'],
      [isPaid ? 'Where can I manage a subscription?' : 'Do I need to enter a payment card?', isPaid ? '<p>Use the account menu in the editor to open subscription management. Review the checkout and account screens for the terms that apply to your subscription.</p>' : '<p>No. This browser demo does not ask for an account or payment card.</p>'],
    ])}</section></div>`;
}

function privacy(c) {
  const measurement = c.gaMeasurementId
    ? `<p>This site offers optional Google Analytics measurement. It starts only after you accept. Declining leaves analytics off and does not block the editor. A Global Privacy Control signal also keeps measurement off.</p><p>Measurement records fixed page and task names, a broad source category, and events such as opening the editor or completing an export. It does not include document contents, filenames, email addresses, passwords, full referring URLs or page-query values. Google Analytics also processes browser/device information and uses analytics cookies after acceptance. Google signals and advertising personalization are disabled in this integration.</p><p>Your preference and the configured analytics cookies last up to 180 days. You can change your choice below. Withdrawal stops future measurement events and attempts to remove this site's analytics cookies; it does not remove data already received by Google. Server-side retention depends on the Analytics property settings.</p><button class="button button-secondary" type="button" data-measurement-preferences>Change measurement preference</button>`
    : '<p>Optional usage measurement is not configured on this deployment. No Google Analytics stream is loaded by Bide. The website host still receives the normal connection information needed to serve pages and application resources.</p>';
  return `<div class="wrap">${breadcrumbs('Privacy')}${pageIntro('HOW BIDE HANDLES DATA', 'Your documents.<br><em>Your device.</em>', 'A practical explanation of what stays in your browser, what the website downloads and what an account may send to a server.')}
    <div class="article-layout"><aside class="article-nav" aria-label="On this page"><a href="#documents">Documents</a><a href="#saved-work">Saved work</a><a href="#network">Network requests</a><a href="#accounts">Accounts & billing</a><a href="#measurement">Usage measurement</a><a href="#questions">Questions</a></aside><article class="prose">
      <section id="documents"><h2>Document processing happens in your browser</h2><p>Bide reads PDF and image files on your device. Editing, merging, compression and supported OCR run in the browser. These operations do not send your document contents to a document-conversion service.</p><p>Opening a file in Bide does not publish it or make it available to other visitors. The app does not provide a shared cloud document library or live document collaboration.</p></section>
      <section id="saved-work"><h2>What is saved on your device</h2><p>The editor autosaves the current workspace in this browser using local browser storage. Preferences, such as OCR languages, are also stored locally. Some downloaded models may be cached so they do not need to download again.</p><p>A .bide project includes source PDFs or images and the editable editor layers. Download one before changing computers, clearing browser storage or relying on a different browser. Undo history belongs to the current session.</p><p>Browser autosaves and .bide project files are not encrypted by Bide. Password protection, when selected, applies to the exported PDF. Clearing site data through your browser removes the local workspace, preferences and caches; the browser may also remove stored data under its own storage policy.</p></section>
      <section id="network"><h2>The website still makes network requests</h2><p>Your browser downloads Bide's application files, fonts and processing resources. In the public demo, some AI models are downloaded on demand from Hugging Face and checked against pinned hashes before use. The model download does not include the document being edited.</p><p>The site host and resource hosts receive ordinary connection information, such as an IP address and browser request details, when serving those resources. Local document processing does not mean the website operates without any network communication.</p><p>The hosted website requires a connection to load. For the local edition's offline setup, see the <a href="${SOURCE}#start-on-windows">download documentation</a>.</p></section>
      <section id="accounts"><h2>Accounts and payments are separate from documents</h2>${c.mode === 'demo' ? '<p>This public demo does not require an account or take subscription payments. No email address or payment information is needed to edit a document here.</p><p>A separately deployed subscription edition uses account and billing services. Its sign-in flow sends an email address to request a code; its server handles sessions, licences and subscription status. Email and payment providers handle their respective operations. That account information is distinct from locally processed document contents.</p>' : '<p>This hosted edition sends the information needed to manage an account to its licence service: an email address for sign-in codes, session information and subscription status. The configured email service delivers sign-in messages. Stripe handles checkout and subscription management.</p><p>Account and payment operations do not require uploading the documents you edit. Account storage and local document storage serve different purposes.</p>'}</section>
      <section id="measurement"><h2>Optional usage measurement</h2>${measurement}</section>
      <section id="questions"><h2>Questions about the product</h2><p>The implementation is available in the <a href="${SOURCE}">Bide source repository</a>. For product questions or a bug report, use <a href="${SOURCE}/issues">GitHub Issues</a>. Issues are public, so describe the problem with a sample that does not contain private information.</p><p>For practical steps such as saving a project or clearing local data, see <a href="/help/">Help</a>.</p></section>
    </article></div></div>`;
}

function help() {
  return `<div class="wrap">${breadcrumbs('Help')}${pageIntro('A LITTLE GUIDANCE', 'Get the job done.<br><em>Keep your work.</em>', 'The essentials for opening, editing and exporting documents in Bide.')}
    <div class="help-topics"><a href="#getting-started">Getting started ${arrow}</a><a href="#saving">Saving your work ${arrow}</a><a href="#limitations">What to expect ${arrow}</a><a href="#shortcuts">Keyboard shortcuts ${arrow}</a></div>
    <div class="article-layout"><aside class="article-nav" aria-label="Help topics"><a href="#getting-started">Open a document</a><a href="#tools">Use the PDF tools</a><a href="#saving">Save & export</a><a href="#limitations">Limits & troubleshooting</a><a href="#shortcuts">Shortcuts</a><a href="#support">Get help</a></aside><article class="prose">
      <section id="getting-started"><h2>Open a document</h2><p>Open the <a href="/app/?tool=edit" data-bide-event="editor_cta_clicked" data-bide-tool="edit">PDF editor</a>, then choose <strong>Open files</strong> and select a PDF from your device. You can also drop supported files into the workspace. For a protected PDF, enter its existing password.</p><p>Use a current desktop browser for the full workspace and larger documents. Chrome or Edge are practical starting points. Browser memory and device capability affect demanding jobs, especially OCR and large image files.</p><p>The hosted edition includes PDF, image and supported text workflows. Office conversion belongs to the local download.</p></section>
      <section id="tools"><h2>Choose the task you need</h2><h3>Edit text</h3><p>Wait for detected text regions to appear, then click a supported region to replace it. Use the text tool to add a new text box. Review font, position and line wrapping before exporting. Scanned text needs OCR and proofreading.</p><h3>Merge documents</h3><p>Open the first set of files, then use <strong>Import & merge</strong> to add more. Drag page thumbnails to set their order. Review all pages so a previous workspace or sample page is not included by accident.</p><h3>Compress a PDF</h3><p>Choose <strong>Compress PDF</strong> or open Export and select a compression preset. Original quality is lossless optimization; Balanced and Smaller file can reduce image quality. Compare the exported file with your original.</p><h3>Find another action</h3><p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to find a tool. The PDF workspace also groups actions for organizing, converting, editing and protecting documents.</p></section>
      <section id="saving"><h2>Save an editable project. Export a finished document.</h2><p><strong>Save project</strong> downloads a .bide file containing your source documents and editable layers. Reopen it in Bide when you want to continue working.</p><p><strong>Export</strong> creates a PDF or another supported output for sharing. Use a page range if you only want part of the document. To retain supported form fields as fillable fields, enable that export option.</p><p>The current workspace also autosaves in this browser. That is not a cloud backup and will not follow you to another device. Save a project before clearing site data. Browser storage and .bide files are unencrypted.</p></section>
      <section id="limitations"><h2>What to expect</h2><h3>Text or a font looks different</h3><p>Not every PDF includes a usable embedded font. Bide may substitute a font, and some layouts need manual adjustment. Review the result in a PDF viewer before sharing it.</p><h3>OCR has recognized the wrong words</h3><p>Check the detected text against the page. Select the appropriate OCR languages and correct the words manually. Faint scans, unusual fonts and complex backgrounds can produce errors.</p><h3>Compression made little difference</h3><p>The source may already be efficiently compressed. Try another preset and inspect image quality; there is no guaranteed size reduction.</p><h3>A large job is slow or cannot finish</h3><p>The browser needs memory to hold the document and process it. Try fewer files or pages at a time on a desktop device. Some AI tools download resources on first use, so the initial load can take longer.</p><h3>Will every PDF feature be preserved?</h3><p>No. Existing certificate signatures, bookmarks and internal navigation may not survive export. Visual signatures added in the editor do not cryptographically sign a PDF. Cropping hides content outside the page boundary; it does not remove that content as redaction would.</p></section>
      <section id="shortcuts"><h2>A few useful shortcuts</h2><div class="shortcut-table"><div><span>Find a tool</span><kbd>Ctrl K</kbd></div><div><span>Open a file</span><kbd>Ctrl O</kbd></div><div><span>Save an editable project</span><kbd>Ctrl S</kbd></div><div><span>Export</span><kbd>Ctrl Shift E</kbd></div><div><span>Undo / redo</span><kbd>Ctrl Z / Ctrl Shift Z</kbd></div><div><span>Fit page to window</span><kbd>Ctrl 0</kbd></div></div><p>Open the editor's Help menu for the full shortcut list. Browser and operating-system shortcuts can take precedence.</p></section>
      <section id="support"><h2>Still need help?</h2><p>Check the <a href="${SOURCE}#readme">project documentation</a> or <a href="${SOURCE}/issues">report a problem on GitHub</a>. Include your browser, the steps you took and the error message. Use a harmless sample file if a document is needed to demonstrate the issue.</p></section>
    </article></div>${endCta('Ready when you are.')}</div>`;
}

function footer(c) {
  return `<footer class="site-footer"><div class="wrap footer-top"><a class="brand" href="/" aria-label="Bide home"><img src="/brand-logo.svg" width="32" height="32" alt=""><span>bide<span class="brand-dot">.</span></span></a><p>Good tools. Less paperwork.</p><div class="footer-links"><a href="/pricing/">Pricing</a><a href="/privacy/">Privacy</a><a href="/help/">Help</a><a href="${SOURCE}">Source code ${arrow}</a></div></div><div class="wrap footer-bottom"><span>© ${new Date().getUTCFullYear()} bide</span><span>PDFs processed on your device.</span><button type="button" data-measurement-preferences>Measurement preferences</button></div></footer>`;
}

export function renderMarketingPage(path, options = {}) {
  const c = config(options);
  const clean = String(path).split(/[?#]/)[0];
  const route = clean === '/' ? '/' : clean.replace(/\/+$/, '') + '/';
  const notFound = clean === '/404.html';
  if (!notFound && !MARKETING_ROUTES.includes(route)) return null;
  const names = {'/':'Home','/pricing/':'Pricing','/privacy/':'Privacy','/help/':'Help'};
  const name = tools[route]?.name || names[route] || 'Page not found';
  const metadata = {
    '/': ['Bide — Edit, merge and compress PDFs in your browser', `Edit PDF text, combine documents and choose compression settings. Bide processes documents on your device.${c.mode === 'demo' ? ' Try the free browser demo.' : ''}`],
    '/pricing/': [`Bide pricing | ${c.mode === 'demo' ? 'Free browser demo and local edition' : 'Hosted edition'}`, c.mode === 'demo' ? 'Try Bide’s free browser demo without an account. Compare the hosted PDF tools with the local download and understand the available editions.' : 'Review the Bide hosted offer and understand local document processing, account access and supported features.'],
    '/privacy/': ['How Bide handles your documents and data | Privacy', 'Understand Bide’s local document processing, browser autosave, resource downloads, account services and optional usage measurement.'],
    '/help/': ['Bide help | Open, edit, merge, compress and save PDFs', 'Get started with Bide. Learn to open documents, edit text, merge pages, choose compression, save projects and export finished PDFs.'],
  };
  const [title, description] = notFound ? ['Page not found | Bide', 'Find Bide’s PDF editor, merger, compressor, pricing and help.'] : tools[route] ? [tools[route].title, tools[route].description] : metadata[route];
  const page = route === '/' ? 'home' : route.replaceAll('/', '');
  const canonical = `${c.origin}${route}`;
  const schema = [
    {'@context':'https://schema.org','@type':'SoftwareApplication',name:'Bide',applicationCategory:'BusinessApplication',operatingSystem:'Web browser',url:c.origin + '/',description:'Browser-based PDF editing, merging and compression with local document processing.',...(c.mode === 'demo' ? {offers:{'@type':'Offer',price:'0',priceCurrency:'EUR',url:c.origin + '/pricing/'}} : {}),sameAs:[SOURCE]},
    ...(route !== '/' && !notFound ? [{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:c.origin + '/'},{'@type':'ListItem',position:2,name,item:canonical}]}] : []),
  ];
  const content = notFound
    ? `<section class="not-found wrap"><p class="eyebrow">404 · PAGE NOT FOUND</p><h1>A small detour.<br><em>Your tools are here.</em></h1><p>This address does not lead to a Bide page. Find the PDF tool you need or return to the homepage.</p><div class="hero-actions"><a class="button button-primary" href="/">Back to Bide ${arrow}</a><a class="text-link" href="/help/">Get help ${arrow}</a></div><div class="not-found-links"><a href="/pdf-editor/">Edit a PDF</a><a href="/merge-pdf/">Merge PDFs</a><a href="/compress-pdf/">Compress a PDF</a></div></section>`
    : route === '/' ? home(c) : tools[route] ? toolPage(tools[route], c) : route === '/pricing/' ? pricing(c) : route === '/privacy/' ? privacy(c) : help();
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#fffefd"><title>${escape(title)}</title><meta name="description" content="${escape(description)}">${notFound ? '<meta name="robots" content="noindex,follow">' : `<link rel="canonical" href="${escape(canonical)}"><meta name="robots" content="index,follow,max-image-preview:large">`}<meta property="og:type" content="website"><meta property="og:site_name" content="Bide"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(notFound ? c.origin + '/404.html' : canonical)}"><meta name="twitter:card" content="summary"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/marketing/site.css">${c.googleVerification ? `<meta name="google-site-verification" content="${escape(c.googleVerification)}">` : ''}${c.bingVerification ? `<meta name="msvalidate.01" content="${escape(c.bingVerification)}">` : ''}${!notFound ? `<script type="application/ld+json">${json(schema)}</script>` : ''}<script id="bide-measurement-config" type="application/json">${json({measurementId:c.gaMeasurementId,page:notFound ? 'not-found' : page})}</script><script defer src="/measurement.js"></script><script defer src="/marketing/site.js"></script></head><body><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="Bide home"><img src="/brand-logo.svg" width="34" height="34" alt=""><span>bide<span class="brand-dot">.</span></span></a><button class="menu-toggle" type="button" data-menu-toggle aria-controls="site-nav" aria-expanded="false" hidden>Menu <span aria-hidden="true">＋</span></button><nav id="site-nav" class="site-nav" aria-label="Main navigation"><a href="/#tools">PDF tools</a><a href="/privacy/"${route === '/privacy/' ? ' aria-current="page"' : ''}>Your privacy</a><a href="/pricing/"${route === '/pricing/' ? ' aria-current="page"' : ''}>Pricing</a><a href="/help/"${route === '/help/' ? ' aria-current="page"' : ''}>Help</a>${appLink('edit', 'Open editor')}</nav></div></header><main id="main">${content}</main>${footer(c)}</body></html>`;
}

export async function writeMarketingSite(options = {}) {
  if (!options.outDir) throw new TypeError('writeMarketingSite requires outDir.');
  const c = config(options);
  const outDir = resolve(options.outDir);
  await mkdir(join(outDir, 'marketing'), {recursive:true});
  for (const path of MARKETING_ROUTES) {
    const file = path === '/' ? join(outDir, 'index.html') : join(outDir, path.slice(1), 'index.html');
    await mkdir(dirname(file), {recursive:true});
    await writeFile(file, renderMarketingPage(path, c), 'utf8');
  }
  await writeFile(join(outDir, '404.html'), renderMarketingPage('/404.html', c), 'utf8');
  for (const file of ['site.css', 'site.js']) await writeFile(join(outDir, 'marketing', file), await readFile(new URL(file, import.meta.url)));
  const urls = MARKETING_ROUTES.map(path => c.origin + path);
  await writeFile(join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`, 'utf8');
  await writeFile(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${c.origin}/sitemap.xml\n`, 'utf8');
  return {outDir, origin:c.origin, routes:[...MARKETING_ROUTES], urls};
}
