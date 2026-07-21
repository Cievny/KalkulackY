// Lokálny „scrubber" osobných údajov (cievny.sk).
// Z voľného klinického textu (žiadanka, CT popis, mail, program) odstráni
// identifikátory pacienta PRED tým, než sa čokoľvek pošle von. Beží 100 %
// lokálne v prehliadači; vracia očistený text + presný zoznam čo vyškrtol,
// aby to používateľ videl v náhľade a potvrdil, čo odchádza.
//
// Zásada: RADŠEJ PREČISTIŤ VIAC. Klinické polia (dg, priemery, symptómy)
// sú väčšinou malými písmenami a skratkami (AAA, CT, AIC) – tie prežijú;
// mená/miesta sú Veľké Začiatočné, tie padnú. Náhľad je posledná poistka:
// regex nikdy nezaručí 100 % odstránenie mien, preto to človek ešte vidí.
//
// scrub(text, {aggressive}) -> { clean, hits:[{type, original, placeholder}] }
(function (global) {
  'use strict';

  // validácia YYMMDD v rodnom čísle – aby evidenčné číslo (napr. 123456/2026)
  // nebolo označené za RČ zbytočne (nezmení bezpečnosť, len presnosť zoznamu)
  function rcTvar(six) {
    var mm = parseInt(six.slice(2, 4), 10), dd = parseInt(six.slice(4, 6), 10);
    if (mm > 50) mm -= 50;
    if (mm > 20 && mm <= 32) mm -= 20;
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
  }

  // pravidlá v poradí (skôr štruktúrované, potom heuristické mená/miesta).
  // ph = zástupka; keep = voliteľný filter (napr. len skutočné RČ tvary).
  function pravidla(aggressive) {
    var P = [
      // e-mail
      { type: 'email', ph: '[EMAIL]', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },

      // meno TESNE pred RČ („Mrkvička Ján 481205/1234", „Nová Anna, 615102/123")
      { type: 'meno', ph: '[MENO]',
        re: /[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+\s+[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+(?=,?\s*\d{6}\s*\/)/g },

      // RČ so „r.č./rodné číslo" (aj bez lomítka)
      { type: 'rc', ph: '[RČ]',
        re: /(?:r\.?\s?[čcč]\.?|rodn[éeě]\s*[čcč][íií]sl[oa])\s*:?\s*\d{6}\s*\/?\s*\d{0,4}/gi },
      // RČ v tvare 6/3–4 (over YYMMDD, nech to nie je iné evidenčné číslo)
      { type: 'rc', ph: '[RČ]', re: /\b\d{6}\s*\/\s*\d{3,4}\b/g,
        keep: function (m) { return rcTvar(m.replace(/\D/g, '').slice(0, 6)); } },

      // číslo poistenca
      { type: 'poistenec', ph: '[POISTENEC]', re: /poisten[a-zá-ž]*\s*:?\s*\d{6,10}\b/gi },

      // telefón (SK aj medzinárodný)
      { type: 'tel', ph: '[TEL]',
        re: /(?:\+421|00421|0)\s?\d{2,3}[\s/]?\d{3}[\s/]?\d{2,3}\b/g },

      // dátum (aj dátum narodenia; CT dátum sa ťahá lokálne pred očistou)
      { type: 'datum', ph: '[DÁTUM]',
        re: /\b\d{1,2}\.\s*\d{1,2}\.\s*(?:19|20)\d{2}\b|\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g },

      // lekár podľa titulu (odosielajúci/konziliár)
      { type: 'lekar', ph: '[LEKÁR]',
        re: /(?:MUDr|MDDr|MVDr|doc|prof|Dr|Bc|Mgr|Ing)\.?\s*[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+(?:\s+[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+){0,2}(?:\s*,?\s*(?:PhD|CSc|MPH|DrSc|FEBVS)\.?)*/g },

      // pacient menom uvedený
      { type: 'meno', ph: '[MENO]',
        re: /pacient(?:ka)?\s+[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+(?:\s+[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+)?/gi },

      // adresa/obec podľa kľúčového slova
      { type: 'obec', ph: '[OBEC]',
        re: /(?:bytom|trval[ýy]\s*pobyt|adres[ay]|obec|mesto)\s*:?\s*[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+(?:\s+(?:nad|pod|pri)\s+[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]+)?/gi },

      // lôžko / izba
      { type: 'lozko', ph: '[LÔŽKO]',
        re: /(?:l[ôo][žz]k[oa]|izb[aey]|posteľ)\s*(?:č\.?|no\.?)?\s*\d+/gi }
    ];

    // prísny režim: každá dvojica Veľké+malé slová = pravdepodobne meno/miesto.
    // Skratky (AAA, CT, AIC) neprejdú – tie nemajú malé písmená po prvom.
    if (aggressive) {
      P.push({ type: 'meno', ph: '[MENO]',
        re: /[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]{2,}\s+[A-ZÁ-ŽČŠŽ][a-zá-žčšžäôý]{2,}/g });
    }
    return P;
  }

  function scrub(text, opts) {
    opts = opts || {};
    var out = String(text == null ? '' : text);
    var hits = [];
    pravidla(opts.aggressive !== false).forEach(function (r) {
      out = out.replace(r.re, function (m) {
        if (r.keep && !r.keep(m)) return m;          // nechať – nie je to identifikátor
        if (m.indexOf('[') === 0) return m;          // už zástupka, nediať dvakrát
        hits.push({ type: r.type, original: m.trim(), placeholder: r.ph });
        return r.ph;
      });
    });
    return { clean: out, hits: hits };
  }

  // krátke ľudské zhrnutie do náhľadu („2× meno, 1× RČ, 1× telefón…")
  function zhrnutie(hits) {
    var lbl = { meno: 'meno', rc: 'RČ', tel: 'telefón', email: 'e-mail',
      datum: 'dátum', lekar: 'lekár', obec: 'obec/adresa', lozko: 'lôžko',
      poistenec: 'poistenec' };
    var c = {};
    hits.forEach(function (h) { c[h.type] = (c[h.type] || 0) + 1; });
    return Object.keys(c).map(function (k) { return c[k] + '× ' + (lbl[k] || k); }).join(', ');
  }

  var API = { scrub: scrub, zhrnutie: zhrnutie };
  global.Scrub = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
