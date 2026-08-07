// Automatické prideľovanie ID výkonu (cievny.sk).
// Pri otvorení formulára navrhne ďalšie voľné číslo v aktuálnom roku
// (napr. EVK-2026-013), pri uložení s prázdnym poľom ho pridelí samo
// a pri kolízii (dvaja lekári naraz) ticho preskočí na ďalšie voľné.
// Ručne prepísané číslo má prednosť – automatika ho nikdy neprepíše.
(function (global) {
  'use strict';

  function pad(n) { var s = String(n); return s.length >= 3 ? s : ('000' + s).slice(-3); }
  function prefix() {
    var el = document.getElementById('id-prefix') || document.getElementById('id_prefix');
    return el ? el.textContent.trim() : '';
  }

  // ďalšie voľné číslo pre aktuálny prefix (max existujúcich + 1)
  function next(sbUrl, headers, table) {
    var pref = prefix();
    if (!pref) return Promise.resolve(null);
    return fetch(sbUrl + '/rest/v1/' + table + '?vykon_id=like.' + encodeURIComponent(pref + '*') + '&select=vykon_id', { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!rows) return null;
        var max = 0;
        rows.forEach(function (x) {
          var n = parseInt(String(x.vykon_id || '').slice(pref.length), 10);
          if (n > max) max = n;
        });
        return pad(max + 1);
      }).catch(function () { return null; });
  }

  // bind({sbUrl, headers: fn, table, datum: 'datum'})
  function bind(cfg) {
    var el = document.getElementById('id_suffix');
    if (!el) return;
    el.placeholder = 'auto';
    // skutočný zásah používateľa vypne automatiku pre toto pole
    el.addEventListener('input', function (e) { if (e.isTrusted) el.dataset.auto = ''; });
    function suggest() {
      if (window._editRecordId) return;
      if (el.value && el.dataset.auto !== '1') return;   // ručne zadané – nechaj tak
      next(cfg.sbUrl, cfg.headers(), cfg.table).then(function (n) {
        if (n == null || window._editRecordId) return;
        if (el.value && el.dataset.auto !== '1') return;
        if (el.value === n) return;
        el.value = n; el.dataset.auto = '1';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        // automatický návrh nie je zásah lekára – nerátať ho ako rozpísané zmeny
        window._dirty = false;
        if (global.GenBar && global.GenBar.markClean) global.GenBar.markClean();
      });
    }
    var d = cfg.datum ? document.getElementById(cfg.datum) : null;
    if (d) d.addEventListener('change', function () { setTimeout(suggest, 60); });  // zmena roka → nový návrh
    function kick() { setTimeout(suggest, 300); }   // až po inicializácii (loadEditRecord)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick);
    else kick();
    API.suggest = suggest;
  }

  var API = { bind: bind, next: next, pad: pad, prefix: prefix };
  global.VykonId = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
