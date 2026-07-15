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

/* ── správa 02: CLTI, DEB PTA, nefajčiar, DM na PAD a IT (inzulinoterapia) ── */
{
  const r = P.parse(load('sprava02.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('02: DM2 isté + liečba OAD+inzulín („na PAD a IT")', d.dm && d.dm.typ === 'DM2' && d.dm.liecba === 'OAD+inzulín', JSON.stringify(d.dm));
  ok('02: AH isté', d.ah === true);
  ok('02: dyslipidémia + statín (Rozor/Rosazimib)', d.dysl && d.dysl.statin === true);
  ok('02: ICHS/IM/CMP NEnájdené', !k.includes('ichs') && !k.includes('im') && !k.includes('cmp'), JSON.stringify(k));
  ok('02: nefajčiar → bez fajčenia', !k.includes('faj'));
  ok('02: CKD/obezita NEnájdené (krea 84, BMI 22.7)', !k.includes('chri') && !k.includes('obez'));
  ok('02: DAPT (Preventax/Anopyrin + Trombex)', d.atb.dapt === true);
  ok('02: vek 79 M z textu', d.vek === 79 && d.pohlavie === 'M', JSON.stringify([d.vek, d.pohlavie]));
}

/* ── správa 03: fajčiar, hypertenzná urgencia; DM2+CKD LEN z vloženej OIRA správy ── */
{
  const r = P.parse(load('sprava03.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('03: AH istá + „zle kompenzovaná" detail', d.ah === true && d.ah_komp === 'nekompenzovan', JSON.stringify(d.ah_komp));
  ok('03: fajčiar aktívny (T65.2 + text), nie ex', d.faj === true && !d.faj_ex);
  ok('03: dyslipidémia + statín (Sorvasta)', d.dysl && d.dysl.statin === true);
  ok('03: DAPT (Anopyrin + Trombex)', d.atb.dapt === true);
  const dm3 = byKod(r, 'dm'), ch3 = byKod(r, 'chri');
  ok('03: DM len z vloženej OIRA správy – citácia to ukáže', dm3 && /Komorbidity/.test(dm3.quote), dm3 && dm3.quote);
  ok('03: CKD len z vloženej OIRA správy – citácia to ukáže', ch3 && /Komorbidity|monoterapia/.test(ch3.quote), ch3 && ch3.quote);
  ok('03: ICHS/IM/CMP NEnájdené', !k.includes('ichs') && !k.includes('im') && !k.includes('cmp'), JSON.stringify(k));
  ok('03: vek 73 M', d.vek === 73 && d.pohlavie === 'M');
}

/* ── správa 04: mladá pacientka, SMAS – takmer bez komorbidít ── */
{
  const r = P.parse(load('sprava04.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('04: žiadne falošné komorbidity', !k.includes('dm') && !k.includes('ah') && !k.includes('ichs') && !k.includes('im') && !k.includes('cmp') && !k.includes('chri') && !k.includes('obez') && !k.includes('dysl') && !k.includes('chochp'), JSON.stringify(k));
  ok('04: fajčí do 20 denne → fajčiarka', d.faj === true && !d.faj_ex);
  ok('04: DAPT (Stadapyrin + Trombex)', d.atb.dapt === true);
  ok('04: vek 34 Ž z textu', d.vek === 34 && d.pohlavie === 'Ž', JSON.stringify([d.vek, d.pohlavie]));
}

/* ── správa 05: fajčiarka, pelvic PTA; CMP brata v RA sa NESMIE preniesť ── */
{
  const r = P.parse(load('sprava05.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('05: CMP NEnájdené (brat v RA!)', !k.includes('cmp'), JSON.stringify(k));
  ok('05: AH istá (I10)', d.ah === true);
  ok('05: dyslipidémia + statín (Torvacard)', d.dysl && d.dysl.statin === true);
  ok('05: fajčiarka aktívna', d.faj === true && !d.faj_ex);
  ok('05: DM/CKD/obezita/IM/ICHS NEnájdené', !k.includes('dm') && !k.includes('chri') && !k.includes('obez') && !k.includes('im') && !k.includes('ichs'));
  ok('05: DAPT (Aspirin + Trombex)', d.atb.dapt === true);
  ok('05: vek 65 Ž', d.vek === 65 && d.pohlavie === 'Ž', JSON.stringify([d.vek, d.pohlavie]));
}

/* ── správa 06: bez AH/DM – len dyslipidémia + fajčiar; „Dobraté" riadok ── */
{
  const r = P.parse(load('sprava06.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('06: AH NEnájdená (pacient ju nemá!)', !k.includes('ah'), JSON.stringify(k));
  ok('06: DM/CMP/IM/ICHS/CKD/obezita NEnájdené', !k.includes('dm') && !k.includes('cmp') && !k.includes('im') && !k.includes('ichs') && !k.includes('chri') && !k.includes('obez'));
  ok('06: dyslipidémia + statín (Sorvasta)', d.dysl && d.dysl.statin === true);
  ok('06: fajčiar aktívny', d.faj === true && !d.faj_ex);
  ok('06: DAPT (Anopyrin + Trombex vo V užívaní)', d.atb.dapt === true);
  ok('06: vek 66 M', d.vek === 66 && d.pohlavie === 'M');
}

/* ── správa 07: TEVAR – CKD N18.3 + krea 199, obezita E66+BMI, exfajčiar, NOAK ── */
{
  const r = P.parse(load('sprava07.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('07: CKD isté (N18.3) + krea 199', byKod(r, 'chri') && byKod(r, 'chri').certain && d.chri.krea === 199, JSON.stringify(d.chri));
  ok('07: obezita istá (E66 + BMI 39.33)', d.obez === true && d.obez_bmi > 39 && d.obez_bmi < 40, JSON.stringify(d.obez_bmi));
  ok('07: ICHS (chronický koronárny sy./koronárna AS choroba)', d.ichs === true);
  ok('07: st.p. IM (STEMI)', d.im === true);
  ok('07: exfajčiar', d.faj === true && d.faj_ex === true);
  ok('07: AH istá', d.ah === true);
  ok('07: dyslipidémia', !!d.dysl);
  ok('07: DM NEnájdené (len hyperglykémia nalačno)', !k.includes('dm'), JSON.stringify(byKod(r, 'dm')));
  ok('07: CMP NEnájdené', !k.includes('cmp'));
  ok('07: NOAK (Vixargio), bez ASA/klopidogrelu', d.atb.noak === true && !d.atb.asa && !d.atb.klopidogrel && !d.atb.dapt, JSON.stringify(d.atb));
  ok('07: vek 68 M', d.vek === 68 && d.pohlavie === 'M', JSON.stringify([d.vek, d.pohlavie]));
}

/* ── správa 08: PEVAR – DM2 na diéte (metformín UKONČENÝ), NCMP, KACH, Xanirva ── */
{
  const r = P.parse(load('sprava08.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('08: DM2 isté + liečba diéta (ukončený metformín sa nepočíta)', d.dm && d.dm.typ === 'DM2' && d.dm.liecba === 'diéta', JSON.stringify(d.dm));
  ok('08: st.p. CMP (NCMP v oblasti ponsu)', d.cmp === true);
  ok('08: ICHS (KACH/koronárna choroba srdca)', d.ichs === true);
  ok('08: IM NEnájdené', !k.includes('im'), JSON.stringify(k));
  ok('08: exfajčiar', d.faj === true && d.faj_ex === true);
  ok('08: AH + dyslipidémia (Zetovar/Atoritimb statín)', d.ah === true && d.dysl && d.dysl.statin === true);
  ok('08: CKD NEnájdené (krea 76–90, CKD-EPI vzorec)', !k.includes('chri'));
  ok('08: NOAK (Xanirva) + ASA, bez DAPT', d.atb.noak === true && d.atb.asa === true && !d.atb.klopidogrel && !d.atb.dapt, JSON.stringify(d.atb));
  ok('08: vek 70 M', d.vek === 70 && d.pohlavie === 'M');
}

/* ── správa 09 (2016, starší formát): PEVAR – len dyslipidémia + obezita + DAPT ── */
{
  const r = P.parse(load('sprava09.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('09: dyslipidémia istá (E78) + statín (Atoris)', byKod(r, 'dysl') && byKod(r, 'dysl').certain && d.dysl.statin === true);
  ok('09: obezita istá (E66 + BMI 31.13)', d.obez === true && d.obez_bmi >= 31 && d.obez_bmi < 32, JSON.stringify(d.obez_bmi));
  ok('09: DM NEnájdené (matka v RA; GLU v labe sa neinferuje)', !k.includes('dm'), JSON.stringify(byKod(r, 'dm')));
  ok('09: AH NEnájdená (pacient ju nemá)', !k.includes('ah'));
  ok('09: fajčenie NEnájdené (nefajčiar)', !k.includes('faj'));
  ok('09: ICHS/IM/CMP/CKD/CHOCHP NEnájdené', !k.includes('ichs') && !k.includes('im') && !k.includes('cmp') && !k.includes('chri') && !k.includes('chochp'), JSON.stringify(k));
  ok('09: DAPT (Aspirin protect + Trombex; Zyllt v odporúčaní sa ignoruje)', d.atb.dapt === true, JSON.stringify(d.atb));
  ok('09: vek 71 M („71- ročný pacient" s medzerou)', d.vek === 71 && d.pohlavie === 'M', JSON.stringify([d.vek, d.pohlavie]));
}

/* ── správa 10: ambulantné vyšetrenie (OA:/LA:/AA: formát, preklepy) ── */
{
  const r = P.parse(load('sprava10.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('10: AH istá (Art. hypertenzia 3. st. v OA)', d.ah === true);
  ok('10: dyslipidémia (HLp) + statín (Atoris v LA)', d.dysl && d.dysl.statin === true, JSON.stringify(d.dysl));
  ok('10: NOAK (Pradaxa v LA)', d.atb.noak === true);
  ok('10: DM/ICHS/IM/CMP/CKD/obezita/fajčenie NEnájdené', !k.includes('dm') && !k.includes('ichs') && !k.includes('im') && !k.includes('cmp') && !k.includes('chri') && !k.includes('obez') && !k.includes('faj'), JSON.stringify(k));
  ok('10: vek neznámy (v ambulantnom náleze nie je)', d.vek === null, JSON.stringify(d.vek));
}

/* ── správa 11: hospitalizácia PEVAR – ICHS I25.8, CKD N18.1+krea 130, FiA na NOAK ── */
{
  const r = P.parse(load('sprava11.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('11: AH istá (I10)', d.ah === true);
  ok('11: ICHS istá (I25.8 + NYHA II text)', byKod(r, 'ichs') && byKod(r, 'ichs').certain);
  ok('11: CKD isté (N18.1) + krea 130', byKod(r, 'chri') && byKod(r, 'chri').certain && d.chri.krea === 130, JSON.stringify(d.chri));
  ok('11: dyslipidémia (HLP) + statín (Atoris)', d.dysl && d.dysl.statin === true);
  ok('11: NOAK (dabigatran/Pradaxa) + LMWH (Fraxiparine)', d.atb.noak === true && d.atb.lmwh === true, JSON.stringify(d.atb));
  ok('11: DM/IM/CMP/obezita/fajčenie NEnájdené (nefajčí; hypoperfúzia ≠ IM)', !k.includes('dm') && !k.includes('im') && !k.includes('cmp') && !k.includes('obez') && !k.includes('faj'), JSON.stringify(k));
  ok('11: vek 80 M (nie 81letý z CZ výkonu nižšie)', d.vek === 80 && d.pohlavie === 'M', JSON.stringify([d.vek, d.pohlavie]));
}

/* ── správa 12: čistý CT popis – parser NESMIE nič vymyslieť ── */
{
  const r = P.parse(load('sprava12.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('12: žiadne komorbidity z CT popisu', !k.includes('dm') && !k.includes('ah') && !k.includes('ichs') && !k.includes('im') && !k.includes('cmp') && !k.includes('chri') && !k.includes('obez') && !k.includes('dysl') && !k.includes('faj') && !k.includes('chochp'), JSON.stringify(k));
  ok('12: žiadne antitrombotiká', !r.found.some(f => f.kod === 'atb'), JSON.stringify(d.atb));
}

/* ── správa 13: 2. ambulantná kontrola po PEVAR (S:, Kreat. s dátumom, endoleak) ── */
{
  const r = P.parse(load('sprava13.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  ok('13: AH + ICHS + dyslipidémia so statínom', d.ah === true && d.ichs === true && d.dysl && d.dysl.statin === true);
  ok('13: NOAK (Pradaxa/dabigatran)', d.atb.noak === true && !d.atb.asa && !d.atb.dapt);
  ok('13: „Kreat.: 11.2.2021: 112" nezmätie parser (žiadne CKD, žiadna krea=11)', !k.includes('chri'), JSON.stringify(d.chri));
  ok('13: DM/IM/CMP/fajčenie/obezita NEnájdené', !k.includes('dm') && !k.includes('im') && !k.includes('cmp') && !k.includes('faj') && !k.includes('obez'), JSON.stringify(k));
  ok('13: vek neznámy (v kontrole nie je)', d.vek === null);
}

/* ── správa 14: PEVAR s ischémiou obličky – AKI (krea 99→255), prechodná ren. insuf. ── */
{
  const r = P.parse(load('sprava14.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  const ch = byKod(r, 'chri');
  ok('14: renálna insuf. ako NEISTÝ návrh (prechodná ≠ chronická CKD)', ch && !ch.certain, JSON.stringify(ch && {c: ch.certain, l: ch.label}));
  ok('14: kreatinín = MAXIMUM z celého textu (255, nie prvý 99)', d.chri && d.chri.krea === 255, JSON.stringify(d.chri));
  ok('14: AH istá (I10 + 2.st text)', d.ah === true);
  ok('14: obezita (BMI 38.89)', d.obez === true && d.obez_bmi > 38 && d.obez_bmi < 39);
  ok('14: stopfajčiar → exfajčiar', d.faj === true && d.faj_ex === true);
  ok('14: ASA (Anopyrin); Clexane v Dobratých sa ignoruje; Trombex len v odporúčaní', d.atb.asa === true && !d.atb.lmwh && !d.atb.klopidogrel && !d.atb.dapt, JSON.stringify(d.atb));
  ok('14: DM/ICHS/IM/CMP/dyslipidémia NEnájdené', !k.includes('dm') && !k.includes('ichs') && !k.includes('im') && !k.includes('cmp') && !k.includes('dysl'), JSON.stringify(k));
  ok('14: vek 66 M (SK text, nie 67letý z CZ protokolu)', d.vek === 66 && d.pohlavie === 'M');
}

/* ── správa 15: kontrolná hospitalizácia – CKD G4 (N18.4) už CHRONICKÁ, sepsa ── */
{
  const r = P.parse(load('sprava15.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  const ch = byKod(r, 'chri');
  ok('15: CKD ISTÉ (kód N18.4 prebije prechodnú formuláciu)', ch && ch.certain, JSON.stringify(ch && ch.certain));
  ok('15: kreatinín max 241', d.chri && d.chri.krea === 241, JSON.stringify(d.chri));
  ok('15: AH + obezita + exfajčiar + ASA', d.ah === true && d.obez === true && d.faj_ex === true && d.atb.asa === true);
  ok('15: DM/ICHS/IM/CMP/dyslipidémia NEnájdené', !k.includes('dm') && !k.includes('ichs') && !k.includes('im') && !k.includes('cmp') && !k.includes('dysl'), JSON.stringify(k));
  ok('15: vek 66 M', d.vek === 66 && d.pohlavie === 'M');
}

/* ── správa 16: krátka amb kontrola (OA:/LA:/TO:/OBJ:), kreat 171 inline ── */
{
  const r = P.parse(load('sprava16.txt'), 'sk');
  const k = r.found.map(f => f.kod);
  const d = r.data;
  const ch = byKod(r, 'chri');
  ok('16: AH istá (text v OA)', d.ah === true);
  ok('16: kreat 171 → neistý CKD návrh', ch && !ch.certain && d.chri.krea === 171, JSON.stringify(d.chri));
  ok('16: ASA (Anopyrín v LA)', d.atb.asa === true);
  ok('16: DM/dyslipidémia/fajčenie/ICHS NEnájdené', !k.includes('dm') && !k.includes('dysl') && !k.includes('faj') && !k.includes('ichs'), JSON.stringify(k));
  ok('16: vek neznámy', d.vek === null);
}

/* ── syntetické: fajčenie – nikotinizmus vs. exnikotinizmus ── */
{
  const r = P.parse('OA: Exnikotinizmus, art. hypertenzia', 'sk');
  const f = byKod(r, 'faj');
  ok('synt: Exnikotinizmus → exfajčiar', f && f.patch.faj === true && f.patch.faj_ex === true, JSON.stringify(f?.patch));
}
{
  const r = P.parse('OA: chronický nikotinizmus, art. hypertenzia', 'sk');
  const f = byKod(r, 'faj');
  ok('synt: chronický nikotinizmus → aktívny fajčiar', f && f.patch.faj === true && !f.patch.faj_ex, JSON.stringify(f?.patch));
}
{
  const r = P.parse('OA: st.p. nikotinizme (10 rokov nefajčí)', 'sk');
  const f = byKod(r, 'faj');
  ok('synt: st.p. nikotinizme → exfajčiar', f && f.patch.faj_ex === true, JSON.stringify(f?.patch));
}

/* ── audit: negácia vymenovania + skratková bodka ── */
{
  const kod = txt => P.parse(txt, 'sk').found.map(f => f.kod);
  ok('audit: „neguje DM, ICHS, CMP" negované všetky', !kod('OA: neguje DM, ICHS, CMP').some(k => ['dm', 'ichs', 'cmp'].includes(k)));
  ok('audit: „bez zn. ICHS" negované', !kod('OA: bez zn. ICHS').includes('ichs'));
  ok('audit: „bez evid. ICHS, AH na terapii" – ICHS preč, AH ostáva', !kod('OA: bez evid. ICHS, AH na terapii').includes('ichs') && kod('OA: bez evid. ICHS, AH na terapii').includes('ah'));
  ok('audit: „…, ICHS prítomná" ostáva pozitívne', kod('OA: neguje alergie, ICHS prítomná').includes('ichs'));
  ok('audit: „bez ICHS. DM na inzulíne" – DM nie je falošne negované', kod('OA: bez ICHS. DM na inzulíne').includes('dm'));
  ok('audit: „DM neguje" postfix negované', !kod('OA: DM neguje').includes('dm'));
}

console.log(fail ? `\n${fail} korpusových testov ZLYHALO` : '\nVšetky korpusové testy prešli.');
process.exit(fail ? 1 : 0);
