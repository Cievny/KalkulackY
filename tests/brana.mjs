// Testy server-side brány (lib/brana.mjs): klasifikácia ciest, cookie, návratová
// cesta, JWT skratka a celý handle() so stubovaným Supabase. Bez Playwrightu.
// Spustenie: node tests/brana.mjs
import { classify, normalize, parseCookie, sanitizeReturn, loginUrl, jwtExp, handle, resetCache, COOKIE } from '../lib/brana.mjs';

let fails = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log('✅', label);
  else { console.error('❌', label, extra ?? ''); fails++; }
};

console.log('— classify —');
const PROTECTED = [
  '/tools/', '/tools', '/tools/index.html', '/cz/tools/', '/cz/tools',
  ...['AVF','Aorta','CAS-generator','EVK','PEVAR','Program','RAS','VIS','analytics','ideas','kalendar','kontroly',
      'objednavky','oznamy','pacient','pozvanka','pristupy','suhlasy','zaloha','zaznamy','upload'].map(d => `/tools/${d}/`),
  ...['CAS-generator','EVK','PEVAR','analytics','ideas','zaznamy'].map(d => `/cz/tools/${d}/`),
  '/tools/EVK/index.html', '/tools/Program/?tv=1', '/tools//EVK/', '/tools/nova-vec/', '/tools/suhlasy/docs/01_EVAR.docx',
  ...['esc','gen-actionbar','pacient','rc-auto','scrub','vykon-id','drg-ceny','gcal-config','anamneza-parser',
      'material-katalog','poziadavky-import','program-import','staging','vqi-clti'].map(f => `/tools/${f}.js`),
  // samostatné kalkulačky sú od 9/2026 tiež len za prihlásením
  ...['ALI','AorticTrauma','CAR','CEAP','SVP','Tromboflebitída','Villa','WELLS','claudication','defektologia'].map(d => `/tools/${d}/`),
  '/tools/Tromboflebit%C3%ADda/', '/tools/defektologia/index.html', '/tools/WELLS', '/tools/svp/',
  '/tools/%E0%A4%A',  // chybné kódovanie → chránené
  // bodkové segmenty / spätné lomky za verejným prefixom – nespoliehame sa na normalizáciu servera
  '/tools/defektologia/../EVK/', '/tools/defektologia/%2e%2e/EVK/', '/tools/wells/./../EVK/',
  '/tools/defektologia/..', '/tools/wells\\..\\EVK/', '/tools/defektologia/%5c..%5cEVK/'
];
const PUBLIC = [
  '/tools/login/', '/tools/login', '/tools/login/index.html', '/tools/LOGIN/', '/cz/tools/login/',
  '/tools/tv/', '/tools/velin/', '/tools/velin/?sala=A',
  '/tools/adventny-kalendar/', '/tools/adventny-kalendar/index.html',
  '/tools/auth.js', '/cz/tools/auth.js'
];
const BLOCKED = ['/middleware.js', '/package.json', '/package-lock.json', '/vercel.json', '/lib/brana.mjs', '/lib/x.js'];
for (const p of PROTECTED) ok(classify(p.split('?')[0]) === 'protected', `chránené: ${p}`, classify(p.split('?')[0]));
for (const p of PUBLIC) ok(classify(p.split('?')[0]) === 'public', `verejné: ${p}`, classify(p.split('?')[0]));
for (const p of BLOCKED) ok(classify(p) === 'blocked', `blokované: ${p}`, classify(p));
ok(normalize('/tools/EVK') === '/tools/evk/', 'normalize: adresár bez lomky dostane lomku');
ok(normalize('/tools/EVK/index.html') === '/tools/evk/', 'normalize: index.html sa odstráni');
ok(normalize('/tools/%E0%A4%A') === null, 'normalize: chybné kódovanie → null');
ok(normalize('/tools/defektologia/%2e%2e/EVK/') === null, 'normalize: dekódované .. → null (chránené)');
ok(normalize('/tools/wells/./x/') === null, 'normalize: segment . → null (chránené)');
ok(normalize('/tools/a\\b/') === null, 'normalize: spätná lomka → null (chránené)');
ok(normalize('/tools/svp.old/') === '/tools/svp.old/', 'normalize: bodka vo vnútri názvu nie je bodkový segment');

console.log('\n— parseCookie —');
ok(parseCookie('a=1; cievny_sess=tok.en; b=2', COOKIE) === 'tok.en', 'nájde cookie medzi inými');
ok(parseCookie('cievny_sess=x=y', COOKIE) === 'x=y', '= vo vnútri hodnoty');
ok(parseCookie('other=1', COOKIE) === '', 'chýbajúca → prázdny reťazec');
ok(parseCookie(null, COOKIE) === '', 'null hlavička → prázdny reťazec');

console.log('\n— sanitizeReturn —');
const FB = '/tools/EVK/';
ok(sanitizeReturn('/tools/Program/?tv=1&sala=A', FB) === '/tools/Program/?tv=1&sala=A', 'interná cesta s query prejde');
for (const bad of ['//evil.com', '/\\evil.com', 'https://x', '', '/tools/login/', '/tools/login/?return=/x', '/cz/tools/login', 'x'.repeat(2001)])
  ok(sanitizeReturn(bad, FB) === FB, `odmietne: ${JSON.stringify(bad).slice(0, 40)}`);
ok(sanitizeReturn(undefined, FB) === FB, 'undefined → fallback');

console.log('\n— loginUrl —');
ok(loginUrl('/tools/EVK/', '?x=1') === '/tools/login/?return=%2Ftools%2FEVK%2F%3Fx%3D1', 'SK login s návratom', loginUrl('/tools/EVK/', '?x=1'));
ok(loginUrl('/cz/tools/EVK/', '') === '/cz/tools/login/?return=%2Fcz%2Ftools%2FEVK%2F', 'CZ login', loginUrl('/cz/tools/EVK/', ''));

console.log('\n— jwtExp —');
const mk = exp => 'h.' + Buffer.from(JSON.stringify(exp === undefined ? {} : { exp })).toString('base64url') + '.s';
ok(jwtExp(mk(2000000000)) === 2000000000000, 'exp v budúcnosti → ms');
ok(jwtExp(mk(1)) === 1000, 'exp v minulosti → ms');
ok(jwtExp(mk(undefined)) === 0, 'bez exp → 0');
ok(jwtExp('nie.jwt') === 0, 'nie JWT → 0');
ok(jwtExp('') === 0 && jwtExp(null) === 0, 'prázdne → 0');

console.log('\n— handle —');
const NOW = 1_700_000_000_000;
const now = () => NOW;
const live = mk(Math.floor(NOW / 1000) + 3600);
const dead = mk(Math.floor(NOW / 1000) - 10);
const req = (path, headers = {}) => new Request('https://www.cievny.sk' + path, { headers });
const stub = (status, body) => {
  const calls = { n: 0 };
  const f = async () => { calls.n++; return new Response(body === undefined ? '' : JSON.stringify(body), { status }); };
  return [f, calls];
};
const loc = r => r.headers.get('Location');

{ resetCache();
  const [f, c] = stub(200, [{ email: 'a@b.sk' }]);
  const r = await handle(req('/tools/EVK/?x=1'), { fetchImpl: f, now });
  ok(r instanceof Response && r.status === 302, 'bez cookie → 302');
  ok(loc(r) === 'https://www.cievny.sk/tools/login/?return=%2Ftools%2FEVK%2F%3Fx%3D1', 'redirect na login s return', loc(r));
  ok(r.headers.get('Cache-Control') === 'no-store', 'redirect je no-store');
  ok(c.n === 0, 'bez cookie sa Supabase nevolá'); }
{ resetCache();
  const [f, c] = stub(200, [{ email: 'a@b.sk' }]);
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now });
  ok(r === null, 'povolený token → pustiť ďalej (null)');
  ok(c.n === 1, 'jedno volanie Supabase');
  const r2 = await handle(req('/tools/Program/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now });
  ok(r2 === null && c.n === 1, 'druhá stránka s tým istým tokenom ide z cache (fetch stále 1×)');
  const r3 = await handle(req('/tools/Program/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now: () => NOW + 61000 });
  ok(r3 === null && c.n === 2, 'po TTL 60 s sa Supabase zavolá znovu'); }
{ resetCache();
  const [f, c] = stub(200, []);
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now });
  ok(r && r.status === 302 && c.n === 1, 'platný token, ale NIE v allowliste ([]) → 302'); }
{ resetCache();
  const [f] = stub(401);
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now });
  ok(r && r.status === 302, 'Supabase 401 → 302'); }
{ resetCache();
  const [f] = stub(500);
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now });
  ok(r && r.status === 302, 'Supabase 500 → 302 (fail-closed)'); }
{ resetCache();
  const f = async () => { throw new Error('sieť'); };
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now });
  ok(r && r.status === 302, 'výnimka siete → 302 (fail-closed)'); }
{ resetCache();
  const f = (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort'))));
  const t0 = Date.now();
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${live}` }), { fetchImpl: f, now, timeoutMs: 50 });
  ok(r && r.status === 302 && Date.now() - t0 < 2000, 'timeout → 302'); }
{ resetCache();
  const [f, c] = stub(200, [{ email: 'a' }]);
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=${dead}` }), { fetchImpl: f, now });
  ok(r && r.status === 302 && c.n === 0, 'expirovaný JWT → 302 bez volania Supabase'); }
{ resetCache();
  const [f, c] = stub(200, [{ email: 'a' }]);
  const r = await handle(req('/tools/EVK/', { cookie: `${COOKIE}=smeti` }), { fetchImpl: f, now });
  ok(r && r.status === 302 && c.n === 0, 'smetný token → 302 bez volania Supabase'); }
{ resetCache();
  const [f] = stub(200, []);
  const r = await handle(req('/tools/anamneza-parser.js', { 'sec-fetch-dest': 'script' }), { fetchImpl: f, now });
  ok(r && r.status === 401, 'skript bez cookie → 401 (nie HTML login)'); }
{ resetCache();
  const [f] = stub(200, []);
  const r = await handle(req('/tools/Program/?tv=1&sala=A'), { fetchImpl: f, now });
  ok(r && r.status === 302 && loc(r) === 'https://www.cievny.sk/tools/tv/', '?tv=1 bez cookie → TV brána', loc(r)); }
{ resetCache();
  const [f, c] = stub(200, []);
  ok(await handle(req('/tools/adventny-kalendar/'), { fetchImpl: f, now }) === null && c.n === 0, 'verejný adventný kalendár → null bez Supabase');
  ok(await handle(req('/tools/auth.js', { 'sec-fetch-dest': 'script' }), { fetchImpl: f, now }) === null, 'verejný JS → null');
  const rw = await handle(req('/tools/WELLS/'), { fetchImpl: f, now });
  ok(rw && rw.status === 302, 'kalkulačka WELLS bez cookie → 302 (už nie je verejná)');
  const rs = await handle(req('/tools/staging.js', { 'sec-fetch-dest': 'script' }), { fetchImpl: f, now });
  ok(rs && rs.status === 401, 'staging.js bez cookie → 401');
  ok(await handle(req('/tools/login/?return=%2Ftools%2FEVK%2F'), { fetchImpl: f, now }) === null, 'login → null (žiadna slučka)'); }
{ const r = await handle(req('/package.json'), { now });
  ok(r && r.status === 404, 'blokovaný súbor → 404');
  const r2 = await handle(req('/lib/brana.mjs'), { now });
  ok(r2 && r2.status === 404, '/lib/* → 404'); }
{ resetCache();
  const [f] = stub(200, []);
  const r = await handle(req('/cz/tools/EVK/'), { fetchImpl: f, now });
  ok(loc(r) === 'https://www.cievny.sk/cz/tools/login/?return=%2Fcz%2Ftools%2FEVK%2F', 'CZ stránka → CZ login', loc(r)); }

if (fails) { console.error(`\n${fails} testov brány zlyhalo.`); process.exit(1); }
console.log('\nVšetky testy brány prešli.');
