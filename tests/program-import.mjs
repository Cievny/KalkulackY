// Testy extraktora denného programu (ProgramImport.parseProgram).
// Vzorky napodobňujú wordový „Katetrizačný program OIRA" a text z NIS
// kalendára – mená pacientov sú FIKTÍVNE (repo je verejné).
// Spustenie: node tests/program-import.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const P = require(join(dir, '../tools/program-import.js'));

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('✅', label);
  else { console.error('❌', label); fails++; }
}

/* ── formát A: wordový program OIRA ── */
{
  const txt = `NÁRODNÝ ÚSTAV SRDCOVÝCH A CIEVNYCH CHORÔB, A.S.
Katetrizačný program  OIRA

PONDELOK  13.7. 2026

1.  Mrkvička Ján            1948    RAS                   OIA
2.  Testovič Peter          1952    AAA                   OIA
3.  Vzorný Ľubomír          1956    EXTENZIA STENTGRAFTU  OIA

Bratislava dňa  10.7. 2026        schválil:  MUDr. X Y`;
  const r = P.parseProgram(txt);
  ok(r.datum === '2026-07-13', 'Word: dátum z riadku PONDELOK 13.7.2026 (nie z „Bratislava dňa 10.7.")');
  ok(r.pacienti.length === 3, 'Word: 3 pacienti');
  ok(r.pacienti[0].meno === 'Mrkvička Ján' && r.pacienti[0].rocnik === 1948, 'Word: meno + ročník 1. pacienta');
  ok(r.pacienti[1].vykon === 'AAA', 'Word: výkon AAA');
  ok(r.pacienti[2].vykon === 'EXTENZIA STENTGRAFTU', 'Word: viacslovný výkon');
  ok(r.pacienti.every(p => p.lozko === 'OIA'), 'Word: oddelenie OIA vo všetkých riadkoch');
}

/* ── formát B: NIS kalendár ── */
{
  const txt = `00:00 Vzorka Milan 431031/107
OIA - Oddelenie intenzívnej angiológie
MUDr. Mohamad Salim Miroslav
Dôvod:
Prosím o endovask. ošetrenie (PEVAR - impl. bifurk. SG + vaskulárne plugy) u pacienta s asymptomatickou sakulárnou aneuryzmou infrarenálnej abdominálnej aorty, max. diameter
57 mm, s nasadujúcim PAU (CTAg 06/2026)
08:00
08:00 Zelebníček Milan 57/ ✕
doc. MUDr. Maďarič Juraj,, PhD, MPH
FEVAR
09:00
10:00 Testovič Peter 521204/190 ✕
MUDr. Širila Miroslav
PAO Panva
EMB. AII pred Pevar
11:00 Vzorný Ľubomír 560502/6152 ✕
doc. MUDr. Maďarič Juraj,, PhD, MPH
FEVAR
12:00
16:00`;
  const r = P.parseProgram(txt);
  ok(r.pacienti.length === 4, 'NIS: 4 pacienti (osové časy mriežky 08:00/09:00/12:00/16:00 preskočené)');
  const [a, b, c, d] = r.pacienti;
  ok(a.meno === 'Vzorka Milan' && a.rocnik === 1943, 'NIS: meno + ročník z RČ 431031/107 → 1943');
  ok(a.cas === null, 'NIS: 00:00 (konzílium) = bez času');
  ok(/PEVAR - impl\. bifurk\. SG/.test(a.diagnoza), 'NIS: Dôvod → diagnóza (viacriadkový)');
  ok(a.lozko === 'OIA', 'NIS: OIA - Oddelenie… → kde leží');
  ok(a.operator === 'MUDr. Mohamad Salim Miroslav', 'NIS: operatér');
  ok(b.meno === 'Zelebníček Milan' && b.rocnik === 1957, 'NIS: orezané RČ „57/" → ročník 1957');
  ok(b.cas === '08:00' && b.vykon === 'FEVAR', 'NIS: čas 08:00 + výkon FEVAR');
  ok(b.operator === 'doc. MUDr. Maďarič Juraj, PhD, MPH', 'NIS: operatér bez „,," artefaktu');
  ok(c.rocnik === 1952 && c.vykon === 'PAO Panva • EMB. AII pred Pevar', 'NIS: RČ 521204 → 1952, výkony spojené');
  ok(d.cas === '11:00' && d.rocnik === 1956, 'NIS: posledný pacient 11:00, ročník 1956');
  ok(r.datum === null, 'NIS: bez dátumu v texte → datum null (vyberie lekár)');
}

/* ── ročník z RČ: storočie ── */
{
  ok(P._rokZRc('48') === 1948, 'RČ 48 → 1948');
  ok(P._rokZRc('04') === 2004, 'RČ 04 → 2004');
  ok(P._rokZRc('00') === 2000, 'RČ 00 → 2000');
}

/* ── dedup + prázdny vstup ── */
{
  const r = P.parseProgram('1. Mrkvička Ján 1948 RAS OIA\n1. Mrkvička Ján 1948 RAS OIA');
  ok(r.pacienti.length === 1, 'dedup: rovnaké meno+ročník len raz');
  ok(P.parseProgram('').pacienti.length === 0, 'prázdny vstup → žiadni pacienti');
  ok(P.parseProgram('dnešný program o 10:00 v knižnici').pacienti.length === 0, 'text bez pacientov → nič (čas bez mena+RČ)');
}

/* ── OCR šum pred poradovým číslom (okraje tabuľky z Wordu) ── */
{
  const r = P.parseProgram([
    '1 PIATOK 17.7. 2026',
    '4 1. Horváthová Helena 1946 DK OIA',
    'A“ 2. Melichárková Jana 1958 DK OIA',
    '4 A 3. Petrík Miroslav 1973 DK OIA',
    '| a 4. Pokorný František 1961 DK OIA',
    'Ä',
    'A Bratislava dňa 16.7. 2026 schválil: MUDr.Vincze Lukáš',
    '/ |'
  ].join('\n'));
  ok(r.pacienti.length === 4, 'OCR šum: 4 pacienti napriek prefixom pred číslom', r.pacienti.length);
  ok(r.pacienti[0].meno === 'Horváthová Helena' && r.pacienti[0].rocnik === 1946, 'OCR šum: „4 1." → meno + ročník');
  ok(r.pacienti[1].meno === 'Melichárková Jana', 'OCR šum: „A“ 2." → meno');
  ok(r.pacienti[2].meno === 'Petrík Miroslav' && r.pacienti[2].rocnik === 1973, 'OCR šum: „4 A 3." → meno');
  ok(r.pacienti[3].meno === 'Pokorný František' && r.pacienti[3].lozko === 'OIA' && r.pacienti[3].vykon === 'DK', 'OCR šum: „| a 4." → meno + výkon + lôžko');
  ok(r.datum === '2026-07-17', 'OCR šum: dátum z riadku PIATOK (nie zo „schválil")');
}

/* ── OCR fallback: číslo riadku úplne rozbité – stačí meno + rok narodenia ── */
{
  const r = P.parseProgram([
    'Katetrizačný program OIRA',
    'PIATOK 17.7. 2026',
    'Melichárková Jana 1958 DK OIA',            // číslo úplne chýba
    '—= Horváthová Helena 1946 DK+PTA OIA',     // číslo zožraté šumom
    'll Petrík Miroslav 1973 DK OIA',           // „1." prečítané ako „ll"
    'A Bratislava dňa 16.7. 2026 schválil: MUDr.Vincze Lukáš'
  ].join('\n'));
  ok(r.pacienti.length === 3, 'OCR fallback: 3 pacienti bez čitateľného čísla', r.pacienti.length);
  ok(r.pacienti[0].meno === 'Melichárková Jana' && r.pacienti[0].rocnik === 1958 && r.pacienti[0].vykon === 'DK' && r.pacienti[0].lozko === 'OIA', 'OCR fallback: meno+rok+výkon+lôžko');
  ok(r.pacienti[1].meno === 'Horváthová Helena' && r.pacienti[1].vykon === 'DK+PTA', 'OCR fallback: šum pred menom odpadne');
  ok(r.pacienti[2].meno === 'Petrík Miroslav', 'OCR fallback: „ll" pred menom odpadne (malé písmená sa do mena neberú zľava)');
  ok(r.datum === '2026-07-17', 'OCR fallback: dátum z hlavičky, riadok „schválil" nie je pacient');
}

/* ── OCR fallback nesmie robiť falošných pacientov z NIS Dôvodu ── */
{
  const r = P.parseProgram('08:00 Vzorka Milan 431031/107\nDôvod:\nAAA od 2019 sledované, progresia');
  ok(r.pacienti.length === 1 && r.pacienti[0].meno === 'Vzorka Milan', 'NIS: rok 2019 v Dôvode nevyrobí pacienta');
}

/* ── audit-fix regresia: fallback dátum nesmie brať dátum CT z Dôvodu ── */
{
  const r = P.parseProgram('08:00 Vzorka Milan 431031/107\nDôvod:\nCT 20.6.2026: AAA max. diameter 57 mm');
  ok(r.datum === null, 'audit: NIS bez hlavičky → datum null (nie dátum CT z Dôvodu)');
  const r2 = P.parseProgram('Katetrizačný program OIRA\nPONDELOK 13.7. 2026\n\n1. Vzorka Milan 1948 RAS OIA');
  ok(r2.datum === '2026-07-13', 'audit: hlavičkový dátum ostáva funkčný');
}

if (fails) { console.error(`\n${fails} testov importu zlyhalo.`); process.exit(1); }
console.log('\nVšetky testy importu programu prešli.');
