// Materiálový register – číselník zariadení, normalizácia názvov a plnenie
// tabuľky material_pouzitie (1 riadok = 1 zariadenie na výkone) z payloadov
// EVK (intervencie_detail) a PEVAR (SG + extenzie + vetvy + plugy + balóny).
// Sync je best-effort po úspešnom uložení výkonu – keď tabuľka ešte
// neexistuje, výkon sa uloží normálne a materiál sa doplní pri ďalšom uložení.
(function (global) {
  'use strict';

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  // číselník: regex → kanonický názov + výrobca + kategória
  // (zoznam vychádza zo selectov v EVK/PEVAR; nové zariadenia sa uložia
  // s originálnym názvom a kategóriou podľa kontextu použitia)
  var KATALOG = [
    // periférne stenty
    { re: /absolute\s*pro/, nazov: 'Absolute Pro', vyrobca: 'Abbott', kategoria: 'BMS' },
    { re: /astron\s*pulsar/, nazov: 'Astron Pulsar', vyrobca: 'Biotronik', kategoria: 'BMS' },
    { re: /pulsar/, nazov: 'Pulsar', vyrobca: 'Biotronik', kategoria: 'BMS' },
    { re: /astron/, nazov: 'Astron', vyrobca: 'Biotronik', kategoria: 'BMS' },
    { re: /biomimics/, nazov: 'BioMimics 3D', vyrobca: 'Veryan', kategoria: 'BMS' },
    { re: /supera/, nazov: 'Supera', vyrobca: 'Abbott', kategoria: 'BMS' },
    { re: /eluvia/, nazov: 'Eluvia', vyrobca: 'Boston Scientific', kategoria: 'DES' },
    { re: /zilver\s*ptx/, nazov: 'Zilver PTX', vyrobca: 'Cook', kategoria: 'DES' },
    { re: /nitides/, nazov: 'NiTiDES', vyrobca: 'iVascular', kategoria: 'DES' },
    { re: /dynetic/, nazov: 'Dynetic', vyrobca: 'Biotronik', kategoria: 'BMS' },
    { re: /isthmus/, nazov: 'Isthmus', vyrobca: 'iVascular', kategoria: 'BMS' },
    { re: /begraft/, nazov: 'BeGraft', vyrobca: 'Bentley', kategoria: 'krytý stent' },
    { re: /viabahn/, nazov: 'Viabahn', vyrobca: 'Gore', kategoria: 'krytý stent' },
    { re: /papyrus/, nazov: 'Papyrus', vyrobca: 'Biotronik', kategoria: 'krytý stent' },
    { re: /advanta|v12/, nazov: 'Advanta V12', vyrobca: 'Getinge', kategoria: 'krytý stent' },
    // balóny
    { re: /jade/, nazov: 'Jade', vyrobca: 'OrbusNeich', kategoria: 'balón' },
    { re: /armada/, nazov: 'Armada', vyrobca: 'Abbott', kategoria: 'balón' },
    { re: /passeo/, nazov: 'Passeo', vyrobca: 'Biotronik', kategoria: 'balón' },
    { re: /cross\s*tella/, nazov: 'CrossTella', vyrobca: 'Terumo', kategoria: 'balón' },
    { re: /mustang/, nazov: 'Mustang', vyrobca: 'Boston Scientific', kategoria: 'balón' },
    { re: /atlas/, nazov: 'Atlas Gold', vyrobca: 'BD', kategoria: 'balón' },
    { re: /metacross/, nazov: 'Metacross', vyrobca: 'Terumo', kategoria: 'balón' },
    { re: /coda/, nazov: 'CODA', vyrobca: 'Cook', kategoria: 'modelovací balón' },
    { re: /reliant/, nazov: 'Reliant', vyrobca: 'Medtronic', kategoria: 'modelovací balón' },
    // DEB
    { re: /magic\s*touch/, nazov: 'MagicTouch', vyrobca: 'Concept Medical', kategoria: 'DEB' },
    { re: /elutax/, nazov: 'Elutax', vyrobca: 'Aachen Resonance', kategoria: 'DEB' },
    { re: /selution/, nazov: 'Selution SLR', vyrobca: 'MedAlliance', kategoria: 'DEB' },
    { re: /in\.?\s*pact/, nazov: 'IN.PACT', vyrobca: 'Medtronic', kategoria: 'DEB' },
    { re: /ranger/, nazov: 'Ranger', vyrobca: 'Boston Scientific', kategoria: 'DEB' },
    { re: /luminor/, nazov: 'Luminor', vyrobca: 'iVascular', kategoria: 'DEB' },
    // vessel prep / IVL / aterektómia / trombektómia
    { re: /chocolate/, nazov: 'Chocolate', vyrobca: 'Medtronic', kategoria: 'vessel prep balón' },
    { re: /cutting/, nazov: 'Cutting balloon', vyrobca: 'Boston Scientific', kategoria: 'vessel prep balón' },
    { re: /angiosculpt/, nazov: 'AngioSculpt', vyrobca: 'Philips', kategoria: 'vessel prep balón' },
    { re: /\bspur\b/, nazov: 'Spur', vyrobca: 'Reflow Medical', kategoria: 'vessel prep balón' },
    { re: /wolverine/, nazov: 'Wolverine', vyrobca: 'Boston Scientific', kategoria: 'vessel prep balón' },
    { re: /shockwave/, nazov: 'Shockwave', vyrobca: 'Shockwave Medical', kategoria: 'IVL' },
    { re: /shockfast/, nazov: 'Shockfast', vyrobca: '', kategoria: 'IVL' },
    { re: /rotarex/, nazov: 'Rotarex', vyrobca: 'BD', kategoria: 'trombektómia' },
    { re: /penumbra|indigo/, nazov: 'Indigo', vyrobca: 'Penumbra', kategoria: 'trombektómia' },
    { re: /outback/, nazov: 'Outback', vyrobca: 'Cordis', kategoria: 'reentry katéter' },
    { re: /offroad/, nazov: 'OffRoad', vyrobca: 'Boston Scientific', kategoria: 'reentry katéter' },
    // stentgrafty aorty
    { re: /endurant/, nazov: 'Endurant II', vyrobca: 'Medtronic', kategoria: 'stentgraft' },
    { re: /excluder/, nazov: 'Excluder', vyrobca: 'Gore', kategoria: 'stentgraft' },
    { re: /ovation/, nazov: 'Ovation', vyrobca: 'Endologix', kategoria: 'stentgraft' },
    { re: /zenith/, nazov: 'Zenith', vyrobca: 'Cook', kategoria: 'stentgraft' },
    { re: /treo/, nazov: 'Treo', vyrobca: 'Terumo Aortic', kategoria: 'stentgraft' },
    { re: /\bafx\b/, nazov: 'AFX', vyrobca: 'Endologix', kategoria: 'stentgraft' },
    { re: /e-?vita|e-?nside|e-?xtra/, nazov: 'JOTEC E-séria', vyrobca: 'Artivion/JOTEC', kategoria: 'stentgraft' },
    { re: /valiant|navion/, nazov: 'Valiant/Navion', vyrobca: 'Medtronic', kategoria: 'stentgraft (TEVAR)' },
    { re: /heli-?fx|endoanchor/, nazov: 'Heli-FX EndoAnchor', vyrobca: 'Medtronic', kategoria: 'kotviaci systém' },
    // plugy / embolizácia
    { re: /impede/, nazov: 'IMPEDE', vyrobca: 'Shape Memory Medical', kategoria: 'embolizačný plug' },
    { re: /amplatzer|avp/, nazov: 'Amplatzer plug', vyrobca: 'Abbott', kategoria: 'embolizačný plug' },
    // uzáver prístupu
    { re: /proglide|perclose/, nazov: 'ProGlide', vyrobca: 'Abbott', kategoria: 'uzáverový systém' },
    { re: /angio-?seal/, nazov: 'Angio-Seal', vyrobca: 'Terumo', kategoria: 'uzáverový systém' },
    { re: /manta/, nazov: 'MANTA', vyrobca: 'Teleflex', kategoria: 'uzáverový systém' }
  ];

  function normalizuj(nazov, fallbackKategoria) {
    var n = norm(nazov);
    if (!n) return null;
    for (var i = 0; i < KATALOG.length; i++) {
      if (KATALOG[i].re.test(n)) {
        return { nazov: KATALOG[i].nazov, vyrobca: KATALOG[i].vyrobca, kategoria: KATALOG[i].kategoria };
      }
    }
    return { nazov: String(nazov).trim(), vyrobca: '', kategoria: fallbackKategoria || '' };
  }

  function num(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(x) ? null : x; }

  // "18-166-16" / "36x120" / "12 a 18mm" → prvé dve čísla ako priemer × dĺžka
  function rozmery(str) {
    var cisla = String(str || '').match(/\d+(?:[.,]\d+)?/g) || [];
    return { priemer: cisla.length ? num(cisla[0]) : null, dlzka: cisla.length > 1 ? num(cisla[1]) : null };
  }

  // kategória z KONTEXTU použitia (SG extenzia, bridging, CERAB…) má prednosť
  // pred katalógovou triedou zariadenia; katalóg dodáva kanonický názov a výrobcu
  function radek(kategoria, nazov, priemer, dlzka, pocet, tepna) {
    var kn = normalizuj(nazov, kategoria);
    if (!kn && !kategoria) return null;
    return {
      kategoria: kategoria || (kn && kn.kategoria) || '',
      nazov: (kn && kn.nazov) || String(nazov || '').trim() || kategoria,
      vyrobca: (kn && kn.vyrobca) || '',
      priemer_mm: num(priemer),
      dlzka_mm: num(dlzka),
      pocet: pocet || 1,
      tepna: String(tepna || '').trim() || null
    };
  }

  // EVK: z intervencie_detail (pole objektov z formulára)
  var EVK_TYP = {
    vessel_prep: 'vessel prep balón', predilat: 'balón', pta: 'balón', deb: 'DEB',
    postdilat: 'balón', ivl: 'IVL'
  };
  function rowsFromEvk(intervDetail) {
    var out = [];
    // CZ formulár ukladá priemer pod kľúčom „průměr" – akceptuj oba
    var pr = function (it) { return it.priemer != null ? it.priemer : it['průměr']; };
    (intervDetail || []).forEach(function (it) {
      if (!it || !it.typ) return;
      var tepna = it.tepna && it.tepna.indexOf('tepna') < 0 ? it.tepna : '';
      if (it.typ === 'stent' || it.typ === 'stentgraft') {
        // trieda stentu: explicitný stent_typ > katalóg > BMS default
        var kn0 = normalizuj(it.stent_nazov);
        var kat = it.typ === 'stentgraft' ? (it.subtyp === 'CERAB' ? 'krytý stent (CERAB)' : 'krytý stent') :
          (/DES/i.test(it.stent_typ || '') ? 'DES' :
           (/kryt|graft/i.test(it.stent_typ || '') ? 'krytý stent' :
            (kn0 && (kn0.kategoria === 'DES' || kn0.kategoria === 'krytý stent') ? kn0.kategoria : 'BMS')));
        var r1 = radek(kat, it.stent_nazov, pr(it), it.dlzka, 1, tepna || it.segment);
        if (r1 && (r1.nazov || r1.kategoria)) out.push(r1);
      } else if (EVK_TYP[it.typ]) {
        if (!it.nazov && pr(it) == null && !it.dlzka) return; // prázdny riadok
        var r2 = radek(EVK_TYP[it.typ], it.nazov, pr(it), it.dlzka, 1, tepna);
        if (r2) out.push(r2);
      } else if (it.typ === 'aterektomia') {
        out.push(radek('aterektómia', it.device || 'aterektomický katéter', null, null, 1, tepna));
      } else if (it.typ === 'reentry') {
        out.push(radek('reentry katéter', it.device, null, null, 1, tepna));
      } else if (it.typ === 'trombektomia') {
        out.push(radek('trombektómia', it.metoda === 'Rotarex' ? 'Rotarex' : (it.kateter || 'aspiračný katéter'), num(it.velkost), null, 1, tepna));
      }
    });
    return out.filter(Boolean);
  }

  // PEVAR: SG telo + extenzie + vetvy (bridging) + plugy + modelovacie balóny
  function rowsFromPevar(p) {
    p = p || {};
    var out = [];
    var sgR = rozmery(p.sg_rozmery);
    if (p.sg_nazov) out.push(radek('stentgraft', p.sg_nazov, sgR.priemer, sgR.dlzka, 1, 'aorta'));
    var ext = [];
    try { ext = typeof p.extenzie_detail === 'string' ? JSON.parse(p.extenzie_detail) : (p.extenzie_detail || []); } catch (e) {}
    (ext || []).forEach(function (e) {
      if (!e || (!e.nazov && !e.rozmery)) return;
      var r = rozmery(e.rozmery);
      out.push(radek('SG extenzia', e.nazov, r.priemer, r.dlzka, 1, e.strana ? ('iliaka ' + e.strana) : 'iliaka'));
    });
    var vetvy = [];
    try { vetvy = typeof p.vetvy_detail === 'string' ? JSON.parse(p.vetvy_detail) : (p.vetvy_detail || []); } catch (e) {}
    (vetvy || []).forEach(function (v) {
      if (!v || !v.bridging) return;
      var r = rozmery(v.rozmer);
      out.push(radek('bridging stent', v.bridging, r.priemer, r.dlzka, 1, v.cieva === 'iná' ? (v.cieva_ine || 'vetva') : v.cieva));
    });
    if (p.sac_fill_pocet > 0) {
      var plug = radek('embolizačný plug', 'IMPEDE-FX', null, null, p.sac_fill_pocet, 'vak AAA');
      out.push(plug);
    }
    if (p.modelovanie_telo_balon) out.push(radek('modelovací balón', p.modelovanie_telo_balon, null, null, 1, 'aorta'));
    if (p.modelovanie_extenzie_balon) {
      var mr = rozmery(p.modelovanie_extenzie_rozmer);
      out.push(radek('modelovací balón', p.modelovanie_extenzie_balon, mr.priemer, null, 1, 'iliaky'));
    }
    return out.filter(Boolean);
  }

  // best-effort zápis: zmaž staré riadky výkonu, vlož nové (idempotentné uloženie)
  function syncMaterial(sbUrl, headers, zdroj, vykonId, datum, rows) {
    if (!vykonId) return Promise.resolve(false);
    var base = sbUrl + '/rest/v1/material_pouzitie';
    var H = Object.assign({ 'Content-Type': 'application/json' }, headers);
    return fetch(base + '?zdroj=eq.' + encodeURIComponent(zdroj) + '&vykon_id=eq.' + encodeURIComponent(vykonId), { method: 'DELETE', headers: H })
      .then(function (r) {
        if (!r.ok && r.status !== 404) throw new Error('del ' + r.status);
        if (!rows || !rows.length) return true;
        var body = rows.map(function (x) {
          return Object.assign({ zdroj: zdroj, vykon_id: vykonId, datum: datum || null }, x);
        });
        return fetch(base, { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(body) })
          .then(function (r2) { return r2.ok; });
      })
      .catch(function () { return false; });
  }

  function syncEvk(sbUrl, headers, zdroj, fullData) {
    var det = [];
    try { det = typeof fullData.intervencie_detail === 'string' ? JSON.parse(fullData.intervencie_detail) : (fullData.intervencie_detail || []); } catch (e) {}
    return syncMaterial(sbUrl, headers, zdroj, fullData.vykon_id, fullData.datum || null, rowsFromEvk(det));
  }
  function syncPevar(sbUrl, headers, zdroj, payload) {
    // PEVAR/CAS payload má dátum pod kľúčom datum_zaznamu (EVK má datum)
    return syncMaterial(sbUrl, headers, zdroj, payload.vykon_id, payload.datum_zaznamu || payload.datum || null, rowsFromPevar(payload));
  }

  var API = {
    KATALOG: KATALOG,
    normalizuj: normalizuj,
    rowsFromEvk: rowsFromEvk,
    rowsFromPevar: rowsFromPevar,
    syncMaterial: syncMaterial,
    syncEvk: syncEvk,
    syncPevar: syncPevar,
    _rozmery: rozmery
  };
  global.MaterialKatalog = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
