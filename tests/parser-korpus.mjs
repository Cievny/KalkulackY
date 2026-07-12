// Korpusové testy parsera anamnézy – REÁLNE (anonymizované) správy + zlatý štandard.
// Spustenie: node tests/parser-korpus.mjs   (beží aj v CI)
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const P = require(join(dirname(fileURLToPath(import.meta.url)), '../tools/anamneza-parser.js'));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '✅' : '❌') + ' ' + n + (c ? '' : '   ← ' + (x || ''))); if (!c) fail++; };
const load = f => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'parser-korpus', f), 'utf8');
const byKod = (r, k) => r.found.find(f => f.kod === k);

/* ── správa 01: prepúšťacia správa, DSA karotíd, konzervatívny postup ──
   Zlatý štandard: DM2 na PAD, AH (kompenzovaná? kombinovaná liečba), DLP+statín,
   ICHS (CHKS, st.p. PKI), st.p. IM (STEMI 2011), st.p. CMP (iNCMP), NEfajčiar,
   BEZ CKD (krea 56; CKD-EPI je len vzorec), BEZ obezity (BMI 27), ASA + Trombex. */
{
  const r = P.parse(load('sprava01.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;

  ok('01: DM2 isté (E11 kód)', byKod(r, 'dm') && byKod(r, 'dm').certain && d.dm.typ === 'DM2', JSON.stringify(d.dm));
  ok('01: DM liečba OAD (explicitné „na PAD", nie nemocničný Humulin)', d.dm.liecba === 'OAD', d.dm && d.dm.liecba);
  ok('01: AH isté (I10 kód)', byKod(r, 'ah') && byKod(r, 'ah').certain);
  ok('01: AH kombinovaná liečba (detail)', d.ah_liecba === 'kombinovan', d.ah_liecba);
  ok('01: dyslipidémia istá (E78 kód + DLP)', byKod(r, 'dysl') && byKod(r, 'dysl').certain);
  ok('01: dyslipidémia so statínom', d.dysl && d.dysl.statin === true);
  ok('01: ICHS nájdené (CHKS / st.p. PKI)', d.ichs === true);
  ok('01: st.p. IM nájdené (STEMI 2011)', d.im === true);
  ok('01: st.p. CMP nájdené (iNCMP)', d.cmp === true);
  ok('01: fajčenie NEnájdené (nefajčiar!)', !k.includes('faj'), JSON.stringify(k));
  ok('01: CKD NEnájdené (krea 56 norm.; CKD-EPI je vzorec)', !k.includes('chri'), JSON.stringify(byKod(r, 'chri')));
  ok('01: obezita NEnájdená (BMI 27.43)', !k.includes('obez'));
  ok('01: ASA nájdené (Anopyrín)', d.atb.asa === true);
  ok('01: klopidogrel nájdený (Trombex vo „V užívaní")', d.atb.klopidogrel === true);
  ok('01: RČ žiadne (anonymizované) a nič falošné', !d.rodne_cislo, d.rodne_cislo);
  ok('01: všetky nálezy majú citácie', r.found.every(f => f.kod === 'rc' || (f.quote && f.quote.length > 3)),
     r.found.filter(f => !f.quote && f.kod !== 'rc').map(f => f.kod).join());
}

console.log(fail ? `\n${fail} korpusových testov ZLYHALO` : '\nVšetky korpusové testy prešli.');
process.exit(fail ? 1 : 0);
