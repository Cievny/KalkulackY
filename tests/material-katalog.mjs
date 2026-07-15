// Testy materiálového registra (normalizácia + mapovanie z EVK/PEVAR payloadov)
// Spustenie: node tests/material-katalog.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const M = require(join(dir, '../tools/material-katalog.js'));

let fails = 0;
const ok = (c, l, x) => { if (c) console.log('✅', l); else { console.error('❌', l, x ?? ''); fails++; } };

/* ── normalizácia ── */
ok(M.normalizuj('pulsar').nazov === 'Pulsar' && M.normalizuj('PULSAR-18').vyrobca === 'Biotronik', 'normalizuj: Pulsar (case/prípona)');
ok(M.normalizuj('Eluvia').kategoria === 'DES', 'normalizuj: Eluvia = DES');
ok(M.normalizuj('in.pact').nazov === 'IN.PACT' && M.normalizuj('IN PACT Admiral').kategoria === 'DEB', 'normalizuj: IN.PACT varianty');
ok(M.normalizuj('Endurant II').kategoria === 'stentgraft', 'normalizuj: Endurant = stentgraft');
ok(M.normalizuj('NeznámeZariadenie X', 'balón').kategoria === 'balón' && M.normalizuj('NeznámeZariadenie X', 'balón').nazov === 'NeznámeZariadenie X', 'normalizuj: neznáme → originál + fallback kategória');
ok(M._rozmery('18-166-16').priemer === 18 && M._rozmery('18-166-16').dlzka === 166, 'rozmery: 18-166-16');
ok(M._rozmery('36x120').priemer === 36 && M._rozmery('36x120').dlzka === 120, 'rozmery: 36x120');
ok(M._rozmery('').priemer === null, 'rozmery: prázdne');

/* ── EVK intervencie_detail → riadky ── */
{
  const det = [
    { typ: 'pta', tepna: 'AFS l.dx.', nazov: 'Armada', priemer: '5', dlzka: '120', lezia_mm: '150' },
    { typ: 'deb', tepna: 'AFS l.dx.', nazov: 'IN.PACT', priemer: '6', dlzka: '150' },
    { typ: 'stent', tepna: 'AFS l.dx.', stent_typ: 'DES', stent_nazov: 'Eluvia', priemer: '6', dlzka: '120' },
    { typ: 'stent', tepna: 'AIC l.sin.', stent_typ: 'samoexpandibilný', stent_nazov: 'Pulsar', priemer: '7', dlzka: '80' },
    { typ: 'ivl', tepna: 'AFC l.dx.', nazov: 'Shockwave', priemer: '7', dlzka: '60', pulzy: '300' },
    { typ: 'trombektomia', tepna: 'APo l.dx.', metoda: 'Rotarex', velkost: '8' },
    { typ: 'stentgraft', subtyp: 'CERAB', segment: 'aorta', stent_nazov: 'BeGraft', priemer: '12', dlzka: '39' },
    { typ: 'pta', tepna: '– tepna –' } // prázdny riadok → preskočiť
  ];
  const rows = M.rowsFromEvk(det);
  ok(rows.length === 7, 'EVK: 7 riadkov (prázdny preskočený)', JSON.stringify(rows.map(r => r.nazov)));
  ok(rows[0].kategoria === 'balón' && rows[0].nazov === 'Armada' && rows[0].priemer_mm === 5 && rows[0].dlzka_mm === 120 && rows[0].tepna === 'AFS l.dx.', 'EVK: PTA balón s rozmermi a tepnou');
  ok(rows[1].kategoria === 'DEB' && rows[1].vyrobca === 'Medtronic', 'EVK: DEB IN.PACT');
  ok(rows[2].kategoria === 'DES' && rows[2].nazov === 'Eluvia', 'EVK: DES podľa stent_typ');
  ok(rows[3].kategoria === 'BMS' && rows[3].nazov === 'Pulsar', 'EVK: BMS default');
  ok(rows[4].kategoria === 'IVL' && rows[4].nazov === 'Shockwave', 'EVK: IVL');
  ok(rows[5].kategoria === 'trombektómia' && rows[5].nazov === 'Rotarex' && rows[5].priemer_mm === 8, 'EVK: Rotarex 8F');
  ok(rows[6].kategoria === 'krytý stent (CERAB)' && rows[6].nazov === 'BeGraft', 'EVK: CERAB BeGraft');
}

/* ── PEVAR payload → riadky ── */
{
  const p = {
    vykon_id: 'PEVAR-2026-001', datum: '2026-07-15',
    sg_nazov: 'Endurant', sg_rozmery: '28-166-16',
    extenzie_detail: JSON.stringify([{ strana: 'l.dx.', nazov: 'Endurant', rozmery: '16x124' }, { strana: 'l.sin.', nazov: '', rozmery: '' }]),
    vetvy_detail: JSON.stringify([{ cieva: 'a. renalis l.dx.', typ: 'fenestrácia', bridging: 'BeGraft', rozmer: '6x38' }]),
    sac_fill_pocet: 8,
    modelovanie_telo_balon: 'CODA',
    modelovanie_extenzie_balon: 'Atlas', modelovanie_extenzie_rozmer: '14'
  };
  const rows = M.rowsFromPevar(p);
  ok(rows.length === 6, 'PEVAR: 6 riadkov (prázdna extenzia preskočená)', JSON.stringify(rows.map(r => r.nazov)));
  ok(rows[0].kategoria === 'stentgraft' && rows[0].nazov === 'Endurant II' && rows[0].priemer_mm === 28 && rows[0].dlzka_mm === 166, 'PEVAR: SG telo z rozmerov 28-166-16');
  ok(rows[1].kategoria === 'SG extenzia' && rows[1].tepna === 'iliaka l.dx.', 'PEVAR: extenzia so stranou');
  ok(rows[2].kategoria === 'bridging stent' && rows[2].nazov === 'BeGraft' && rows[2].tepna === 'a. renalis l.dx.', 'PEVAR: bridging do renálky');
  ok(rows[3].kategoria === 'embolizačný plug' && rows[3].pocet === 8, 'PEVAR: 8 plugov ako jeden riadok s počtom');
  ok(rows[4].nazov === 'CODA' && rows[5].nazov === 'Atlas Gold' && rows[5].priemer_mm === 14, 'PEVAR: modelovacie balóny');
}

/* ── sync (mock fetch) ── */
{
  const calls = [];
  globalThis.fetch = (url, opts) => { calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null }); return Promise.resolve({ ok: true, status: 200 }); };
  const done = await M.syncMaterial('https://x.supabase.co', { apikey: 'k' }, 'evk', 'EVK-2026-001', '2026-07-15', [{ kategoria: 'balón', nazov: 'Armada', pocet: 1 }]);
  ok(done === true, 'sync: prebehne');
  ok(calls[0].method === 'DELETE' && calls[0].url.includes('zdroj=eq.evk') && calls[0].url.includes('vykon_id=eq.EVK-2026-001'), 'sync: najprv DELETE starých riadkov výkonu');
  ok(calls[1].method === 'POST' && calls[1].body[0].zdroj === 'evk' && calls[1].body[0].vykon_id === 'EVK-2026-001' && calls[1].body[0].datum === '2026-07-15', 'sync: POST s metadátami výkonu');
  // chýbajúca tabuľka → false, žiadna výnimka
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 404 });
  ok(await M.syncMaterial('https://x.supabase.co', {}, 'evk', 'X', null, []) === true, 'sync: 404 pri DELETE bez riadkov neprekáža');
  globalThis.fetch = () => Promise.reject(new Error('sieť'));
  ok(await M.syncMaterial('https://x.supabase.co', {}, 'evk', 'X', null, [{ nazov: 'a' }]) === false, 'sync: chyba siete → false (best-effort)');
}

/* ── audit-fix regresie ── */
ok(M.normalizuj('Astron Pulsar').nazov === 'Astron Pulsar', 'audit: „Astron Pulsar" sa nezmení na „Pulsar"');
ok(M.normalizuj('Pulsar-18').nazov === 'Pulsar', 'audit: „Pulsar" ostáva Pulsar');
ok(Array.isArray(M.rowsFromPevar(null)) && M.rowsFromPevar(null).length === 0, 'audit: rowsFromPevar(null) nespadne');
{
  const cz = M.rowsFromEvk([{ typ: 'stent', stent_typ: 'DES', stent_nazov: 'Eluvia', 'průměr': '6', dlzka: '120', tepna: 'AFS l.dx.' }]);
  ok(cz[0].priemer_mm === 6, 'audit: CZ kľúč „průměr" sa zapíše do priemer_mm');
}

if (fails) { console.error(`\n${fails} testov materiálu zlyhalo.`); process.exit(1); }
console.log('\nVšetky testy materiálového registra prešli.');
