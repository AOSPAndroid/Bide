// bide modifications, 2026-09-16: no remote icon, conversion or collaboration services.
window.ICONSEARCH_PATH = null;
window.ICON_SERVICE_PATH = null;
window.NOTIFICATIONS_URL = null;
window.VSS_CONVERT_URL = null;
window.REALTIME_URL = null;
window.RT_WEBSOCKET_URL = null;
window.EXPORT_URL = null;
// Keep bide's command palette available while focus is inside the editor iframe.
window.addEventListener('keydown', function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); event.stopImmediatePropagation();
    parent.postMessage(JSON.stringify({event:'bide-command-palette'}), location.origin);
  }
}, true);
