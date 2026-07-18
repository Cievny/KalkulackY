// Zdieľaný escape HTML helper – jediný zdroj pravdy pre vkladanie DB hodnôt
// do innerHTML/atribútov. Escapuje aj úvodzovky, takže je bezpečný aj v
// title="…", value="…" a pod. (attribute-context XSS).
// Použitie:  el.innerHTML = '<div title="'+esc(x)+'">'+esc(y)+'</div>';
(function (global) {
  'use strict';
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; });
  }
  global.esc = esc;
  if (typeof module !== 'undefined' && module.exports) module.exports = esc;
})(typeof window !== 'undefined' ? window : globalThis);
