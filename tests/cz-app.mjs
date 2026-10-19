// Nezávislá CZ kópia (cz-app/): (1) je aktuálna voči SK zdrojom, (2) neobsahuje
// odkaz na slovenský Supabase, (3) stránky sa načítajú bez JS chýb s vlastnou
// konfiguráciou, navigácia má len nástroje z kópie, login je bez Google.
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const ROOT = join(REPO, 'cz-app');
let pass = 0, fail = 0;
const ok = (c, n) => { c ? (pass++, console.log('✅ ' + n)) : (fail++, console.log('❌ ' + n)); };

// 1) generátor: kópia zodpovedá zdrojom
let chk = '';
try { chk = execFileSync('python3', [join(REPO, 'scripts/build_cz_app.py'), '--check'], { encoding: 'utf8' }); } catch (e) { chk = String(e.stdout || e.message); }
ok(/je aktuálna/.test(chk), 'cz-app/ je aktuálna voči SK zdrojom: ' + chk.trim().split('\n')[0]);

// 2) žiadny odkaz na slovenský Supabase
const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
const files = ['tools/auth.js', 'tools/config.js', 'tools/Aorta/index.html', 'tools/login/index.html', 'lib/brana.mjs', 'vercel.json'];
const sk = files.filter(f => /ncqtiicfqhaturjlfxcj/.test(readFileSync(join(ROOT, f), 'utf8')));
ok(sk.length === 0, 'bez odkazu na SK Supabase projekt' + (sk.length ? ': ' + sk.join(', ') : ''));
ok(readFileSync(join(ROOT, 'vercel.json'), 'utf8').includes(cfg.SB_URL), 'CSP connect-src má URL českého projektu');

// 2b) brána kópie: config.js verejný (login ho potrebuje), middleware bez npm importu a funkčný
const brana = await import(join(ROOT, 'lib/brana.mjs'));
ok(brana.classify('/tools/config.js') === 'public' && brana.classify('/tools/auth.js') === 'public' && brana.classify('/tools/Aorta/') === 'protected', 'brána: config.js a auth.js verejné, Požiadavky chránené');
ok(!/from ['"]@vercel/.test(readFileSync(join(ROOT, 'middleware.js'), 'utf8')), 'middleware bez npm závislosti');
const mw = await import(join(ROOT, 'middleware.js'));
const r1 = await mw.default(new Request('https://cz.example/tools/Aorta/'));
const r2 = await mw.default(new Request('https://cz.example/tools/login/'));
const r3 = await mw.default(new Request('https://cz.example/tools/config.js'));
ok(r1.status === 302 && /\/tools\/login\//.test(r1.headers.get('location')), 'middleware: neprihlásený → 302 na login');
ok(r2.headers.get('x-middleware-next') === '1' && r3.headers.get('x-middleware-next') === '1', 'middleware: login a config.js prejdú (x-middleware-next)');

// 3) stránky v prehliadači
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'text/plain' }); res.end(readFileSync(p));
});
await new Promise(r => srv.listen(8997, r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext();
await ctx.addInitScript(() => { sessionStorage.setItem('cievny_auth', '1'); sessionStorage.setItem('cievny_auth_at', 't'); sessionStorage.setItem('cievny_auth_exp', String(Date.now() + 3600e3)); sessionStorage.setItem('cievny_auth_email', 'test@cievny.cz'); });
const hosts = [];
await ctx.route('**/*.supabase.co/**', route => { hosts.push(new URL(route.request().url()).host); route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:8997/tools/Aorta/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900);
ok(errs.length === 0, 'Požiadavky sa načítajú bez JS chýb' + (errs.length ? ': ' + errs[0] : ''));
ok(await page.evaluate(() => typeof window.APP_CONFIG === 'object' && window.SB_BASE === window.APP_CONFIG.SB_URL), 'auth.js číta Supabase z config.js');
const cfgHost = new URL(cfg.SB_URL).host;
ok(hosts.length > 0 && hosts.every(h => h === cfgHost), 'všetky volania idú na český projekt (' + [...new Set(hosts)].join(',') + ')');
const nav = await page.evaluate(() => [...document.querySelectorAll('.shared-nav a')].map(a => a.getAttribute('href')));
ok(nav.length === 2 && nav.includes('/tools/') && nav.includes('/tools/Aorta/'), 'navigácia má len 🏠 a Požiadavky (' + nav.join(' ') + ')');
const th = await page.evaluate(() => ({ nav: getComputedStyle(document.querySelector('.shared-nav')).backgroundColor, st0: STATUSES[0].color, st3: STATUSES[3].color, body: getComputedStyle(document.body).backgroundColor, title: document.title }));
ok(th.nav === 'rgb(91, 14, 26)' && th.body === 'rgb(253, 242, 242)', 'červená téma: navigácia a pozadie (' + th.nav + ')');
ok(th.st0 === '#3b82f6' && th.st3 === '#1e40af', 'farby stavov nástenky ostali pôvodné');
ok(/^CZ – /.test(th.title), 'titulok karty začína „CZ –"');
ok(await page.evaluate(() => !!document.getElementById('af_rodne_cislo') && !!document.getElementById('af_telefon') && !!document.getElementById('af_epikriza')), 'formulár požiadavky má polia ako SK (r.č., telefón, epikríza)');
await page.evaluate(() => openModal(null)); await page.waitForTimeout(100);
ok(await page.evaluate(() => typeof formToObj === 'function' && 'telefon' in formToObj()), 'formToObj funguje v kópii');
const lp = await ctx.newPage(); const lerr = []; lp.on('pageerror', e => lerr.push(e.message));
await lp.goto('http://localhost:8997/tools/login/', { waitUntil: 'domcontentloaded' }); await lp.waitForTimeout(400);
ok(lerr.length === 0 && await lp.$('#email') && await lp.$('.gbtn'), 'login: e-mail + heslo aj Google, bez chýb');
ok(await lp.evaluate(() => typeof doGoogle === 'function'), 'login: doGoogle dostupné (OAuth cez český projekt)');
ok(/cievny\.cz/.test(await lp.$eval('.logo', e => e.textContent)), 'login nesie názov inštancie z config.json');
const hp = await ctx.newPage(); await hp.goto('http://localhost:8997/tools/', { waitUntil: 'domcontentloaded' }); await hp.waitForTimeout(300);
ok((await hp.$$('.card')).length === 1, 'úvodná stránka má len kartu Požiadavky');
await browser.close(); srv.close();
console.log(`\n${pass} prešlo, ${fail} zlyhalo`); process.exit(fail ? 1 : 0);
