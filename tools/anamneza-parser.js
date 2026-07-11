/* =========================================================================
   anamneza-parser.js – lokálny parser anamnézy / medikácie (SK + CZ)
   Doktor vloží voľný text zo správy → parser rozpozná komorbidity,
   antitrombotiká, kreatinín, rodné číslo / vek / pohlavie.
   Všetko beží LEN v prehliadači – žiadna sieť, žiadne ukladanie.

   Export: window.AnamnezaParser = { parse, open, apply }
   (v Node: module.exports – kvôli unit testom)
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- utily ---------- */
  // malé písmená + odstránenie diakritiky (č→c, í→i …) – SK aj CZ texty
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Negácia: nález preskočíme, ak ~15 znakov PRED zhodou je negačné slovo,
  // alebo riadok začína na "neguje". Jednoduchá riadková heuristika.
  var NEG_WIN = /(neguje|\bbez\s|\bnema\s|nemel|nemela|vylucen|vyloucen|0:)/;

  // Nájde prvú NEnegovanú zhodu regexu (regex bez /g – klonuje sa s g).
  // Vracia {m: matchArray} alebo null. Pracuje riadok po riadku.
  function findPos(lines, re) {
    var g = new RegExp(re.source, 'g' + (re.flags || '').replace(/g/g, ''));
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var negLine = /^\s*neguje/.test(line);
      g.lastIndex = 0;
      var m;
      while ((m = g.exec(line))) {
        if (negLine) break;
        var win = line.slice(Math.max(0, m.index - 15), m.index);
        if (NEG_WIN.test(win)) { if (m.index === g.lastIndex) g.lastIndex++; continue; }
        return { m: m };
      }
    }
    return null;
  }

  /* ---------- slovníky (na normalizovanom texte, bez diakritiky) ---------- */
  var RX = {
    dm:      /\bdm\b|\bdm\s*[12]\b|\bdm\s*i{1,2}\b|diabet|cukrovk/,
    dm1:     /\bdm\s*-?\s*1\b|\bdm\s*i\b(?!i)|\b1\.?\s*typu?\b|\btypu?\s*1\b|\bi\.\s*typu/,
    dm2:     /\bdm\s*-?\s*2\b|\bdm\s*ii\b|\b2\.?\s*typu?\b|\btypu?\s*2\b|\bii\.\s*typu/,
    inzulin: /inzulin/,
    oad:     /\bpad\b|\boad\b|metformin|gliklazid|glimepirid|gliptin|sitagliptin|linagliptin|empagliflozin|dapagliflozin|gliflozin|glifozin/,
    dieta:   /\bdiet(a|e|ou|u)\b/,
    ah:      /arteriov[a-z]* hypertenz|arterialni hypertenz|hypertenz(ia|e)|\bah\b|esencialn[a-z]* ht\b|\bht\b.{0,3}na terapii/,
    chri:    /\bckd\b|\bchri\b|renaln[a-z]* insuficienc|nefropati|ochorenie oblicok|ochorenie obliciek|onemocneni ledvin|nedostatocnost oblicok|selhani ledvin/,
    krea:    /krea(?:tinin[a-z]*)?\s*[:.=]?\s*(\d{2,4})(?:[.,]\d+)?(\s*[uµ]mol)?/,
    ichs:    /\bichs\b|ischemick[a-z]* choroba srd|\bcad\b|koronarn[a-z]* (chorob|nemoc)/,
    im:      /st\.?\s*p\.?\s*im\b|infarkt[a-z]* myokardu|\bn?stemi\b|\bpo im\b/,
    cmp:     /st\.?\s*p\.?\s*n?cmp\b|\bn?cmp\b|cievna mozgova prihoda|cevni mozkova prihoda|\biktus|\bstroke\b|\btia\b/,
    faj:     /fajciar|fajcen|nikotinizm|kurak|koureni|kuractvi/,
    fajEx:   /(ex|stop)\s*-?\s*(fajciar|kurak)|byval[a-z]* (fajciar|kurak)/,
    dysl:    /dyslipidemi|hyperlipoproteinemi|\bhlp\b|hypercholesterolemi|hyperlipidemi/,
    statin:  /\bstatin|atorvastatin|rosuvastatin|simvastatin|fluvastatin|pravastatin|sortis|crestor|torvacard|rosucard|tulip|atoris/,
    obez:    /obezit|adipozit|obezn/,
    bmi:     /\bbmi\s*[:=]?\s*(\d{2}(?:[.,]\d)?)/,
    chochp:  /\bchochp\b|\bchopn\b|\bcopd\b/,
    asa:     /anopyrin|acylpyrin|aspirin|\basa\b|kyselina acetylsalicylov|acetylsalicyl|godasal|stacyl/,
    klopi:   /trombex|plavix|zyllt|[ck]lopidogrel/,
    dapt:    /\bdapt\b|dualn[a-z]* antiagregac|dualni antiagregac/,
    noak:    /rivaroxaban|xarelto|apixaban|eliquis|dabigatran|pradaxa|edoxaban|lixiana|\bnoak\b|\bdoac\b/,
    warf:    /warfarin|lawarin/,
    lmwh:    /fraxiparin|clexane|enoxaparin|nadroparin|\blmwh\b|nizkomolekul/,
    // RČ s lomkou: RRMMDD/XXX(X)
    rcSlash: /\b(\d{2})(\d{2})(\d{2})\s*\/\s*(\d{3,4})\b/,
    // RČ bez lomky: 9–10 číslic vcelku (prísna validácia v rcPlainOk –
    // inak by matcher chytal telefónne čísla, napr. 0905123456)
    rcPlain: /\b(\d{2})(\d{2})(\d{2})(\d{3,4})\b/,
    // kontext „RČ / r.č. / rodné číslo“ (na normalizovanom texte bez diakritiky)
    rcCtx: /\br\.?\s?c\b|rodn/
  };

  var LABELS = {
    sk: { faj: 'fajčiar', fajEx: 'exfajčiar', dysl: 'dyslipidémia', statin: 'statín',
          obez: 'obezita', chochp: 'CHOCHP', warf: 'warfarín', vek: 'vek', zena: 'Ž',
          missing: ['DM', 'AH', 'CKD', 'ICHS', 'IM', 'CMP', 'fajčenie', 'dyslipidémia', 'obezita', 'CHOCHP', 'antitrombotiká', 'RČ'] },
    cz: { faj: 'kuřák', fajEx: 'ex-kuřák', dysl: 'dyslipidemie', statin: 'statin',
          obez: 'obezita', chochp: 'CHOPN', warf: 'warfarin', vek: 'věk', zena: 'Ž',
          missing: ['DM', 'AH', 'CKD', 'ICHS', 'IM', 'CMP', 'kouření', 'dyslipidemie', 'obezita', 'CHOPN', 'antitrombotika', 'RČ'] }
  };

  /* ---------- rodné číslo ---------- */
  // Validuje mesiac (1–12; ženy +50; príp. +20 pri vyčerpaní koncoviek) a deň.
  function rcParse(yy, mm, dd, suf, now) {
    var y = parseInt(yy, 10), m = parseInt(mm, 10), d = parseInt(dd, 10);
    var pohlavie = 'M';
    if (m > 50) { pohlavie = 'Z'; m -= 50; }           // ženy: mesiac +50
    if (m > 20 && m <= 32) m -= 20;                     // zriedkavé: mesiac +20
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    // Storočie: 3-miestna koncovka = pred r. 1954 → 19xx.
    // Inak jednoduché pravidlo: yy > aktuálny 2-miestny rok → 19xx, inak 20xx.
    var nowYY = now.getFullYear() % 100;
    var year = (suf.length === 3) ? 1900 + y : (y > nowYY ? 1900 + y : 2000 + y);
    var vek = now.getFullYear() - year - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
    if (vek < 0 || vek > 110) return null;              // poistka plauzibility
    return { rc: yy + mm + dd + '/' + suf, pohlavie: pohlavie === 'Z' ? 'Ž' : 'M', vek: vek };
  }

  // Existuje daný kalendárny dátum? (odchytí napr. 31.2., 30.2. …)
  function realDate(y, m, d) {
    var t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
  }

  // Smie sa zhoda 9–10 číslic VCELKU (bez lomky) považovať za RČ?
  //  (i) kontext „RČ / rodné číslo“ do ~20 znakov pred zhodou, ALEBO
  //  (ii) 10 číslic + deliteľnosť 11 (kontrolná číslica) + validný mesiac
  //       (1–12 / 51–62) + validný deň (1–31) + reálny dátum narodenia
  //       + prefix nie je mobilná predvoľba 09xx.
  // Telefóny tak neprejdú: 0905123456 padne na 09-prefixe, pevné linky
  // spravidla na mesiaci/dni/deliteľnosti 11. 9-miestne RČ len s kontextom.
  function rcPlainOk(m, nt) {
    if (RX.rcCtx.test(nt.slice(Math.max(0, m.index - 20), m.index))) return true;
    var digits = m[1] + m[2] + m[3] + m[4];
    if (digits.length !== 10) return false;              // 9 číslic len s kontextom
    if (digits.slice(0, 2) === '09') return false;       // zjavná predvoľba mobilu
    if (parseInt(digits, 10) % 11 !== 0) return false;   // modulo-11 kontrola
    var yy = parseInt(m[1], 10), mm = parseInt(m[2], 10), dd = parseInt(m[3], 10);
    if (mm > 50) mm -= 50;                               // ženy: mesiac +50
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
    var nowYY = new Date().getFullYear() % 100;
    return realDate(yy > nowYY ? 1900 + yy : 2000 + yy, mm, dd);
  }

  /* ---------- hlavný parser ---------- */
  function parse(text, lang) {
    lang = lang === 'cz' ? 'cz' : 'sk';
    var L = LABELS[lang];
    var lines = String(text || '').split(/\r?\n/).map(norm);
    var nt = lines.join('\n'); // celý normalizovaný text (pre typ DM ap.)
    var P = function (re) { return findPos(lines, re); };

    var found = [];
    var data = { dm: null, ah: false, chri: null, ichs: false, im: false, cmp: false,
                 faj: false, obez: false, dysl: null, chochp: false,
                 atb: { asa: false, klopidogrel: false, dapt: false, noak: false, warfarin: false, lmwh: false },
                 rodne_cislo: null, vek: null, pohlavie: null };

    // DM + typ + liečba
    if (P(RX.dm)) {
      var typ = RX.dm1.test(nt) && !RX.dm2.test(nt) ? 'DM1' : (RX.dm2.test(nt) ? 'DM2' : null);
      var maInz = !!P(RX.inzulin), maOad = !!P(RX.oad);
      var liecba = (maInz && maOad) ? 'OAD+inzulín'
        : (maInz ? 'inzulín' : (maOad ? 'OAD' : (P(RX.dieta) ? 'diéta' : null)));
      data.dm = { typ: typ, liecba: liecba };
      found.push({ kod: 'dm', label: (typ || 'DM') + (liecba ? ' (' + liecba + ')' : ''), detail: liecba });
    }
    if (P(RX.ah)) { data.ah = true; found.push({ kod: 'ah', label: 'AH', detail: null }); }

    // CKD + kreatinín (hodnota len v plauzibilnom pásme 40–1500 µmol/l)
    var kreaM = P(RX.krea);
    var krea = null;
    if (kreaM) { var kv = parseInt(kreaM.m[1], 10); if (kv >= 40 && kv <= 1500) krea = kv; }
    if (P(RX.chri)) {
      data.chri = { krea: krea };
      found.push({ kod: 'chri', label: 'CKD' + (krea ? ' (krea ' + krea + ')' : ''), detail: krea ? 'krea ' + krea : null });
    }

    if (P(RX.ichs)) { data.ichs = true; found.push({ kod: 'ichs', label: 'ICHS', detail: null }); }
    if (P(RX.im))   { data.im = true;   found.push({ kod: 'im', label: 'st.p. IM', detail: null }); }
    if (P(RX.cmp))  { data.cmp = true;  found.push({ kod: 'cmp', label: 'st.p. CMP', detail: null }); }

    // Fajčenie – aj exfajčiar sa počíta ako zaškrtnuté
    if (P(RX.faj)) {
      data.faj = true;
      data.faj_ex = !!P(RX.fajEx);
      found.push({ kod: 'faj', label: data.faj_ex ? L.fajEx : L.faj, detail: null });
    }

    // Obezita: slovo alebo BMI ≥ 30
    var bmiM = P(RX.bmi);
    var bmi = bmiM ? parseFloat(bmiM.m[1].replace(',', '.')) : null;
    if (P(RX.obez) || (bmi !== null && bmi >= 30)) {
      data.obez = true;
      if (bmi !== null && bmi >= 30) data.obez_bmi = bmi;
      found.push({ kod: 'obez', label: L.obez + (bmi !== null && bmi >= 30 ? ' (BMI ' + bmi + ')' : ''), detail: null });
    }

    // Dyslipidémia – aj samotný statín v medikácii ju indikuje
    var statin = !!P(RX.statin);
    if (P(RX.dysl) || statin) {
      data.dysl = { statin: statin };
      found.push({ kod: 'dysl', label: L.dysl + (statin ? ' (' + L.statin + ')' : ''), detail: null });
    }

    if (P(RX.chochp)) { data.chochp = true; found.push({ kod: 'chochp', label: L.chochp, detail: null }); }

    // Antitrombotiká
    var a = data.atb;
    a.asa = !!P(RX.asa);
    a.klopidogrel = !!P(RX.klopi);
    a.dapt = (a.asa && a.klopidogrel) || !!P(RX.dapt);
    a.noak = !!P(RX.noak);
    a.warfarin = !!P(RX.warf);
    a.lmwh = !!P(RX.lmwh);
    if (a.dapt) found.push({ kod: 'atb', label: 'ASA+klopidogrel (DAPT)', detail: null });
    else {
      if (a.asa) found.push({ kod: 'atb', label: 'ASA', detail: null });
      if (a.klopidogrel) found.push({ kod: 'atb', label: 'klopidogrel', detail: null });
    }
    if (a.noak) found.push({ kod: 'atb', label: 'NOAK/DOAC', detail: null });
    if (a.warfarin) found.push({ kod: 'atb', label: L.warf, detail: null });
    if (a.lmwh) found.push({ kod: 'atb', label: 'LMWH', detail: null });

    // Rodné číslo: formát s lomkou platí bez kontextu; 9–10 číslic vcelku
    // len ak prejde rcPlainOk (kontext alebo prísna validácia – viď vyššie)
    var now = new Date();
    var rc = null;
    var rcM = RX.rcSlash.exec(nt);
    if (rcM) rc = rcParse(rcM[1], rcM[2], rcM[3], rcM[4], now);
    if (!rc) {
      var gP = new RegExp(RX.rcPlain.source, 'g');
      var pm;
      while ((pm = gP.exec(nt))) {
        if (!rcPlainOk(pm, nt)) continue;
        rc = rcParse(pm[1], pm[2], pm[3], pm[4], now);
        if (rc) break;
      }
    }
    if (rc) {
      data.rodne_cislo = rc.rc; data.pohlavie = rc.pohlavie; data.vek = rc.vek;
      found.push({ kod: 'rc', label: 'RČ ' + rc.rc + ' (' + rc.pohlavie + ', ' + rc.vek + ' r.)', detail: null });
    }

    return { found: found, data: data };
  }

  /* ======================================================================
     UI + zápis do formulára (spoločné pre EVK / CAS / PEVAR, SK aj CZ).
     Rozdiely medzi súbormi sa detegujú priamo z DOM-u (id/hodnoty).
     ====================================================================== */

  function isCZ() {
    try { return global.location && global.location.pathname.indexOf('/cz/') === 0; } catch (e) { return false; }
  }

  function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) {} }

  function tickCheckbox(el) {
    if (el && !el.checked) { el.checked = true; fire(el, 'change'); } // nikdy neodškrtávame
  }
  function setRadio(name, pred) {
    var radios = document.querySelectorAll('input[name="' + name + '"]');
    for (var i = 0; i < radios.length; i++) {
      if (pred(norm(radios[i].value))) { if (!radios[i].checked) { radios[i].checked = true; fire(radios[i], 'change'); } return true; }
    }
    return false;
  }
  function atbBox(pred) {
    var list = document.querySelectorAll('input.atb');
    for (var i = 0; i < list.length; i++) if (pred(norm(list[i].value))) return list[i];
    return null;
  }

  // Zapíše výsledok parsera do formulára. Nič neodškrtáva, RČ/vek/pohlavie
  // vypĺňa len do prázdnych polí. Vracia info pre výsledný riadok (eGFR…).
  function apply(res) {
    var d = res.data;

    // Pacient: RČ / vek / pohlavie – len ak sú polia prázdne
    var rcEl = document.getElementById('rodne_cislo');
    var rcWasEmpty = rcEl && !rcEl.value.trim();
    if (d.rodne_cislo && rcWasEmpty) { rcEl.value = d.rodne_cislo; fire(rcEl, 'input'); }
    var vekEl = document.getElementById('vek');
    if (d.vek !== null && vekEl && !vekEl.value) { vekEl.value = d.vek; fire(vekEl, 'input'); }
    // select pohlavia nemá "prázdny" stav → nastavíme ho len vtedy,
    // keď bolo RČ pole prázdne (pacient sa evidentne ešte nevypĺňal)
    var pohlEl = document.getElementById('pohl') || document.getElementById('pohlavie');
    if (d.pohlavie && pohlEl && rcWasEmpty) {
      var male = !!pohlEl.querySelector('option[value="M"]');            // EVK: M/Z, CAS+PEVAR: Muž/Žena
      pohlEl.value = d.pohlavie === 'M' ? (male ? 'M' : 'Muž') : (male ? 'Z' : 'Žena');
      fire(pohlEl, 'change');
    }

    // Komorbidity
    if (d.dm) {
      tickCheckbox(document.getElementById('k_dm'));
      if (d.dm.typ) setRadio('dm_typ', function (v) { return v === norm(d.dm.typ); });
      // kombinácia OAD+inzulín má vlastné radio („kombináciou OAD a inzulínu“ /
      // „kombinací OAD a inzulinu“) – nesmie skončiť len ako inzulín
      if (d.dm.liecba === 'OAD+inzulín') setRadio('dm_liecba', function (v) { return v.indexOf('kombin') === 0; });
      else if (d.dm.liecba === 'inzulín') setRadio('dm_liecba', function (v) { return v.indexOf('inzulin') === 0; });
      else if (d.dm.liecba === 'OAD') setRadio('dm_liecba', function (v) { return v === 'oad'; });
      else if (d.dm.liecba === 'diéta') setRadio('dm_liecba', function (v) { return v.indexOf('diet') === 0; });
    }
    if (d.ah) tickCheckbox(document.getElementById('k_ah'));
    if (d.chri) {
      tickCheckbox(document.getElementById('k_chri'));
      var kreaEl = document.getElementById('chri_krea');
      if (d.chri.krea && kreaEl && !kreaEl.value) { kreaEl.value = d.chri.krea; fire(kreaEl, 'input'); } // oninput → calcEGFR()+gen()
    }
    if (d.ichs) tickCheckbox(document.getElementById('k_ichs'));
    if (d.im) tickCheckbox(document.getElementById('k_im'));
    if (d.cmp) tickCheckbox(document.getElementById('k_cmp'));
    if (d.faj) {
      tickCheckbox(document.getElementById('k_faj'));
      if (d.faj_ex) setRadio('faj_stav', function (v) { return v.indexOf('ex') === 0; });
    }
    if (d.obez) {
      tickCheckbox(document.getElementById('k_obez'));
      var bmiEl = document.getElementById('obez_bmi');
      if (d.obez_bmi && bmiEl && !bmiEl.value) { bmiEl.value = d.obez_bmi; fire(bmiEl, 'input'); }
    }
    if (d.dysl) {
      tickCheckbox(document.getElementById('k_dysl'));
      if (d.dysl.statin) setRadio('dysl_liecba', function (v) { return v === 'statin'; });
    }
    if (d.chochp) tickCheckbox(document.getElementById('k_chochp'));

    // Antitrombotiká – podľa hodnôt checkboxov .atb v danom súbore.
    // Pri DAPT sa zaškrtne LEN checkbox DAPT (nie navyše samostatné ASA
    // a klopidogrel – dvojice by sa vo výslednom texte duplikovali).
    var a = d.atb;
    if (a.dapt) {
      var daptEl = atbBox(function (v) { return v.indexOf('dapt') === 0; });
      if (daptEl) tickCheckbox(daptEl);
      else {
        // formulár bez DAPT checkboxu – fallback na dvojicu ASA + klopidogrel
        tickCheckbox(atbBox(function (v) { return v === 'asa'; }));
        tickCheckbox(atbBox(function (v) { return v === 'klopidogrel'; }));
      }
    } else {
      if (a.asa) tickCheckbox(atbBox(function (v) { return v === 'asa'; }));
      if (a.klopidogrel) tickCheckbox(atbBox(function (v) { return v === 'klopidogrel'; }));
    }
    if (a.noak) tickCheckbox(atbBox(function (v) { return v === 'doac' || v === 'noak'; }));
    if (a.warfarin) tickCheckbox(atbBox(function (v) { return v.indexOf('warfar') === 0; }));
    if (a.lmwh) tickCheckbox(atbBox(function (v) { return v === 'lmwh'; }));

    // Otvor sekciu komorbidít, nech doktor vidí, čo sa zaškrtlo
    var kdm = document.getElementById('k_dm');
    var det = kdm && kdm.closest ? kdm.closest('details') : null;
    if (det) det.setAttribute('open', '');

    var egfrEl = document.getElementById('chri_egfr_result');
    return { egfrText: egfrEl ? egfrEl.textContent.trim() : '' };
  }

  /* ---------- inline modal ---------- */
  var T = {
    sk: { title: '📋 Vyplniť z textu správy', ph: 'Sem vložte text zo správy – anamnéza, medikácia…',
          note: '🔒 Text sa spracuje len vo vašom prehliadači – nikam sa neodosiela ani neukladá.',
          run: 'Rozpoznať a vyplniť', cancel: 'Zrušiť', close: 'Zavrieť',
          ok: '✅ Rozpoznané: ', none: '❗ Nič sa nerozpoznalo.', miss: 'nenašli sa: ' },
    cz: { title: '📋 Vyplnit z textu zprávy', ph: 'Sem vložte text ze zprávy – anamnéza, medikace…',
          note: '🔒 Text se zpracuje jen ve vašem prohlížeči – nikam se neodesílá ani neukládá.',
          run: 'Rozpoznat a vyplnit', cancel: 'Zrušit', close: 'Zavřít',
          ok: '✅ Rozpoznáno: ', none: '❗ Nic se nerozpoznalo.', miss: 'nenalezeno: ' }
  };

  var modal = null;

  function buildModal(lang) {
    var t = T[lang];
    var ov = document.createElement('div');
    ov.id = 'anamneza_modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;max-width:640px;width:100%;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-size:13px';
    box.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:8px">' + t.title + '</div>' +
      '<textarea id="anamneza_txt" rows="9" placeholder="' + t.ph + '" style="width:100%;box-sizing:border-box;border:1.5px solid #dde1ea;border-radius:8px;padding:8px;font-size:12.5px;font-family:inherit;outline:none;resize:vertical"></textarea>' +
      '<div style="font-size:11px;color:#6b7280;margin:6px 0 10px">' + t.note + '</div>' +
      '<div id="anamneza_result" style="display:none;font-size:12px;line-height:1.5;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" id="anamneza_cancel" style="padding:6px 14px;border:1.5px solid #dde1ea;background:#fff;border-radius:8px;cursor:pointer;font-size:12.5px">' + t.cancel + '</button>' +
      '<button type="button" id="anamneza_run" style="padding:6px 14px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600">' + t.run + '</button>' +
      '</div>';
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    box.querySelector('#anamneza_cancel').addEventListener('click', close);
    box.querySelector('#anamneza_run').addEventListener('click', function () { runApply(lang); });
    return ov;
  }

  function open() {
    var lang = isCZ() ? 'cz' : 'sk';
    if (!modal) { modal = buildModal(lang); document.body.appendChild(modal); }
    modal.style.display = 'flex';
    var res = modal.querySelector('#anamneza_result');
    res.style.display = 'none'; res.textContent = '';
    modal.querySelector('#anamneza_cancel').textContent = T[lang].cancel;
    setTimeout(function () { modal.querySelector('#anamneza_txt').focus(); }, 0);
  }

  function close() { if (modal) modal.style.display = 'none'; }

  function runApply(lang) {
    var t = T[lang];
    var txt = modal.querySelector('#anamneza_txt').value;
    var res = parse(txt, lang);
    var info = apply(res);
    var out = modal.querySelector('#anamneza_result');

    var chips = res.found.map(function (f) {
      return (f.kod === 'chri' && info.egfrText) ? f.label + ' → ' + info.egfrText : f.label;
    });
    // Hlavné kategórie, ktoré sa NEnašli
    var L = LABELS[lang];
    var have = {};
    res.found.forEach(function (f) { have[f.kod] = true; });
    var missMap = { DM: 'dm', AH: 'ah', CKD: 'chri', ICHS: 'ichs', IM: 'im', CMP: 'cmp' };
    var missing = L.missing.filter(function (name, i) {
      var kod = missMap[name] || ['dm', 'ah', 'chri', 'ichs', 'im', 'cmp', 'faj', 'dysl', 'obez', 'chochp', 'atb', 'rc'][i];
      return !have[kod];
    });

    out.style.display = 'block';
    out.textContent = (chips.length ? t.ok + chips.join(', ') : t.none) +
      (missing.length ? '\n(' + t.miss + missing.join(', ') + ')' : '');
    out.style.whiteSpace = 'pre-wrap';
    // modal ostáva otvorený, kým doktor neklikne Zavrieť
    modal.querySelector('#anamneza_cancel').textContent = t.close;
  }

  var API = { parse: parse, apply: apply, open: open, close: close, _norm: norm };
  global.AnamnezaParser = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
