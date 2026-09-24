// Diktovanie nálezu EVK (Fáza 1 – textová cesta).
// Lekár nadiktuje (klávesnicou telefónu / Win+H / vloží prepis) HESLOVITÝ
// protokol výkonu → lokálny scrubber odstráni osobné údaje → náhľad →
// edge funkcia „extrakcia" (kind: 'evk') vráti štruktúru → apply() ju
// zapíše do formulára EVK a podfarbí vyplnené polia (🤖). Nič sa neukladá
// automaticky – lekár skontroluje a uloží sám.
//
// Zásady:
//  - identifikáciu pacienta (RČ, meno) zadáva lekár ručne, diktát ju nemá obsahovať;
//    scrubber + serverová poistka sú len záchranná sieť
//  - apply() nikdy nezhodí celý import: každé pole zvlášť, chyby idú do
//    zoznamu „nezaradené", aby lekár videl, čo musí doplniť ručne
//  - hodnoty mimo katalógu (neznámy balón) → voľba „vlastný" + text, nie strata
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  // porovnávanie bez diakritiky, medzier a interpunkcie: „Angio-Seal 6 F" ≡ „AngioSeal 6F"
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function has(fn) { return typeof global[fn] === 'function'; }
  // EVK drží počítadlá (cnts/locCnt/segCnt) v lexikálnych `let` – zvonku neviditeľné,
  // preto index naposledy pridaného riadku čítame z DOM (data-idx / data-li / data-sn)
  function lastRow(sel, attr) { var rows = document.querySelectorAll(sel); return rows.length ? rows[rows.length - 1].dataset[attr] : null; }
  function call(fn) { if (has(fn)) return global[fn].apply(null, [].slice.call(arguments, 1)); }

  /* ── 🤖 označenie vyplnených polí (zmizne, keď lekár pole upraví) ── */
  function mark(el) {
    if (!el) return;
    var t = el.type === 'checkbox' || el.type === 'radio' ? (el.closest('label') || el) : el;
    t.classList.add('ai-filled');
    var off = function () { t.classList.remove('ai-filled'); el.removeEventListener('input', off); el.removeEventListener('change', off); };
    el.addEventListener('input', off); el.addEventListener('change', off);
  }

  /* ── nastavovače (chýbajúci element = ticho nič) ── */
  function setVal(id, v) { var el = $(id); if (!el || v == null || v === '') return false; el.value = String(v); mark(el); return true; }
  function setChk(id, on) { var el = $(id); if (!el) return false; el.checked = !!on; if (on) mark(el); return true; }
  function setRadio(name, val) {
    var list = [].slice.call(document.querySelectorAll('input[name="' + name + '"]'));
    var hit = list.find(function (r) { return norm(r.value) === norm(val); });
    if (!hit) return false;
    hit.checked = true; mark(hit); return true;
  }
  // select: presná zhoda → jednoznačná prefixová zhoda → voľba „vlastný" + text → false
  function setSel(id, val, o) {
    var el = $(id); if (!el || val == null || val === '') return false;
    o = o || {};
    var target = norm(val), opts = [].slice.call(el.options);
    var hit = opts.find(function (op) { return norm(op.value) === target || norm(op.text) === target; });
    if (!hit && target.length >= 3) {
      var cand = opts.filter(function (op) {
        var a = norm(op.value) || norm(op.text);
        return a.length >= 3 && a !== 'vlastny' && (a.indexOf(target) === 0 || target.indexOf(a) === 0);
      });
      if (cand.length === 1) hit = cand[0];
    }
    if (hit) { el.value = hit.value; mark(el); return true; }
    if (o.vlastny) {
      var vl = opts.find(function (op) { return op.value === o.vlastny; });
      if (vl) {
        el.value = vl.value; mark(el);
        var c = o.custom && $(o.custom);
        if (c) { c.value = String(val); c.style.display = 'block'; mark(c); }
        return 'custom';
      }
    }
    return false;
  }
  // zoznam checkboxov podľa class; vráti hodnoty, ktoré sa nenašli
  function checkList(cls, values) {
    var miss = [];
    (values || []).forEach(function (v) {
      var cb = [].slice.call(document.querySelectorAll('input.' + cls)).find(function (c) { return norm(c.value) === norm(v); });
      if (cb) { cb.checked = true; mark(cb); } else miss.push(v);
    });
    return miss;
  }

  /* ── tepny ── */
  var DSA_SID = { Aorta: 'v_Ao', AIC: 'v_AIC', AIE: 'v_AIE', AII: 'v_AII', AFC: 'f_AFC', APF: 'f_APF', AFS: 'f_AFS', P1: 'p_P1', P2: 'p_P2', P3: 'p_P3', ATA: 'd_ATA', ATP: 'd_ATP', AFib: 'd_AFib', TTF: 'd_TTF' };
  var PELV = ['Aorta', 'AIC', 'AIE', 'AII'];
  function grp(tepna) { return PELV.indexOf(tepna) >= 0 ? 'pelv' : 'fem'; }
  function vesselStr(e) { return e && e.tepna && e.strana ? e.tepna + ' ' + e.strana : ''; }
  function sideSuffix(strana, group) {
    if (strana === 'l.sin.') return '_s';
    if (strana === 'l.dx.') return '_d';
    var lat = ($(group === 'pelv' ? 'pelv_lat' : 'fem_lat') || {}).value;   // jednostranný výkon → strana je jasná
    return lat === 'sin' ? '_s' : lat === 'dx' ? '_d' : null;
  }
  // všetky tepny spomenuté v diktáte → riečisko a laterality
  function zberTepien(F) {
    var out = [];
    (F.dsa || []).forEach(function (e) { out.push(e); });
    (F.intervencie || []).forEach(function (it) { out.push(it); (it.dalsie_tepny || []).forEach(function (l) { out.push(l); }); });
    if (F.kissing) out.push({ tepna: 'AIC', strana: 'l.sin.' }, { tepna: 'AIC', strana: 'l.dx.' });
    if (F.cerab) out.push({ tepna: 'AIC', strana: 'l.sin.' }, { tepna: 'AIC', strana: 'l.dx.' });
    return out.filter(function (e) { return e && e.tepna; });
  }
  function odvodRiecisko(F) {
    var t = zberTepien(F), p = t.some(function (e) { return grp(e.tepna) === 'pelv'; }), f = t.some(function (e) { return grp(e.tepna) === 'fem'; });
    return p && f ? 'both' : p ? 'pelv' : f ? 'fem' : null;
  }
  function odvodLat(F) {
    var s = { pelv: {}, fem: {} };
    zberTepien(F).forEach(function (e) { if (e.strana) s[grp(e.tepna)][e.strana] = 1; });
    var one = function (o) { var k = Object.keys(o); return k.length === 2 ? 'bilat' : k[0] === 'l.sin.' ? 'sin' : k[0] === 'l.dx.' ? 'dx' : null; };
    return { pelv: one(s.pelv), fem: one(s.fem) };
  }

  /* ── hlavné mapovanie: polia z AI → formulár EVK ── */
  function apply(F) {
    F = F || {};
    var filled = [], unm = [];
    var add = function (l) { filled.push(l); };
    var miss = function (l) { unm.push(l); };
    var safe = function (label, fn) { try { fn(); } catch (e) { miss(label + ' – chyba pri vypĺňaní (' + (e && e.message || e) + ')'); } };

    // 1) riečisko + laterality (musí byť PRED DSA, lebo určuje, ktoré polia existujú)
    safe('riečisko', function () {
      var t = F.riecisko || odvodRiecisko(F);
      var sel = $('territory');
      if (t && sel && sel.value !== t) { sel.value = t; mark(sel); add('riečisko'); }
      call('updateTerritory');
      var lat = odvodLat(F), changed = false;
      if (lat.pelv && $('pelv_lat') && $('pelv_lat').value !== lat.pelv) { $('pelv_lat').value = lat.pelv; changed = true; }
      if (lat.fem && $('fem_lat') && $('fem_lat').value !== lat.fem) { $('fem_lat').value = lat.fem; changed = true; }
      if (changed) { call('buildPelvDSA'); call('buildFemDSA'); }
      call('updateVsel');
    });

    // 2) prístup
    safe('prístup', function () {
      var P = F.pristup || {};
      if (P.arteria) {
        var r = setSel('access_art', P.arteria, { vlastny: 'vlastny', custom: 'access_art_c' });
        if (r) add('prístup ' + P.arteria); else miss('prístupová tepna: ' + P.arteria);
        call('updateAccess');
      }
      setSel('strana', P.strana); setSel('tech', P.technika); setSel('smer', P.smer);
      setSel('spos', P.sposob); setSel('anes', P.anestezia); setSel('nav', P.navigacia);
      if (P.sheath_fr) setSel('sheath', P.sheath_fr + ' Fr');
      if (P.sheath_dlzka_cm) setSel('sheathdlz', P.sheath_dlzka_cm + ' cm');
      if (P.kateter && !setSel('kat', P.kateter)) { setSel('kat', 'vlastný'); miss('diagnostický katéter „' + P.kateter + '" nie je v zozname'); }
      var D = F.dalsi_pristup;
      if (D && D.arteria) {
        setChk('c_pristup2', true); call('p2Toggle');
        if (!setSel('p2_art', D.arteria, { vlastny: 'vlastna', custom: 'p2_art_c' })) miss('ďalší prístup: ' + D.arteria);
        setSel('p2_strana', D.strana); setSel('p2_tech', D.technika);
        if (D.sheath_fr) setSel('p2_sheath', D.sheath_fr + ' Fr');
        if (D.uzaver && !setSel('p2_uzaver', D.uzaver)) miss('uzáver ďalšieho prístupu: ' + D.uzaver);
        setVal('p2_pozn', D.poznamka);
        add('ďalší prístup ' + D.arteria);
      }
      if (setVal('heparin', F.heparin_iu)) add('heparín');
      checkList('kontr', F.kontrast).forEach(function (v) { miss('kontrast: ' + v); });
    });

    // 3) DSA nález po tepnách
    (F.dsa || []).forEach(function (e) {
      safe('DSA ' + (e.tepna || '?'), function () {
        var base = DSA_SID[e.tepna];
        if (!base) { miss('DSA: neznáma tepna „' + e.tepna + '"'); return; }
        var lbl = e.tepna + (e.strana ? ' ' + e.strana : '');
        var sid = e.tepna === 'Aorta' ? 'v_Ao' : (function () { var s = sideSuffix(e.strana, grp(e.tepna)); return s ? base + s : null; })();
        if (!sid) { miss('DSA ' + e.tepna + ': neuvedená strana (' + (e.nalez || '') + ')'); return; }
        if (!$(sid)) { miss('DSA ' + lbl + ': pole nie je zobrazené pri tomto riečisku/lateralite (' + (e.nalez || '') + ')'); return; }
        var val = e.nalez === 'vlastný popis' ? (e.popis || 'vlastný popis') : e.nalez;
        if (e.segment && e.segment !== 'celý' && has('addSeg')) {
          call('addSeg', sid, true);
          var n = lastRow('#' + sid + '_segs .seg-row', 'sn'), vid = sid + '_g' + n + '_val';
          if (!setSel(sid + '_g' + n + '_seg', e.segment)) miss('DSA ' + lbl + ': segment „' + e.segment + '"');
          var r = setSel(vid, val, { vlastny: 'vlastný popis', custom: vid + '_c' });
          if (!r) miss('DSA ' + lbl + ': nález „' + val + '"');
          call('cC', vid);
        } else {
          var r2 = setSel(sid, val, { vlastny: 'vlastný popis', custom: sid + '_c' });
          if (!r2) miss('DSA ' + lbl + ': nález „' + val + '"');
          call('cC', sid);
        }
        add('DSA ' + lbl);
      });
    });

    // 4) výmena sheathu, prechod, vodič, podporný katéter
    safe('intervenčný sheath', function () {
      var S = F.vymena_sheathu;
      if (S && (S.fr || S.znacka)) {
        setChk('c_ivsheath', true); call('tB', 'ivsheath');
        if (S.fr) setSel('iv_sheath', S.fr + ' Fr');
        if (S.dlzka_cm) setSel('iv_sheath_dlz', S.dlzka_cm + ' cm');
        if (S.znacka) setSel('iv_sheath_zn', S.znacka, { vlastny: 'vlastný', custom: 'iv_sheath_zn_c' });
        add('výmena sheathu');
      }
      checkList('prec', F.prechod).forEach(function (v) { miss('prechod cez léziu: ' + v); });
      if (F.vodic) { setSel('vodic', F.vodic, { vlastny: 'vlastný', custom: 'vodic_c' }); call('vVodic'); add('vodič'); }
      if (F.podporny_kateter) { setSel('support_kat', F.podporny_kateter, { vlastny: 'vlastný', custom: 'support_kat_c' }); call('chkVl', 'support_kat'); add('podporný katéter'); }
    });

    // 5) intervencie
    var KIND = { vessel_prep: ['vprep', 'balon_vprep'], predilatacia: ['pred', 'balon'], ivl: ['sw', 'balon_ivl'], pta: ['pta', 'balon'], deb: ['deb', 'balon_deb'], postdilatacia: ['post', 'balon'], stent: ['stent', 'stent'], reentry: ['reentry', 'reentry'] };
    var LBL = { vessel_prep: 'vessel prep', predilatacia: 'predilatácia', ivl: 'IVL', pta: 'PTA', deb: 'DEB', postdilatacia: 'postdilatácia', stent: 'stent', reentry: 'reentry', stentgraft: 'stentgraft', trombektomia: 'trombektómia', aterektomia: 'aterektómia' };
    function extraLocs(id, list) {
      (list || []).forEach(function (l) {
        if (!$(id + '_locs') || !has('addLoc')) { miss('ďalšia tepna ' + vesselStr(l) + ' – tento typ nemá viac lokalít, pridajte samostatnú položku'); return; }
        call('addLoc', id, true, '＋ Tepna (tá istá inflácia)');
        var li = lastRow('#' + id + '_locs .loc-row', 'li');
        call('svTp', id + '_l' + li + '_tp', vesselStr(l)); mark($(id + '_l' + li + '_tp'));
        if (l.segment) setSel(id + '_l' + li + '_sg', l.segment);
      });
    }
    function emptyRow(pfx) {
      var rows = [].slice.call(document.querySelectorAll('#' + pfx + '_list .dyn-row'));
      for (var i = 0; i < rows.length; i++) {
        var id = pfx + '_' + rows[i].dataset.idx, tp = $(id + '_tp'), p = $(id + '_p');
        var untouched = (!tp || tp.value === '– tepna –') && (!p || p.value === '') && !rows[i].querySelector('.ai-filled');
        if (untouched) return id;
      }
      return null;
    }
    function listItem(it, pfx, kind) {
      if (pfx === 'post') { setChk('c_stent', true); call('tB', 'stent'); setChk('c_post', true); call('togglePost'); }
      else { setChk('c_' + pfx, true); call('tB', pfx); }
      // EVK pri načítaní pripraví jeden prázdny riadok každého typu – prvý diktovaný
      // kus ide doň, ďalšie sa pridávajú
      var id = emptyRow(pfx);
      if (!id) { call('addItem', pfx, kind, true); id = pfx + '_' + lastRow('#' + pfx + '_list .dyn-row', 'idx'); }
      var tp = vesselStr(it);
      if (tp) { call('svTp', id + '_tp', tp); mark($(id + '_tp')); }
      else if (it.tepna) miss(LBL[it.typ] + ' ' + it.tepna + ': neuvedená strana');
      if (it.segment && !setSel(id + '_sg', it.segment)) miss(LBL[it.typ] + ' ' + tp + ': segment „' + it.segment + '"');
      if (it.device) {
        var dev = kind === 'stent' ? setSel(id + '_n', it.device, { vlastny: 'vlastný', custom: id + '_n_c' }) : setSel(id + '_s', it.device, { vlastny: 'vlastný', custom: id + '_s_c' });
        if (dev === 'custom') miss(LBL[it.typ] + ': „' + it.device + '" nie je v katalógu – vložené ako vlastný názov');
      }
      if (it.stent_typ) setSel(id + '_t', it.stent_typ);
      setVal(id + '_p', it.priemer_mm); setVal(id + '_d', it.dlzka_mm);
      setVal(id + '_i', it.inflacia_min); setVal(id + '_a', it.tlak_atm); setVal(id + '_u', it.pulzy);
      setVal(id + '_lmm', it.dlzka_lezie_mm); setSel(id + '_lkalc', it.kalcifikacia);
      if (it.cto) { setChk(id + '_lcto', true); call('ctoToggle', id); setVal(id + '_lctomm', it.cto_dlzka_mm); }
      extraLocs(id, it.dalsie_tepny);
      add(LBL[it.typ] + (it.device ? ' ' + it.device : '') + (tp ? ' – ' + tp : ''));
    }
    function stentgraft(it) {
      setChk('c_sg', true); call('tB', 'sg');
      setSel('sg_t', it.stent_typ);
      if (it.device && setSel('sg_n', it.device, { vlastny: 'vlastný', custom: 'sg_n_c' }) === 'custom') miss('stentgraft „' + it.device + '" nie je v katalógu – vložený ako vlastný');
      setVal('sg_p', it.priemer_mm); setVal('sg_d', it.dlzka_mm);
      var tp = vesselStr(it); if (tp) { call('svTp', 'sg_tp', tp); mark($('sg_tp')); }
      setSel('sg_sg', it.segment);
      add('stentgraft' + (it.device ? ' ' + it.device : ''));
    }
    function trombektomia(it) {
      setChk('c_trom', true); call('tB', 'trom');
      var met = it.metoda || (it.device ? 'aspiračná' : '');
      if (norm(met) === 'rotarex') { setChk('trom_rotarex', true); call('toggleRotarex'); if (it.velkost_fr) setSel('rotarex_fr', it.velkost_fr + 'F'); }
      else if (met) {
        setChk('trom_aspir', true); call('toggleAspir');
        if (it.device && setSel('aspir_kat', it.device, { vlastny: 'vlastný', custom: 'aspir_kat_c' }) === 'custom') miss('aspiračný katéter „' + it.device + '" nie je v katalógu – vložený ako vlastný');
        if (it.velkost_fr && !setSel('aspir_fr', it.velkost_fr + 'F')) miss('aspiračný katéter ' + it.velkost_fr + 'F – veľkosť mimo ponuky');
      } else miss('trombektómia: neuvedená metóda (Rotarex / aspiračná)');
      var tp = vesselStr(it), tsel = $('trom_tp');
      if (tp) {
        if (tsel && tsel.value === '– tepna –') { call('svTp', 'trom_tp', tp); mark(tsel); setSel('trom_sg', it.segment); }
        else extraLocs('trom', [it]);
      }
      extraLocs('trom', it.dalsie_tepny);
      add('trombektómia' + (met ? ' ' + met : '') + (tp ? ' – ' + tp : ''));
    }
    function aterektomia(it) {
      setChk('c_atek', true); call('tB', 'atek');
      if (it.atek_typ) checkList('atek_t', [it.atek_typ]).forEach(function (v) { miss('aterektómia typ: ' + v); });
      var tp = vesselStr(it); if (tp) { call('svTp', 'atek_tp', tp); mark($('atek_tp')); }
      if (it.dlzka_lezie_mm) setVal('atek_d', Math.round(it.dlzka_lezie_mm / 10 * 10) / 10);
      if (it.emboloprotekcia && !setSel('atek_e', it.emboloprotekcia)) { setSel('atek_e', 'vlastný filter'); miss('emboloprotekcia „' + it.emboloprotekcia + '" nie je v zozname'); }
      add('aterektómia' + (tp ? ' – ' + tp : ''));
    }
    (F.intervencie || []).forEach(function (it, i) {
      safe('intervencia ' + (i + 1) + ' (' + (it.typ || '?') + ')', function () {
        if (KIND[it.typ]) listItem(it, KIND[it.typ][0], KIND[it.typ][1]);
        else if (it.typ === 'stentgraft') stentgraft(it);
        else if (it.typ === 'trombektomia') trombektomia(it);
        else if (it.typ === 'aterektomia') aterektomia(it);
        else miss('intervencia neznámeho typu: ' + JSON.stringify(it));
      });
    });

    // 6) kissing / CERAB (panvové techniky)
    function stentKus(pfx, ids, K) {
      if (!K) return;
      if (ids.t) setSel(ids.t, K.typ);
      if (K.nazov && setSel(ids.n, K.nazov, { vlastny: 'vlastný', custom: ids.n + '_c' }) === 'custom') miss(pfx + ': stent „' + K.nazov + '" nie je v katalógu – vložený ako vlastný');
      setVal(ids.p, K.priemer_mm); setVal(ids.d, K.dlzka_mm);
    }
    safe('kissing stent', function () {
      if (!F.kissing) return;
      if (!$('c_kiss')) { miss('kissing stent: dostupný len pri panvovom riečisku'); return; }
      setChk('c_kiss', true); call('tB', 'kiss');
      stentKus('kissing l.sin.', { t: 'kiss_ts', n: 'kiss_ns', p: 'kiss_ps', d: 'kiss_ds' }, F.kissing.stent_sin);
      stentKus('kissing l.dx.', { t: 'kiss_td', n: 'kiss_nd', p: 'kiss_pd', d: 'kiss_dd' }, F.kissing.stent_dx);
      add('kissing stent');
    });
    safe('CERAB', function () {
      if (!F.cerab) return;
      setChk('c_cerab', true); call('tB', 'cerab');
      stentKus('CERAB cuff', { n: 'cerab_ao_n', p: 'cerab_ao_p', d: 'cerab_ao_d' }, F.cerab.cuff);
      stentKus('CERAB l.sin.', { n: 'cerab_sin_n', p: 'cerab_sin_p', d: 'cerab_sin_d' }, F.cerab.sin);
      stentKus('CERAB l.dx.', { n: 'cerab_dx_n', p: 'cerab_dx_p', d: 'cerab_dx_d' }, F.cerab.dx);
      add('CERAB');
    });

    // 7) bez intervencie / ďalšie nevyhnutné ošetrenie
    safe('bez intervencie', function () {
      var B = F.bez_intervencie;
      if (!B) return;
      setChk('c_bezint', true); call('tB', 'bezint');
      if (B.dovod && !setRadio('bezint_r', B.dovod)) { setRadio('bezint_r', 'vlastny'); setVal('bezint_vlastny', B.dovod); }
      call('chkBezIntVl');
      add('bez intervencie');
    });
    safe('ďalšie ošetrenie', function () {
      var D = F.dalsie_osetrenie;
      if (!D) return;
      setChk('c_dal', true); call('tB', 'dal');
      checkList('dal_d', D.dovod).forEach(function (v) { miss('ďalšie ošetrenie – dôvod: ' + v); });
      checkList('dal_t', D.technika).forEach(function (v) { miss('ďalšie ošetrenie – technika: ' + v); });
      setVal('dal_text', D.poznamka);
      add('ďalšie nevyhnutné ošetrenie');
    });

    // 8) uzáver, úspech, komplikácie, štúdia, záver
    safe('uzáver', function () {
      var U = F.uzaver || {};
      setVal('kompr', U.kompresia_min);
      if (U.zariadenie) {
        var z = norm(U.zariadenie);
        if (z.indexOf('manual') >= 0 || z.indexOf('kompres') >= 0) { $('uzatv').value = ''; mark($('uzatv')); }
        else if (!setSel('uzatv', U.zariadenie)) miss('uzatváracie zariadenie „' + U.zariadenie + '" – nejednoznačné alebo mimo ponuky, vyberte ručne');
      }
      setSel('hemo', U.hemostaza);
      if (U.femostop) setChk('femostop', true);
      if (U.zariadenie || U.hemostaza || U.kompresia_min) add('uzáver');
    });
    safe('technický úspech', function () { if (F.technicky_uspech) { if (setRadio('tech_uspech', F.technicky_uspech)) add('technický úspech'); else miss('technický úspech: ' + F.technicky_uspech); } });
    safe('komplikácie', function () {
      if (F.komplikacie && F.komplikacie.length) { checkList('komp_ck', F.komplikacie).forEach(function (v) { miss('komplikácia: ' + v); }); add('komplikácie'); }
      setVal('komp_text', F.komplikacie_text);
    });
    safe('štúdia', function () {
      var S = F.studia || {};
      var n = 0;
      if (setVal('st_dur', S.dlzka_min)) n++; if (setVal('st_fluoro', S.skia_min)) n++;
      if (setVal('st_dap', S.dap)) n++; if (setVal('st_contrast', S.kontrast_ml)) n++;
      if (n) add('periprocedurálne dáta');
    });
    safe('záver', function () {
      var z = $('zaver');
      if (F.zaver && z) { z.value = String(F.zaver); z.dispatchEvent(new Event('input', { bubbles: true })); mark(z); add('záver'); }
    });
    (F.nezaradene || []).forEach(function (t) { miss('📝 „' + t + '"'); });

    try { global._dirty = true; } catch (e) {}
    call('gen');
    return { filled: filled, unmapped: unm };
  }

  /* ── okno diktátu ── */
  var DRAFT = 'evk_diktat_draft';
  // konzervatívny režim očisty: štruktúrované identifikátory (RČ, telefón, e-mail, dátum,
  // „pacient Meno", lekár s titulom, poistenec, adresa) padnú; prísne mazanie dvojíc
  // Veľkých slov by v diktáte zničilo názvy devices („Stent Pulsar", „Balón Armada").
  // Preto: meno pacienta sa nediktuje – a náhľad pred odoslaním číta lekár.
  var SCRUB_OPTS = { aggressive: false };
  var ov = null;
  function close() { if (ov) { ov.remove(); ov = null; } }
  function open() {
    if (ov) return;
    ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto';
    var draft = ''; try { draft = sessionStorage.getItem(DRAFT) || ''; } catch (e) {}
    ov.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:720px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:18px 20px;font-family:inherit">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px"><h3 style="margin:0;font-size:15px;color:#1a2745">🎙️ Nález z diktátu (EVK)</h3>' +
      '<button type="button" id="dk_x" style="border:none;background:none;font-size:20px;cursor:pointer;color:#6b7280">×</button></div>' +
      '<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:600;margin-bottom:8px">🔒 Nediktujte meno ani rodné číslo – identifikáciu vyplňte ručne vo formulári. Rodné čísla, telefóny, dátumy a e-maily sa pred odoslaním odstránia automaticky; samotné priezvisko appka v diktáte nespozná – preto náhľad pred odoslaním prečítajte.</div>' +
      '<div style="font-size:12px;color:#5a6a8a;margin-bottom:6px">Heslovitý protokol v poradí výkonu – strana, prístup, sheath, DSA po tepnách, každý balón/stent s tepnou a rozmerom, uzáver, úspech, komplikácie. Diktujte klávesnicou (🎤 na telefóne, Win+H) alebo vložte prepis.</div>' +
      '<textarea id="dk_txt" style="width:100%;box-sizing:border-box;min-height:190px;border:1.5px solid #dde1ea;border-radius:8px;padding:9px;font-size:13px;font-family:inherit;resize:vertical" placeholder="napr.: Pravá noha. AFC vpravo retrográdne, LA, USG, sheath 6F. Heparín 5000. DSA: AFS oklúzia stredný segment, P1 stenóza 70–90. Prechod subintimálne, Advantage 0.018. Predilatácia Armada 4x80 AFS stred. Stent Pulsar 6x120 AFS stred. Postdilatácia 6x80. AngioSeal 6F, hemostáza ihneď. Technický úspech, bez komplikácií. Kontrast 80.">' + esc(draft) + '</textarea>' +
      '<div id="dk_review" style="display:none;margin-top:8px"></div>' +
      '<div id="dk_result" style="display:none;margin-top:8px"></div>' +
      '<div id="dk_btns" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">' +
      '<button type="button" id="dk_cancel" style="padding:7px 14px;border:1.5px solid #dde1ea;background:#fff;border-radius:8px;cursor:pointer;font-size:13px">Zavrieť</button>' +
      '<button type="button" id="dk_gate" style="padding:7px 14px;border:none;background:#1e40af;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">🔒 Očistiť a skontrolovať</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    var txt = ov.querySelector('#dk_txt');
    txt.addEventListener('input', function () { try { sessionStorage.setItem(DRAFT, txt.value); } catch (e) {} });
    ov.querySelector('#dk_x').addEventListener('click', close);
    ov.querySelector('#dk_cancel').addEventListener('click', close);
    ov.querySelector('#dk_gate').addEventListener('click', gate);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    setTimeout(function () { txt.focus(); }, 50);
  }
  function box(html) { var b = ov.querySelector('#dk_review'); b.style.display = 'block'; b.innerHTML = html; }
  function err(m) { box('<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;font-size:12px">❌ ' + esc(m) + '</div>'); }
  function gate() {
    var raw = ov.querySelector('#dk_txt').value;
    if (!raw.trim()) { err('Diktát je prázdny.'); return; }
    if (!global.Scrub) { err('Modul očisty (scrub.js) sa nenačítal – obnovte stránku.'); return; }
    var s = global.Scrub.scrub(raw, SCRUB_OPTS);
    var zhrn = s.hits.length ? global.Scrub.zhrnutie(s.hits) : 'nič citlivé sa nenašlo';
    box('<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font-size:12px"><b>🔒 Pred odoslaním appka odstránila:</b> ' + esc(zhrn) + '.<br>Von pôjde <b>len</b> tento očistený text:</div>' +
      '<textarea id="dk_clean" style="width:100%;box-sizing:border-box;margin-top:6px;border:1.5px solid #dde1ea;border-radius:8px;padding:8px;font-size:12px;font-family:inherit;height:130px;background:#f8fafc;color:#334155">' + esc(s.clean) + '</textarea>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:3px">Text môžete ešte upraviť (napr. dopísať čo prepis skomolil) – odošle sa táto verzia.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button type="button" id="dk_back" style="padding:6px 12px;border:1.5px solid #dde1ea;background:#fff;border-radius:8px;cursor:pointer;font-size:12px">Späť</button>' +
      '<button type="button" id="dk_send" style="padding:6px 12px;border:none;background:#4338ca;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">🤖 Odoslať do AI a vyplniť formulár</button></div>');
    ov.querySelector('#dk_back').addEventListener('click', function () { var b = ov.querySelector('#dk_review'); b.style.display = 'none'; b.innerHTML = ''; });
    ov.querySelector('#dk_send').addEventListener('click', function () { send(ov.querySelector('#dk_clean').value); });
  }
  function send(clean) {
    if (!global.SB_BASE || !global.sbHeaders) { err('AI extrakcia nie je dostupná (chýba pripojenie).'); return; }
    // druhá lokálna kontrola – aj po ručnej úprave náhľadu nesmie odísť RČ/e-mail/telefón
    var s2 = global.Scrub.scrub(clean, SCRUB_OPTS);
    if (s2.hits.length) { err('V upravenom texte ostal identifikátor (' + global.Scrub.zhrnutie(s2.hits) + '). Odstráňte ho a skúste znova.'); return; }
    var btn = ov.querySelector('#dk_send'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Spracúvam…'; }
    fetch(global.SB_BASE + '/functions/v1/extrakcia', { method: 'POST', headers: global.sbHeaders(), body: JSON.stringify({ text: clean, kind: 'evk' }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          var m = res.d && res.d.error ? res.d.error : ('chyba ' + res.status);
          if (res.status === 503) m = 'AI zatiaľ nie je nastavené (chýba API kľúč na serveri).';
          if (res.status === 404) m = 'Funkcia extrakcia nie je nasadená.';
          err(m); if (btn) { btn.disabled = false; btn.textContent = '🤖 Odoslať do AI a vyplniť formulár'; }
          return;
        }
        var r = apply((res.d && res.d.fields) || {});
        showResult(r);
        try { sessionStorage.removeItem(DRAFT); } catch (e) {}
      })
      .catch(function (e) { err(String(e && e.message || e)); if (btn) { btn.disabled = false; btn.textContent = '🤖 Odoslať do AI a vyplniť formulár'; } });
  }
  function showResult(r) {
    var rv = ov.querySelector('#dk_review'); rv.style.display = 'none'; rv.innerHTML = '';
    var out = ov.querySelector('#dk_result'); out.style.display = 'block';
    var h = '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:8px 10px;font-size:12.5px"><b>✅ Vyplnené (' + r.filled.length + '):</b> ' + (r.filled.map(esc).join(', ') || '–') +
      '<div style="margin-top:4px;color:#065f46">Vyplnené polia sú vo formulári podfarbené žlto – skontrolujte ich a doplňte identifikáciu pacienta. Nič sa neuložilo automaticky.</div></div>';
    if (r.unmapped.length) h += '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:12.5px;margin-top:6px"><b>⚠️ Nezaradené / na ručné doplnenie (' + r.unmapped.length + '):</b><ul style="margin:4px 0 0 16px;padding:0">' + r.unmapped.map(function (u) { return '<li>' + esc(u) + '</li>'; }).join('') + '</ul></div>';
    out.innerHTML = h;
    var btns = ov.querySelector('#dk_btns');
    btns.innerHTML = '<button type="button" id="dk_done" style="padding:7px 14px;border:none;background:#1d6f42;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">Hotovo – skontrolovať formulár</button>';
    ov.querySelector('#dk_done').addEventListener('click', close);
  }

  var API = { apply: apply, open: open, close: close, _norm: norm };
  global.DiktatEVK = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
