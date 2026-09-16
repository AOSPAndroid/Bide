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
urlParams['dark'] = '0';
// Expose local draw.io actions to bide's command palette, never remote integrations.
(function () {
  var ui = null;
  var installed = false;
  var allowed = ['undo','redo','delete','duplicate','selectAll','selectNone','selectVertices','selectEdges','group','ungroup','enterGroup','exitGroup','toFront','toBack','sendBackward','alignCellsLeft','alignCellsCenter','alignCellsRight','alignCellsTop','alignCellsMiddle','alignCellsBottom','autosize','zoomIn','zoomOut','fitPage','fitPageWidth','fitWindow','grid','guides','snapToGrid','format','editData'];
  var check = window.checkAllLoaded;
  window.checkAllLoaded = function () {
    if (!installed && window.EditorUi) {
      installed = true;
      var init = EditorUi.prototype.init;
      EditorUi.prototype.init = function () {
        var result = init.apply(this, arguments);
        ui = this;
        return result;
      };
    }
    return check.apply(this, arguments);
  };
  window.addEventListener('message', function (event) {
    if (event.source !== parent || event.origin !== location.origin || typeof event.data !== 'string') return;
    var data;
    try { data = JSON.parse(event.data); } catch (_) { return; }
    if (!ui || !ui.actions || !data || typeof data !== 'object') return;
    if (data.action === 'bide-list-commands') {
      var commands = allowed.map(function (id) {
        var a = ui.actions.get(id);
        return a && a.isVisible() ? {id:id,label:(window.mxResources&&mxResources.get(a.label))||a.label,enabled:a.isEnabled(),hint:a.shortcut||''} : null;
      }).filter(Boolean);
      parent.postMessage(JSON.stringify({event:'bide-commands',commands:commands}), location.origin);
    } else if (data.action === 'bide-run-command' && allowed.indexOf(data.id) !== -1) {
      var a = ui.actions.get(data.id);
      if (a && a.isEnabled() && a.isVisible()) {
        try { a.funct(); } catch (_) { parent.postMessage(JSON.stringify({event:'bide-command-error',message:'This diagram action could not be completed.'}),location.origin); }
      } else parent.postMessage(JSON.stringify({event:'bide-command-error',message:'This diagram action is unavailable for the current selection.'}),location.origin);
    }
  });
}());
