// Vercel Routing Middleware – server-side brána pre chránené stránky.
// Beží PRED podaním statického súboru; logika je v lib/brana.mjs (testovaná
// v tests/brana.mjs). Env premenné sú voliteľné – fallback sú rovnaké verejné
// hodnoty ako v tools/auth.js.
import { next } from '@vercel/functions';
import { handle, classify } from './lib/brana.mjs';

export const config = {
  matcher: [
    '/tools/:path*',
    '/cz/tools/:path*',
    '/lib/:path*',
    '/middleware.js',
    '/package.json',
    '/package-lock.json',
    '/vercel.json'
  ]
};

export default async function middleware(request) {
  const res = await handle(request, {
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    }
  });
  if (res) return res;
  if (classify(new URL(request.url).pathname) === 'protected') {
    return next({ headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  return next();
}
