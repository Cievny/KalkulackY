/* =========================================================================
   anamneza-parser.js v2 – lokálny parser anamnézy / medikácie (SK + CZ)
   Doktor vloží text zo správy → parser rozpozná komorbidity, antitrombotiká,
   kreatinín, RČ / vek / pohlavie – a PRED vyplnením ukáže kontrolný panel:
   každý nález s citáciou z textu a mierou istoty (isté = predzaškrtnuté,
   neisté = len ponúknuté). Až po potvrdení sa vyplní formulár.

   Ako parser číta správu:
   1. rozreže text na sekcie (Dg./OA/RA/lieky/lab/odporúčanie…) – rodinná
      anamnéza a odporúčania sa IGNORUJÚ (otcov infarkt nie je pacientov),
   2. MKCH-10 kódy v diagnózach = najistejší zdroj,
   3. textové diagnózy s klauzulovou negáciou („DM neguje", „bez ICHS"),
   4. lieky (metformín→DM, statín→dyslipidémia, antitrombotiká),
   5. laboratórium (kreatinín, BMI/výška+váha).

   Všetko beží LEN v prehliadači – žiadna sieť, žiadne ukladanie.
   Export: window.AnamnezaParser = { parse, apply, open, close }
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- utily ---------- */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function escHtml(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- sekcie správy ----------
     Hlavička sekcie = riadok začínajúci známym názvom. Sekcia platí po
     najbližšiu ďalšiu hlavičku. Text pred prvou hlavičkou = 'uvod'.       */
  var SECTION_HEADS = [
    // rodinná anamnéza – IGNOROVAŤ (choroby príbuzných, nie pacienta)
    { id: 'ra',  re: /^\s*(ra|r\.a\.?)\s*[:\-]|^\s*rodinn[aá] anamn/ },
    // odporúčania / plán – IGNOROVAŤ (návrhy liečby nie sú anamnéza)
    { id: 'odp', re: /^\s*(odporucan|doporucen|odporucam|doporucuj|plan\s*[:\-]|zaver a odporucan)/ },
    { id: 'dg',  re: /^\s*(dg\.?|dgn\.?|diagnoz|diagnóz|zakladne diagnoz|suhrn diagnoz|souhrn diagnoz)\s*[:\-]?/ },
    { id: 'oa',  re: /^\s*(oa|o\.a\.?)\s*[:\-]|^\s*osobn[aiy] anamn/ },
    { id: 'th',  re: /^\s*(th|tap|t\.?h\.?)\s*[:\-]|^\s*(lieky|leky|medikaci|medikáci|terapia|terapie|farmakoterapi|chronicka (medikacia|terapia|farmakoterapia)|trvala medikaci)\s*[:\-]?\s*$|^\s*(lieky|leky|medikaci|terapia|terapie|farmakoterapi)\s*[:\-]/ },
    { id: 'lab', re: /^\s*(lab\.?|laborator|odbery|biochemi)\s*[:\-]?/ },
    // ďalšie bežné hlavičky – vraciame sa nimi do všeobecného kontextu
    { id: 'gen', re: /^\s*(ta|t\.a\.?|terajsie ochoreni|nynejsi onemocnen|sa|s\.a\.?|socialna anamn|aa|a\.a\.?|alergick|ga|g\.a\.?|abusus|objektivn|status praesens|fyzikaln|ekg|usg|echo|ct\b|rtg)\s*[:\-]?/ }
  ];

  function sectionize(rawLines, normLines) {
    var out = []; // {sec, raw, norm}
    var cur = 'uvod';
    for (var i = 0; i < normLines.length; i++) {
      var nl = normLines[i];
      for (var s = 0; s < SECTION_HEADS.length; s++) {
        if (SECTION_HEADS[s].re.test(nl)) { cur = SECTION_HEADS[s].id; break; }
      }
      out.push({ sec: cur, raw: rawLines[i], norm: nl });
    }
    return out;
  }
  // sekcie, v ktorých hľadáme pacientove diagnózy/lieky
  function usable(sec) { return sec !== 'ra' && sec !== 'odp'; }

  /* ---------- klauzulová negácia ----------
     Riadok delíme na klauzuly (, ; .) – nález je negovaný, ak jeho klauzula
     obsahuje negačné slovo pred/okolo zhody, alebo riadok začína „neguje“. */
  var NEG = /(neguje|negat|\bbez\b|\bnema\b|\bnemel\b|\bnemela\b|\bnemal\b|\bnemala\b|\bnemali\b|\bnie je\b|\bneni\b|\bnení\b|vylucen|vyloucen|v norme|\b0\s*:|nepritomn|neprítomn|neudava|neudává|nezistene|popiera|popira)/;

  function clauseOf(line, idx) {
    var start = 0, end = line.length;
    for (var i = idx - 1; i >= 0; i--) { if (',;.'.indexOf(line[i]) >= 0) { start = i + 1; break; } }
    for (var j = idx; j < line.length; j++) { if (',;.'.indexOf(line[j]) >= 0) { end = j; break; } }
    return { text: line.slice(start, end), start: start };
  }
  function negated(line, matchIdx) {
    if (/^\s*neguje/.test(line)) return true;
    // negácia platí pre celú klauzulu – „DM neguje" aj „bez ICHS"
    var cl = clauseOf(line, matchIdx);
    return NEG.test(cl.text);
  }

  // Prvá nenegovaná zhoda regexu v použiteľných sekciách.
  // Vracia {m, line:{sec,raw,norm}} alebo null.
  function findIn(seclines, re, secFilter) {
    var g = new RegExp(re.source, 'g' + (re.flags || '').replace(/g/g, ''));
    for (var i = 0; i < seclines.length; i++) {
      var L = seclines[i];
      if (!usable(L.sec)) continue;
      if (secFilter && !secFilter(L)) continue;
      g.lastIndex = 0;
      var m;
      while ((m = g.exec(L.norm))) {
        if (negated(L.norm, m.index)) { if (m.index === g.lastIndex) g.lastIndex++; continue; }
        return { m: m, line: L };
      }
    }
    return null;
  }

  // Citácia: orezaný pôvodný riadok (max ~110 znakov okolo zhody)
  function quoteOf(line, idx) {
    var raw = (line.raw || '').trim();
    if (raw.length <= 110) return raw;
    var a = Math.max(0, (idx || 0) - 40);
    return (a > 0 ? '…' : '') + raw.slice(a, a + 100).trim() + '…';
  }

  /* ---------- slovníky ---------- */
  var RX = {
    dm:      /\bdm\b|\bdm\s*[12]\b|\bdm\s*i{1,2}\b|diabet|cukrovk/,
    dm1:     /\bdm\s*-?\s*1\b|\bdm\s*i\b(?!i)|\b1\.?\s*typu?\b|\btypu?\s*1\b|\bi\.\s*typu/,
    dm2:     /\bdm\s*-?\s*2\b|\bdm\s*ii\b|\b2\.?\s*typu?\b|\btypu?\s*2\b|\bii\.\s*typu/,
    inzulin: /inzulin|lantus|toujeo|tresiba|levemir|novorapid|humalog|apidra|abasaglar/,
    oad:     /\bpad\b|\boad\b|metformin|siofor|glucophage|stadamet|gliklazid|diaprel|glimepirid|amaryl|gliptin|sitagliptin|januvia|linagliptin|trajenta|empagliflozin|jardiance|dapagliflozin|forxiga|gliflozin|glifozin|ozempic|semaglutid|trulicity|dulaglutid/,
    dieta:   /\bdiet(a|e|ou|u)\b/,
    ah:      /arteriov[a-z]* hypertenz|arterialni hypertenz|hypertenz(ia|e)\b|\bah\b|esencialn[a-z]* ht\b|\bht\b.{0,3}na terapii/,
    chri:    /\bckd\b|\bchri\b|renaln[a-z]* insuficienc|nefropati|ochorenie oblicok|ochorenie obliciek|onemocneni ledvin|nedostatocnost oblicok|selhani ledvin|dialyz|hemodialyz/,
    krea:    /krea(?:tinin[a-z]*)?\s*[:.=]?\s*(\d{2,4})(?:[.,]\d+)?(\s*[uµ]mol)?/,
    ichs:    /\bichs\b|ischemick[a-z]* choroba srd|\bcad\b|koronarn[a-z]* (chorob|nemoc)|st\.?\s*p\.?\s*(pci|cabg|aokoronarnom bypasse)|po pci\b|po cabg\b/,
    im:      /st\.?\s*p\.?\s*im\b|infarkt[a-z]* myokardu|\bn?stemi\b|\bpo im\b/,
    cmp:     /st\.?\s*p\.?\s*n?cmp\b|\bn?cmp\b|cievna mozgova prihoda|cevni mozkova prihoda|\biktus|\bstroke\b|\btia\b/,
    faj:     /fajciar|fajcen|nikotinizm|kurak|koureni|kuractvi/,
    fajEx:   /(ex|stop)\s*-?\s*(fajciar|kurak)|byval[a-z]* (fajciar|kurak)/,
    packy:   /(\d{1,3})\s*(?:pack[\s-]?years?|\bpy\b|balicko\s*-?\s*rok)/,
    dysl:    /dyslipidemi|hyperlipoproteinemi|\bhlp\b|hypercholesterolemi|hyperlipidemi/,
    statin:  /\bstatin|atorvastatin|rosuvastatin|simvastatin|fluvastatin|pravastatin|sortis|crestor|torvacard|rosucard|tulip|atoris|ezetimib/,
    obez:    /obezit|adipozit|obezn/,
    bmi:     /\bbmi\s*[:=]?\s*(\d{2}(?:[.,]\d)?)/,
    vyskaVaha: /(\d{3})\s*cm\b[^\d]{0,20}(\d{2,3})\s*kg\b|(\d{2,3})\s*kg\b[^\d]{0,20}(\d{3})\s*cm\b/,
    chochp:  /\bchochp\b|\bchopn\b|\bcopd\b/,
    asa:     /anopyrin|acylpyrin|aspirin|\basa\b|kyselina acetylsalicylov|acetylsalicyl|godasal|stacyl/,
    klopi:   /trombex|plavix|zyllt|[ck]lopidogrel/,
    dapt:    /\bdapt\b|dualn[a-z]* antiagregac|dualni antiagregac/,
    noak:    /rivaroxaban|xarelto|apixaban|eliquis|dabigatran|pradaxa|edoxaban|lixiana|\bnoak\b|\bdoac\b/,
    warf:    /warfarin|lawarin/,
    lmwh:    /fraxiparin|clexane|enoxaparin|nadroparin|\blmwh\b|nizkomolekul/,
    rcSlash: /\b(\d{2})(\d{2})(\d{2})\s*\/\s*(\d{3,4})\b/,
    rcPlain: /\b(\d{2})(\d{2})(\d{2})(\d{3,4})\b/,
    rcCtx:   /\br\.?\s?c\b|rodn/
  };

  /* MKCH-10 kódy → nálezy (len v Dg. sekcii / na „dg" riadkoch).
     Match len na kódy z tejto mapy – žiadne B12/O2 falošné poplachy.     */
  var ICD = [
    { re: /\be10(\.\d+)?\b/, kod: 'dm',   patch: { dm: { typ: 'DM1' } },  label: 'DM1' },
    { re: /\be11(\.\d+)?\b/, kod: 'dm',   patch: { dm: { typ: 'DM2' } },  label: 'DM2' },
    { re: /\bi1[0-5](\.\d+)?\b/, kod: 'ah',  patch: { ah: true },  label: 'AH' },
    { re: /\bi2[045](\.\d+)?\b/, kod: 'ichs', patch: { ichs: true }, label: 'ICHS' },
    { re: /\bi2[12](\.\d+)?\b/,  kod: 'im',  patch: { im: true, ichs: true }, label: 'st.p. IM' },
    { re: /\bi6[34](\.\d+)?\b|\bi69(\.\d+)?\b|\bg45(\.\d+)?\b/, kod: 'cmp', patch: { cmp: true }, label: 'st.p. CMP/TIA' },
    { re: /\bn18(\.\d+)?\b|\bn19\b/, kod: 'chri', patch: { chri: {} }, label: 'CKD' },
    { re: /\bj44(\.\d+)?\b/, kod: 'chochp', patch: { chochp: true }, label: 'CHOCHP' },
    { re: /\be78(\.\d+)?\b/, kod: 'dysl', patch: { dysl: {} }, label: 'dyslipidémia' },
    { re: /\be66(\.\d+)?\b/, kod: 'obez', patch: { obez: true }, label: 'obezita' },
    { re: /\bf17(\.\d+)?\b|\bz72\.0\b/, kod: 'faj', patch: { faj: true }, label: 'fajčenie' }
  ];
  // Kód berieme len z Dg. sekcie alebo riadku, ktorý vyzerá ako zoznam diagnóz
  function icdLineOk(L) {
    return L.sec === 'dg' || /^\s*(dg|diagn)/.test(L.norm) || /\b[a-z]\d{2}\.\d\b.*\b[a-z]\d{2}/.test(L.norm);
  }

  /* ---------- rodné číslo (nezmenené overené funkcie) ---------- */
  function rcParse(yy, mm, dd, suf, now) {
    var y = parseInt(yy, 10), m = parseInt(mm, 10), d = parseInt(dd, 10);
    var pohlavie = 'M';
    if (m > 50) { pohlavie = 'Z'; m -= 50; }
    if (m > 20 && m <= 32) m -= 20;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    var nowYY = now.getFullYear() % 100;
    var year = (suf.length === 3) ? 1900 + y : (y > nowYY ? 1900 + y : 2000 + y);
    var vek = now.getFullYear() - year - ((now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) ? 1 : 0);
    if (vek < 0 || vek > 110) return null;
    return { rc: yy + mm + dd + '/' + suf, pohlavie: pohlavie === 'Z' ? 'Ž' : 'M', vek: vek };
  }
  function realDate(y, m, d) {
    var t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
  }
  function rcPlainOk(m, nt) {
    if (RX.rcCtx.test(nt.slice(Math.max(0, m.index - 20), m.index))) return true;
    var digits = m[1] + m[2] + m[3] + m[4];
    if (digits.length !== 10) return false;
    if (digits.slice(0, 2) === '09') return false;
    if (parseInt(digits, 10) % 11 !== 0) return false;
    var yy = parseInt(m[1], 10), mm = parseInt(m[2], 10), dd = parseInt(m[3], 10);
    if (mm > 50) mm -= 50;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
    var nowYY = new Date().getFullYear() % 100;
    return realDate(yy > nowYY ? 1900 + yy : 2000 + yy, mm, dd);
  }

  /* ---------- texty ---------- */
  var T = {
    sk: { title: '📋 Vyplniť z textu správy', ph: 'Sem vložte text zo správy – anamnéza, diagnózy, medikácia…',
          note: '🔒 Text sa spracuje len vo vašom prehliadači – nikam sa neodosiela ani neukladá.',
          run: 'Rozpoznať', apply: 'Vyplniť vybrané', cancel: 'Zrušiť', close: 'Zavrieť',
          none: '❗ Nič sa nerozpoznalo – skontrolujte, či text obsahuje anamnézu/diagnózy.',
          certain: 'isté', uncertain: 'overiť', done: '✅ Vyplnené: ', miss: 'Nenašli sa: ',
          raNote: 'ℹ️ Rodinná anamnéza a odporúčania sa ignorujú (nie sú to choroby pacienta).',
          src: { kod: 'MKCH kód', dg: 'diagnóza', text: 'text', liek: 'z liekov', lab: 'laboratórium', rc: 'identifikátor' },
          missing: { dm: 'DM', ah: 'AH', chri: 'CKD', ichs: 'ICHS', im: 'IM', cmp: 'CMP', faj: 'fajčenie', dysl: 'dyslipidémia', obez: 'obezita', chochp: 'CHOCHP', atb: 'antitrombotiká', rc: 'RČ' } },
    cz: { title: '📋 Vyplnit z textu zprávy', ph: 'Sem vložte text ze zprávy – anamnéza, diagnózy, medikace…',
          note: '🔒 Text se zpracuje jen ve vašem prohlížeči – nikam se neodesílá ani neukládá.',
          run: 'Rozpoznat', apply: 'Vyplnit vybrané', cancel: 'Zrušit', close: 'Zavřít',
          none: '❗ Nic se nerozpoznalo – zkontrolujte, zda text obsahuje anamnézu/diagnózy.',
          certain: 'jisté', uncertain: 'ověřit', done: '✅ Vyplněno: ', miss: 'Nenalezeno: ',
          raNote: 'ℹ️ Rodinná anamnéza a doporučení se ignorují (nejsou to nemoci pacienta).',
          src: { kod: 'MKN kód', dg: 'diagnóza', text: 'text', liek: 'z léků', lab: 'laboratoř', rc: 'identifikátor' },
          missing: { dm: 'DM', ah: 'AH', chri: 'CKD', ichs: 'ICHS', im: 'IM', cmp: 'CMP', faj: 'kouření', dysl: 'dyslipidemie', obez: 'obezita', chochp: 'CHOPN', atb: 'antitrombotika', rc: 'RČ' } }
  };

  /* ---------- hlavný parser ---------- */
  // Vracia { found: [ {id, kod, label, quote, src, certain, patch} ], data }
  // data = zlúčené patche VŠETKÝCH nálezov (spätná kompatibilita / testy).
  function parse(text, lang) {
    lang = lang === 'cz' ? 'cz' : 'sk';
    var t = T[lang];
    var rawLines = String(text || '').split(/\r?\n/);
    var normLines = rawLines.map(norm);
    var S = sectionize(rawLines, normLines);
    var nt = normLines.join('\n');

    var found = [];
    var seq = 0;
    // add: zlúči nález s existujúcim rovnakého kodu (kód > text > liek)
    function add(kod, label, src, certain, patch, quote) {
      var ex = null;
      for (var i = 0; i < found.length; i++) if (found[i].kod === kod && kod !== 'atb') { ex = found[i]; break; }
      if (ex) {
        // silnejší zdroj vyhráva label/istotu; patche sa zlúčia
        var rank = { kod: 3, dg: 2, lab: 2, text: 2, liek: 1, rc: 3 };
        if ((rank[src] || 0) > (rank[ex.src] || 0)) { ex.label = label; ex.src = src; ex.quote = quote || ex.quote; }
        ex.certain = ex.certain || certain;
        mergePatch(ex.patch, patch);
        return ex;
      }
      var f = { id: 'f' + (seq++), kod: kod, label: label, src: src, certain: certain, patch: patch, quote: quote || '' };
      found.push(f);
      return f;
    }
    function mergePatch(a, b) {
      for (var k in b) {
        if (b[k] && typeof b[k] === 'object' && a[k] && typeof a[k] === 'object') mergePatch(a[k], b[k]);
        else if (a[k] === undefined || a[k] === null || a[k] === false) a[k] = b[k];
      }
    }

    /* 1) MKCH kódy v diagnózach */
    for (var c = 0; c < ICD.length; c++) {
      var hit = findIn(S, ICD[c].re, icdLineOk);
      if (hit) {
        var patchCopy = JSON.parse(JSON.stringify(ICD[c].patch));
        add(ICD[c].kod, ICD[c].label, 'kod', true, patchCopy, quoteOf(hit.line, hit.m.index));
      }
    }

    /* 2) textové diagnózy (mimo RA/odporúčaní, s klauzulovou negáciou) */
    var m;
    if ((m = findIn(S, RX.dm))) {
      var typ = RX.dm1.test(nt) && !RX.dm2.test(nt) ? 'DM1' : (RX.dm2.test(nt) ? 'DM2' : null);
      add('dm', typ || 'DM', m.line.sec === 'dg' ? 'dg' : 'text', true, { dm: { typ: typ } }, quoteOf(m.line, m.m.index));
    }
    if ((m = findIn(S, RX.ah)))     add('ah', 'AH', m.line.sec === 'dg' ? 'dg' : 'text', true, { ah: true }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.chri)))   add('chri', 'CKD', m.line.sec === 'dg' ? 'dg' : 'text', true, { chri: {} }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.ichs)))   add('ichs', 'ICHS', m.line.sec === 'dg' ? 'dg' : 'text', true, { ichs: true }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.im)))     add('im', 'st.p. IM', m.line.sec === 'dg' ? 'dg' : 'text', true, { im: true }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.cmp)))    add('cmp', 'st.p. CMP/TIA', m.line.sec === 'dg' ? 'dg' : 'text', true, { cmp: true }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.faj))) {
      var ex = findIn(S, RX.fajEx);
      var py = findIn(S, RX.packy);
      add('faj', (ex ? (lang === 'cz' ? 'ex-kuřák' : 'exfajčiar') : (lang === 'cz' ? 'kuřák' : 'fajčiar')) + (py ? ' (' + py.m[1] + ' PY)' : ''),
          'text', true, { faj: true, faj_ex: !!ex, faj_py: py ? parseInt(py.m[1], 10) : null }, quoteOf(m.line, m.m.index));
    }
    if ((m = findIn(S, RX.dysl)))   add('dysl', lang === 'cz' ? 'dyslipidemie' : 'dyslipidémia', m.line.sec === 'dg' ? 'dg' : 'text', true, { dysl: {} }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.chochp))) add('chochp', lang === 'cz' ? 'CHOPN' : 'CHOCHP', m.line.sec === 'dg' ? 'dg' : 'text', true, { chochp: true }, quoteOf(m.line, m.m.index));
    if ((m = findIn(S, RX.obez)))   add('obez', 'obezita', m.line.sec === 'dg' ? 'dg' : 'text', true, { obez: true }, quoteOf(m.line, m.m.index));

    /* 3) lieky – detail k DM / neisté návrhy / antitrombotiká */
    var inz = findIn(S, RX.inzulin), oad = findIn(S, RX.oad), dieta = findIn(S, RX.dieta);
    var liecba = (inz && oad) ? 'OAD+inzulín' : (inz ? 'inzulín' : (oad ? 'OAD' : (dieta ? 'diéta' : null)));
    var dmF = null;
    for (var fi = 0; fi < found.length; fi++) if (found[fi].kod === 'dm') dmF = found[fi];
    if (dmF && liecba) {
      dmF.patch.dm.liecba = liecba;
      dmF.label += ' (' + liecba + ')';
    } else if (!dmF && (inz || oad)) {
      // liek bez zmienky o DM → neistý návrh
      var dq = (inz || oad);
      add('dm', 'DM? (' + (lang === 'cz' ? 'z léků: ' : 'z liekov: ') + (liecba || '') + ')', 'liek', false,
          { dm: { typ: null, liecba: liecba } }, quoteOf(dq.line, dq.m.index));
    }
    var statin = findIn(S, RX.statin);
    var dyslF = null;
    for (var fj = 0; fj < found.length; fj++) if (found[fj].kod === 'dysl') dyslF = found[fj];
    if (dyslF && statin) { dyslF.patch.dysl.statin = true; dyslF.label += ' (statín)'; }
    else if (!dyslF && statin) {
      add('dysl', (lang === 'cz' ? 'dyslipidemie? (statin v medikaci)' : 'dyslipidémia? (statín v medikácii)'), 'liek', false,
          { dysl: { statin: true } }, quoteOf(statin.line, statin.m.index));
    }

    // antitrombotiká – prítomnosť lieku je istá informácia
    var asa = findIn(S, RX.asa), klopi = findIn(S, RX.klopi), daptM = findIn(S, RX.dapt);
    var noak = findIn(S, RX.noak), warf = findIn(S, RX.warf), lmwh = findIn(S, RX.lmwh);
    var dapt = (asa && klopi) || !!daptM;
    if (dapt) {
      var dsrc = daptM || asa || klopi;
      add('atb', 'ASA+klopidogrel (DAPT)', 'liek', true, { atb: { dapt: true, asa: !!asa, klopidogrel: !!klopi } }, quoteOf(dsrc.line, dsrc.m.index));
    } else {
      if (asa)   add('atb', 'ASA', 'liek', true, { atb: { asa: true } }, quoteOf(asa.line, asa.m.index));
      if (klopi) add('atb', 'klopidogrel', 'liek', true, { atb: { klopidogrel: true } }, quoteOf(klopi.line, klopi.m.index));
    }
    if (noak) add('atb', 'NOAK/DOAC', 'liek', true, { atb: { noak: true } }, quoteOf(noak.line, noak.m.index));
    if (warf) add('atb', lang === 'cz' ? 'warfarin' : 'warfarín', 'liek', true, { atb: { warfarin: true } }, quoteOf(warf.line, warf.m.index));
    if (lmwh) add('atb', 'LMWH', 'liek', true, { atb: { lmwh: true } }, quoteOf(lmwh.line, lmwh.m.index));

    /* 4) laboratórium: kreatinín, BMI / výška+váha */
    var kreaM = findIn(S, RX.krea);
    var krea = null;
    if (kreaM) { var kv = parseInt(kreaM.m[1], 10); if (kv >= 40 && kv <= 1500) krea = kv; }
    var chriF = null;
    for (var fk = 0; fk < found.length; fk++) if (found[fk].kod === 'chri') chriF = found[fk];
    if (chriF && krea) { chriF.patch.chri.krea = krea; chriF.label += ' (krea ' + krea + ')'; }
    else if (!chriF && krea && krea >= 130) {
      // zvýšený kreatinín bez zmienky o CKD → neistý návrh
      add('chri', 'CKD? (krea ' + krea + ' µmol/l)', 'lab', false, { chri: { krea: krea } }, quoteOf(kreaM.line, kreaM.m.index));
    }
    var bmiM = findIn(S, RX.bmi);
    var bmi = bmiM ? parseFloat(bmiM.m[1].replace(',', '.')) : null;
    if (bmi === null) {
      var vv = findIn(S, RX.vyskaVaha);
      if (vv) {
        var cm = parseInt(vv.m[1] || vv.m[4], 10), kg = parseInt(vv.m[2] || vv.m[3], 10);
        if (cm >= 120 && cm <= 220 && kg >= 35 && kg <= 250) { bmi = Math.round(kg / Math.pow(cm / 100, 2) * 10) / 10; bmiM = vv; }
      }
    }
    if (bmi !== null && bmi >= 30) {
      var obF = null;
      for (var fo = 0; fo < found.length; fo++) if (found[fo].kod === 'obez') obF = found[fo];
      if (obF) { obF.patch.obez_bmi = bmi; obF.label = 'obezita (BMI ' + bmi + ')'; }
      else add('obez', 'obezita (BMI ' + bmi + ')', 'lab', true, { obez: true, obez_bmi: bmi }, quoteOf(bmiM.line, bmiM.m.index));
    }

    /* 5) RČ / vek / pohlavie */
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
    if (rc) add('rc', 'RČ ' + rc.rc + ' (' + rc.pohlavie + ', ' + rc.vek + ' r.)', 'rc', true,
                { rodne_cislo: rc.rc, pohlavie: rc.pohlavie, vek: rc.vek }, '');

    /* data = zlúčené patche všetkých nálezov (spätná kompatibilita) */
    var data = buildData(found, null);
    return { found: found, data: data, lang: lang };
  }

  // Zlúči patche vybraných nálezov do plochého data objektu pre apply().
  function buildData(found, selectedIds) {
    var data = { dm: null, ah: false, chri: null, ichs: false, im: false, cmp: false,
                 faj: false, faj_ex: false, faj_py: null, obez: false, obez_bmi: null, dysl: null, chochp: false,
                 atb: { asa: false, klopidogrel: false, dapt: false, noak: false, warfarin: false, lmwh: false },
                 rodne_cislo: null, vek: null, pohlavie: null };
    found.forEach(function (f) {
      if (selectedIds && selectedIds.indexOf(f.id) < 0) return;
      var p = f.patch;
      if (p.dm) data.dm = Object.assign({ typ: null, liecba: null }, data.dm || {}, p.dm);
      if (p.ah) data.ah = true;
      if (p.chri) data.chri = Object.assign({ krea: null }, data.chri || {}, p.chri);
      if (p.ichs) data.ichs = true;
      if (p.im) data.im = true;
      if (p.cmp) data.cmp = true;
      if (p.faj) { data.faj = true; data.faj_ex = !!p.faj_ex; if (p.faj_py) data.faj_py = p.faj_py; }
      if (p.obez) data.obez = true;
      if (p.obez_bmi) data.obez_bmi = p.obez_bmi;
      if (p.dysl) data.dysl = Object.assign({ statin: false }, data.dysl || {}, p.dysl);
      if (p.chochp) data.chochp = true;
      if (p.atb) for (var k in p.atb) if (p.atb[k]) data.atb[k] = true;
      if (p.rodne_cislo) { data.rodne_cislo = p.rodne_cislo; data.pohlavie = p.pohlavie; data.vek = p.vek; }
    });
    if (data.atb.asa && data.atb.klopidogrel) data.atb.dapt = true;
    return data;
  }

  /* ====================================================================
     Zápis do formulára (EVK / CAS / PEVAR, SK aj CZ) – nič neodškrtáva,
     RČ/vek/pohlavie len do prázdnych polí.
     ==================================================================== */
  function isCZ() {
    try { return global.location && global.location.pathname.indexOf('/cz/') === 0; } catch (e) { return false; }
  }
  function fire(el, type) { try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) {} }
  function tickCheckbox(el) { if (el && !el.checked) { el.checked = true; fire(el, 'change'); } }
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

  // apply(res) – všetko; apply(res, selectedIds) – len vybrané nálezy
  function apply(res, selectedIds) {
    var d = selectedIds ? buildData(res.found, selectedIds) : res.data;

    var rcEl = document.getElementById('rodne_cislo');
    var rcWasEmpty = rcEl && !rcEl.value.trim();
    if (d.rodne_cislo && rcWasEmpty) { rcEl.value = d.rodne_cislo; fire(rcEl, 'input'); }
    var vekEl = document.getElementById('vek');
    if (d.vek !== null && vekEl && !vekEl.value) { vekEl.value = d.vek; fire(vekEl, 'input'); }
    var pohlEl = document.getElementById('pohl') || document.getElementById('pohlavie');
    if (d.pohlavie && pohlEl && rcWasEmpty) {
      var male = !!pohlEl.querySelector('option[value="M"]');
      pohlEl.value = d.pohlavie === 'M' ? (male ? 'M' : 'Muž') : (male ? 'Z' : 'Žena');
      fire(pohlEl, 'change');
    }

    if (d.dm) {
      tickCheckbox(document.getElementById('k_dm'));
      if (d.dm.typ) setRadio('dm_typ', function (v) { return v === norm(d.dm.typ); });
      if (d.dm.liecba === 'OAD+inzulín') setRadio('dm_liecba', function (v) { return v.indexOf('kombin') === 0; });
      else if (d.dm.liecba === 'inzulín') setRadio('dm_liecba', function (v) { return v.indexOf('inzulin') === 0; });
      else if (d.dm.liecba === 'OAD') setRadio('dm_liecba', function (v) { return v === 'oad'; });
      else if (d.dm.liecba === 'diéta') setRadio('dm_liecba', function (v) { return v.indexOf('diet') === 0; });
    }
    if (d.ah) tickCheckbox(document.getElementById('k_ah'));
    if (d.chri) {
      tickCheckbox(document.getElementById('k_chri'));
      var kreaEl = document.getElementById('chri_krea');
      if (d.chri.krea && kreaEl && !kreaEl.value) { kreaEl.value = d.chri.krea; fire(kreaEl, 'input'); }
    }
    if (d.ichs) tickCheckbox(document.getElementById('k_ichs'));
    if (d.im) tickCheckbox(document.getElementById('k_im'));
    if (d.cmp) tickCheckbox(document.getElementById('k_cmp'));
    if (d.faj) {
      tickCheckbox(document.getElementById('k_faj'));
      if (d.faj_ex) setRadio('faj_stav', function (v) { return v.indexOf('ex') === 0; });
      var pyEl = document.getElementById('faj_py');
      if (d.faj_py && pyEl && !pyEl.value) { pyEl.value = d.faj_py; fire(pyEl, 'input'); }
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

    var a = d.atb;
    if (a.dapt) {
      var daptEl = atbBox(function (v) { return v.indexOf('dapt') === 0; });
      if (daptEl) tickCheckbox(daptEl);
      else {
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

    var kdm = document.getElementById('k_dm');
    var det = kdm && kdm.closest ? kdm.closest('details') : null;
    if (det) det.setAttribute('open', '');

    var egfrEl = document.getElementById('chri_egfr_result');
    return { egfrText: egfrEl ? egfrEl.textContent.trim() : '' };
  }

  /* ---------- modal s kontrolným panelom ---------- */
  var modal = null;
  var lastRes = null;

  function buildModal(lang) {
    var t = T[lang];
    var ov = document.createElement('div');
    ov.id = 'anamneza_modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-size:13px';
    box.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:8px">' + t.title + '</div>' +
      '<textarea id="anamneza_txt" rows="8" placeholder="' + t.ph + '" style="width:100%;box-sizing:border-box;border:1.5px solid #dde1ea;border-radius:8px;padding:8px;font-size:12.5px;font-family:inherit;outline:none;resize:vertical"></textarea>' +
      '<div style="font-size:11px;color:#6b7280;margin:6px 0 10px">' + t.note + '</div>' +
      '<div id="anamneza_review" style="display:none;margin-bottom:10px"></div>' +
      '<div id="anamneza_result" style="display:none;font-size:12px;line-height:1.5;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" id="anamneza_cancel" style="padding:6px 14px;border:1.5px solid #dde1ea;background:#fff;border-radius:8px;cursor:pointer;font-size:12.5px">' + t.cancel + '</button>' +
      '<button type="button" id="anamneza_run" style="padding:6px 14px;border:none;background:#2563eb;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600">' + t.run + '</button>' +
      '<button type="button" id="anamneza_apply" style="display:none;padding:6px 14px;border:none;background:#16a34a;color:#fff;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700">' + t.apply + '</button>' +
      '</div>';
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    box.querySelector('#anamneza_cancel').addEventListener('click', close);
    box.querySelector('#anamneza_run').addEventListener('click', function () { runParse(lang); });
    box.querySelector('#anamneza_apply').addEventListener('click', function () { runApplySelected(lang); });
    return ov;
  }

  function open() {
    var lang = isCZ() ? 'cz' : 'sk';
    if (!modal) { modal = buildModal(lang); document.body.appendChild(modal); }
    modal.style.display = 'flex';
    lastRes = null;
    modal.querySelector('#anamneza_review').style.display = 'none';
    modal.querySelector('#anamneza_review').innerHTML = '';
    modal.querySelector('#anamneza_result').style.display = 'none';
    modal.querySelector('#anamneza_result').textContent = '';
    modal.querySelector('#anamneza_apply').style.display = 'none';
    modal.querySelector('#anamneza_run').style.display = '';
    modal.querySelector('#anamneza_cancel').textContent = T[lang].cancel;
    setTimeout(function () { modal.querySelector('#anamneza_txt').focus(); }, 0);
  }
  function close() { if (modal) modal.style.display = 'none'; }

  // Krok 1: rozpoznanie → kontrolný panel s citáciami a checkboxami
  function runParse(lang) {
    var t = T[lang];
    var txt = modal.querySelector('#anamneza_txt').value;
    lastRes = parse(txt, lang);
    var box = modal.querySelector('#anamneza_review');
    var resBox = modal.querySelector('#anamneza_result');
    resBox.style.display = 'none';

    if (!lastRes.found.length) {
      box.style.display = 'block';
      box.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;font-size:12px">' + escHtml(t.none) + '</div>';
      modal.querySelector('#anamneza_apply').style.display = 'none';
      return;
    }
    var html = '<div style="border:1.5px solid #dde1ea;border-radius:10px;padding:8px 10px;max-height:44vh;overflow-y:auto">';
    lastRes.found.forEach(function (f) {
      var tag = f.certain
        ? '<span style="font-size:10px;font-weight:700;color:#166534;background:#dcfce7;border-radius:5px;padding:1px 6px">' + escHtml(t.src[f.src] || f.src) + '</span>'
        : '<span style="font-size:10px;font-weight:700;color:#92400e;background:#fef3c7;border-radius:5px;padding:1px 6px">❓ ' + escHtml(t.uncertain) + ' · ' + escHtml(t.src[f.src] || f.src) + '</span>';
      html += '<label style="display:flex;gap:8px;align-items:flex-start;padding:5px 2px;border-bottom:1px solid #f1f5f9;cursor:pointer">' +
        '<input type="checkbox" class="anamneza_pick" data-id="' + f.id + '"' + (f.certain ? ' checked' : '') + ' style="margin-top:2px">' +
        '<span style="flex:1"><b>' + escHtml(f.label) + '</b> ' + tag +
        (f.quote ? '<br><span style="color:#6b7280;font-style:italic;font-size:11.5px">„' + escHtml(f.quote) + '"</span>' : '') +
        '</span></label>';
    });
    html += '</div>';
    // čo sa nenašlo + poznámka o ignorovaných sekciách
    var have = {};
    lastRes.found.forEach(function (f) { have[f.kod] = true; });
    var missKeys = ['dm', 'ah', 'chri', 'ichs', 'im', 'cmp', 'faj', 'dysl', 'obez', 'chochp', 'atb', 'rc'];
    var missing = missKeys.filter(function (k) { return !have[k]; }).map(function (k) { return t.missing[k]; });
    if (missing.length) html += '<div style="font-size:11px;color:#6b7280;margin-top:6px">' + escHtml(t.miss) + escHtml(missing.join(', ')) + '</div>';
    html += '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + escHtml(t.raNote) + '</div>';

    box.innerHTML = html;
    box.style.display = 'block';
    var applyBtn = modal.querySelector('#anamneza_apply');
    applyBtn.style.display = '';
    updateApplyCount(lang);
    box.querySelectorAll('.anamneza_pick').forEach(function (cb) {
      cb.addEventListener('change', function () { updateApplyCount(lang); });
    });
  }
  function updateApplyCount(lang) {
    var n = modal.querySelectorAll('.anamneza_pick:checked').length;
    modal.querySelector('#anamneza_apply').textContent = T[lang].apply + ' (' + n + ')';
  }

  // Krok 2: vyplnenie vybraných nálezov do formulára
  function runApplySelected(lang) {
    if (!lastRes) return;
    var t = T[lang];
    var ids = [];
    modal.querySelectorAll('.anamneza_pick:checked').forEach(function (cb) { ids.push(cb.dataset.id); });
    var info = apply(lastRes, ids);
    var labels = lastRes.found.filter(function (f) { return ids.indexOf(f.id) >= 0; }).map(function (f) {
      return (f.kod === 'chri' && info.egfrText) ? f.label + ' → ' + info.egfrText : f.label;
    });
    var out = modal.querySelector('#anamneza_result');
    out.style.display = 'block';
    out.style.whiteSpace = 'pre-wrap';
    out.textContent = t.done + (labels.join(', ') || '–');
    modal.querySelector('#anamneza_cancel').textContent = t.close;
  }

  var API = { parse: parse, apply: apply, open: open, close: close, _norm: norm, _buildData: buildData };
  global.AnamnezaParser = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
