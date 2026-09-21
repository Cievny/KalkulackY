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
    if (seg === 'proximálny' || seg === 'stredný' || seg === 'distálny' || seg === 'odstup') return 100;
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
    // zjednotenie kľúčov: lézia môže byť zadaná IBA segmentovým riadkom (_segs),
    // keď hlavný select ostal „bez závažnej stenózy" – tie EVK do dsa nepridá
    var kluce = {};
    Object.keys(dsa).forEach(function (f) { if (f !== '_segs' && !/_text$/.test(f)) kluce[f] = 1; });
    Object.keys(segsExtra).forEach(function (f) { kluce[f] = 1; });
    Object.keys(kluce).forEach(function (f) {
      var kl = dsaKluc(f);
      if (!kl) return;
      var raw = dsa[f];
      var stav = stavZ(raw);
      var seg = null;
      var rest = /in-?stent|restenoz/i.test(String(raw || ''));
      // subsegmentové nálezy: vezmi najhorší + jeho subsegment
      (segsExtra[f] || []).forEach(function (sx) {
        var s2 = stavZ(sx.val);
        if (s2 && (ZAV[s2] || 0) >= (ZAV[stav] || 0)) {
          stav = horsi(stav, s2); seg = sx.seg || seg;
          if (/in-?stent|restenoz/i.test(String(sx.val || ''))) rest = true;
        }
      });
      if (!stav || stav === 'mierna') {
        if (stav === 'mierna' && kl.seg !== 'Ao') (kl.strana ? model[kl.strana] : model)[kl.seg] = { stav: 'mierna' };
        return;
      }
      if (kl.seg === 'Ao') { model.Ao = { stav: stav }; return; }
      model[kl.strana][kl.seg] = { stav: stav, dlzka: odhadDlzky(seg), ctoDlzka: null, subseg: seg, kalcif: false, cto: stav === 'okluzia', restenoza: rest };
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
      var ctoMm = parseFloat(it.cto_mm);
      if (ctoMm > 0 && (!e.ctoDlzka || ctoMm > e.ctoDlzka)) e.ctoDlzka = ctoMm;
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
    if (sten(d.aie) && sten(s.aie) && (d.aie.dlzka || 0) > 30 && (s.aie.dlzka || 0) > 30)
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
    var restenoza = [afs, p1, p2, p3].some(function (e) { return e.restenoza; });

    // D: CTO AFC alebo AFS >20 cm (so zasahom popliteálnej); CTO popliteálnej + trifurkácie
    if (afc.stav === 'okluzia') return { tasc: 'D', pozn: ['chronická oklúzia AFC'] };
    if (afsOkl && (afsL > 200 || (afsL === 0 && afs.subseg === 'celý'))) return { tasc: 'D', pozn: ['CTO AFS >20 cm'] };
    if (popOkl && (ttf.stav === 'okluzia' || ttf.stav === 'stenoza')) return { tasc: 'D', pozn: ['CTO popliteálnej + proximálna trifurkácia'] };
    // C: jednotlivé/viacnásobné spolu >15 cm; CTO AFS 15–20 cm; recidíva (in-stent)
    if (total > 150) return { tasc: 'C', pozn: [lez.length > 1 ? 'lézie spolu >15 cm' : 'lézia >15 cm'] };
    if (afsOkl && afsL > 150) return { tasc: 'C', pozn: ['CTO AFS 15–20 cm'] };
    if (restenoza) return { tasc: 'C', pozn: ['in-stent restenóza – recidíva'] };
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

  /* ══ GLASS ════════════════════════════════════════════════════════════════
     Jadro je 1:1 s oficiálnou kalkulačkou SVS (svs.webauthor.com …calc.cfm?id=1002),
     kde hodnota každého <option> JE príspevok do stupňa segmentu:

       FP – hemodynamicky signifikantná choroba?   nie → FP 0
            dĺžka choroby AFS : žiadna/nevýznamná 0 | <10 cm 1 | 10–20 cm 2 | >20 cm 3
            CTO AFS           : žiadna 0 | non-flush <5 cm 1 | non-flush 5–10 cm 2
                                non-flush 10–20 cm 3 | flush <20 cm 3 | akákoľvek >20 cm 4
            popliteálna tepna : bez signifikantnej choroby 1 | stenóza <2 cm 2
                                stenóza 2–5 cm 3 | stenóza >5 cm alebo do trifurkácie 4 | akákoľvek CTO 4
            ťažká kalcifikácia: +1
       IP – hemodynamicky signifikantná choroba?   nie → IP 0
            dĺžka choroby TAP : <3 cm 1 | ≤1/3 2 | 1/3–2/3 3 | >2/3 4
            CTO prítomná?     : nie → nasledujúce dve sa neuplatnia
            lokalizácia CTO   : odstup TAP 3 | mimo odstupu 0 | TP trunk 4 (len pri TAP = ATP/peronea)
            dĺžka CTO         : <3 cm 2 | do 1/3 3 | >1/3 4
            ťažká kalcifikácia: +1

     Stupeň segmentu = MAXIMUM zložiek, kalcifikácia potom +1, strop 4.
     Overené proti štyrom reálnym výsledkom kalkulačky (tests/staging.mjs). */

  var FP_ZLOZKY = ['sfaChoroba', 'sfaCto', 'poplitea'];
  var IP_ZLOZKY = ['tapChoroba', 'ctoLokalizacia', 'ctoDlzka'];

  function zlozkyNaStupen(z, kluce) {
    var g = 0;
    for (var i = 0; i < kluce.length; i++) {
      var v = z[kluce[i]];
      if (typeof v === 'number' && v > g) g = v;
    }
    if (z.kalcif && g > 0) g = Math.min(4, g + 1);
    return g;
  }

  // FP stupeň zo zložiek SVS. z.signifikantna=false → 0.
  function glassFPzoZloziek(z) {
    z = z || {};
    if (!z.signifikantna) return 0;
    return zlozkyNaStupen(z, FP_ZLOZKY);
  }

  // IP stupeň zo zložiek SVS. Lokalizácia a dĺžka CTO sa počítajú len keď z.cto.
  function glassIPzoZloziek(z) {
    z = z || {};
    if (!z.signifikantna) return 0;
    var pouzi = { tapChoroba: z.tapChoroba, kalcif: z.kalcif };
    if (z.cto) { pouzi.ctoLokalizacia = z.ctoLokalizacia; pouzi.ctoDlzka = z.ctoDlzka; }
    return zlozkyNaStupen(pouzi, IP_ZLOZKY);
  }

  /* ── EVK model → zložky FP ──
     dlzka = celková dĺžka choroby, ctoDlzka = dĺžka samotnej CTO (ak ju lekár
     zadal zvlášť; inak sa berie celková dĺžka a doplní sa poznámka).
     ZJEDNODUŠENIE: dĺžky popliteálnych stenóz sa sčítajú cez P1–P3. */
  function glassFPzlozky(model, strana) {
    var M = model[strana] || {};
    var afs = M.AFS || {}, pop = [M.P1 || {}, M.P2 || {}, M.P3 || {}];
    var pozn = [];
    var sig = function (e) { return e.stav === 'stenoza' || e.stav === 'okluzia'; };
    var afsSig = sig(afs), popSig = pop.some(sig);
    var trif = (M.TTF || {}).stav != null && (M.TTF || {}).stav !== 'mierna';
    if (!afsSig && !popSig && !trif) return { z: { signifikantna: false }, pozn: pozn };

    var z = { signifikantna: true, kalcif: !!(afs.kalcif || pop.some(function (e) { return e.kalcif; })) };
    var afsL = afs.dlzka || 0;

    // dĺžka choroby AFS
    if (!afsSig) z.sfaChoroba = 0;
    else if (afsL > 200) z.sfaChoroba = 3;
    else if (afsL > 100) z.sfaChoroba = 2;
    else if (afsL > 0) z.sfaChoroba = 1;
    else { z.sfaChoroba = 1; pozn.push('dĺžka lézie AFS bez údaja – brané ako < 10 cm'); }

    // CTO AFS – vlastná dĺžka, ak je zadaná
    if (afs.stav !== 'okluzia') z.sfaCto = 0;
    else {
      var flush = afs.subseg === 'proximálny' || afs.subseg === 'odstup';
      var ctoL = afs.ctoDlzka || 0;
      if (!ctoL && afsL) { ctoL = afsL; pozn.push('dĺžka CTO AFS nezadaná zvlášť – brané ako celá dĺžka lézie'); }
      if (ctoL > 200) z.sfaCto = 4;
      else if (flush) z.sfaCto = 3;
      else if (ctoL > 100) z.sfaCto = 3;
      else if (ctoL > 50) z.sfaCto = 2;
      else if (ctoL > 0) z.sfaCto = 1;
      else { z.sfaCto = 2; pozn.push('dĺžka CTO AFS bez údaja – brané ako 5–10 cm'); }
    }

    // popliteálna tepna (bez signifikantnej choroby = 1, tak ako v kalkulačke SVS)
    if (pop.some(function (e) { return e.stav === 'okluzia'; })) { z.poplitea = 4; pozn.push('CTO popliteálnej tepny'); }
    else if (trif) { z.poplitea = 4; pozn.push('choroba zasahuje trifurkáciu'); }
    else if (popSig) {
      var popL = pop.reduce(function (a, e) { return a + (sig(e) ? (e.dlzka || 0) : 0); }, 0);
      if (popL > 50) z.poplitea = 4;
      else if (popL > 20) z.poplitea = 3;
      else if (popL > 0) z.poplitea = 2;
      else { z.poplitea = 2; pozn.push('dĺžka popliteálnej stenózy bez údaja – brané ako < 2 cm'); }
    } else z.poplitea = 1;

    if (z.kalcif) pozn.push('ťažká kalcifikácia: grade +1');
    return { z: z, pozn: pozn };
  }

  /* ── EVK model → zložky IP na cieľovej tepne (TAP) ──
     Krurálne tepny ~30 cm → 1/3 ≈ 10 cm, 2/3 ≈ 20 cm.
     TP trunk je spoločný odstup pre ATP a a. peroneu; pri TAP = ATA ho
     kalkulačka SVS z ponuky odstraňuje, tak ho tu tiež neuplatňujeme. */
  function glassIPzlozky(model, strana, tap) {
    var M = model[strana] || {};
    var e = M[tap] || {}, ttf = M.TTF || {};
    var pozn = [];
    var sig = e.stav === 'stenoza' || e.stav === 'okluzia';
    var ttfSig = (tap === 'ATP' || tap === 'AFib') && (ttf.stav === 'stenoza' || ttf.stav === 'okluzia');
    if (!sig && !ttfSig) return { z: { signifikantna: false }, pozn: pozn };

    var z = { signifikantna: true, kalcif: !!e.kalcif };
    var L = e.dlzka || (e.subseg === 'celý' ? 300 : 0);

    if (!sig) z.tapChoroba = 0;
    else if (L > 200) z.tapChoroba = 4;
    else if (L > 100) z.tapChoroba = 3;
    else if (L > 30) z.tapChoroba = 2;
    else if (L > 0) z.tapChoroba = 1;
    else { z.tapChoroba = 1; pozn.push('dĺžka lézie TAP bez údaja – brané ako < 3 cm'); }

    var ttfOkl = ttfSig && ttf.stav === 'okluzia';
    z.cto = e.stav === 'okluzia' || ttfOkl;
    if (z.cto) {
      if (ttfOkl) { z.ctoLokalizacia = 4; pozn.push('CTO TP trunku pri TAP = ' + tap); }
      else if (e.subseg === 'odstup' || e.subseg === 'proximálny') { z.ctoLokalizacia = 3; pozn.push('CTO v odstupe cieľovej tepny'); }
      else z.ctoLokalizacia = 0;

      if (e.stav === 'okluzia') {
        var ctoL = e.ctoDlzka || 0;
        if (!ctoL && L) { ctoL = L; pozn.push('dĺžka CTO v TAP nezadaná zvlášť – brané ako celá dĺžka lézie'); }
        if (ctoL > 100) z.ctoDlzka = 4;
        else if (ctoL > 30) z.ctoDlzka = 3;
        else if (ctoL > 0) z.ctoDlzka = 2;
        else { z.ctoDlzka = 3; pozn.push('dĺžka CTO v TAP bez údaja – brané ako do 1/3'); }
      }
    }
    // stenóza TP trunku nemá v kalkulačke SVS vlastnú položku – berieme ju ako
    // chorobu prítoku cieľovej tepny na úrovni odstupu (stupeň 3)
    if (ttfSig && !ttfOkl) { z.tapChoroba = Math.max(z.tapChoroba || 0, 3); pozn.push('stenóza TP trunku pri TAP = ' + tap); }

    if (z.kalcif) pozn.push('ťažká kalcifikácia: grade +1');
    return { z: z, pozn: pozn };
  }

  function glassFP(model, strana) {
    var r = glassFPzlozky(model, strana);
    return { grade: glassFPzoZloziek(r.z), pozn: r.pozn, zlozky: r.z };
  }

  function glassIP(model, strana, tap) {
    if (!tap) return { grade: null, pozn: ['nezvolená cieľová tepna (TAP)'] };
    var r = glassIPzlozky(model, strana, tap);
    return { grade: glassIPzoZloziek(r.z), pozn: r.pozn, zlozky: r.z };
  }

  /* ── Filtre ponuky ako v kalkulačke SVS ──
     „CTO length cannot exceed disease length": pri dĺžke choroby AFS 0/1/2/3 sú
     povolené len tieto hodnoty CTO, a pri dĺžke choroby TAP 0–4 len tieto
     hodnoty dĺžky CTO. Kľúč je hodnota dĺžky choroby. */
  var GLASS_CTO_POVOLENE = {
    sfa: { 0: ['0'], 1: ['0', '1', '2', '3f'], 2: ['0', '1', '2', '3', '3f'], 3: ['0', '1', '2', '3', '3f', '4'] },
    tap: { 0: [], 1: ['1'], 2: ['1', '2'], 3: ['1', '2', '3'], 4: ['1', '2', '3'] }
  };

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
    glassFPzoZloziek: glassFPzoZloziek,
    glassIPzoZloziek: glassIPzoZloziek,
    GLASS_CTO_POVOLENE: GLASS_CTO_POVOLENE,
    glassStadium: glassStadium,
    wifi: wifi,
    wifiIzABI: wifiIzABI,
    wifiIzTP: wifiIzTP,
    _stavZ: stavZ
  };
  global.Staging = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
