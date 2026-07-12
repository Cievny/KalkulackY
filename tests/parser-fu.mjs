// Testy follow-up parsera (AnamnezaParser.parseFU) nad reálnymi anonymizovanými
// správami z tests/parser-korpus/ + syntetické prípady pre CAS.
// Spustenie: node tests/parser-fu.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P = require(join(dir, '../tools/anamneza-parser.js'));

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('✅', label);
  else { console.error('❌', label); fails++; }
}
const load = n => readFileSync(join(dir, 'parser-korpus', `sprava${n}.txt`), 'utf8');
const byKod = (res, kod) => res.found.find(f => f.kod === kod);

/* ── sprava13: PEVAR kontrola s CTAg – endoleak typ III, regresia vaku ── */
{
  const r = P.parseFU(load('13'), 'pevar', 'sk');
  const datum = byKod(r, 'datum');
  ok(datum && datum.patch.datum === '2021-02-06', '13: dátum kontroly 6.02.2021 → 2021-02-06');
  const zobr = byKod(r, 'zobr');
  ok(zobr && zobr.patch.zobr === 'CTA', '13: zobrazenie CTA (viac zmienok než USG)');
  const el = byKod(r, 'el');
  ok(el && el.certain && el.patch.el_typ === 'III', '13: endoleak typ III istý (z „v.s. typu III", nie z negovaného „bez známok endoleaku")');
  const sac = byKod(r, 'sac');
  ok(sac && sac.patch.sac === 58, '13: priemer vaku 58 mm (aktuálny 58x55, nie predoperačných 60)');
  ok(sac && sac.certain, '13: priemer vaku istý (pri slove „vak")');
  const zm = byKod(r, 'zmena');
  ok(zm && zm.patch.zmena === 'regresi', '13: vývoj vaku regresia');
}

/* ── sprava15: hospitalizácia po PEVAR – „bez endoleaku" NEsmie prejsť ── */
{
  const r = P.parseFU(load('15'), 'pevar', 'sk');
  ok(!byKod(r, 'el'), '15: „Vak ... bez endoleaku" → endoleak NEnájdený');
  const sac = byKod(r, 'sac');
  ok(sac && sac.patch.sac === 68, '15: priemer vaku 68 mm (max z 60x68)');
  ok(!byKod(r, 'exitus'), '15: exitus NEnájdený');
}

/* ── sprava16: USG kontrola – „bez evid. endoleaku" (skratková bodka) ── */
{
  const r = P.parseFU(load('16'), 'pevar', 'sk');
  const datum = byKod(r, 'datum');
  ok(datum && datum.patch.datum === '2020-05-07', '16: dátum kontroly 07.05.2020');
  const zobr = byKod(r, 'zobr');
  ok(zobr && zobr.patch.zobr === 'duplex' && zobr.certain, '16: zobrazenie duplex USG (Cdus), isté');
  ok(!byKod(r, 'el'), '16: „bez evid. endoleaku" → endoleak NEnájdený (negácia cez skratkovú bodku)');
  ok(!byKod(r, 'sac'), '16: „do 7cm" bez mm → priemer vaku NEnájdený (radšej nič než zle)');
}

/* ── sprava06: EVK – ABI po výkone, priechodný stent ── */
{
  const r = P.parseFU(load('06'), 'evk', 'sk');
  const rest = byKod(r, 'rest');
  ok(rest && rest.patch.bez_rest === true && rest.certain, '06: „stent štíhly trif. tok" → bez restenózy (primárna patencia)');
  const abi = byKod(r, 'abi');
  ok(abi && abi.patch.abi === 1, '06: ABI 1,0 po výkone (nie 0,19 spred výkonu)');
  ok(abi && !abi.certain, '06: ABI je na overenie (❓), nie prednastavené');
  const zobr = byKod(r, 'zobr');
  ok(zobr && zobr.patch.zobr === 'duplex', '06: zobrazenie duplex (CDUS kontrola)');
}

/* ── sprava05: EVK – ABI hodnoty, Rutherford ── */
{
  const r = P.parseFU(load('05'), 'evk', 'sk');
  const abi = byKod(r, 'abi');
  ok(abi && abi.patch.abi > 0 && abi.patch.abi < 2 && !abi.certain, '05: ABI nájdené ako neisté (viac hodnôt, lekár vyberie)');
  const ruth = byKod(r, 'ruth');
  ok(ruth && ruth.patch.ruth === '3' && !ruth.certain, '05: Rutherford 3 ponúknutý na overenie');
}

/* ── syntetické CAS prípady ── */
{
  const txt = 'Kontrolné vyšetrenie 12.06.2026\nCDUS karotíd: v stente ACI l.dx. restenóza 60-70%\nNeurologicky bez príhody, TIA neguje.';
  const r = P.parseFU(txt, 'cas', 'sk');
  ok(byKod(r, 'datum')?.patch.datum === '2026-06-12', 'CAS synt: dátum 12.06.2026');
  const rest = byKod(r, 'rest');
  ok(rest && rest.patch.rest_band === '50-70' && rest.certain, 'CAS synt: restenóza 60-70 % → pásmo 50–70');
  const neuro = byKod(r, 'neuro');
  ok(neuro && neuro.patch.neuro === 'bez', 'CAS synt: „TIA neguje" + „bez príhody" → bez neurologickej príhody');
}
{
  const txt = 'Kontrola po CAS 3.03.2026\nDuplex: oklúzia stentu ACI l.sin.\nPrekonal TIA 2/2026, odoslaný na neurológiu. Zvážená reintervencia.';
  const r = P.parseFU(txt, 'cas', 'sk');
  const rest = byKod(r, 'rest');
  ok(rest && rest.patch.okluzia === true, 'CAS synt2: oklúzia stentu');
  const neuro = byKod(r, 'neuro');
  ok(neuro && neuro.patch.neuro === 'TIA', 'CAS synt2: TIA zachytená');
  const reint = byKod(r, 'reint');
  ok(reint && !reint.certain, 'CAS synt2: reintervencia ponúknutá na overenie');
}
{
  // exitus – len ako neistý návrh
  const txt = 'Telefonická kontrola 1.02.2026\nPacient zomrel 15.01.2026 doma, podľa rodiny náhle.';
  const r = P.parseFU(txt, 'evk', 'sk');
  const ex = byKod(r, 'exitus');
  ok(ex && !ex.certain, 'exitus: zachytený ako neistý (❓ overiť)');
}

if (fails) { console.error(`\n${fails} FU testov zlyhalo.`); process.exit(1); }
console.log('\nVšetky FU testy prešli.');
