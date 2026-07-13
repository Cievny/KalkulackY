// Extraktor požiadavky – z textu žiadanky / CT popisu / mailu vytiahne polia
// formulára Požiadaviek (RČ, diagnóza, priemer, krčok, iliaky, symptómy…).
// Beží 100 % lokálne v prehliadači; rovnaký kontrolný panel ako pri anamnéze:
// isté nálezy predzaškrtnuté, neisté na overenie, každý s citáciou.
(function (global) {
  'use strict';

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\s+/g, ' ');
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
  function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) {} }

  // negácia v klauzule pred zhodou („bez prejavov ruptúry", „bez endoleaku")
  function negPred(nline, idx) {
    var od = Math.max(0, idx - 32);
    var pred = nline.slice(od, idx);
    var ci = Math.max(pred.lastIndexOf(','), pred.lastIndexOf(';'));
    if (ci >= 0) pred = pred.slice(ci + 1);
    return /(\bbez\b|vylucen|neprit|negat|nie je|neni|neevid)/.test(pred);
  }

  var RX = {
    rc:        /\b(\d{6})\s*\/\s*(\d{3,4})\b/,
    datum:     /(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})/,
    ctLine:    /\bcta?\b|ct ?ag|angiografi|angio ?ct/,
    endoleak:  /endoleak[a-z]*(?:[^,;\n]{0,20}?typu?\s*\.?\s*(ia|ib|iiib|iiia|iii|ii|iv|v)\b)?/,
    maxPriem:  /max[.]?\s*(?:diameter|diametr[a-z]*|priemer[a-z]*|diam\.?)[^\d\n]{0,15}(\d{2,3})(?:[.,]\d)?\s*(?:x\s*\d{2,3}\s*)?mm/g,
    rastZNa:   /z\s*(\d{2,3})\s*mm\s*na\s*(\d{2,3})\s*mm[^.\n]{0,45}?(\d{1,2})\s*(?:mesiac|mes\.)/,
    rastPriamo:/rast[a-z]*[^\d\n]{0,15}(\d{1,2})(?:[.,]\d)?\s*mm/,
    krcokDlzka:/krc[oc]k[a-z]*[^\n]{0,30}?dlzk[a-z]*\D{0,8}(\d{1,2})(?:[.,]\d)?\s*mm|dlzk[a-z]*\s*krc[oc]k[a-z]*\D{0,8}(\d{1,2})(?:[.,]\d)?\s*mm/,
    krcokPriem:/krc[oc]k[a-z]*[^\n]{0,40}?priemer[a-z]*\D{0,8}(\d{2})(?:[.,]\d)?\s*mm|priemer\s*krc[oc]k[a-z]*\D{0,8}(\d{2})(?:[.,]\d)?\s*mm/,
    krcokAng:  /angul[a-z]*\D{0,12}(\d{2,3})/,
    aicDx:     /\baic\b[^\n]{0,14}?(?:l\.?\s?dx|dx\b|vpravo)[^\d\n,]{0,50}(\d{2})(?:[.,]\d)?\s*mm/,
    aicSin:    /\baic\b[^\n]{0,14}?(?:l\.?\s?sin|sin\b|vlavo)[^\d\n,]{0,50}(\d{2})(?:[.,]\d)?\s*mm/,
    aieDx:     /\baie\b[^\n]{0,14}?(?:l\.?\s?dx|dx\b|vpravo)[^\d\n,]{0,40}(\d{2})(?:[.,]\d)?\s*mm/,
    aieSin:    /\baie\b[^\n]{0,14}?(?:l\.?\s?sin|sin\b|vlavo)[^\d\n,]{0,40}(\d{2})(?:[.,]\d)?\s*mm/,
    aieBilat:  /\baie\b[^\n]{0,20}?bilat[a-z.]*[^\d\n]{0,20}(\d{2})(?:[.,]\d)?\s*mm/,
    egfr:      /(?:egfr|ckd[- ]?epi)\D{0,10}(\d+(?:[.,]\d+)?)/,
    krea:      /krea[a-z]*\.?\s*:?\s*(?:\d{1,2}\.\s?\d{1,2}\.\s?20\d{2}\s*:?\s*)?(\d{2,3})(?:[.,]\d)?\s*(?:umol|µmol)?/,
    urgent:    /urgentn|emergentn|neodkladn|co najskor|ruptur/,
    vykon:     /\b(pevar|fevar|bevar|tevar|evar|embolizaci)/,
    ruptura:   /ruptur/,
    asympt:    /asymptomatick|asympt\b|asympt\./,
    sympt:     /symptomatick/
  };
  // diagnózy v poradí priority (prvá zhoda vyhráva); hodnota = text option-u
  var DG = [
    { re: /endoleak/, dg: 'Endoleak po EVAR/TEVAR', neg: true },
    { re: /disekci[a-z]*[^.\n]{0,20}typ[a-z]*\s*b\b|typu?\s*b\s*disekci/, dg: 'Disekcia typ B' },
    { re: /\btaaa\b|torakoabdominaln/, dg: 'TAAA' },
    { re: /aneuryz[a-z]*[^.\n]{0,25}(hrudnej|torakalnej|thorakalnej)|hrudn[a-z]* aort[a-z]*[^.\n]{0,20}aneuryz|\btaa\b/, dg: 'Aneuryzma hrudnej aorty' },
    { re: /\bimh\b|intramuraln[a-z]* hematom/, dg: 'IMH' },
    { re: /juxtarenaln[a-z]*[^.\n]{0,15}aneuryz|aneuryz[a-z]*[^.\n]{0,25}juxtarenaln|aaa juxtarenaln/, dg: 'AAA juxtarenálna' },
    { re: /\baaa\b|aneuryz[a-z]*[^.\n]{0,35}(infrarenaln|abdominaln|brusnej)|(infrarenaln|abdominaln)[a-z]*[^.\n]{0,25}aneuryz/, dg: 'AAA infrarenálna' },
    { re: /aneuryz[a-z]*[^.\n]{0,25}(\baic\b|\baii\b|iliak|iliac|panvov)|(\baic\b|\baii\b|iliak)[^.\n]{0,30}aneuryz/, dg: 'Aneuryzma iliaky' },
    { re: /\bpau\b|penetrujuc[a-z]*[^.\n]{0,25}vred/, dg: 'PAU' }
  ];
  var LIEKY = [
    ['ASA', /anopyrin|\basa\b|stacyl|aspirin|preventax|stadapyrin|godasal/],
    ['klopidogrel', /klopidogrel|clopidogrel|plavix|trombex|zyllt|egitromb/],
    ['NOAK', /apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|lixiana/],
    ['warfarín', /warfarin|lawarin/],
    ['LMWH', /fraxiparin|clexane|enoxaparin|nadroparin|zibor/]
  ];

  function quote(raw, i) {
    var line = String(raw).replace(/\s+/g, ' ');
    if (line.length <= 110) return line.trim();
    var od = Math.max(0, i - 40);
    return (od > 0 ? '…' : '') + line.slice(od, od + 105).trim() + '…';
  }

  function parsePZ(text) {
    var rawLines = String(text || '').split(/\r?\n/);
    var found = [];
    var seq = 0;
    function add(kod, label, certain, patch, q) {
      found.push({ id: 'p' + (seq++), kod: kod, label: label, certain: certain, patch: patch, quote: q || '' });
    }
    // riadky mimo odporúčaní (plán kontrol by plietol dátumy/výkony)
    var lines = [];
    var vOdp = false;
    rawLines.forEach(function (raw) {
      var n = norm(raw);
      if (/^\s*(odporucan|doporucen|odporucam|plan\s*[:\-])/.test(n)) vOdp = true;
      if (!vOdp) lines.push({ raw: raw, n: n });
    });
    var cely = lines.map(function (l) { return l.n; }).join('\n');

    var m, i, L;

    // rodné číslo → RČ + ročník + pohlavie (doplní formulár sám)
    for (i = 0; i < lines.length; i++) {
      if ((m = RX.rc.exec(lines[i].n))) {
        add('rc', 'Rodné číslo ' + m[1] + '/' + m[2], true, { rc: m[1] + '/' + m[2] }, quote(lines[i].raw, m.index));
        // iniciály: 2 slová s veľkým začiatkom tesne pred RČ (napr. „Mrkvička Ján 481205/123")
        var pred = lines[i].raw.slice(0, lines[i].raw.search(/\d{6}\s*\//));
        var mi = /([A-ZÁ-Ž][a-zá-ž]+)\s+([A-ZÁ-Ž][a-zá-ž]+)\s*$/.exec(pred);
        if (mi) add('inicialy', 'Iniciály ' + mi[1][0] + '.' + mi[2][0] + '.', false, { inicialy: mi[1][0] + '.' + mi[2][0] + '.' }, quote(lines[i].raw, 0));
        break;
      }
    }

    // dátum CT: dátum na riadku spomínajúcom CT/CTA
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      if (RX.ctLine.test(L.n) && (m = RX.datum.exec(L.n))) {
        add('datum_ct', 'Dátum CT ' + m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]), false,
          { datum_ct: m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]) }, quote(L.raw, m.index));
        break;
      }
    }

    // diagnóza podľa priority + endoleak typ
    for (var di = 0; di < DG.length; di++) {
      var hit = null;
      for (i = 0; i < lines.length && !hit; i++) {
        var g = new RegExp(DG[di].re.source, 'g');
        var mm;
        while ((mm = g.exec(lines[i].n))) {
          if (DG[di].neg && negPred(lines[i].n, mm.index)) { if (mm.index === g.lastIndex) g.lastIndex++; continue; }
          hit = { line: lines[i], m: mm }; break;
        }
      }
      if (hit) {
        var patch = { dg: DG[di].dg };
        var lbl = 'Diagnóza: ' + DG[di].dg;
        if (DG[di].dg === 'Endoleak po EVAR/TEVAR') {
          var me = RX.endoleak.exec(hit.line.n);
          if (me && me[1]) {
            var typ = me[1].toUpperCase();
            if (typ === 'IIIA' || typ === 'IIIB') typ = 'III';
            patch.endoleak_typ = typ === 'IA' ? 'Ia' : (typ === 'IB' ? 'Ib' : typ);
            lbl += ' – typ ' + patch.endoleak_typ;
          }
        }
        add('dg', lbl, true, patch, quote(hit.line.raw, hit.m.index));
        break;
      }
    }

    // klinický stav (asympt. treba testovať pred sympt.)
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      if ((m = new RegExp(RX.ruptura.source, 'g').exec(L.n)) && !negPred(L.n, m.index)) {
        add('sympt', 'Klinický stav: ruptúra', true, { sympt: 'ruptúra' }, quote(L.raw, m.index)); break;
      }
      if (RX.asympt.test(L.n)) {
        add('sympt', 'Klinický stav: asymptomatický', true, { sympt: 'asymptomatický' }, quote(L.raw, L.n.search(RX.asympt))); break;
      }
      if (RX.sympt.test(L.n.replace(/asymptomatick/g, ''))) {
        add('sympt', 'Klinický stav: symptomatický', true, { sympt: 'symptomatický' }, quote(L.raw, 0)); break;
      }
    }

    // max. priemer – najväčšia hodnota so slovom „max" (AAA býva najväčšia)
    var best = null, bi = null;
    for (i = 0; i < lines.length; i++) {
      var gg = new RegExp(RX.maxPriem.source, 'g');
      var mp;
      while ((mp = gg.exec(lines[i].n))) {
        var v = parseInt(mp[1], 10);
        if (v >= 25 && v <= 130 && (best === null || v > best)) { best = v; bi = { line: lines[i], idx: mp.index }; }
      }
    }
    if (best !== null) add('priemer', 'Max. priemer ' + best + ' mm', true, { priemer: best }, quote(bi.line.raw, bi.idx));
    else if ((m = RX.rastZNa.exec(cely))) {
      // bez „max. diameter" – aktuálny rozmer z progresie („z 54 mm na 60 mm")
      add('priemer', 'Max. priemer ' + m[2] + ' mm (z progresie)', false, { priemer: parseInt(m[2], 10) }, m[0]);
    }

    // rast: „z 54 mm na 60 mm v priebehu 6 mesiacov" → mm/rok; alebo priamo
    if ((m = RX.rastZNa.exec(cely))) {
      var rocne = Math.round((parseInt(m[2], 10) - parseInt(m[1], 10)) * 12 / parseInt(m[3], 10));
      if (rocne > 0 && rocne < 40) add('rast', 'Rast ~' + rocne + ' mm/rok (z ' + m[1] + ' na ' + m[2] + ' mm za ' + m[3] + ' mes.)', false, { rast: rocne }, m[0]);
    } else if ((m = RX.rastPriamo.exec(cely))) {
      add('rast', 'Rast ' + m[1] + ' mm/rok', false, { rast: parseInt(m[1], 10) }, m[0]);
    }

    // krčok + iliaky (na overenie – sizing chce presnosť)
    if ((m = RX.krcokDlzka.exec(cely))) add('krcok_dlzka', 'Krčok dĺžka ' + (m[1] || m[2]) + ' mm', false, { krcok_dlzka: parseInt(m[1] || m[2], 10) }, m[0]);
    if ((m = RX.krcokPriem.exec(cely))) add('krcok_priemer', 'Krčok priemer ' + (m[1] || m[2]) + ' mm', false, { krcok_priemer: parseInt(m[1] || m[2], 10) }, m[0]);
    if ((m = RX.krcokAng.exec(cely))) {
      var ang = parseInt(m[1], 10);
      if (ang >= 10 && ang <= 180) add('krcok_ang', 'Krčok angulácia ' + ang + '° (' + (ang < 60 ? '<60' : '>60') + ')', false, { krcok_ang: ang < 60 ? '<60' : '>60' }, m[0]);
    }
    [['aic_dx', RX.aicDx, 'AIC dx'], ['aic_sin', RX.aicSin, 'AIC sin'], ['aie_dx', RX.aieDx, 'AIE dx'], ['aie_sin', RX.aieSin, 'AIE sin']].forEach(function (def) {
      var mm2 = def[1].exec(cely);
      if (mm2) {
        var pv = {}; pv[def[0]] = parseInt(mm2[1], 10);
        add(def[0], def[2] + ' ' + mm2[1] + ' mm', false, pv, mm2[0]);
      }
    });
    if (!found.some(function (f) { return f.kod === 'aie_dx'; }) && (m = RX.aieBilat.exec(cely))) {
      add('aie_dx', 'AIE bilat. ' + m[1] + ' mm', false, { aie_dx: parseInt(m[1], 10), aie_sin: parseInt(m[1], 10) }, m[0]);
    }

    // renálne funkcie: eGFR, inak kreatinín ako text
    if ((m = RX.egfr.exec(cely))) add('renalne', 'eGFR ' + m[1], false, { renalne: m[1].replace(',', '.') }, m[0]);
    else if ((m = RX.krea.exec(cely))) add('renalne', 'kreatinín ' + m[1] + ' µmol/l', false, { renalne: 'krea ' + m[1] }, m[0]);

    // antitrombotická liečba
    var lieky = [];
    LIEKY.forEach(function (lk) { if (lk[1].test(cely)) lieky.push(lk[0]); });
    if (lieky.length) add('medikacia', 'Antitrombotiká: ' + lieky.join(', '), true, { medikacia: lieky.join(', ') }, '');

    // urgencia + navrhovaný výkon
    if ((m = new RegExp(RX.urgent.source, 'g').exec(cely)) && !negPred(cely.slice(Math.max(0, m.index - 60), m.index) + '', 60)) {
      var urg = /emergentn/.test(m[0]) || /ruptur/.test(m[0]) ? 'emergentné' : 'urgentné';
      if (!(/ruptur/.test(m[0]) && negPred(cely, m.index))) add('urgencia', 'Urgencia: ' + urg, false, { urgencia: urg }, quote(m[0], 0));
    }
    if ((m = RX.vykon.exec(cely))) {
      var vk = m[1] === 'embolizaci' ? 'Embolizácia' : m[1].toUpperCase();
      add('vykon', 'Navrhovaný výkon: ' + vk, false, { vykon: vk }, quote(cely.slice(Math.max(0, m.index - 30), m.index + 30), 30));
    }

    return { found: found };
  }

  /* ---------- vyplnenie formulára ---------- */
  function setVal(id, v, force) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!force && el.value) return;
    el.value = v; fire(el, 'input'); fire(el, 'change');
  }
  function setSel(id, pred) {
    var el = document.getElementById(id);
    if (!el) return;
    for (var i = 0; i < el.options.length; i++) {
      if (pred(norm(el.options[i].value || el.options[i].text), el.options[i].text)) {
        el.value = el.options[i].value; fire(el, 'change'); return;
      }
    }
  }

  function applyPZ(res, ids) {
    var d = {};
    res.found.forEach(function (f) {
      if (ids && ids.indexOf(f.id) < 0) return;
      for (var k in f.patch) d[k] = f.patch[k];
    });
    if (d.rc) setVal('af_rodne_cislo', d.rc, true);         // input event doplní ročník + pohlavie
    if (d.inicialy) setVal('af_inicialy', d.inicialy);
    if (d.datum_ct) setVal('af_datum_ct', d.datum_ct);
    if (d.dg) setSel('af_diagnoza', function (v, t) { return t === d.dg; });
    if (d.endoleak_typ) setSel('af_endoleak_typ', function (v, t) { return t === 'typ ' + d.endoleak_typ || t.indexOf('typ ' + d.endoleak_typ) === 0; });
    if (d.sympt) setSel('af_symptomy', function (v, t) { return t === d.sympt; });
    if (d.priemer != null) setVal('af_priemer', d.priemer);
    if (d.rast != null) setVal('af_rast', d.rast);
    if (d.krcok_dlzka != null) setVal('af_krcok_dlzka', d.krcok_dlzka);
    if (d.krcok_priemer != null) setVal('af_krcok_priemer', d.krcok_priemer);
    if (d.krcok_ang) setSel('af_krcok_angulacia', function (v) { return v.indexOf(d.krcok_ang) === 0; });
    if (d.aic_dx != null) setVal('sz_AIC_dx_mm', d.aic_dx);
    if (d.aic_sin != null) setVal('sz_AIC_sin_mm', d.aic_sin);
    if (d.aie_dx != null) setVal('sz_AIE_dx_mm', d.aie_dx);
    if (d.aie_sin != null) setVal('sz_AIE_sin_mm', d.aie_sin);
    if (d.renalne) setVal('af_renalne', d.renalne);
    if (d.medikacia) setVal('af_medikacia', d.medikacia);
    if (d.urgencia) setSel('af_urgencia', function (v, t) { return t === d.urgencia; });
    if (d.vykon) setSel('af_vykon_typ', function (v, t) { return t === d.vykon; });
    return true;
  }

  /* ---------- modal (nad modálom požiadavky) ---------- */
  var mdl = null, lastRes = null;

  function build() {
    var ov = document.createElement('div');
    ov.id = 'pz_modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:92vh;overflow-y:auto;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-size:13px';
    box.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:8px">📋 Vyplniť požiadavku z textu (žiadanka / CT popis / mail)</div>' +
      '<textarea id="pz_txt" rows="8" placeholder="Sem vložte text žiadanky, CT popisu alebo mailu…" style="width:100%;box-sizing:border-box;border:1.5px solid #dde1ea;border-radius:8px;padding:8px;font-size:12.5px;font-family:inherit;outline:none;resize:vertical"></textarea>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap">' +
      '<label style="cursor:pointer;font-size:12px;font-weight:600;color:#1e40af;border:1.5px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:5px 10px">📷 Načítať zo screenshotu<input type="file" id="pz_img" accept="image/*" style="display:none"></label>' +
      '<span style="font-size:11px;color:#6b7280">alebo obrázok vložte Ctrl+V • všetko sa spracuje len vo vašom prehliadači</span>' +
      '</div>' +
      '<div id="pz_ocr" style="display:none;font-size:12.5px;margin-top:6px;color:#1e40af;font-weight:600"></div>' +
      '<div id="pz_review" style="display:none;margin:10px 0"></div>' +
      '<div id="pz_result" style="display:none;font-size:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;margin:10px 0"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">' +
      '<button type="button" id="pz_cancel" style="padding:6px 14px;border:1.5px solid #dde1ea;background:#fff;border-radius:8px;cursor:pointer;font-size:12.5px">Zrušiť</button>' +
      '<button type="button" id="pz_run" style="padding:6px 14px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600">Rozpoznať</button>' +
      '<button type="button" id="pz_apply" style="display:none;padding:6px 14px;border:none;background:#16a34a;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700">Vyplniť vybrané</button>' +
      '</div>';
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) closePZ(); });
    box.querySelector('#pz_cancel').addEventListener('click', closePZ);
    box.querySelector('#pz_run').addEventListener('click', runParse);
    box.querySelector('#pz_apply').addEventListener('click', runApply);
    box.querySelector('#pz_img').addEventListener('change', function () { ocrFile(this.files[0]); this.value = ''; });
    ov.addEventListener('paste', function (e) {
      var it = Array.prototype.find.call((e.clipboardData || {}).items || [], function (i) { return i.type && i.type.indexOf('image/') === 0; });
      if (it) { e.preventDefault(); ocrFile(it.getAsFile()); }
    });
    return ov;
  }
  function openPZ() {
    if (!mdl) { mdl = build(); document.body.appendChild(mdl); }
    mdl.style.display = 'flex';
    lastRes = null;
    mdl.querySelector('#pz_review').style.display = 'none';
    mdl.querySelector('#pz_review').innerHTML = '';
    mdl.querySelector('#pz_result').style.display = 'none';
    mdl.querySelector('#pz_apply').style.display = 'none';
    setTimeout(function () { mdl.querySelector('#pz_txt').focus(); }, 0);
  }
  function closePZ() { if (mdl) mdl.style.display = 'none'; }
  function runParse() {
    lastRes = parsePZ(mdl.querySelector('#pz_txt').value);
    var box = mdl.querySelector('#pz_review');
    mdl.querySelector('#pz_result').style.display = 'none';
    if (!lastRes.found.length) {
      box.style.display = 'block';
      box.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;font-size:12px">❗ V texte sa nenašli údaje požiadavky (RČ, diagnóza, priemer…).</div>';
      mdl.querySelector('#pz_apply').style.display = 'none';
      return;
    }
    var html = '<div style="border:1.5px solid #dde1ea;border-radius:10px;padding:8px 10px;max-height:42vh;overflow-y:auto">';
    lastRes.found.forEach(function (f) {
      var tag = f.certain
        ? '<span style="font-size:10px;font-weight:700;color:#166534;background:#dcfce7;border-radius:5px;padding:1px 6px">✓</span>'
        : '<span style="font-size:10px;font-weight:700;color:#92400e;background:#fef3c7;border-radius:5px;padding:1px 6px">❓ overiť</span>';
      html += '<label style="display:flex;gap:8px;align-items:flex-start;padding:5px 2px;border-bottom:1px solid #f1f5f9;cursor:pointer">' +
        '<input type="checkbox" class="pz_pick" data-id="' + f.id + '"' + (f.certain ? ' checked' : '') + ' style="margin-top:2px">' +
        '<span style="flex:1"><b>' + esc(f.label) + '</b> ' + tag +
        (f.quote ? '<br><span style="color:#6b7280;font-style:italic;font-size:11.5px">„' + esc(f.quote) + '"</span>' : '') +
        '</span></label>';
    });
    html += '</div>';
    box.innerHTML = html;
    box.style.display = 'block';
    var ab = mdl.querySelector('#pz_apply');
    ab.style.display = '';
    var upd = function () { ab.textContent = 'Vyplniť vybrané (' + mdl.querySelectorAll('.pz_pick:checked').length + ')'; };
    upd();
    mdl.querySelectorAll('.pz_pick').forEach(function (cb) { cb.addEventListener('change', upd); });
  }
  function runApply() {
    if (!lastRes) return;
    var ids = [];
    mdl.querySelectorAll('.pz_pick:checked').forEach(function (cb) { ids.push(cb.dataset.id); });
    applyPZ(lastRes, ids);
    var labels = lastRes.found.filter(function (f) { return ids.indexOf(f.id) >= 0; }).map(function (f) { return f.label; });
    var out = mdl.querySelector('#pz_result');
    out.style.display = 'block';
    out.textContent = '✅ Vyplnené: ' + (labels.join(', ') || '–');
    mdl.querySelector('#pz_cancel').textContent = 'Zavrieť';
  }

  /* ---------- OCR (tesseract.js – lokálne, spoločné vendor súbory) ---------- */
  var ocrWorker = null;
  function ocrStav(t) { var el = mdl.querySelector('#pz_ocr'); el.style.display = t ? 'block' : 'none'; el.textContent = t || ''; }
  function loadTess() {
    return global.Tesseract ? Promise.resolve() : new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = '/tools/vendor/tesseract/tesseract.min.js';
      s.onload = res; s.onerror = function () { rej(new Error('nepodarilo sa načítať OCR knižnicu')); };
      document.head.appendChild(s);
    });
  }
  function ocrFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return;
    ocrStav('⏳ Načítavam OCR (prvýkrát ~6 MB)…');
    loadTess().then(function () {
      return ocrWorker ? ocrWorker : Tesseract.createWorker('slk', 1, {
        workerPath: '/tools/vendor/tesseract/worker.min.js',
        corePath: '/tools/vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
        langPath: '/tools/vendor/tesseract',
        logger: function (mm) { if (mm.status === 'recognizing text') ocrStav('🔍 Čítam obrázok… ' + Math.round((mm.progress || 0) * 100) + ' %'); }
      }).then(function (w) { ocrWorker = w; return w; });
    }).then(function (w) {
      ocrStav('🔍 Čítam obrázok…');
      return w.recognize(file);
    }).then(function (r) {
      var txt = (r && r.data && r.data.text || '').trim();
      if (!txt) { ocrStav('❗ Z obrázka sa nepodarilo prečítať text – skúste ostrejší screenshot.'); return; }
      var ta = mdl.querySelector('#pz_txt');
      ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + txt;
      ocrStav('');
      runParse();
    }).catch(function (e) { ocrStav('❌ OCR zlyhalo: ' + ((e && e.message) || e)); });
  }

  var API = { parsePZ: parsePZ, applyPZ: applyPZ, openPZ: openPZ, closePZ: closePZ, _norm: norm };
  global.PoziadavkyImport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
