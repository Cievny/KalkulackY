// Testy skórovacích kalkulačiek: WELLS (DVT) a CEAP (revízia 2020).
// Spustenie: node tests/skorovacie.mjs
import {createServer} from 'http';
import {readFileSync} from 'fs';
import {join, extname} from 'path';
const {chromium} = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = process.env.REPO_ROOT || process.cwd();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv = createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  try{ res.writeHead(200,{'Content-Type':MIME[extname(p)]||'text/plain'}); res.end(readFileSync(join(ROOT,p))); }
  catch(e){ res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>srv.listen(8261,r));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
let failed = 0;
const check = (name, cond, extra='') => { console.log((cond?'✅':'❌')+' '+name+(cond?'':'   → '+extra)); if(!cond) failed++; };

async function open(path){
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.route('**/cdn.tailwindcss.com/**', r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8261'+path,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(300);
  return {page, ctx, errs};
}
const txt = (page, sel) => page.$eval(sel, e=>e.textContent.replace(/\s+/g,' ').trim());

// ── WELLS ──
{
  const {page, ctx, errs} = await open('/tools/WELLS/');
  console.log('— WELLS —');
  check('skóre 0 zobrazí výsledok (nízka pravdepodobnosť), nie prázdnu obrazovku',
    (await page.$eval('#result-area', e=>e.className)).includes('visible') && (await txt(page,'#result-area')).includes('Nízka'));
  check('skóre 0 vypíše Skóre: 0', (await txt(page,'#result-area')).includes('Skóre: 0'));
  await page.check('#c_alternative'); await page.waitForTimeout(100);
  check('len alternatívna dg (−2) = nízka', (await txt(page,'#result-area')).includes('Skóre: -2'));
  await page.uncheck('#c_alternative');
  await page.check('#c_history'); await page.waitForTimeout(100);
  check('1 bod = stredná', (await txt(page,'#result-area')).includes('Stredná'));
  const cbs = await page.$$('#wells-list input[type=checkbox]');
  for (const cb of cbs) { const id = await cb.getAttribute('id'); if (id !== 'c_alternative') await cb.check(); }
  await page.waitForTimeout(100);
  check('9 pozitívnych kritérií = 9 bodov, vysoká', (await txt(page,'#result-area')).includes('Skóre: 9') && (await txt(page,'#result-area')).includes('Vysoká'));
  await page.check('#c_alternative'); await page.waitForTimeout(100);
  check('9 − 2 = 7, stále vysoká', (await txt(page,'#result-area')).includes('Skóre: 7'));
  await page.click('#reset-button'); await page.waitForTimeout(100);
  check('reset vráti skóre 0 s výsledkom', (await txt(page,'#result-area')).includes('Skóre: 0'));
  check('kritérium obvodu lýtka uvádza miesto merania', (await page.content()).includes('10 cm pod tuberositas tibiae'));
  check('kritérium operácie uvádza anestéziu', (await page.content()).includes('anestézii'));
  check('WELLS bez JS chýb', errs.length===0, errs.join(' | '));
  await ctx.close();
}

// ── CEAP 2020 ──
{
  const {page, ctx, errs} = await open('/tools/CEAP/');
  console.log('— CEAP —');
  for (const id of ['c2r','c4a','c4b','c4c','c6r','esi','ese','sym_s','sym_a'])
    check(`má prvok revízie 2020: ${id}`, (await page.$('#'+id)) !== null);
  check('starý nedelený C4 už neexistuje', (await page.$('#c4')) === null);
  check('staré nedelené Es už neexistuje', (await page.$('#es')) === null);
  await page.check('#c4b'); await page.check('#ep'); await page.check('#as'); await page.check('#pr'); await page.waitForTimeout(100);
  let r = await txt(page,'#result-area');
  check('C4b, Ep, As, Pr sa vypíše', r.includes('C4b, Ep, As, Pr'), r);
  check('bez S/A upozorní, že je súčasťou základnej CEAP', r.includes('S/A'));
  await page.check('#sym_s'); await page.waitForTimeout(100);
  r = await txt(page,'#result-area');
  check('so symptómami: C4b S, Ep, As, Pr', r.includes('C4b S, Ep, As, Pr'), r);
  check('po doplnení S/A upozornenie zmizne', !r.includes('S/A'));
  await page.check('#ad'); await page.waitForTimeout(100);
  r = await txt(page,'#result-area');
  check('viac anatomických lokalizácií naraz: As,Ad', r.includes('As,Ad'), r);
  await page.check('#an'); await page.waitForTimeout(100);
  check('An zruší As/Ad (vylučujú sa)', !(await page.isChecked('#as')) && !(await page.isChecked('#ad')) && (await page.isChecked('#an')));
  await page.check('#ap'); await page.waitForTimeout(100);
  check('Ap zruší An', !(await page.isChecked('#an')) && (await page.isChecked('#ap')));
  await page.check('#esi'); await page.waitForTimeout(100);
  check('Esi sa vypíše', (await txt(page,'#result-area')).includes('Esi'));
  await page.click('#reset-button'); await page.waitForTimeout(100);
  check('reset skryje výsledok', !(await page.$eval('#result-area', e=>e.className)).includes('visible'));
  check('CEAP bez JS chýb', errs.length===0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} testov ZLYHALO` : '\nVšetky skórovacie testy prešli.');
process.exit(failed ? 1 : 0);
