// Testy diktovania EVK (node tests/diktat-evk.mjs) – Fáza 1.
// Pre každý fixture v tests/diktat-korpus/*.json:
//   1. načíta /tools/EVK/, zavolá DiktatEVK.apply(fields) (to, čo by vrátila AI)
//   2. overí hodnoty polí, zaškrtnutia, text nálezu (#out), DRG kódy a zoznam nezaradených
// Navyše: očista (scrub) v okne diktátu, serverová cesta cez mock edge funkcie,
// a že žlté podfarbenie (.ai-filled) zmizne po ručnej úprave poľa.
import { createServer } from 'http';
import { readFileSync, readdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || join(HERE, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = readFileSync(join(ROOT, p)); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' }); res.end(b); }
  catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => srv.listen(8931, r));

let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('  ✅ ' + n)) : (fail++, console.log('  ❌ ' + n)); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function openEVK(onExtrakcia) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    sessionStorage.setItem('cievny_auth', '1'); sessionStorage.setItem('cievny_auth_at', 'tok');
    sessionStorage.setItem('cievny_auth_exp', String(Date.now() + 3600e3)); sessionStorage.setItem('cievny_auth_email', 'test@cievny.sk');
  });
  await ctx.route('**/ncqtiicfqhaturjlfxcj.supabase.co/**', route => {
    const req = route.request();
    if (req.url().includes('/functions/v1/extrakcia') && onExtrakcia) return onExtrakcia(route, req);
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:8931/tools/EVK/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}

/* ── 1) korpus: apply(fields) → formulár ── */
const dir = join(HERE, 'diktat-korpus');
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
for (const f of files) {
  const fx = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  console.log('\n📄 ' + f + ' – ' + fx.popis);
  const { ctx, page, errs } = await openEVK();
  ok(errs.length === 0, 'EVK sa načítal bez JS chýb' + (errs.length ? ': ' + errs[0] : ''));
  ok(await page.evaluate(() => typeof window.DiktatEVK === 'object' && typeof DiktatEVK.apply === 'function'), 'DiktatEVK je dostupný');

  const r = await page.evaluate(F => DiktatEVK.apply(F), fx.fields);
  ok(errs.length === 0, 'apply() bez JS chýb' + (errs.length ? ': ' + errs[0] : ''));
  ok(r && Array.isArray(r.filled) && r.filled.length > 0, 'apply() vrátil zoznam vyplnených (' + (r.filled || []).length + ')');

  const E = fx.expect || {};
  const vals = await page.evaluate(ids => { const o = {}; ids.forEach(id => { const el = document.getElementById(id); o[id] = el ? el.value : null; }); return o; }, Object.keys(E.vals || {}));
  for (const [id, want] of Object.entries(E.vals || {})) ok(vals[id] === want, `${id} = ${JSON.stringify(want)}` + (vals[id] === want ? '' : ` (je ${JSON.stringify(vals[id])})`));

  const chk = await page.evaluate(ids => ids.map(id => { const el = document.getElementById(id); return el ? el.checked : null; }), E.checked || []);
  (E.checked || []).forEach((id, i) => ok(chk[i] === true, id + ' zaškrtnuté'));

  for (const [name, want] of Object.entries(E.radio || {})) {
    const v = await page.evaluate(n => (document.querySelector('input[name="' + n + '"]:checked') || {}).value || '', name);
    ok(v === want, `radio ${name} = ${want}` + (v === want ? '' : ` (je ${JSON.stringify(v)})`));
  }
  for (const [cls, wants] of Object.entries(E.checked_values || {})) {
    const got = await page.evaluate(c => [...document.querySelectorAll('input.' + c + ':checked')].map(x => x.value), cls);
    ok(wants.every(w => got.includes(w)) && got.length === wants.length, `checkboxy .${cls} = ${wants.join(', ')}` + (got.length === wants.length ? '' : ` (je ${got.join(', ')})`));
  }

  const out = await page.$eval('#out', e => e.value);
  (E.out || []).forEach(re => ok(new RegExp(re).test(out), 'nález obsahuje /' + re + '/'));

  const drg = await page.evaluate(() => collectDRG().map(c => c.code));
  if (E.drg_none) ok(drg.filter(c => /^8r8/.test(c)).length === 0, 'žiadne intervenčné DRG kódy (' + drg.join(', ') + ')');
  (E.drg || []).forEach(pref => ok(drg.some(c => c.startsWith(pref)), 'DRG obsahuje ' + pref + ' (' + drg.join(', ') + ')'));

  const um = r.unmapped || [];
  (E.unmapped || []).forEach(re => ok(um.some(u => new RegExp(re).test(u)), 'nezaradené spomína /' + re + '/'));
  if (E.unmapped_max != null) ok(um.length <= E.unmapped_max, `nezaradených ≤ ${E.unmapped_max} (${um.length})` + (um.length > E.unmapped_max ? ': ' + um.join(' | ') : ''));

  // žlté podfarbenie: existuje a zmizne po ručnej úprave
  const first = Object.keys(E.vals || {}).find(id => vals[id] && /^(strana|sheath|uzatv|heparin)$/.test(id)) || 'strana';
  const hl = await page.evaluate(id => {
    const el = document.getElementById(id); if (!el) return null;
    const before = el.classList.contains('ai-filled');
    el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: el.classList.contains('ai-filled'), any: document.querySelectorAll('.ai-filled').length };
  }, first);
  ok(hl && hl.before === true && hl.after === false, `podfarbenie .ai-filled na #${first} zmizne po úprave`);
  ok(hl && hl.any > 0, 'ostatné vyplnené polia ostávajú podfarbené (' + (hl && hl.any) + ')');
  ok(await page.evaluate(() => window._dirty === true), 'formulár je označený ako zmenený (_dirty)');
  await ctx.close();
}

/* ── 2) okno diktátu: scrub + mock edge funkcie ── */
{
  console.log('\n🎙️ okno diktátu (scrub + odoslanie)');
  const fx = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
  let sent = null;
  const { ctx, page, errs } = await openEVK((route, req) => {
    sent = req.postDataJSON();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: fx.fields, model: 'mock' }) });
  });
  ok(await page.$('#btn_diktat') !== null, 'tlačidlo „Z diktátu" existuje');
  await page.click('#btn_diktat');
  await page.waitForTimeout(150);
  ok(await page.$('#dk_txt') !== null, 'okno diktátu sa otvorilo');
  const dirty = 'Pacient Mrkvička Ján 481205/1234, tel. 0905 123 456. ' + fx.diktat;
  await page.fill('#dk_txt', dirty);
  await page.click('#dk_gate');
  await page.waitForTimeout(150);
  const clean = await page.$eval('#dk_clean', e => e.value);
  ok(!/481205\s*\/\s*1234/.test(clean) && !/Mrkvička/.test(clean) && !/0905/.test(clean), 'náhľad je bez RČ, mena a telefónu');
  ok(/Pulsar 6x120/.test(clean) && /AngioSeal/.test(clean), 'klinický obsah v náhľade ostal');
  // ručne vrátený RČ do náhľadu → odoslanie sa zablokuje lokálne
  await page.fill('#dk_clean', clean + ' RČ 481205/1234');
  await page.click('#dk_send');
  await page.waitForTimeout(200);
  ok(sent === null, 'text s RČ sa neodoslal (druhá lokálna kontrola)');
  ok(/identifikátor/.test(await page.$eval('#dk_review', e => e.textContent)), 'zobrazila sa chyba o identifikátore');
  // späť na čistý text → odošle sa len očistená verzia s kind:'evk'
  await page.click('#dk_gate'); await page.waitForTimeout(150);
  await page.click('#dk_send');
  await page.waitForTimeout(500);
  ok(sent && sent.kind === 'evk' && typeof sent.text === 'string', 'odoslané { text, kind:"evk" }');
  ok(sent && !/481205|Mrkvička|0905/.test(sent.text), 'odoslaný text je očistený');
  ok(await page.$('#dk_result') && /Vyplnené \(\d+\)/.test(await page.$eval('#dk_result', e => e.textContent)), 'výsledok ukazuje počet vyplnených');
  ok((await page.$eval('#stent_0_n', e => e.value)) === 'Pulsar', 'formulár vyplnený z odpovede mock AI (stent Pulsar)');
  await page.click('#dk_done');
  await page.waitForTimeout(100);
  ok(await page.$('#dk_txt') === null, 'okno sa zavrelo');
  ok(errs.length === 0, 'bez JS chýb' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ── 3) chybové stavy: nenasadená funkcia / chýbajúci kľúč ── */
{
  console.log('\n⚠️ chybové stavy');
  for (const [status, re] of [[404, /nie je nasadená/], [503, /API kľúč/]]) {
    const { ctx, page } = await openEVK((route) => route.fulfill({ status, contentType: 'application/json', body: '{"error":"x"}' }));
    await page.evaluate(() => DiktatEVK.open());
    await page.fill('#dk_txt', 'AFC vľavo, sheath 6F, DSA bez stenóz.');
    await page.click('#dk_gate'); await page.waitForTimeout(100);
    await page.click('#dk_send'); await page.waitForTimeout(300);
    const t = await page.$eval('#dk_review', e => e.textContent);
    ok(re.test(t), `HTTP ${status} → zrozumiteľná hláška (${t.slice(0, 60).trim()})`);
    await ctx.close();
  }
}

await browser.close(); srv.close();
console.log(`\n${pass} prešlo, ${fail} zlyhalo`);
process.exit(fail ? 1 : 0);
