// Testy staging algoritmov (TASC II / GLASS / WIfI) proti tabuľkám guidelines.
// Spustenie: node tests/staging.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const S = require(join(dir, '../tools/staging.js'));

let fails = 0;
function ok(cond, label, extra) {
  if (cond) console.log('✅', label);
  else { console.error('❌', label, extra ?? ''); fails++; }
}

// pomocník: model priamo (obchádza lezieZEvk)
const M = (d = {}, s = {}, Ao = null) => ({ Ao, d, s, chybajuceDlzky: [] });

/* ── normalizácia z EVK dát ── */
{
  const dsa = { f_AFS_d: 'oklúzia', v_AIC_s: 'stenóza 70–90%', f_AFC_d: 'stenóza do 50%', d_ATA_d: 'kritická stenóza >90%' };
  const interv = [{ typ: 'pta', tepna: 'AFS l.dx.', lezia_mm: '180', kalcif: 'ťažká', cto: true }];
  const m = S.lezieZEvk(dsa, interv);
  ok(m.d.AFS.stav === 'okluzia' && m.d.AFS.dlzka === 180 && m.d.AFS.kalcif && m.d.AFS.cto, 'lezieZEvk: AFS dx oklúzia 180mm ťažká kalc. CTO');
  ok(m.s.AIC.stav === 'stenoza', 'lezieZEvk: AIC sin stenóza 70–90%');
  ok(m.d.AFC.stav === 'mierna', 'lezieZEvk: do 50% = mierna (nesignifikantná)');
  ok(m.d.ATA.stav === 'stenoza', 'lezieZEvk: kritická stenóza >90% = signifikantná');
  ok(m.chybajuceDlzky.some(x => x.includes('AIC')), 'lezieZEvk: chýbajúca dĺžka AIC hlásená');
}

/* ── TASC II aortoiliakálne ── */
ok(S.tascAI(M({ AIC: { stav: 'stenoza' } }, { AIC: { stav: 'stenoza' } })).tasc === 'A', 'TASC AI: bilat. stenózy AIC → A');
ok(S.tascAI(M({ AIC: { stav: 'okluzia' } })).tasc === 'B', 'TASC AI: unilat. oklúzia AIC → B');
ok(S.tascAI(M({ AIE: { stav: 'okluzia' } })).tasc === 'B', 'TASC AI: unilat. oklúzia AIE bez AFC → B');
ok(S.tascAI(M({ AIC: { stav: 'okluzia' } }, { AIC: { stav: 'okluzia' } })).tasc === 'C', 'TASC AI: bilat. oklúzie AIC → C');
ok(S.tascAI(M({ AIE: { stav: 'okluzia' }, AFC: { stav: 'stenoza' } })).tasc === 'C', 'TASC AI: oklúzia AIE + AFC → C');
ok(S.tascAI(M({ AIE: { stav: 'stenoza' }, AFC: { stav: 'stenoza' } })).tasc === 'C', 'TASC AI: stenóza AIE do AFC → C');
ok(S.tascAI(M({ AIC: { stav: 'okluzia' }, AIE: { stav: 'okluzia' } })).tasc === 'D', 'TASC AI: AIC+AIE oklúzia rovnaká strana → D');
ok(S.tascAI(M({ AIE: { stav: 'okluzia' } }, { AIE: { stav: 'okluzia' } })).tasc === 'D', 'TASC AI: bilat. oklúzie AIE → D');
ok(S.tascAI(M({}, {}, { stav: 'okluzia' })).tasc === 'D', 'TASC AI: oklúzia aorty → D');
ok(S.tascAI(M()).tasc === null, 'TASC AI: bez lézií → null');

/* ── TASC II femoropopliteálne ── */
ok(S.tascFP(M({ AFS: { stav: 'stenoza', dlzka: 80 } }), 'd').tasc === 'A', 'TASC FP: stenóza 8 cm → A');
ok(S.tascFP(M({ AFS: { stav: 'okluzia', dlzka: 40 } }), 'd').tasc === 'A', 'TASC FP: oklúzia 4 cm → A');
ok(S.tascFP(M({ AFS: { stav: 'okluzia', dlzka: 100 } }), 'd').tasc === 'B', 'TASC FP: oklúzia 10 cm → B');
ok(S.tascFP(M({ P2: { stav: 'stenoza' } }), 'd').tasc === 'B', 'TASC FP: infragenik. popliteálna stenóza → B');
ok(S.tascFP(M({ AFS: { stav: 'stenoza', dlzka: 120 }, P1: { stav: 'stenoza', dlzka: 40 } }), 'd').tasc === 'C', 'TASC FP: viacnásobné >15 cm → C');
ok(S.tascFP(M({ AFS: { stav: 'okluzia', dlzka: 250 } }), 'd').tasc === 'D', 'TASC FP: CTO 25 cm → D');
ok(S.tascFP(M({ AFC: { stav: 'okluzia' } }), 'd').tasc === 'D', 'TASC FP: CTO AFC → D');
ok(S.tascFP(M({ P2: { stav: 'okluzia' }, TTF: { stav: 'okluzia' } }), 'd').tasc === 'D', 'TASC FP: CTO popliteálnej + trifurkácia → D');
ok(S.tascFP(M(), 'd').tasc === null, 'TASC FP: bez lézií → null');

/* ── GLASS FP ── */
ok(S.glassFP(M({ AFS: { stav: 'stenoza', dlzka: 80 } }), 'd').grade === 1, 'GLASS FP: stenóza 8 cm → 1');
ok(S.glassFP(M({ AFS: { stav: 'stenoza', dlzka: 150 } }), 'd').grade === 2, 'GLASS FP: stenóza 15 cm → 2');
ok(S.glassFP(M({ AFS: { stav: 'okluzia', dlzka: 80 } }), 'd').grade === 2, 'GLASS FP: CTO 8 cm → 2');
ok(S.glassFP(M({ AFS: { stav: 'okluzia', dlzka: 150 } }), 'd').grade === 3, 'GLASS FP: CTO 15 cm → 3');
ok(S.glassFP(M({ AFS: { stav: 'okluzia', dlzka: 80, subseg: 'proximálny' } }), 'd').grade === 3, 'GLASS FP: flush CTO → 3');
ok(S.glassFP(M({ AFS: { stav: 'okluzia', dlzka: 250 } }), 'd').grade === 4, 'GLASS FP: CTO 25 cm → 4');
ok(S.glassFP(M({ P3: { stav: 'okluzia' } }), 'd').grade === 4, 'GLASS FP: CTO popliteálnej → 4');
ok(S.glassFP(M({ AFS: { stav: 'stenoza', dlzka: 80, kalcif: true } }), 'd').grade === 2, 'GLASS FP: ťažká kalcifikácia +1');
ok(S.glassFP(M(), 'd').grade === 0, 'GLASS FP: bez lézií → 0');

/* ── GLASS IP (cieľová tepna) ── */
ok(S.glassIP(M({ ATA: { stav: 'stenoza', dlzka: 25 } }), 'd', 'ATA').grade === 1, 'GLASS IP: fokálna stenóza → 1');
ok(S.glassIP(M({ ATA: { stav: 'stenoza', dlzka: 120 } }), 'd', 'ATA').grade === 2, 'GLASS IP: stenóza ~1/3 → 2');
ok(S.glassIP(M({ ATA: { stav: 'okluzia', dlzka: 60 } }), 'd', 'ATA').grade === 3, 'GLASS IP: CTO ≤1/3 → 3');
ok(S.glassIP(M({ ATA: { stav: 'okluzia', subseg: 'celý' } }), 'd', 'ATA').grade === 4, 'GLASS IP: CTO celej tepny → 4');
ok(S.glassIP(M({ ATP: { stav: 'mierna' }, TTF: { stav: 'okluzia' } }), 'd', 'ATP').grade === 3, 'GLASS IP: TTF oklúzia pri TAP=ATP → min. 3');
ok(S.glassIP(M({ ATA: { stav: 'stenoza' } }), 'd', null).grade === null, 'GLASS IP: bez TAP → null');
ok(S.glassIP(M(), 'd', 'ATA').grade === 0, 'GLASS IP: čistá TAP → 0');

/* ── GLASS štádium (matica) ── */
ok(S.glassStadium(1, 1) === 'I', 'GLASS: FP1+IP1 → I');
ok(S.glassStadium(2, 0) === 'I', 'GLASS: FP2+IP0 → I');
ok(S.glassStadium(2, 2) === 'II', 'GLASS: FP2+IP2 → II');
ok(S.glassStadium(3, 3) === 'III', 'GLASS: FP3+IP3 → III');
ok(S.glassStadium(4, 0) === 'III', 'GLASS: FP4 → vždy III');
ok(S.glassStadium(0, 4) === 'III', 'GLASS: IP4 → vždy III');
ok(S.glassStadium(0, 0) === null, 'GLASS: 0+0 → bez štádia');

/* ── WIfI ── */
ok(S.wifiIzABI(0.85) === 0 && S.wifiIzABI(0.7) === 1 && S.wifiIzABI(0.5) === 2 && S.wifiIzABI(0.3) === 3, 'WIfI: ischémia z ABI (0.85/0.7/0.5/0.3 → 0/1/2/3)');
ok(S.wifiIzTP(65) === 0 && S.wifiIzTP(45) === 1 && S.wifiIzTP(35) === 2 && S.wifiIzTP(20) === 3, 'WIfI: ischémia z TP/TcPO2');
ok(S.wifi(0, 0, 0).riziko === 'VL' && S.wifi(0, 0, 0).stadium === 1, 'WIfI: 0-0-0 → VL / štádium 1');
ok(S.wifi(1, 2, 0).riziko === 'L' && S.wifi(1, 2, 0).stadium === 2, 'WIfI: W1 I2 fI0 → L / 2');
ok(S.wifi(2, 1, 1).riziko === 'M' && S.wifi(2, 1, 1).stadium === 3, 'WIfI: W2 I1 fI1 → M / 3');
ok(S.wifi(3, 3, 3).riziko === 'H' && S.wifi(3, 3, 3).stadium === 4, 'WIfI: W3 I3 fI3 → H / 4');
ok(S.wifi(null, 1, 0).stadium === null, 'WIfI: neúplné vstupy → null');

/* ── audit-fix regresie ── */
// lézia zadaná IBA segmentovým riadkom (hlavný select ostal normálny)
{
  const m = S.lezieZEvk({ _segs: { f_AFS_d: [{ seg: 'stredný', val: 'oklúzia' }] } }, []);
  ok(m.d.AFS && m.d.AFS.stav === 'okluzia', 'audit: lézia len z _segs sa nestratí');
}
// jednotlivá stenóza >15 cm → C (nie A)
ok(S.tascFP(M({ AFS: { stav: 'stenoza', dlzka: 200 } }), 'd').tasc === 'C', 'audit: jedna stenóza 20 cm → C');
ok(S.tascFP(M({ AFS: { stav: 'stenoza', dlzka: 150 } }), 'd').tasc === 'B', 'audit: stenóza presne 15 cm ostáva B');
// in-stent restenóza → min C
{
  const m = S.lezieZEvk({ f_AFS_d: 'in-stent restenóza' }, [{ typ: 'stent', tepna: 'AFS l.dx.', lezia_mm: '40' }]);
  ok(m.d.AFS.restenoza === true, 'audit: in-stent restenóza označená');
  ok(S.tascFP(m, 'd').tasc === 'C', 'audit: in-stent restenóza → C');
}
// bilaterálne AIE 3–10 cm len keď OBE strany >3 cm
ok(S.tascAI(M({ AIE: { stav: 'stenoza', dlzka: 40 } }, { AIE: { stav: 'stenoza', dlzka: 10 } })).tasc === 'B', 'audit: unilat. AIE 4 cm + kontralat. 1 cm → B (nie C)');
ok(S.tascAI(M({ AIE: { stav: 'stenoza', dlzka: 40 } }, { AIE: { stav: 'stenoza', dlzka: 40 } })).tasc === 'C', 'audit: bilat. AIE 4 cm → C');
// odstupová (flush) CTO AFS → GLASS FP grade 3
ok(S.glassFP(M({ AFS: { stav: 'okluzia', dlzka: 80, subseg: 'odstup' } }), 'd').grade === 3, 'audit: flush CTO (odstup) → GLASS FP 3');

if (fails) { console.error(`\n${fails} staging testov zlyhalo.`); process.exit(1); }
console.log('\nVšetky staging testy prešli.');
