// Brána pre chránené stránky cievny.sk – čistá logika bez závislostí.
// Používa ju /middleware.js (Vercel Routing Middleware) aj tests/brana.mjs.
//
// Pravidlo: pod /tools/ a /cz/tools/ je VŠETKO chránené (default-deny), okrem
// explicitne vymenovaných verejných adresárov (samostatné kalkulačky, login,
// kioskové brány) a verejných súborov (JS, ktoré verejné stránky potrebujú).
// Nový nástroj je teda chránený automaticky, kým ho niekto vedome nepridá sem.
//
// Overenie: cookie `cievny_sess` nesie Supabase access JWT. Jediné volanie
// GET /rest/v1/povoleni_pouzivatelia?select=email&limit=1 s týmto tokenom vráti
//   401        → token neplatný/expirovaný
//   200 + []   → platný, ale e-mail NIE JE v allowliste (RLS: je_povoleny())
//   200 + [..] → povolený používateľ
// Čokoľvek iné (timeout, sieť, 5xx) = zamietnuť (fail-closed).

export const SB_URL_DEFAULT = 'https://ncqtiicfqhaturjlfxcj.supabase.co';
export const SB_ANON_DEFAULT = 'sb_publishable_DX_FaXYGNx70dB6m-PfhAA_H5NHyH3k';
export const COOKIE = 'cievny_sess';

// všetko lowercase – porovnáva sa s normalizovanou cestou
const PUBLIC_DIRS = [
  '/tools/login/', '/cz/tools/login/',
  '/tools/tv/', '/tools/velin/',                       // kioskové brány – prihlasujú sa kódom priamo v stránke
  '/tools/ali/', '/tools/aortictrauma/', '/tools/car/', '/tools/ceap/', '/tools/svp/',
  '/tools/tromboflebitída/', '/tools/villa/', '/tools/wells/', '/tools/adventny-kalendar/',
  '/tools/claudication/', '/tools/defektologia/'
];
const PUBLIC_FILES = new Set([
  '/tools/auth.js', '/cz/tools/auth.js',               // potrebuje login stránka a kiosky
  '/tools/staging.js', '/tools/vqi-clti.js'            // potrebuje verejná defektológia
]);
const BLOCKED = new Set(['/middleware.js', '/package.json', '/package-lock.json', '/vercel.json']);

export function normalize(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return null; }   // chybné kódovanie → volajúci berie ako chránené
  p = p.toLowerCase().replace(/\/{2,}/g, '/');
  if (p.endsWith('/index.html')) p = p.slice(0, -'index.html'.length);
  if (!/\.[a-z0-9]+$/.test(p) && !p.endsWith('/')) p += '/';
  return p;
}

// 'public' | 'protected' | 'blocked'
export function classify(pathname) {
  const p = normalize(pathname);
  if (p === null) return 'protected';
  if (BLOCKED.has(p) || p.startsWith('/lib/')) return 'blocked';
  if (PUBLIC_FILES.has(p)) return 'public';
  for (const d of PUBLIC_DIRS) if (p === d || p.startsWith(d)) return 'public';
  return 'protected';
}

export function parseCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

// Len interné cesty: začína '/', druhý znak nie je '/' ani '\' (prehliadač by
// '/\evil.com' znormalizoval na '//evil.com'), nikdy nie späť na login (slučka).
export function sanitizeReturn(ret, fallback) {
  if (typeof ret !== 'string' || ret.length > 2000 || !/^\/[^/\\]/.test(ret)) return fallback;
  if (/^\/(cz\/)?tools\/login\/?/i.test(ret)) return fallback;
  return ret;
}

export function loginUrl(pathname, search) {
  const login = pathname.toLowerCase().startsWith('/cz/') ? '/cz/tools/login/' : '/tools/login/';
  return login + '?return=' + encodeURIComponent(pathname + (search || ''));
}

// exp z JWT payloadu v ms (0 ak sa nedá prečítať). BEZ overenia podpisu –
// slúži len ako rýchla skratka, aby sa s mŕtvym tokenom nevolal Supabase.
export function jwtExp(token) {
  if (typeof token !== 'string' || token.length > 4000) return 0;
  const parts = token.split('.');
  if (parts.length !== 3) return 0;
  try {
    let b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b += '='.repeat((4 - b.length % 4) % 4);
    const exp = JSON.parse(atob(b)).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch (e) { return 0; }
}

export async function tokenHash(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

export async function allowlisted(token, { fetchImpl = fetch, env = {}, timeoutMs = 3000 } = {}) {
  const url = (env.SUPABASE_URL || SB_URL_DEFAULT) + '/rest/v1/povoleni_pouzivatelia?select=email&limit=1';
  const anon = env.SUPABASE_ANON_KEY || SB_ANON_DEFAULT;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, {
      headers: { apikey: anon, Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: ctl.signal
    });
    if (r.status !== 200) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// Pozitívna cache (len povolené tokeny) v pamäti edge izolátu – šetrí Supabase.
const CACHE = new Map();
const TTL = 60000, MAX = 500;
export function resetCache() { CACHE.clear(); }

export async function isAuthorized(token, opts = {}) {
  const now = (opts.now || Date.now)();
  const exp = jwtExp(token);
  if (!exp || exp <= now) return false;
  const key = await tokenHash(token);
  const hit = CACHE.get(key);
  if (hit && hit > now) return true;
  const ok = await allowlisted(token, opts);
  if (ok) {
    if (CACHE.size >= MAX) CACHE.clear();
    CACHE.set(key, Math.min(now + TTL, exp));
  }
  return ok;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

// Vráti Response (odmietnutie/presmerovanie/404) alebo null = pustiť na statický súbor.
export async function handle(request, opts = {}) {
  const url = new URL(request.url);
  const cls = classify(url.pathname);
  if (cls === 'blocked') return new Response('Not found', { status: 404, headers: NO_STORE });
  if (cls === 'public') return null;

  const token = parseCookie(request.headers.get('cookie'), COOKIE);
  if (token && await isAuthorized(token, opts)) return null;

  // skript / obrázok / fetch: HTML loginu by len spôsobilo chybu – 401 je čistejšie
  const dest = request.headers.get('sec-fetch-dest');
  if (dest && dest !== 'document' && dest !== 'iframe') {
    return new Response('Unauthorized', { status: 401, headers: NO_STORE });
  }
  // TV bez klávesnice: na TV bránu, nie na ľudský login
  if (url.searchParams.get('tv') === '1') {
    return new Response(null, { status: 302, headers: { ...NO_STORE, Location: new URL('/tools/tv/', url).toString() } });
  }
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, Location: new URL(loginUrl(url.pathname, url.search), url).toString() }
  });
}
