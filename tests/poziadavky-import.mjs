// Testy extraktora požiadaviek (PoziadavkyImport.parsePZ) – reálne CT správy
// z korpusu + syntetická žiadanka (fiktívne meno a RČ, repo je verejné).
// Spustenie: node tests/poziadavky-import.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P = require(join(dir, '../tools/poziadavky-import.js'));

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('✅', label);
  else { console.error('❌', label); fails++; }
}
const load = n => readFileSync(join(dir, 'parser-korpus', `sprava${n}.txt`), 'utf8');
const byKod = (r, k) => r.found.find(f => f.kod === k);

/* ── syntetická žiadanka (typ NIS požiadavky) ── */
{
  const txt = `Pacient Mrkvička Ján 481205/1234
Prosím o endovask. ošetrenie (PEVAR - impl. bifurk. SG + vaskulárne plugy) u pacienta s asymptomatickou sakulárnou aneuryzmou infrarenálnej abdominálnej aorty, max. diameter 57 mm, s nasadujúcim PAU (CTAg 06/2026)
CT z 20.6.2026: infrarenálna AAA, krčok dĺžky 18mm, priemer krčka 24mm, angulácia 45°, AIC l.dx 15mm, AIC l.sin 20 mm
KREAT: 171 umol/l, CKD-EPI: 0.82
Lieky: Anopyrin 100mg, Xarelto 20mg`;
  const r = P.parsePZ(txt);
  ok(byKod(r, 'rc')?.patch.rc === '481205/1234' && byKod(r, 'rc').certain, 'žiadanka: RČ isté');
  ok(byKod(r, 'inicialy')?.patch.inicialy === 'M.J.', 'žiadanka: iniciály M.J. z mena pred RČ (meno sa neukladá)');
  ok(byKod(r, 'dg')?.patch.dg === 'AAA infrarenálna', 'žiadanka: dg AAA infrarenálna (nie PAU – AAA má prioritu)');
  ok(byKod(r, 'sympt')?.patch.sympt === 'asymptomatický', 'žiadanka: asymptomatický');
  ok(byKod(r, 'priemer')?.patch.priemer === 57 && byKod(r, 'priemer').certain, 'žiadanka: max. priemer 57 mm');
  ok(byKod(r, 'krcok_dlzka')?.patch.krcok_dlzka === 18, 'žiadanka: krčok dĺžka 18');
  ok(byKod(r, 'krcok_priemer')?.patch.krcok_priemer === 24, 'žiadanka: krčok priemer 24');
  ok(byKod(r, 'krcok_ang')?.patch.krcok_ang === '<60', 'žiadanka: angulácia 45° → <60');
  ok(byKod(r, 'aic_dx')?.patch.aic_dx === 15 && byKod(r, 'aic_sin')?.patch.aic_sin === 20, 'žiadanka: AIC dx/sin');
  ok(byKod(r, 'renalne')?.patch.renalne === '0.82', 'žiadanka: eGFR má prednosť pred kreatinínom');
  ok(byKod(r, 'medikacia')?.patch.medikacia === 'ASA, NOAK', 'žiadanka: ASA + NOAK');
  ok(byKod(r, 'vykon')?.patch.vykon === 'PEVAR' && !byKod(r, 'vykon').certain, 'žiadanka: navrhovaný PEVAR (na overenie)');
  ok(byKod(r, 'datum_ct')?.patch.datum_ct === '2026-06-20', 'žiadanka: dátum CT 20.6.2026');
  ok(!byKod(r, 'urgencia'), 'žiadanka: bez urgencie (elektívne default)');
}

/* ── sprava11: prepúšťacia správa s progresiou AAA ── */
{
  const r = P.parsePZ(load('11'));
  ok(byKod(r, 'dg')?.patch.dg === 'AAA infrarenálna', '11: dg AAA infrarenálna');
  ok(!byKod(r, 'sympt') || byKod(r, 'sympt').patch.sympt !== 'ruptúra', '11: „bez prejavov ruptúry" nie je ruptúra');
  ok(byKod(r, 'rast')?.patch.rast === 12, '11: rast 12 mm/rok (z 54 na 60 za 6 mes.)');
  ok(byKod(r, 'priemer')?.patch.priemer === 60 && !byKod(r, 'priemer').certain, '11: priemer 60 mm z progresie (neistý)');
  ok(byKod(r, 'aic_dx')?.patch.aic_dx === 15 && byKod(r, 'aic_sin')?.patch.aic_sin === 20, '11: AIC dx 15 / sin 20');
}

/* ── sprava12: CT popis ── */
{
  const r = P.parsePZ(load('12'));
  ok(byKod(r, 'priemer')?.patch.priemer === 61 && byKod(r, 'priemer').certain, '12: max. diametrom 61mm (nie prostata 68mm)');
  ok(byKod(r, 'aic_sin')?.patch.aic_sin === 17, '12: AIC sin. diametra do 17mm');
  ok(byKod(r, 'aie_dx')?.patch.aie_dx === 12 && byKod(r, 'aie_dx').patch.aie_sin === 12, '12: AIE bilat. šírky 12mm → obe strany');
}

/* ── sprava13: kontrola po PEVAR s endoleakom ── */
{
  const r = P.parsePZ(load('13'));
  ok(byKod(r, 'dg')?.patch.dg === 'Endoleak po EVAR/TEVAR', '13: dg endoleak (má prioritu)');
  ok(byKod(r, 'renalne')?.patch.renalne === 'krea 112', '13: „Kreat.: 11.2.2021: 112 umol/l" → 112 (nie 11 z dátumu)');
}

/* ── sprava16: „bez evid. endoleaku" nesmie dať dg endoleak ── */
{
  const r = P.parsePZ(load('16'));
  ok(byKod(r, 'dg')?.patch.dg !== 'Endoleak po EVAR/TEVAR', '16: negovaný endoleak nie je diagnóza');
  ok(byKod(r, 'dg')?.patch.dg === 'AAA infrarenálna', '16: dg AAA infrarenálna');
}

/* ── endoleak žiadanka s typom + ruptúra ── */
{
  const r = P.parsePZ('Pacient po EVAR 2023, na CTA endoleak typu Ia, vak s max. priemerom 72 mm, rast 8 mm. Prosím o urgentné riešenie.');
  ok(byKod(r, 'dg')?.patch.dg === 'Endoleak po EVAR/TEVAR' && byKod(r, 'dg').patch.endoleak_typ === 'Ia', 'endoleak: dg + typ Ia');
  ok(byKod(r, 'priemer')?.patch.priemer === 72, 'endoleak: vak 72 mm');
  ok(byKod(r, 'urgencia')?.patch.urgencia === 'urgentné', 'endoleak: urgentné');
}
{
  const r = P.parsePZ('75-ročný pacient, AAA 80 mm s krytou ruptúrou, hypotenzný. Emergentne prosím o EVAR.');
  ok(byKod(r, 'sympt')?.patch.sympt === 'ruptúra', 'ruptúra: klinický stav');
  ok(byKod(r, 'vykon')?.patch.vykon === 'EVAR', 'ruptúra: výkon EVAR');
}

/* ── audit-fix regresie ── */
{
  const b = (txt, kod) => { const f = P.parsePZ(txt).found.find(x => x.kod === kod); return f ? f.patch : null; };
  ok(!b('Žiadanka ev. č. 123456/2026, AAA 55 mm', 'rc'), 'audit: evidenčné číslo (neplatný mesiac) sa neberie ako RČ');
  ok(b('Pacient 480512/1234, AAA', 'rc')?.rc === '480512/1234', 'audit: platné RČ ostáva');
  ok(b('CT: dĺžka krčka 12 mm', 'krcok_dlzka')?.krcok_dlzka === 12, 'audit: „krčka" (genitív) – dĺžka');
  ok(b('CT: priemer krčka 26 mm', 'krcok_priemer')?.krcok_priemer === 26, 'audit: „krčka" (genitív) – priemer');
  ok(!b('AAA, angulovaný priebeh\n58 mm max. šírka vaku', 'krcok_ang'), 'audit: rozmer vaku z ďalšieho riadku nie je angulácia');
  ok(!b('AAA 52 mm, nie je urgentné, plánovaná kontrola', 'urgencia'), 'audit: „nie je urgentné" sa neponúkne ako urgentné');
  ok(b('AAA 80 mm, urgentne prosím o EVAR', 'urgencia')?.urgencia === 'urgentné', 'audit: skutočná urgencia ostáva');
}

if (fails) { console.error(`\n${fails} testov požiadaviek zlyhalo.`); process.exit(1); }
console.log('\nVšetky testy extraktora požiadaviek prešli.');
