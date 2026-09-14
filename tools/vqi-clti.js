// VQI CLTI Mortality Prediction Model – odhad 30-dňového a 2-ročného prežitia
// u pacientov s CLTI pred infrainguinálnou revaskularizáciou.
//
// Zdroj modelu: Simons JP, Schanzer A, Flahive JM a kol., "Survival prediction in
// patients with chronic limb-threatening ischemia who undergo infrainguinal
// revascularization" (VQI, n = 38 470). Rizikové skupiny podľa publikovaných hraníc
// SVS: nízke (> 97 % / > 70 %), stredné (95–97 % / 50–70 %), vysoké (< 95 % alebo < 50 %).
//
// POZNÁMKA K PÔVODU KOEFICIENTOV – dôležité pri akejkoľvek úprave:
// Publikované supplementárne tabuľky (tblSI pre 30 dní, tblSII pre 2 roky) obsahujú
// interakčné členy s časom a ich hlavné efekty sú tým skreslené. Pri 30-dňovom
// modeli sa skreslenie týkalo len tkanivovej straty – ostatné bety z tblSI sedia
// s oficiálnou kalkulačkou SVS a sú prevzaté doslova. Pri 2-ročnom modeli sa
// ukázalo, že tblSII nesedí ani pre premenné bez interakcie, preto sú VŠETKY
// jeho bety aj baseline odmerané kalibráciou proti oficiálnej kalkulačke
// (svs-vqi.shinyapps.io/CRICalculators): 23 jednopremenných profilov (referent
// + zmena jedného poľa) a 4 viacpremenné profily ako koncová kontrola, riešené
// naraz ako sústava nerovností. Celá sada je v tests/vqi-clti.mjs.
// Kalibrované členy sú označené komentárom /* kalibrované */.
(function (global) {
  'use strict';

  // 30-DŇOVÝ MODEL – bety z tblSI (Simons a kol.), tkanivová strata a baseline
  // dopočítané kalibráciou (pozri hlavičku). Overené na 23 profiloch.
  var M30 = {
    baseline: 0.99680,           /* kalibrované */
    vek:       { '<60': 0, '60-70': 0.510, '71-80': 0.970, '>80': 1.500 },
    rasa:      { biela: 0, ina: -0.380 },
    indikacia: { kludova_bolest: 0, tkanivova_strata: 0.397 },   /* kalibrované (tblSI: -0.24, skreslené interakciou) */
    ichs:      { ziadna: 0, im_stabilna: 0.250, nestabilna: 0.780 },
    sz:        { nie: 0, ano: 0.530 },
    chocbp:    { ziadna: 0, liecena: 0.270, kyslik: 0.860 },
    ckd:       { '1': 0, '2': -0.050, '3': 0.260, '4': 0.760, '5': 1.450 },
    ambulacia: { nezavisly: 0, s_pomocou: 0.410, vozik: 0.600, leziaci: 1.340 },
    statin:    { nie: 0, ano: -0.290 }
    // fajčenie, betablokátor a antiagregans boli z 30-dňového modelu vylúčené (P > .01)
  };

  // 2-ROČNÝ MODEL – VŠETKY bety aj baseline odmerané kalibráciou proti oficiálnej
  // kalkulačke SVS (23 jednopremenných + 4 viacpremenné profily, riešené naraz ako
  // sústava). Publikovaná tblSII sa ukázala nepoužiteľná aj pre premenné bez
  // interakčného člena. Presnosť jednotlivých bét je daná zaokrúhľovaním appky na
  // celé percentá (~±0,1 v log-hazarde); súčty overené na viacpremenných profiloch.
  var M2R = {
    baseline: 0.9580,              /* kalibrované */
    vek:       { '<60': 0, '60-70': 0.361, '71-80': 0.611, '>80': 1.204 },
    rasa:      { biela: 0, ina: -0.514 },
    indikacia: { kludova_bolest: 0, tkanivova_strata: 0.463 },
    fajcenie:  { nikdy: 0, byvaly: 0.084, aktivny: 0.106 },
    ichs:      { ziadna: 0, im_stabilna: 0.084, nestabilna: 0.290 },
    sz:        { nie: 0, ano: 0.463 },
    chocbp:    { ziadna: 0, liecena: 0.435, kyslik: 0.583 },
    ckd:       { '1': 0, '2': 0.057, '3': 0.105, '4': 0.611, '5': 1.122 },
    ambulacia: { nezavisly: 0, s_pomocou: 0.290, vozik: 0.463, leziaci: 0.964 },
    betablokator: { nie: 0, ano: 0.084 },
    antiagregans: { nie: 0, ano: -0.172 },
    statin:       { nie: 0, ano: -0.078 }
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
