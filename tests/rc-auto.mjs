// Testy odvodenia pohlavia/veku z rodného čísla (node tests/rc-auto.mjs).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parse } = require('../tools/rc-auto.js');

let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('✅ ' + n)) : (fail++, console.log('❌ ' + n)); };

// muž 1948 (4-miestna prípona neplatná pred 54 → tu 48 = 1948, 3-miestna)
let p = parse('481205/123', '2026-08-03');
ok(p && !p.zena && p.rok === 1948, 'muž 481205 → muž, rok 1948');
ok(p && p.vek === 77, 'vek k 3.8.2026 = 77 (narodeniny 5.12. ešte neboli)');

// žena +50
p = parse('485112/1234', '2026-08-03');
ok(p && p.zena && p.rok === 1948 && p.mesiac === 1, 'žena 4851.. → žena, január 1948');

// žena narodená PO dátume výkonu v roku → vek -1
p = parse('506224/321', '2026-06-01');
ok(p && p.zena && p.vek === 75, 'žena 24.12.1950 k 1.6.2026 = 75');

// rok 2004+ preplnenie (+20 na mesiaci): 045221 = žena, feb… mm=52-50=2? 52→ž,2
p = parse('045224/1234', '2026-08-03');
ok(p && p.zena && p.rok === 2004, '04xx so 4-misc príponou → 2004');

// preplnenie sérií: mesiac 21–32 (muž po r. 2004)
p = parse('062501/5678', '2026-08-03');
ok(p && !p.zena && p.mesiac === 5 && p.rok === 2006, 'mesiac 25 → muž, máj (preplnenie +20)');

// neplatný mesiac → null
ok(parse('991501/123') === null, 'mesiac 15 (nie 51+) → neplatné RČ');
// prikrátke → null
ok(parse('12345') === null, 'krátky vstup → null');
// s lomkou aj bez nej rovnaké
const a = parse('4851121234', '2026-01-01'), b = parse('485112/1234', '2026-01-01');
ok(a && b && a.rok === b.rok && a.zena === b.zena, 'lomka nehrá rolu');

// rok 1953 s 3-miestnou príponou
p = parse('530101/999', '2026-08-03');
ok(p && p.rok === 1953, '53 s 3-miestnou → 1953');

console.log(`\n${pass} prešlo, ${fail} zlyhalo`);
if (fail) process.exit(1);
