// Testy cookie relácie a login toku (tools/auth.js, cz/tools/auth.js, kiosky):
// po prihlásení existuje cookie cievny_sess pre server-side bránu, ?return= sa
// prevezme a sanitizuje, refresh token obnoví reláciu bez hesla, odhlásenie
// cookie aj SW cache zmaže. Lokálny server nemá middleware – testuje sa klient.
// Spustenie: node tests/auth-cookie.mjs
import {createServer} from 'http';
import {readFileSync} from 'fs';
import {join, extname} from 'path';
const {chromium} = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = process.env.REPO_ROOT || process.cwd();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv = createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  let body;
  try{ body = readFileSync(join(ROOT,p)); }catch(e){ res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200,{'Content-Type':MIME[extname(p)]||'text/plain'}); res.end(body);
});
await new Promise(r=>srv.listen(8271,r));
const BASE = 'http://localhost:8271';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
let failed = 0;
const check = (name, cond, extra='') => { console.log((cond?'✅':'❌')+' '+name+(cond?'':'   → '+extra)); if(!cond) failed++; };

const SESSION = {access_token:'tok.abc.def', refresh_token:'rt-1', expires_in:3600, user:{email:'test@cievny.sk'}};
async function ctxWithSupabase(init){
  const ctx = await browser.newContext();
  await ctx.route('**/ncqtiicfqhaturjlfxcj.supabase.co/**', r=>{
    const u = r.request().url();
    if(u.includes('/auth/v1/token')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(SESSION)});
    if(u.includes('/auth/v1/logout')) return r.fulfill({status:204,body:''});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  if(init) await ctx.addInitScript(init);
  return ctx;
}
const sess = async ctx => (await ctx.cookies()).find(c=>c.name==='cievny_sess');
const path = page => new URL(page.url()).pathname + new URL(page.url()).search;

// 1) prihlásenie heslom → cookie + návrat na ?return=
{
  const ctx = await ctxWithSupabase(); const page = await ctx.newPage();
  await page.goto(BASE+'/tools/login/?return=%2Ftools%2FProgram%2F%3Fsala%3DA',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(300);
  check('?return= sa z URL vyčistí', !page.url().includes('return='), page.url());
  await page.fill('#email','test@cievny.sk'); await page.fill('#pw','x');
  await page.evaluate(()=>doLogin());
  await page.waitForURL('**/tools/Program/**',{timeout:5000}).catch(()=>{});
  const c = await sess(ctx);
  check('po logine existuje cookie cievny_sess', !!c && c.value==='tok.abc.def', JSON.stringify(c));
  check('cookie má Path=/ a SameSite=Lax', c && c.path==='/' && c.sameSite==='Lax', c && (c.path+' '+c.sameSite));
  check('cookie expiruje ~ o hodinu', c && Math.abs(c.expires - (Date.now()/1000+3600)) < 120, c && String(c.expires));
  check('po logine návrat na ?return= vrátane query', path(page)==='/tools/Program/?sala=A', path(page));
  await ctx.close();
}

// 2) open-redirect: /\evil.com a //evil.com → fallback
for (const bad of ['%2F%5Cevil.com','%2F%2Fevil.com','%2Ftools%2Flogin%2F']) {
  const ctx = await ctxWithSupabase(); const page = await ctx.newPage();
  await page.goto(BASE+'/tools/login/?return='+bad,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(200);
  await page.fill('#email','t@x.sk'); await page.fill('#pw','x');
  await page.evaluate(()=>doLogin());
  await page.waitForURL('**/tools/EVK/**',{timeout:5000}).catch(()=>{});
  check(`return=${decodeURIComponent(bad)} → fallback /tools/EVK/`, path(page).startsWith('/tools/EVK/'), path(page));
  await ctx.close();
}

// 3) tichý refresh: len refresh token v sessionStorage → bez kliku späť na stránku s cookie
{
  const ctx = await ctxWithSupabase(()=>{ sessionStorage.setItem('cievny_auth_rt','rt-1'); });
  const page = await ctx.newPage();
  await page.goto(BASE+'/tools/login/?return=%2Ftools%2FEVK%2F',{waitUntil:'domcontentloaded'});
  await page.waitForURL('**/tools/EVK/**',{timeout:5000}).catch(()=>{});
  check('s refresh tokenom sa login preskočí a vráti na return', path(page)==='/tools/EVK/', path(page));
  check('tichý refresh nastaví cookie', !!(await sess(ctx)));
  await ctx.close();
}

// 4) bez refresh tokenu ostane login formulár
{
  const ctx = await ctxWithSupabase(); const page = await ctx.newPage();
  await page.goto(BASE+'/tools/login/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(400);
  check('bez relácie ostane na login stránke', path(page)==='/tools/login/', path(page));
  check('bez relácie žiadna cookie', !(await sess(ctx)));
  await ctx.close();
}

// 5) odhlásenie → cookie preč, SW cache prázdna
{
  // reláciu seedni LEN na stránke EVK – init skript beží pri každej navigácii a na login
  // stránke by refresh token po odhlásení potichu obnovil prihlásenie (falošný neúspech)
  const ctx = await ctxWithSupabase(()=>{
    if(!location.pathname.startsWith('/tools/EVK'))return;
    sessionStorage.setItem('cievny_auth','1'); sessionStorage.setItem('cievny_auth_at','tok.abc.def');
    sessionStorage.setItem('cievny_auth_rt','rt-1'); sessionStorage.setItem('cievny_auth_exp',String(Date.now()+3600000));
    sessionStorage.setItem('cievny_auth_email','test@cievny.sk');
  });
  await ctx.addCookies([{name:'cievny_sess',value:'tok.abc.def',url:BASE}]);
  const page = await ctx.newPage();
  await page.goto(BASE+'/tools/EVK/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(500);
  await page.evaluate(async()=>{ const c=await caches.open('cievny-test'); await c.put('/x',new Response('x')); });
  check('pred odhlásením cookie existuje', !!(await sess(ctx)));
  await page.evaluate(()=>doLogout());
  await page.waitForURL('**/tools/login/**',{timeout:5000}).catch(()=>{});
  // login stránka sa po načítaní ešte môže raz presmerovať (bootstrap) – počkaj, kým sa usadí
  await page.waitForLoadState('load').catch(()=>{}); await page.waitForTimeout(500);
  check('po odhlásení je na login stránke', path(page)==='/tools/login/', path(page));
  check('po odhlásení cookie neexistuje', !(await sess(ctx)));
  const keys = await page.evaluate(()=>caches.keys()).catch(async()=>{ await page.waitForTimeout(500); return page.evaluate(()=>caches.keys()); });
  check('po odhlásení je SW cache prázdna', keys.length===0, JSON.stringify(keys));
  await ctx.close();
}

// 6) TV kiosk: kód → cookie → Program v TV režime
{
  const ctx = await ctxWithSupabase(); const page = await ctx.newPage();
  await page.goto(BASE+'/tools/tv/',{waitUntil:'domcontentloaded'});
  await page.fill('#code','1234');
  await page.evaluate(()=>prihlas());
  await page.waitForURL('**/tools/Program/**',{timeout:5000}).catch(()=>{});
  check('TV kiosk po kóde nastaví cookie', !!(await sess(ctx)));
  check('TV kiosk ide na Program v TV režime', path(page).startsWith('/tools/Program/') && path(page).includes('tv=1'), path(page));
  await ctx.close();
}

// 7) veľín: bez relácie brána, po kóde cookie
{
  const ctx = await ctxWithSupabase(); const page = await ctx.newPage();
  await page.goto(BASE+'/tools/velin/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(300);
  check('veľín bez relácie ukáže bránu (kód)', await page.isVisible('#code'));
  await page.fill('#code','1234');
  await page.evaluate(()=>prihlas());
  await page.waitForTimeout(600);
  check('veľín po kóde nastaví cookie', !!(await sess(ctx)));
  await ctx.close();
}

// 8) CZ login → cookie + CZ návrat
{
  const ctx = await ctxWithSupabase(); const page = await ctx.newPage();
  await page.goto(BASE+'/cz/tools/login/?return=%2Fcz%2Ftools%2FEVK%2F',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(200);
  await page.fill('#email','t@x.sk'); await page.fill('#pw','x');
  await page.evaluate(()=>doLogin());
  await page.waitForURL('**/cz/tools/EVK/**',{timeout:5000}).catch(()=>{});
  check('CZ login nastaví cookie', !!(await sess(ctx)));
  check('CZ login sa vráti na CZ return', path(page)==='/cz/tools/EVK/', path(page));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} testov cookie/loginu ZLYHALO` : '\nVšetky testy cookie/loginu prešli.');
process.exit(failed ? 1 : 0);
