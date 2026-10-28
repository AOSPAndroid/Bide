/* Optional, consent-first GA4 measurement. No configured stream means no analytics.
 * Keep this classic script independent of the editor bundle. See docs/measurement.md.
 */
(function (createMeasurement) {
  if (typeof module === 'object' && module.exports) {
    module.exports = { createMeasurement };
    return;
  }
  if (typeof window === 'undefined' || !window.document || window.bideMeasurement) return;
  window.bideMeasurement = createMeasurement(window);
  const boot = () => {
    let config = {};
    try { config = JSON.parse(window.document.getElementById('bide-measurement-config')?.textContent || '{}'); } catch { /* Disabled on invalid configuration. */ }
    window.bideMeasurement.init(config);
    window.dispatchEvent(new CustomEvent('bide-measurement-ready'));
  };
  if (window.document.readyState === 'loading') window.document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(function createMeasurement(win) {
  'use strict';
  const doc = win.document;
  const CHOICE_KEY = 'bide.analytics.choice.v1';
  const SOURCE_KEY = 'bide.analytics.source.v1';
  const CONSENT_MS = 180 * 86400000;
  const SOURCE_MS = 30 * 60000;
  const COOKIE_PREFIX = 'bide_analytics';
  const EVENTS = new Set(['page_view', 'editor_cta_clicked', 'editor_opened', 'document_opened', 'export_completed', 'sign_in_complete', 'checkout_started']);
  const TOOLS = new Set(['edit', 'merge', 'compress', 'split', 'convert', 'ocr', 'other']);
  const FORMATS = new Set(['pdf', 'png', 'jpg', 'svg', 'split', 'txt', 'docx', 'psd', 'bide', 'other']);
  const PAGES = {
    home: ['/', 'Bide — PDF tools in your browser'],
    'pdf-editor': ['/pdf-editor/', 'Bide — PDF editor'],
    'merge-pdf': ['/merge-pdf/', 'Bide — Merge PDF'],
    'compress-pdf': ['/compress-pdf/', 'Bide — Compress PDF'],
    pricing: ['/pricing/', 'Bide — Pricing'],
    privacy: ['/privacy/', 'Bide — Privacy'],
    help: ['/help/', 'Bide — Help'],
    app: ['/app/', 'Bide — Editor'],
    other: ['/', 'Bide']
  };
  const SOURCES = {
    google: 'https://www.google.com/', bing: 'https://www.bing.com/',
    chatgpt: 'https://chatgpt.com/', copilot: 'https://copilot.microsoft.com/',
    perplexity: 'https://www.perplexity.ai/', direct: '', other: ''
  };
  const state = { id: '', page: 'home', tool: 'edit', choice: 'unset', expiresAt: 0, active: false, source: 'direct', initialized: false };
  let providerRequested = false, providerLoaded = false, providerScript, expiryTimer, dialog, returnFocus;

  const now = () => Date.now();
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const hasGpc = () => win.navigator?.globalPrivacyControl === true;
  const validId = value => typeof value === 'string' && /^G-[A-Z0-9]{6,20}$/.test(value.trim()) ? value.trim() : '';
  const storage = (kind, operation, key, value) => {
    try { return win[kind][operation](key, value); } catch { return null; }
  };
  const readJson = (kind, key) => {
    try { return JSON.parse(storage(kind, 'getItem', key) || 'null'); } catch { return null; }
  };
  const inferPage = () => {
    const pathname = win.location.pathname.replace(/\/+$/, '') || '/';
    return Object.keys(PAGES).find(key => key !== 'other' && (PAGES[key][0].replace(/\/+$/, '') || '/') === pathname) || 'other';
  };
  function incomingSource() {
    if (!doc.referrer) return 'direct';
    try {
      const ref = new URL(doc.referrer);
      if (!['http:', 'https:'].includes(ref.protocol) || ref.origin === win.location.origin) return 'direct';
      const host = ref.hostname.toLowerCase();
      if (/(^|\.)google\.(com|fr|co\.uk|de|es|it|ca|com\.au|co\.in|co\.jp|nl|be|ch)$/.test(host)) return 'google';
      if (host === 'bing.com' || host.endsWith('.bing.com')) return 'bing';
      if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'chatgpt';
      if (host === 'copilot.microsoft.com') return 'copilot';
      if (host === 'perplexity.ai' || host.endsWith('.perplexity.ai')) return 'perplexity';
      return 'other';
    } catch { return 'other'; }
  }
  // Only a finite source category crosses public pages -> editor, and only after consent.
  function sourceAfterConsent() {
    const incoming = incomingSource(), stored = readJson('sessionStorage', SOURCE_KEY);
    state.source = incoming === 'direct' && stored && owns(SOURCES, stored.source) && Number.isFinite(stored.expiresAt) && stored.expiresAt > now()
      ? stored.source : incoming;
    storage('sessionStorage', 'setItem', SOURCE_KEY, JSON.stringify({ source: state.source, expiresAt: now() + SOURCE_MS }));
  }
  function readChoice() {
    const record = readJson('localStorage', CHOICE_KEY);
    if (!record || record.version !== 1 || record.measurementId !== state.id || !['accepted', 'declined'].includes(record.choice)
      || !Number.isFinite(record.expiresAt) || record.expiresAt <= now() || record.expiresAt > now() + CONSENT_MS + 60000) return { choice: 'unset', expiresAt: 0 };
    return { choice: record.choice, expiresAt: record.expiresAt };
  }
  function clearAnalyticsStorage() {
    storage('sessionStorage', 'removeItem', SOURCE_KEY);
    try {
      const names = doc.cookie.split(';').map(part => part.trim().split('=')[0]).filter(name => name.startsWith(COOKIE_PREFIX + '_'));
      const secure = win.location.protocol === 'https:' ? '; Secure' : '';
      for (const name of names) for (const domain of ['', '; Domain=' + win.location.hostname, '; Domain=.' + win.location.hostname]) {
        doc.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax' + secure + domain;
      }
    } catch { /* Browser policy may prevent removal; no document data is involved. */ }
  }
  function stop() {
    state.active = false;
    if (state.id) win['ga-disable-' + state.id] = true;
    // Drop our not-yet-processed commands; already transmitted data cannot be recalled.
    if (Array.isArray(win.bideDataLayer)) win.bideDataLayer.length = 0;
    if (expiryTimer) win.clearTimeout(expiryTimer);
    expiryTimer = undefined;
    clearAnalyticsStorage();
  }
  function allowed() {
    if (!state.id || !state.active || state.choice !== 'accepted') return false;
    if (hasGpc() || state.expiresAt <= now()) {
      stop();
      if (state.expiresAt <= now()) { state.choice = 'unset'; state.expiresAt = 0; }
      return false;
    }
    return true;
  }
  function send() { win.bideDataLayer.push(arguments); }
  function pageParams() {
    return {
      page_location: win.location.origin + PAGES[state.page][0],
      page_title: PAGES[state.page][1],
      page_referrer: SOURCES[state.source],
      bide_page: state.page,
      acquisition_source: state.source
    };
  }
  function track(name, options) {
    try {
      if (!EVENTS.has(name) || !allowed()) return false;
      const values = options && typeof options === 'object' ? options : {};
      const params = { ...pageParams(), send_to: state.id };
      if (TOOLS.has(values.tool)) params.tool = values.tool;
      else if (['editor_opened', 'document_opened', 'export_completed'].includes(name)) params.tool = state.tool;
      if (FORMATS.has(values.format)) params.format = values.format;
      // Refresh attribution's inactivity expiry; no identifier or raw URL is stored here.
      storage('sessionStorage', 'setItem', SOURCE_KEY, JSON.stringify({ source: state.source, expiresAt: now() + SOURCE_MS }));
      send('event', name, params);
      return true;
    } catch { return false; }
  }
  function scheduleExpiry() {
    if (expiryTimer) win.clearTimeout(expiryTimer);
    expiryTimer = win.setTimeout(() => {
      if (state.expiresAt <= now()) {
        stop(); state.choice = 'unset'; state.expiresAt = 0;
        if (!hasGpc()) showPreferences(false);
      } else scheduleExpiry();
    }, Math.min(Math.max(1, state.expiresAt - now()), 2147483647));
  }
  function enable() {
    if (!state.id || hasGpc() || state.choice !== 'accepted' || state.expiresAt <= now()) return;
    sourceAfterConsent();
    state.active = true;
    win['ga-disable-' + state.id] = false;
    if (!Array.isArray(win.bideDataLayer)) win.bideDataLayer = [];
    const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
    if (!providerLoaded) {
      send('consent', 'default', denied);
      send('set', 'ads_data_redaction', true);
      send('set', 'url_passthrough', false);
    }
    send('consent', 'update', { ...denied, analytics_storage: 'granted' });
    // Explicit values also override raw campaign query parameters. Nothing from the
    // current URL query, fragment, document title, or complete referrer is forwarded.
    const config = {
      ...pageParams(), send_page_view: false,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_domain: 'none', cookie_path: '/', cookie_prefix: COOKIE_PREFIX,
      cookie_expires: Math.max(1, Math.floor((state.expiresAt - now()) / 1000)), cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure',
      campaign_source: state.source,
      campaign_medium: state.source === 'direct' ? '(none)' : ['google', 'bing'].includes(state.source) ? 'organic' : 'referral',
      campaign_id: '(not set)', campaign_name: '(not set)', campaign_content: '(not set)', campaign_term: '(not set)'
    };
    send('set', config);
    if (!providerLoaded) send('js', new Date());
    send('config', state.id, config);
    if (!providerRequested) {
      providerRequested = true;
      providerScript = doc.createElement('script');
      providerScript.async = true;
      providerScript.crossOrigin = 'anonymous';
      providerScript.referrerPolicy = 'no-referrer';
      providerScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(state.id) + '&l=bideDataLayer';
      providerScript.onerror = () => { stop(); providerScript?.remove(); providerRequested = false; providerLoaded = false; };
      providerScript.onload = () => { providerLoaded = true; if (!allowed()) stop(); };
      doc.head.appendChild(providerScript);
    }
    scheduleExpiry();
    track('page_view');
  }
  function closeDialog() {
    if (!dialog) return;
    try { if (typeof dialog.close === 'function') dialog.close(); } catch { /* Older browser fallback. */ }
    dialog.remove(); dialog = undefined;
    try { returnFocus?.focus(); } catch { /* Focus target may have been removed. */ }
    returnFocus = undefined;
  }
  function choose(choice) {
    if (!state.id || hasGpc()) { stop(); closeDialog(); return; }
    state.choice = choice; state.expiresAt = now() + CONSENT_MS;
    storage('localStorage', 'setItem', CHOICE_KEY, JSON.stringify({ version: 1, measurementId: state.id, choice, expiresAt: state.expiresAt }));
    if (choice === 'accepted') { if (!state.active) enable(); else scheduleExpiry(); }
    else stop();
    closeDialog();
  }
  function showPreferences(manual) {
    if (!doc.body) return;
    closeDialog();
    returnFocus = manual ? doc.activeElement : undefined;
    if (!doc.getElementById('bide-measurement-style')) {
      const style = doc.createElement('style'); style.id = 'bide-measurement-style';
      style.textContent = '#bide-measurement-dialog{position:fixed;inset:auto 16px 16px;margin:0 auto;box-sizing:border-box;width:calc(100% - 32px);max-width:660px;padding:22px;border:1px solid #d8ddd9;border-radius:16px;background:#fff;color:#17251e;box-shadow:0 12px 50px #17251e26;z-index:2147483646;font:14px/1.55 system-ui,sans-serif}#bide-measurement-dialog::backdrop{background:#101c1740}#bide-measurement-dialog h2{font:650 18px/1.3 system-ui,sans-serif;margin:0 0 10px}#bide-measurement-dialog p{margin:0 0 14px}#bide-measurement-dialog a{color:inherit;text-decoration:underline}#bide-measurement-dialog .bide-choices{display:flex;gap:10px;flex-wrap:wrap}#bide-measurement-dialog button{appearance:none;font:600 14px/1.4 system-ui,sans-serif;padding:10px 16px;min-height:42px;cursor:pointer;color:#17251e;background:#fff;border:1px solid #65786b;border-radius:8px}#bide-measurement-dialog button:hover{background:#edf2ed}#bide-measurement-dialog button:focus-visible{outline:3px solid #398559;outline-offset:3px}';
      doc.head.appendChild(style);
    }
    dialog = doc.createElement('dialog'); dialog.id = 'bide-measurement-dialog';
    dialog.setAttribute('aria-labelledby', 'bide-measurement-title');
    const title = doc.createElement('h2'); title.id = 'bide-measurement-title'; title.textContent = 'Optional analytics'; dialog.appendChild(title);
    const message = doc.createElement('p');
    message.textContent = !state.id ? 'No optional analytics are running on this site.' : hasGpc()
      ? 'Your browser’s Global Privacy Control is enabled. Optional analytics stay off.'
      : 'With your permission, Google Analytics helps us understand visits and completed tasks using browser cookies. We send page and tool names, never document contents or filenames. You can decline and use every available tool, or change your choice here later. Your choice lasts 180 days.';
    dialog.appendChild(message);
    const details = doc.createElement('a'); details.href = '/privacy/'; details.textContent = 'Read the privacy details';
    const paragraph = doc.createElement('p'); paragraph.appendChild(details); dialog.appendChild(paragraph);
    const buttons = doc.createElement('div'); buttons.className = 'bide-choices';
    const button = (text, action) => { const element = doc.createElement('button'); element.type = 'button'; element.textContent = text; element.addEventListener('click', action); buttons.appendChild(element); };
    if (state.id && !hasGpc()) {
      button('Decline analytics', () => choose('declined'));
      button('Accept analytics', () => choose('accepted'));
    }
    if (manual || !state.id || hasGpc()) button('Close', closeDialog);
    dialog.appendChild(buttons);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    doc.body.appendChild(dialog);
    if (manual && typeof dialog.showModal === 'function') { try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); } }
    else dialog.setAttribute('open', '');
  }
  function init(config) {
    try {
      const options = config && typeof config === 'object' ? config : {};
      const id = owns(options, 'measurementId') ? validId(options.measurementId) : state.id;
      const page = owns(PAGES, options.page) ? options.page : inferPage();
      const pageChanged = state.page !== page;
      if (state.initialized && state.id === id) {
        state.page = page;
        if (pageChanged) track('page_view');
        return !!id;
      }
      if (state.id) stop();
      state.id = id; state.page = page; state.initialized = true;
      if (!id) { closeDialog(); return false; }
      win['ga-disable-' + id] = true;
      Object.assign(state, readChoice());
      if (hasGpc()) { stop(); closeDialog(); return true; }
      if (state.choice === 'accepted') enable();
      else if (state.choice === 'declined') stop();
      else showPreferences(false);
      return true;
    } catch { return false; }
  }
  function syncChoice() {
    if (!state.id) return;
    const previous = state.choice;
    Object.assign(state, readChoice());
    if (hasGpc() || state.choice !== 'accepted') {
      stop();
      if (!hasGpc() && previous === 'accepted' && state.choice === 'unset') showPreferences(false);
    } else if (!state.active) enable();
  }
  doc.addEventListener('click', event => {
    try {
      const preference = event.target?.closest?.('[data-measurement-preferences]');
      if (preference) { event.preventDefault(); showPreferences(true); return; }
      const target = event.target?.closest?.('[data-bide-event]');
      if (target) track(target.getAttribute('data-bide-event'), { tool: target.getAttribute('data-bide-tool') });
    } catch { /* Measurement must never interrupt navigation. */ }
  });
  win.addEventListener('storage', event => { if (event.key === CHOICE_KEY || event.key === null) syncChoice(); });
  win.addEventListener('focus', syncChoice);
  return {
    init, track,
    setTool(tool) { if (!TOOLS.has(tool)) return false; state.tool = tool; return true; },
    preferences() { try { showPreferences(true); } catch { /* Do not break the editor. */ } }
  };
});
