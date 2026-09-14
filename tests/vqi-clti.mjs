// Testy VQI CLTI modelu (tools/vqi-clti.js) proti oficiálnej kalkulačke SVS.
//
// Každý profil nižšie bol zadaný do svs-vqi.shinyapps.io/CRICalculators a zapísaný
// aj s výstupom. Appka zobrazuje "> 99%", keď je hodnota nad 99 %, inak zaokrúhľuje
// na celé percento – testy porovnávajú rovnakým spôsobom.
//
// Profily označené (kalibračné) boli použité na dopočet bét, ktoré sa nedali prevziať
// z publikácie. Profily označené (kontrolné) model pri kalibrácii nevidel.
// Spustenie: node tests/vqi-clti.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const V = require(join(dir, '../tools/vqi-clti.js'));

let fails = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log('✅', label);
  else { console.error('❌', label, extra ?? ''); fails++; }
};

// zobrazenie tak, ako ho robí appka SVS
const zobraz = p => (p === null ? 'n/a' : (100 * p > 99 ? '>99' : String(Math.round(100 * p))));

// referenčný profil – všetko na referenčnej úrovni
const Z = {
  vek: '<60', rasa: 'biela', indikacia: 'kludova_bolest', ichs: 'ziadna', sz: 'nie',
  chocbp: 'ziadna', ckd: '1', ambulacia: 'nezavisly', statin: 'nie',
  fajcenie: 'nikdy', betablokator: 'nie', antiagregans: 'nie'
};
const s = (zmeny) => ({ ...Z, ...zmeny });

const PROFILY = [
  ['Z  referent (kalibračný)', Z, '>99', '96', 'nizke'],
  ['#2 referent + vozík (kalibračný)', s({ ambulacia: 'vozik' }), '>99', '93', 'nizke'],
  ['#3 referent + ICHS IM/stabilná (kontrolný)', s({ ichs: 'im_stabilna' }), '>99', '95', 'nizke'],
  ['A  60-70, ICHS, CHOCHP, CKD3, vozík (kalibračný)',
    s({ vek: '60-70', ichs: 'im_stabilna', chocbp: 'liecena', ckd: '3', ambulacia: 'vozik',
        statin: 'ano', fajcenie: 'byvaly', antiagregans: 'ano' }), '98', '86', 'nizke'],
  ['B  71-80, tkan. strata, SZ, ležiaci (kalibračný)',
    s({ vek: '71-80', indikacia: 'tkanivova_strata', ichs: 'im_stabilna', sz: 'ano',
        chocbp: 'liecena', ckd: '3', ambulacia: 'leziaci', statin: 'ano',
        fajcenie: 'aktivny', antiagregans: 'ano' }), '88', '43', 'vysoke'],
  ['C  <60, tkan. strata, nestab. ICHS, SZ, CKD4 (kalibračný)',
    s({ indikacia: 'tkanivova_strata', ichs: 'nestabilna', sz: 'ano', ckd: '4',
        statin: 'ano', antiagregans: 'ano' }), '97', '81', 'nizke'],
  ['D  60-70, CHOCHP, CKD3, s pomocou, BB (kalibračný)',
    s({ vek: '60-70', chocbp: 'liecena', ckd: '3', ambulacia: 's_pomocou',
        fajcenie: 'aktivny', betablokator: 'ano' }), '99', '84', 'nizke'],
];

console.log('— Prežitie proti oficiálnej kalkulačke SVS —');
for (const [nazov, p, e30, e2r, eskup] of PROFILY) {
  const r = V.vypocitaj(p);
  ok(zobraz(r.prezitie30) === e30, `${nazov} · 30 dní = ${e30}`,
    `dostal ${zobraz(r.prezitie30)} (${(100 * r.prezitie30).toFixed(2)}%)`);
  ok(zobraz(r.prezitie2r) === e2r, `${nazov} · 2 roky = ${e2r}`,
    `dostal ${zobraz(r.prezitie2r)} (${(100 * r.prezitie2r).toFixed(2)}%)`);
  ok(r.skupina === eskup, `${nazov} · skupina = ${eskup}`, `dostal ${r.skupina}`);
}

console.log('\n— Monotónnosť —');
const pr2 = p => V.vypocitaj(p).prezitie2r;
ok(pr2(Z) > pr2(s({ ambulacia: 's_pomocou' })) &&
   pr2(s({ ambulacia: 's_pomocou' })) > pr2(s({ ambulacia: 'vozik' })) &&
   pr2(s({ ambulacia: 'vozik' })) > pr2(s({ ambulacia: 'leziaci' })),
   'horšia ambulácia = horšie 2-ročné prežitie');
ok(pr2(Z) > pr2(s({ ichs: 'im_stabilna' })) && pr2(s({ ichs: 'im_stabilna' })) > pr2(s({ ichs: 'nestabilna' })),
   'nestabilná ICHS je horšia než stabilná');
ok(pr2(s({ ckd: '1' })) > pr2(s({ ckd: '3' })) && pr2(s({ ckd: '3' })) > pr2(s({ ckd: '5' })),
   'vyššie štádium CKD = horšie prežitie');
ok(pr2(s({ statin: 'ano' })) > pr2(s({ statin: 'nie' })), 'statín zlepšuje 2-ročné prežitie');

console.log('\n— Rizikové skupiny podľa publikovaných hraníc —');
ok(V.rizikovaSkupina(0.98, 0.75) === 'nizke', 'nízke: > 97 % a > 70 %');
ok(V.rizikovaSkupina(0.96, 0.60) === 'stredne', 'stredné: 95–97 % a 50–70 %');
ok(V.rizikovaSkupina(0.94, 0.80) === 'vysoke', 'vysoké: 30-dňové < 95 % samo osebe');
ok(V.rizikovaSkupina(0.99, 0.45) === 'vysoke', 'vysoké: 2-ročné < 50 % samo osebe');
ok(V.rizikovaSkupina(0.975, 0.65) === 'stredne', 'hranica: 97,5 % / 65 % → stredné');

console.log('\n— Neúplné a neplatné vstupy —');
{
  const r = V.vypocitaj({ vek: '60-70' });
  ok(r.prezitie30 === null && r.prezitie2r === null, 'neúplný vstup nevráti číslo');
  ok(r.skupina === null, 'neúplný vstup nezaradí do skupiny');
  ok(r.chybajuce.length > 0 && r.chybajuce.includes('ckd'), 'vymenuje, čo chýba');
}
{
  const r = V.vypocitaj(s({ ckd: '7' }));
  ok(r.prezitie30 === null && r.prezitie2r === null, 'neznáma kategória nevráti číslo');
}
{
  const r = V.vypocitaj(Z);
  ok(r.chybajuce.length === 0, 'kompletný vstup nehlási nič chýbajúce');
  ok(r.nazovSkupiny === 'Nízke riziko', 'skupina má slovenský názov');
}

if (fails) { console.error(`\n${fails} testov VQI zlyhalo.`); process.exit(1); }
console.log('\nVšetky testy VQI prešli.');
