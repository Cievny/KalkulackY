// VQI CLTI Mortality Prediction Model – odhad 30-dňového a 2-ročného prežitia
// u pacientov s CLTI pred infrainguinálnou revaskularizáciou.
//
// Zdroj modelu: Simons JP, Schanzer A, Flahive JM a kol., "Survival prediction in
// patients with chronic limb-threatening ischemia who undergo infrainguinal
// revascularization" (VQI, n = 38 470). Rizikové skupiny podľa publikovaných hraníc
// SVS: nízke (> 97 % / > 70 %), stredné (95–97 % / 50–70 %), vysoké (< 95 % alebo < 50 %).
//
// POZNÁMKA K PÔVODU KOEFICIENTOV – dôležité pri akejkoľvek úprave:
// Väčšina bét je prevzatá priamo z publikovaných supplementárnych tabuliek
// (tblSI pre 30 dní, tblSII pre 2 roky). Tie však obsahujú interakčné členy s časom
// pre premenné, ktoré porušili predpoklad proporcionality, a ich hlavné efekty sú
// preto skreslené (napr. ambulácia "vozík" tam má HR 49, ICHS HR 7,5). Tieto
// konkrétne bety a obe baseline hodnoty boli preto dopočítané kalibráciou proti
// oficiálnej kalkulačke SVS (svs-vqi.shinyapps.io/CRICalculators) – pozri
// tests/vqi-clti.mjs, kde je celá sada kalibračných aj kontrolných profilov.
// Kalibrované členy sú nižšie označené komentárom /* kalibrované */.
(function (global) {
  'use strict';

  var M30 = {
    baseline: 0.99671,           /* kalibrované */
    vek:       { '<60': 0, '60-70': 0.51, '71-80': 0.97, '>80': 1.5 },
    rasa:      { biela: 0, ina: -0.38 },
    indikacia: { kludova_bolest: 0, tkanivova_strata: 0.330 },  /* kalibrované */
    ichs:      { ziadna: 0, im_stabilna: 0.25, nestabilna: 0.78 },
    sz:        { nie: 0, ano: 0.53 },
    chocbp:    { ziadna: 0, liecena: 0.27, kyslik: 0.86 },
    ckd:       { '1': 0, '2': -0.05, '3': 0.26, '4': 0.76, '5': 1.45 },
    ambulacia: { nezavisly: 0, s_pomocou: 0.41, vozik: 0.60, leziaci: 1.34 },
    statin:    { nie: 0, ano: -0.29 }
    // fajčenie, betablokátor a antiagregans boli z 30-dňového modelu vylúčené (P > .01)
  };

  var M2R = {
    baseline: 0.96,              /* kalibrované */
    vek:       { '<60': 0, '60-70': 0.33, '71-80': 0.63, '>80': 0.99 },
    rasa:      { biela: 0, ina: -0.20 },
    indikacia: { kludova_bolest: 0, tkanivova_strata: 0.37 },
    fajcenie:  { nikdy: 0, byvaly: 0.04, aktivny: 0.07 },
    ichs:      { ziadna: 0, im_stabilna: 0.172, nestabilna: 0.691 },   /* kalibrované */
    sz:        { nie: 0, ano: 0.29 },
    chocbp:    { ziadna: 0, liecena: 0.21, kyslik: 0.38 },
    ckd:       { '1': 0, '2': 0.05, '3': 0.28, '4': 0.59, '5': 1.03 },
    ambulacia: { nezavisly: 0, s_pomocou: 0.372, vozik: 0.575, leziaci: 1.307 }, /* kalibrované */
    betablokator: { nie: 0, ano: 0.19 },
    antiagregans: { nie: 0, ano: -0.11 },
    statin:       { nie: 0, ano: -0.19 }
  };

  // Polia, ktoré musí volajúci vyplniť, aby sa dal model počítať.
  var POVINNE_30 = ['vek','rasa','indikacia','ichs','sz','chocbp','ckd','ambulacia','statin'];
  var POVINNE_2R = POVINNE_30.concat(['fajcenie','betablokator','antiagregans']);

  function chybajuce(p, polia) {
    var out = [];
    for (var i = 0; i < polia.length; i++) {
      var k = polia[i];
      if (p[k] === undefined || p[k] === null || p[k] === '') out.push(k);
    }
    return out;
  }

  function linearnyPrediktor(model, p, polia) {
    var lp = 0;
    for (var i = 0; i < polia.length; i++) {
      var k = polia[i];
      var tab = model[k];
      if (!tab) continue;
      var b = tab[p[k]];
      if (b === undefined) return null;   // neznáma kategória – radšej nič než tichý nezmysel
      lp += b;
    }
    return lp;
  }

  function prezitie(model, p, polia) {
    var lp = linearnyPrediktor(model, p, polia);
    if (lp === null) return null;
    return Math.pow(model.baseline, Math.exp(lp));
  }

  // Rizikové skupiny podľa publikovaných hraníc SVS.
  function rizikovaSkupina(p30, p2r) {
    if (p30 === null || p2r === null) return null;
    var a = 100 * p30, b = 100 * p2r;
    if (a < 95 || b < 50) return 'vysoke';
    if (a > 97 && b > 70) return 'nizke';
    return 'stredne';
  }

  var NAZOV_SKUPINY = { nizke: 'Nízke riziko', stredne: 'Stredné riziko', vysoke: 'Vysoké riziko' };

  function vypocitaj(p) {
    p = p || {};
    var chyba30 = chybajuce(p, POVINNE_30);
    var chyba2r = chybajuce(p, POVINNE_2R);
    var s30 = chyba30.length ? null : prezitie(M30, p, POVINNE_30);
    var s2r = chyba2r.length ? null : prezitie(M2R, p, POVINNE_2R);
    var skupina = rizikovaSkupina(s30, s2r);
    return {
      prezitie30: s30,
      prezitie2r: s2r,
      skupina: skupina,
      nazovSkupiny: skupina ? NAZOV_SKUPINY[skupina] : null,
      chybajuce: chyba2r
    };
  }

  var API = {
    vypocitaj: vypocitaj,
    rizikovaSkupina: rizikovaSkupina,
    MODEL_30D: M30,
    MODEL_2R: M2R,
    POVINNE: POVINNE_2R
  };
  global.VQI = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
