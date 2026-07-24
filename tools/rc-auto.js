// Automatické odvodenie pohlavia a veku z rodného čísla (cievny.sk).
// Nález z evakuačného testu: pohlavie malo default „Muž" a nederivovalo sa
// z RČ – pri zabudnutom prepnutí vznikal záznam so zlým pohlavím a zle
// vypočítaným eGFR (CKD-EPI). Tento modul pri písaní RČ doplní pohlavie
// (mesiac +50 = žena, +20/+70 preplnenie od r. 2004) a vek k dátumu výkonu.
// Ručná zmena používateľa má prednosť (auto sa vypne po skutočnom kliku).
(function (global) {
  'use strict';

  // parse('485112/1234', '2026-08-03') -> {zena, rok, mesiac, den, vek} | null
  function parse(rcRaw, refDatum) {
    var d = String(rcRaw || '').replace(/\D/g, '');
    if (d.length < 6) return null;
    var yy = +d.slice(0, 2), mm = +d.slice(2, 4), dd = +d.slice(4, 6);
    var zena = false;
    if (mm > 50) { zena = true; mm -= 50; }
    if (mm > 20 && mm <= 32) mm -= 20;         // preplnenie sérií od r. 2004
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    var rok;
    if (yy > 53) rok = 1900 + yy;              // 4-miestna prípona existuje až od 1954
    else if (d.length <= 9) rok = 1900 + yy;   // 3-miestna prípona = pred 1954
    else rok = yy <= (new Date().getFullYear() % 100) ? 2000 + yy : 1900 + yy;
    var vek = null;
    var ref = refDatum ? new Date(refDatum) : new Date();
    if (!isNaN(ref)) {
      vek = ref.getFullYear() - rok;
      if ((ref.getMonth() + 1) < mm || ((ref.getMonth() + 1) === mm && ref.getDate() < dd)) vek--;
    }
    return { zena: zena, rok: rok, mesiac: mm, den: dd, vek: vek };
  }

  // bind({rc:'rodne_cislo', pohl:'pohl', muz:'M', zena:'Z', vek:'vek', datum:'datum'})
  function bind(cfg) {
    var rc = document.getElementById(cfg.rc);
    if (!rc) return;
    var pohl = cfg.pohl ? document.getElementById(cfg.pohl) : null;
    var vek = cfg.vek ? document.getElementById(cfg.vek) : null;
    // skutočný zásah používateľa (isTrusted) vypne auto pre dané pole
    if (pohl) pohl.addEventListener('change', function (e) { if (e.isTrusted) pohl.dataset.rcManual = '1'; });
    if (vek) vek.addEventListener('input', function (e) { if (e.isTrusted) vek.dataset.rcManual = '1'; });
    function apply() {
      var dat = cfg.datum ? document.getElementById(cfg.datum) : null;
      var p = parse(rc.value, dat && dat.value || null);
      if (!p) return;
      if (pohl && !pohl.dataset.rcManual) {
        var v = p.zena ? cfg.zena : cfg.muz;
        if (pohl.value !== v) { pohl.value = v; pohl.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      if (vek && !vek.dataset.rcManual && p.vek != null && p.vek >= 18 && p.vek <= 110) {
        var s = String(p.vek);
        if (vek.value !== s) { vek.value = s; vek.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    }
    rc.addEventListener('input', apply);
    rc.addEventListener('change', apply);
  }

  var API = { parse: parse, bind: bind };
  global.RcAuto = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
