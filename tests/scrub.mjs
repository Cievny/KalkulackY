// Testy lokálneho scrubbera osobných údajov (node tests/scrub.mjs).
// Overia, že identifikátory pacienta padnú a klinický obsah prežije.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { scrub, zhrnutie } = require('../tools/scrub.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('✅ ' + name); } else { fail++; console.log('❌ ' + name); } }
function ziadne(clean, re, name) { ok(!re.test(clean), name); }
function obsahuje(clean, s, name) { ok(clean.includes(s), name); }

// ── realistický (vymyslený) text žiadanky ──
const ziadanka = `Odosielajúci lekár: MUDr. Peter Kováč, PhD.
Pacient: Mrkvička Ján, 481205/1234, bytom Nitra, tel. 0905 123 456
Poistenec: 4812051234, VšZP
Nar. 5.12.1948, lôžko č. 7
CT AG z 14.3.2026: infrarenálna AAA, max. diameter 58 mm, krčok dĺžka 22 mm,
angulácia 45°. AIC l.dx 14 mm. Asymptomatický. Navrhujeme EVAR.
Kontakt: kovac.peter@nemocnica.sk`;

const r1 = scrub(ziadanka);
console.log('  hits:', zhrnutie(r1.hits));
ziadne(r1.clean, /481205\s*\/\s*1234/, 'RČ 481205/1234 odstránené');
ziadne(r1.clean, /Mrkvička/, 'priezvisko pacienta odstránené');
ziadne(r1.clean, /Kováč/, 'meno lekára odstránené');
ziadne(r1.clean, /0905\s*123\s*456/, 'telefón odstránený');
ziadne(r1.clean, /4812051234/, 'číslo poistenca odstránené');
ziadne(r1.clean, /5\.12\.1948/, 'dátum narodenia odstránený');
ziadne(r1.clean, /kovac\.peter@/, 'e-mail odstránený');
ziadne(r1.clean, /Nitra/, 'obec (bytom Nitra) odstránená');
ziadne(r1.clean, /lôžko č\. 7|lôžko\s*č\.?\s*7/i, 'lôžko odstránené');
// klinický obsah MUSÍ prežiť
obsahuje(r1.clean, '58 mm', 'priemer 58 mm ostal');
obsahuje(r1.clean, 'AAA', 'skratka AAA ostala');
obsahuje(r1.clean, 'krčok dĺžka 22 mm', 'krčok ostal');
obsahuje(r1.clean, 'AIC l.dx 14 mm', 'AIC rozmer ostal');
obsahuje(r1.clean, 'Asymptomatický', 'klinický stav ostal');
obsahuje(r1.clean, 'EVAR', 'navrhovaný výkon ostal');

// ── program (riadok Word OIRA) ──
const program = `1. Novák Jozef 1955  CAS l.sin  OIA
2. Horváthová Mária 1962  PEVAR  OIRA`;
const r2 = scrub(program);
ziadne(r2.clean, /Novák|Horváthová/, 'mená z programu odstránené (prísny režim)');
obsahuje(r2.clean, 'CAS l.sin', 'výkon CAS ostal');
obsahuje(r2.clean, 'PEVAR', 'výkon PEVAR ostal');

// ── konzervatívny režim: bez agresívneho mazania Veľkých dvojíc ──
const r3 = scrub('Kontrolné CT o 12 mesiacov, aneuryzma stabilná 52 mm', { aggressive: false });
obsahuje(r3.clean, 'Kontrolné CT', 'konzervatívny režim nezmaže „Kontrolné CT"');
obsahuje(r3.clean, '52 mm', 'rozmer ostal v konzervatívnom režime');

// ── nič citlivé → žiadne zásahy ──
const r4 = scrub('AAA 55 mm, asymptomatická, plán EVAR');
ok(r4.hits.length === 0, 'čistý klinický text = 0 zásahov');

// ── evidenčné číslo (nie RČ) sa neoznačí ako RČ ──
const r5 = scrub('Žiadanka č. 993456/2026 na výkon');
ok(!r5.hits.some(h => h.type === 'rc'), 'evidenčné 993456/2026 nie je RČ (zlý YYMMDD)');

console.log(`\n${pass} prešlo, ${fail} zlyhalo`);
if (fail) process.exit(1);
