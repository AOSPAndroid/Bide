// bide modifications to the draw.io self-hosted configuration, 2026-09-16.
// Everything required by the editor is served by this copy of bide.
window.DRAWIO_BASE_URL = new URL('./', location.href).href.replace(/\/$/, '');
window.DRAWIO_VIEWER_URL = new URL('js/viewer-static.min.js', location.href).href;
window.DRAWIO_LIGHTBOX_URL = window.DRAWIO_BASE_URL;
window.EXPORT_URL = null;
window.DRAWIO_CONFIG = {defaultFonts: ['Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New'], enableAi: false};
urlParams['offline'] = '1';
urlParams['local'] = '1';
urlParams['gapi'] = '0';
urlParams['db'] = '0';
urlParams['od'] = '0';
urlParams['gh'] = '0';
urlParams['gl'] = '0';
urlParams['tr'] = '0';
urlParams['plugins'] = '0';
urlParams['pwa'] = '0'; // bide serves the complete editor; no service worker needed.
