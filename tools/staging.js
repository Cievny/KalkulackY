// Staging DK ischémie: TASC II + GLASS + WIfI vypočítané z dát, ktoré EVK
// formulár už zbiera (dsa_nalez + interv_detail + ABI). Všetky výsledky sú
// NÁVRH na overenie lekárom – tabuľky guidelines majú hrany a dĺžky lézií
// nie sú vždy zadané. Zdroje: TASC II (Norgren 2007), GLASS (Conte,
// Global Vascular Guidelines 2019), WIfI (Mills, SVS 2014).
// Zjednodušenia sú komentované pri každom pravidle.
(function (global) {
  'use strict';

  /* ── normalizácia hodnôt zo selectov EVK ── */
  // 'stenóza do 50%' → mierna (nesignifikantná pre staging)
  // 50–70 / 70–90 / >90 / in-stent restenóza → signifikantná stenóza
  // oklúzia / oklúzia stentu → oklúzia
  function stavZ(val) {
    if (!val) return null;
    var v = String(val).toLowerCase();
    if (v.indexOf('okl') === 0 || v.indexOf('oklúzia') >= 0 || v.indexOf('okluzia') >= 0) return 'okluzia';
    if (v.indexOf('do 50') >= 0) return 'mierna';
    if (v.indexOf('50–70') >= 0 || v.indexOf('50-70') >= 0 || v.indexOf('70–90') >= 0 || v.indexOf('70-90') >= 0 ||
        v.indexOf('>90') >= 0 || v.indexOf('kritick') >= 0) return 'stenoza';
    if (v.indexOf('in-stent') >= 0) return 'stenoza';
    return null; // stav po intervencii bez restenózy, disekcia, aneuryzma… – pre staging neutrálne
  }
  var ZAV = { okluzia: 3, stenoza: 2, mierna: 1 };
  function horsi(a, b) { return (ZAV[b] || 0) > (ZAV[a] || 0) ? b : a; }

  // dĺžkové odhady zo subsegmentov, keď nie je zadaná dĺžka v mm
  // (AFS ~30 cm; prox/stred/dist ≈ tretiny; krurálne tepny ~30 cm)
  function odhadDlzky(seg) {
    if (seg === 'celý' || seg === 'cely') return 300;
    if (seg === 'proximálny' || seg === 'stredný' || seg === 'distálny') return 100;
    return null;
  }

  // interv_detail item.tepna 'AFS l.dx.' → kľúč AFS_d
  function tepnaKluc(tp) {
    if (!tp) return null;
    var m = /^(AIC|AIE|AII|AFC|APF|AFS|P1|P2|P3|ATA|ATP|AFib|TTF)\s+l\.\s*(sin|dx)\.?$/i.exec(String(tp).trim());
    if (!m) return null;
    return m[1] + '_' + (m[2].toLowerCase() === 'dx' ? 'd' : 's');
  }

  // dsa kľúč 'f_AFS_d' → {seg:'AFS', strana:'d'}
  var DSA_PREF = /^[vfpd]_/;
  function dsaKluc(f) {
    var k = f.replace(DSA_PREF, '');
    if (k === 'Ao') return { seg: 'Ao', strana: null };
    var m = /^(.+)_([sd])$/.exec(k);
    return m ? { seg: m[1], strana: m[2] } : null;
  }

  /* Model: { Ao:{stav}, d:{AIC:{stav,dlzka,kalcif,cto},…}, s:{…} }
     dlzka v mm (zadaná z interv_detail alebo odhad zo subsegmentu), môže byť null. */
  function lezieZEvk(dsa, intervDetail) {
    dsa = dsa || {};
    var model = { Ao: null, d: {}, s: {}, chybajuceDlzky: [] };
    var segsExtra = dsa._segs || {};
    Object.keys(dsa).forEach(function (f) {
      if (f === '_segs' || /_text$/.test(f)) return;
      var kl = dsaKluc(f);
      if (!kl) return;
      var stav = stavZ(dsa[f]);
      var seg = null;
      // subsegmentové nálezy: vezmi najhorší + jeho subsegment
      (segsExtra[f] || []).forEach(function (sx) {
        var s2 = stavZ(sx.val);
        if (s2 && (ZAV[s2] || 0) >= (ZAV[stav] || 0)) { stav = horsi(stav, s2); seg = sx.seg || seg; }
      });
      if (!stav || stav === 'mierna') {
        if (stav === 'mierna' && kl.seg !== 'Ao') (kl.strana ? model[kl.strana] : model)[kl.seg] = { stav: 'mierna' };
        return;
      }
      if (kl.seg === 'Ao') { model.Ao = { stav: stav }; return; }
      model[kl.strana][kl.seg] = { stav: stav, dlzka: odhadDlzky(seg), subseg: seg, kalcif: false, cto: stav === 'okluzia' };
    });
    // dĺžky/CTO/kalcifikácia z intervenčných položiek (presnejšie než odhad)
    (intervDetail || []).forEach(function (it) {
      var k = tepnaKluc(it.tepna);
      if (!k) return;
      var p = k.split('_');
      var e = model[p[1]][p[0]];
      if (!e) return; // materiál v segmente bez zadanej lézie – staging neovplyvní
      var mm = parseFloat(it.lezia_mm || it.dlzka_lezie);
      if (mm > 0 && (!e.dlzka || mm > e.dlzka)) e.dlzka = mm;
      if (it.kalcif === 'ťažká' || it.kalcif === 'tazka') e.kalcif = true;
      if (it.cto) e.cto = true;
    });
    ['d', 's'].forEach(function (st) {
      Object.keys(model[st]).forEach(function (seg) {
        var e = model[st][seg];
        if (e.stav && e.stav !== 'mierna' && !e.dlzka) model.chybajuceDlzky.push(seg + ' l.' + (st === 'd' ? 'dx' : 'sin') + '.');
      });
    });
    return model;
  }

  /* ── TASC II aortoiliakálne (A–D) ──
     Zjednodušenia: dĺžky stenóz AIE bez údaja berieme ako ≤3 cm (krátke);
     „ťažká kalcifikácia AIE oklúzie" → C. */
  function tascAI(model) {
    var pozn = [];
    function sg(st, seg) { return model[st][seg] || {}; }
    var okl = function (e) { return e.stav === 'okluzia'; };
    var sten = function (e) { return e.stav === 'stenoza'; };
    var any = ['d', 's'].some(function (st) {
      return ['AIC', 'AIE'].some(function (seg) { return sg(st, seg).stav === 'okluzia' || sg(st, seg).stav === 'stenoza'; });
    }) || (model.Ao && model.Ao.stav);
    if (!any) return { tasc: null, pozn: pozn };

    var aoOkl = model.Ao && model.Ao.stav === 'okluzia';
    var d = { aic: sg('d', 'AIC'), aie: sg('d', 'AIE'), afc: sg('d', 'AFC') };
    var s = { aic: sg('s', 'AIC'), aie: sg('s', 'AIE'), afc: sg('s', 'AFC') };

    // D
    if (aoOkl) return { tasc: 'D', pozn: ['oklúzia infrarenálnej aorty'] };
    if (okl(d.aie) && okl(s.aie)) return { tasc: 'D', pozn: ['bilaterálna oklúzia AIE'] };
    for (var i = 0; i < 2; i++) {
      var x = i ? s : d;
      if (okl(x.aic) && okl(x.aie)) return { tasc: 'D', pozn: ['oklúzia AIC + AIE na tej istej strane'] };
      if ((okl(x.aic) || sten(x.aic)) && (okl(x.aie) || sten(x.aie)) && (okl(x.afc) || sten(x.afc)))
        return { tasc: 'D', pozn: ['difúzne postihnutie AIC+AIE+AFC'] };
    }
    // C
    if (okl(d.aic) && okl(s.aic)) return { tasc: 'C', pozn: ['bilaterálne oklúzie AIC'] };
    for (var j = 0; j < 2; j++) {
      var y = j ? s : d;
      if (okl(y.aie) && (sten(y.afc) || okl(y.afc))) return { tasc: 'C', pozn: ['oklúzia AIE zasahujúca AFC'] };
      if (sten(y.aie) && (sten(y.afc) || okl(y.afc))) return { tasc: 'C', pozn: ['stenóza AIE prechádzajúca do AFC'] };
      if (okl(y.aie) && y.aie.kalcif) return { tasc: 'C', pozn: ['ťažko kalcifikovaná oklúzia AIE'] };
    }
    if (sten(d.aie) && sten(s.aie) && ((d.aie.dlzka || 0) > 30 || (s.aie.dlzka || 0) > 30))
      return { tasc: 'C', pozn: ['bilaterálne stenózy AIE 3–10 cm'] };
    // B
    if (okl(d.aic) || okl(s.aic)) return { tasc: 'B', pozn: ['unilaterálna oklúzia AIC'] };
    if (okl(d.aie) || okl(s.aie)) return { tasc: 'B', pozn: ['unilaterálna oklúzia AIE (bez AFC)'] };
    if (model.Ao && model.Ao.stav === 'stenoza') return { tasc: 'B', pozn: ['krátka stenóza infrarenálnej aorty'] };
    for (var k2 = 0; k2 < 2; k2++) {
      var z = k2 ? s : d;
      if (sten(z.aie) && (z.aie.dlzka || 0) > 30) return { tasc: 'B', pozn: ['stenóza AIE 3–10 cm'] };
    }
    // A
    if (sten(d.aic) || sten(s.aic)) { if (!(d.aie.dlzka || s.aie.dlzka)) pozn.push('dĺžky bez údaja – brané ako krátke'); return { tasc: 'A', pozn: pozn.concat(['stenóza AIC']) }; }
    if (sten(d.aie) || sten(s.aie)) { pozn.push('dĺžka AIE bez údaja – braná ako ≤3 cm'); return { tasc: 'A', pozn: pozn }; }
    return { tasc: null, pozn: pozn };
  }

  /* ── TASC II femoropopliteálne (A–D) pre jednu končatinu ──
     P1 = supragenikulárna, P2/P3 = infragenikulárna popliteálna.
     In-stent restenózu berieme ako recidívu → min. C (pozn.). */
  function tascFP(model, strana) {
    var M = model[strana] || {};
    var afs = M.AFS || {}, p1 = M.P1 || {}, p2 = M.P2 || {}, p3 = M.P3 || {}, afc = M.AFC || {};
    var ttf = M.TTF || {};
    var pozn = [];
    var lez = [afs, p1, p2, p3].filter(function (e) { return e.stav === 'stenoza' || e.stav === 'okluzia'; });
    if (!lez.length && afc.stav !== 'okluzia') return { tasc: null, pozn: pozn };

    var afsOkl = afs.stav === 'okluzia', afsL = afs.dlzka || 0;
    var popOkl = p1.stav === 'okluzia' || p2.stav === 'okluzia' || p3.stav === 'okluzia';
    var popInfra = (p2.stav === 'stenoza' || p2.stav === 'okluzia' || p3.stav === 'stenoza' || p3.stav === 'okluzia');
    var total = lez.reduce(function (a, e) { return a + (e.dlzka || 0); }, 0);

    // D: CTO AFC alebo AFS >20 cm (so zasahom popliteálnej); CTO popliteálnej + trifurkácie
    if (afc.stav === 'okluzia') return { tasc: 'D', pozn: ['chronická oklúzia AFC'] };
    if (afsOkl && (afsL > 200 || (afsL === 0 && afs.subseg === 'celý'))) return { tasc: 'D', pozn: ['CTO AFS >20 cm'] };
    if (popOkl && (ttf.stav === 'okluzia' || ttf.stav === 'stenoza')) return { tasc: 'D', pozn: ['CTO popliteálnej + proximálna trifurkácia'] };
    // C: viacnásobné spolu >15 cm; recidíva (in-stent)
    if (total > 150 && lez.length > 1) return { tasc: 'C', pozn: ['lézie spolu >15 cm'] };
    if (afsOkl && afsL > 150) return { tasc: 'C', pozn: ['CTO AFS 15–20 cm'] };
    // B: jednotlivé ≤15 cm; oklúzia 5–15 cm; infragenikulárna popliteálna; viac lézií ≤5 cm
    if (afsOkl && afsL > 50) return { tasc: 'B', pozn: ['oklúzia AFS 5–15 cm'] };
    if (!afsOkl && afsL > 100 && afsL <= 150) return { tasc: 'B', pozn: ['stenóza 10–15 cm'] };
    if (popInfra || popOkl) return { tasc: 'B', pozn: ['postihnutie popliteálnej tepny'] };
    if (lez.length > 1) return { tasc: 'B', pozn: ['viacnásobné lézie ≤5 cm'] };
    // A: jedna stenóza ≤10 cm; jedna oklúzia ≤5 cm
    if (afsOkl) { if (!afsL) pozn.push('dĺžka bez údaja – braná ako ≤5 cm'); return { tasc: 'A', pozn: pozn.concat(['oklúzia ≤5 cm']) }; }
    if (!afsL) pozn.push('dĺžka bez údaja – braná ako ≤10 cm');
    return { tasc: 'A', pozn: pozn };
  }

  /* ── GLASS femoropopliteálny grade 0–4 pre jednu končatinu ──
     Ťažká kalcifikácia zvyšuje grade o 1 (max 4). */
  function glassFP(model, strana) {
    var M = model[strana] || {};
    var afs = M.AFS || {}, p1 = M.P1 || {}, p2 = M.P2 || {}, p3 = M.P3 || {};
    var pozn = [];
    var g = 0;
    var afsL = afs.dlzka || 0;
    var afsSig = afs.stav === 'stenoza' || afs.stav === 'okluzia';
    var afsOkl = afs.stav === 'okluzia';
    var flush = afsOkl && afs.subseg === 'proximálny'; // odstupová oklúzia ~ flush
    var popSig = [p1, p2, p3].some(function (e) { return e.stav === 'stenoza'; });
    var popOkl = [p1, p2, p3].some(function (e) { return e.stav === 'okluzia'; });
    var trif = (M.TTF || {}).stav != null && (M.TTF || {}).stav !== 'mierna';

    if (popOkl || trif) g = 4;
    else if (afsOkl && (afsL > 200 || (!afsL && afs.subseg === 'celý'))) g = 4;
    else if (afsOkl && (afsL > 100 || flush)) g = 3;
    else if (afsSig && !afsOkl && afsL > 200) g = 3;
    else if ((p2.stav === 'stenoza' || p3.stav === 'stenoza')) g = 3;         // infragenik. popliteálna stenóza
    else if (afsOkl) g = 2;                                                   // CTO <10 cm, nie flush
    else if (afsSig && afsL > 100) g = 2;
    else if (p1.stav === 'stenoza') g = 2;                                    // fokálna popliteálna stenóza
    else if (afsSig) g = 1;
    else if (afs.stav === 'mierna' || popSig) g = 1;

    if (g > 0 && g < 4 && (afs.kalcif || p1.kalcif)) { g += 1; pozn.push('ťažká kalcifikácia: grade +1'); }
    if (afsSig && !afsL) pozn.push('dĺžka AFS lézie bez údaja');
    return { grade: g, pozn: pozn };
  }

  /* ── GLASS infrapopliteálny grade 0–4 na cieľovej tepne (TAP) ──
     Subsegmenty ≈ tretiny priebehu; TTF postihnutie = odstupová choroba
     pre ATP/AFib. */
  function glassIP(model, strana, tap) {
    if (!tap) return { grade: null, pozn: ['nezvolená cieľová tepna (TAP)'] };
    var M = model[strana] || {};
    var e = M[tap] || {};
    var ttf = M.TTF || {};
    var ttfChoroba = (tap === 'ATP' || tap === 'AFib') && (ttf.stav === 'stenoza' || ttf.stav === 'okluzia');
    var pozn = [];
    var L = e.dlzka || 0;
    var g = 0;
    var sig = e.stav === 'stenoza' || e.stav === 'okluzia';
    var okl = e.stav === 'okluzia' || (ttfChoroba && ttf.stav === 'okluzia');

    if (!sig && !ttfChoroba) return { grade: e.stav === 'mierna' ? 0 : 0, pozn: pozn };
    var cely = e.subseg === 'celý' || L > 200;
    if (okl && (cely || (L > 100 && e.subseg !== 'distálny'))) g = 4;             // CTO >1/3
    else if ((sig && cely) || (okl)) g = 3;                                        // choroba do 2/3 / CTO ≤1/3 (aj odstup)
    else if (sig && (L > 100 || e.subseg === 'stredný' || e.subseg === 'proximálny')) g = 2;
    else if (sig) g = 1;                                                           // fokálna stenóza <3 cm
    if (ttfChoroba && g < 3) { g = 3; pozn.push('postihnutie TTF (odstup TAP)'); }
    if (sig && !L && !e.subseg) pozn.push('dĺžka/rozsah bez údaja');
    return { grade: g, pozn: pozn };
  }

  // GLASS štádium I–III (matica FP × IP, GVG 2019)
  var GLASS_MATICA = [
    [0, 1, 1, 2, 3],
    [1, 1, 2, 2, 3],
    [1, 2, 2, 2, 3],
    [2, 2, 2, 3, 3],
    [3, 3, 3, 3, 3]
  ];
  function glassStadium(fp, ip) {
    if (fp == null || ip == null) return null;
    var v = GLASS_MATICA[Math.min(4, fp)][Math.min(4, ip)];
    return v === 0 ? null : ['I', 'II', 'III'][v - 1];
  }

  /* ── WIfI (SVS 2014) ── */
  function wifiIzABI(abi) {
    abi = parseFloat(abi);
    if (isNaN(abi)) return null;
    if (abi >= 0.8) return 0;
    if (abi >= 0.6) return 1;
    if (abi >= 0.4) return 2;
    return 3;
  }
  function wifiIzTP(tp) { // palcový tlak / TcPO2 (mmHg)
    tp = parseFloat(tp);
    if (isNaN(tp)) return null;
    if (tp >= 60) return 0;
    if (tp >= 40) return 1;
    if (tp >= 30) return 2;
    return 3;
  }
  // riziko amputácie v 1 roku: VL/L/M/H – konsenzuálna tabuľka SVS WIfI;
  // klinické štádium = 1 (VL) … 4 (H)
  var WIFI_RIZIKO = {
    // W0
    '000': 'VL', '001': 'VL', '002': 'L', '003': 'M',
    '010': 'VL', '011': 'VL', '012': 'L', '013': 'M',
    '020': 'L', '021': 'L', '022': 'M', '023': 'H',
    '030': 'L', '031': 'M', '032': 'M', '033': 'H',
    // W1
    '100': 'VL', '101': 'VL', '102': 'L', '103': 'M',
    '110': 'VL', '111': 'L', '112': 'M', '113': 'H',
    '120': 'L', '121': 'M', '122': 'H', '123': 'H',
    '130': 'M', '131': 'M', '132': 'H', '133': 'H',
    // W2
    '200': 'L', '201': 'L', '202': 'M', '203': 'H',
    '210': 'M', '211': 'M', '212': 'H', '213': 'H',
    '220': 'M', '221': 'H', '222': 'H', '223': 'H',
    '230': 'H', '231': 'H', '232': 'H', '233': 'H',
    // W3
    '300': 'M', '301': 'M', '302': 'H', '303': 'H',
    '310': 'H', '311': 'H', '312': 'H', '313': 'H',
    '320': 'H', '321': 'H', '322': 'H', '323': 'H',
    '330': 'H', '331': 'H', '332': 'H', '333': 'H'
  };
  var RIZIKO_STADIUM = { VL: 1, L: 2, M: 3, H: 4 };
  function wifi(W, I, fI) {
    if (W == null || I == null || fI == null) return { stadium: null, riziko: null };
    var r = WIFI_RIZIKO['' + W + I + fI];
    return { stadium: r ? RIZIKO_STADIUM[r] : null, riziko: r || null, w: W, i: I, fi: fI };
  }

  var API = {
    lezieZEvk: lezieZEvk,
    tascAI: tascAI,
    tascFP: tascFP,
    glassFP: glassFP,
    glassIP: glassIP,
    glassStadium: glassStadium,
    wifi: wifi,
    wifiIzABI: wifiIzABI,
    wifiIzTP: wifiIzTP,
    _stavZ: stavZ
  };
  global.Staging = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
