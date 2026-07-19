// Sticky akčná lišta pre generátory nálezov – na mobile drží Kopírovať a
// Uložiť vždy na dosah (bez skrolovania pod celý formulár).
// Použitie: stránka nastaví window.GEN_BAR = { copy:'copyTxt', save:'saveRAS' }
// (názvy globálnych funkcií) PRED načítaním tohto skriptu, alebo kedykoľvek
// a zavolá GenBar.mount(). Lištu možno skryť na iných taboch: GenBar.show(bool).
(function (global) {
  'use strict';
  var BAR_ID = 'gen-actionbar';
  function call(name) { try { if (typeof global[name] === 'function') global[name](); } catch (e) {} }

  function mount() {
    if (document.getElementById(BAR_ID)) return;
    var cfg = global.GEN_BAR || {};
    var style = document.createElement('style');
    style.textContent =
      '#' + BAR_ID + '{position:fixed;left:0;right:0;bottom:0;z-index:900;display:none;' +
      'gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));' +
      'background:rgba(255,255,255,.97);border-top:1px solid #d8dce6;box-shadow:0 -2px 10px rgba(0,0,0,.08)}' +
      '#' + BAR_ID + ' button{flex:1;border:none;border-radius:9px;padding:13px 10px;font-size:15px;font-weight:700;' +
      'display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:#fff}' +
      '#' + BAR_ID + ' .gb-copy{background:#1e40af}#' + BAR_ID + ' .gb-save{background:#1d6f42}' +
      '@media(max-width:800px){#' + BAR_ID + '.on{display:flex}body.has-genbar{padding-bottom:70px}}';
    document.head.appendChild(style);
    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML =
      '<button type="button" class="gb-copy">📋 Kopírovať</button>' +
      '<button type="button" class="gb-save">💾 Uložiť</button>';
    document.body.appendChild(bar);
    bar.querySelector('.gb-copy').addEventListener('click', function () { call(cfg.copy); });
    bar.querySelector('.gb-save').addEventListener('click', function () { call(cfg.save); });
    document.body.classList.add('has-genbar');
    show(true);
  }
  function show(v) {
    var bar = document.getElementById(BAR_ID);
    if (bar) bar.classList.toggle('on', v !== false);
  }
  // --- Ochrana pred stratou rozpísaného nálezu (beforeunload) ---
  // dirty=true nastaví len SKUTOČNÁ interakcia používateľa (programové gen()
  // hodnoty nemení cez input event). saved() volajú nástroje po uložení.
  var dirty = false;
  function markDirty() { dirty = true; }
  function saved() { dirty = false; }
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = ''; // prehliadač zobrazí štandardné varovanie
    return '';
  });

  var API = { mount: mount, show: show, saved: saved, markClean: saved };
  global.GenBar = API;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : globalThis);
