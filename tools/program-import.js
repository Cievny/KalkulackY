// Extraktor denného programu – z textu wordového „Katetrizačný program OIRA"
// alebo z textu skopírovaného z NIS kalendára vytiahne pacientov pre Program.
// Beží 100 % lokálne v prehliadači, nič sa nikam neodosiela.
// Z rodného čísla sa berie LEN ročník – celé RČ sa nikam neukladá.
(function (global) {
  'use strict';

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }

  var DEN = /(pondelok|utorok|streda|stvrtok|piatok|sobota|nedela)/;
  var DATUM = /(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})/;
  // číslovaný riadok wordového programu: „1. Priezvisko Meno   1948   VÝKON   OIA"
  var CISLOVANY = /^\s*\d{1,2}[.)]\s+(.+?)\s+(19\d{2}|20\d{2})\b\s*(.*)$/;
  var ODDELENIE_KONIEC = /\s+(OIA|OIRA|OAIM|KAIM|JIS|OUM)\s*$/i;
  // NIS kalendár: blok začína časom, na riadku je meno + RČ (aj orezané „57/")
  var CAS = /^\s*(\d{1,2}):(\d{2})\b\s*(.*)$/;
  var RC = /\b(\d{2})(\d{4})?\s*\/\s*\d{0,4}(?=\s|$)/;
  var OPERATOR = /^\s*(doc\.|prof\.|mudr\.?|mddr\.?)/i;
  var ODDELENIE_NIS = /^\s*(O[IA][A-Z]{0,3})\s*[-–]\s*odd/i;
  var DOVOD = /^\s*d[oô]vod\s*:\s*(.*)$/i;
  var MENO_OK = /[a-zA-Zá-žÁ-Ž]{2,}\s+[a-zA-Zá-žÁ-Ž]{2,}/;

  // ročník z prvých dvoch číslic RČ (57 → 1957, 04 → 2004)
  function rokZRc(yy) {
    yy = parseInt(yy, 10);
    if (isNaN(yy)) return null;
    var cur = new Date().getFullYear() % 100;
    return yy > cur ? 1900 + yy : 2000 + yy;
  }

  function novyPacient() {
    return { meno: '', rocnik: null, cas: null, vykon: '', diagnoza: '', operator: '', lozko: '' };
  }

  function parseProgram(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (s) {
      return s.replace(/[✕✖×⌗]/g, ' ').replace(/\s+/g, ' ').trim();
    });

    // dátum programu: riadok s dňom v týždni; inak prvý dátum mimo riadku
    // s „dňa"/„schválil" (to je dátum podpisu, nie programu)
    var datum = null;
    for (var i = 0; i < lines.length && !datum; i++) {
      if (DEN.test(norm(lines[i]))) {
        var d = DATUM.exec(lines[i]);
        if (d) datum = d[3] + '-' + pad2(d[2]) + '-' + pad2(d[1]);
      }
    }
    if (!datum) {
      // fallback len z HLAVIČKY (riadky pred prvým pacientom) – inak by sa vzal
      // napr. dátum CT z „Dôvodu" v NIS bloku
      for (var j = 0; j < lines.length && !datum; j++) {
        var mc0 = CISLOVANY.exec(lines[j]);
        var mt0 = CAS.exec(lines[j]);
        if ((mc0 && MENO_OK.test(mc0[1])) || (mt0 && MENO_OK.test(mt0[3]))) break; // začal program
        var nj = norm(lines[j]);
        if (/\bdna\b|schvalil/.test(nj)) continue;
        var d2 = DATUM.exec(lines[j]);
        if (d2) datum = d2[3] + '-' + pad2(d2[2]) + '-' + pad2(d2[1]);
      }
    }

    var pacienti = [];
    var cur = null;      // rozpracovaný pacient z NIS bloku
    var vDovode = false;

    function uzavri() {
      if (cur && MENO_OK.test(cur.meno)) pacienti.push(cur);
      cur = null; vDovode = false;
    }

    for (var k = 0; k < lines.length; k++) {
      var line = lines[k];
      if (!line) { vDovode = false; continue; }

      // formát A: číslovaný riadok wordového programu
      var mc = CISLOVANY.exec(line);
      if (mc && MENO_OK.test(mc[1])) {
        uzavri();
        var p = novyPacient();
        p.meno = mc[1].trim();
        p.rocnik = parseInt(mc[2], 10);
        var zvysok = mc[3].trim();
        var od = ODDELENIE_KONIEC.exec(zvysok);
        if (od) { p.lozko = od[1].toUpperCase(); zvysok = zvysok.slice(0, od.index).trim(); }
        p.vykon = zvysok;
        pacienti.push(p);
        continue;
      }

      // formát B: NIS blok začínajúci časom
      var mt = CAS.exec(line);
      if (mt) {
        uzavri();
        var rest = mt[3];
        var rc = RC.exec(rest);
        var meno = (rc ? rest.slice(0, rc.index) : rest).trim();
        if (!MENO_OK.test(meno)) continue; // osové časy mriežky (samotné „12:00") preskoč
        cur = novyPacient();
        cur.meno = meno;
        if (rc) cur.rocnik = rokZRc(rc[1]);
        var hh = pad2(mt[1]), mm = mt[2];
        if (!(hh === '00' && mm === '00')) cur.cas = hh + ':' + mm;
        continue;
      }

      if (!cur) continue;

      // riadky vnútri NIS bloku
      var md = DOVOD.exec(line);
      if (md) { vDovode = true; cur.diagnoza = md[1]; continue; }
      if (OPERATOR.test(line)) {
        if (!cur.operator) cur.operator = line.replace(/,{2,}/g, ',').trim();
        vDovode = false;
        continue;
      }
      var mo = ODDELENIE_NIS.exec(line);
      if (mo) { cur.lozko = mo[1].toUpperCase(); vDovode = false; continue; }
      if (!/[a-zA-Zá-žÁ-Ž]/.test(line)) continue; // artefakty bez písmen
      if (vDovode) cur.diagnoza = (cur.diagnoza + ' ' + line).trim();
      else cur.vykon = cur.vykon ? cur.vykon + ' • ' + line : line;
    }
    uzavri();

    // orezanie dĺžok + dedup (rovnaké meno + ročník)
    var seen = {};
    var out = [];
    pacienti.forEach(function (p) {
      p.vykon = p.vykon.slice(0, 160);
      p.diagnoza = p.diagnoza.slice(0, 300);
      var key = norm(p.meno) + '|' + (p.rocnik || '');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(p);
    });
    return { datum: datum, pacienti: out };
  }

  var API = { parseProgram: parseProgram, _rokZRc: rokZRc, _norm: norm };
  global.ProgramImport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
