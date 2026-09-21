// Testy Rutherfordovej klasifikácie akútnej končatinovej ischémie (/tools/ALI/).
// Trieda III je definovaná kombináciou anestézia + paralýza + nevybaviteľný venózny
// signál; ktorýkoľvek z nich samostatne je nanajvýš IIb.
// Spustenie: node tests/ali.mjs
import {createServer} from 'http';
import {readFileSync} from 'fs';
import {join, extname} from 'path';
const {chromium} = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = process.env.REPO_ROOT || process.cwd();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv = createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  // súbor načítaj PRED hlavičkami – 404 (napr. manifest z auth.js) inak zhodí server
  let body; try{ body = readFileSync(join(ROOT,p)); }catch(e){ res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200,{'Content-Type':MIME[extname(p)]||'text/plain'}); res.end(body);
});
await new Promise(r=>srv.listen(8251,r));

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
const ctx = await browser.newContext();
await ctx.addInitScript(()=>{ sessionStorage.setItem('cievny_auth','1'); sessionStorage.setItem('cievny_auth_at','tok'); sessionStorage.setItem('cievny_auth_exp',String(Date.now()+3600000)); sessionStorage.setItem('cievny_auth_email','test@cievny.sk'); }); // kalkulačky sú za prihlásením
const page = await ctx.newPage();
await page.route('**/cdn.tailwindcss.com/**', r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const errs = [];
page.on('pageerror', e=>errs.push(e.message));
await page.goto('http://localhost:8251/tools/ALI/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(400);

let failed = 0;
const check = (name, cond, extra='') => { console.log((cond?'✅':'❌')+' '+name+(cond?'':'   → '+extra)); if(!cond) failed++; };

// s = senzorika 0-3, m = motorika 0-2, da = artériový doppler 0/1, dv = venózny 0/1
async function klasifikuj(s, m, da, dv){
  await page.check(`#s_${s}`);
  await page.check(`#m_${m}`);
  await page.check(`#da_${da}`);
  await page.check(`#dv_${dv}`);
  await page.waitForTimeout(120);
  return page.$eval('#result-area', e=>e.textContent.replace(/\s+/g,' ').trim());
}

// ── Rutherfordova tabuľka: štyri kanonické riadky ──
let r = await klasifikuj(0,0,0,0);
check('I: bez deficitu, oba signály vybaviteľné → trieda I', r.includes('Trieda I:'), r);

r = await klasifikuj(1,0,1,0);
check('IIa: minimálny deficit (prsty), artériový nevybaviteľný → IIa', r.includes('Trieda IIa'), r);

r = await klasifikuj(2,1,1,0);
check('IIb: deficit viac ako prsty + mierny motorický, venózny vybaviteľný → IIb', r.includes('Trieda IIb'), r);

r = await klasifikuj(3,2,1,1);
check('III: anestézia + paralýza + nevybaviteľný venózny → trieda III', r.includes('Trieda III'), r);

// ── regresia: pôvodná OR-logika hlásila III pri ktoromkoľvek jednom náleze ──
r = await klasifikuj(0,2,1,0);
check('paralýza pri vybaviteľnom venóznom signáli NIE je trieda III', !r.includes('Trieda III'), r);
check('  → je to IIb (zachrániteľná)', r.includes('Trieda IIb'), r);
check('  → neodporúča primárnu amputáciu', !r.includes('amputácia'), r);
check('  → hlási hraničný nález medzi IIb a III', r.includes('hraničný nález'), r);

r = await klasifikuj(3,0,1,0);
check('anestézia bez paralýzy NIE je trieda III', !r.includes('Trieda III') && r.includes('Trieda IIb'), r);

r = await klasifikuj(0,0,1,1);
check('nevybaviteľný venózny signál sám o sebe NIE je trieda III', !r.includes('Trieda III'), r);
check('  → ale je označený ako varovný nález', r.includes('varovný nález'), r);

r = await klasifikuj(3,2,1,0);
check('anestézia + paralýza, ale venózny vybaviteľný → IIb, nie III', r.includes('Trieda IIb'), r);

// ── regresia: artériový doppler sa predtým vôbec nepoužíval ──
r = await klasifikuj(0,0,1,0);
check('bez deficitu + nevybaviteľný artériový signál → IIa (nie I)', r.includes('Trieda IIa'), r);
check('  → vysvetlí prečo to nie je trieda I', r.includes('nie o triedu I'), r);

r = await klasifikuj(0,0,0,0);
check('bez deficitu + vybaviteľný artériový signál → trieda I', r.includes('Trieda I:'), r);

// ── súhrn vstupov a nekonzistencie ──
r = await klasifikuj(3,2,0,1);
check('III s vybaviteľným artériovým signálom hlási nekonzistenciu', r.includes('nesúhlasí'), r);

r = await klasifikuj(2,0,1,0);
check('výsledok vypisuje súhrn zadaných nálezov', /S2 M0/.test(r), r);

// ── neúplný vstup nesmie nič zobraziť ──
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(300);
await page.check('#s_0');
await page.waitForTimeout(150);
check('neúplný vstup nezobrazí žiadnu klasifikáciu',
  !(await page.$eval('#result-area', e=>e.className)).includes('visible'));

check('žiadne JS chyby', errs.length===0, errs.join(' | '));

await browser.close();
srv.close();
console.log(failed ? `\n${failed} testov ALI ZLYHALO` : '\nVšetky testy ALI prešli.');
process.exit(failed ? 1 : 0);
