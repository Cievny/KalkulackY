// Testy skórovacích kalkulačiek: WELLS (DVT), CEAP (revízia 2020), CAR (ECST-2),
// SVP (Meissner 2021), Villalta a klasifikácia traumy aorty.
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

// ── CAR (ECST-2) ──
{
  const {page, ctx, errs} = await open('/tools/CAR/');
  console.log('— CAR —');
  const vypln = async (stenoza, noccl) => {
    await page.fill('#stenosis', String(stenoza)); await page.selectOption('#event-type','T');
    await page.fill('#days-since-event','10'); await page.fill('#age','70');
    await page.check(`input[name="near-occlusion"][value="${noccl}"]`);
    await page.click('#car-risk-form button[type=submit]'); await page.waitForTimeout(150);
    return (await txt(page,'#result-container')).match(/(\d+)%/)?.[1];
  };
  const r70 = await vypln(70,'No'), r90 = await vypln(90,'No');
  check('vyššia stenóza → vyššie riziko', Number(r90) >= Number(r70), r70+' vs '+r90);
  const n60 = await vypln(60,'Yes'), n95 = await vypln(95,'Yes');
  check('pri takmer oklúzii sa zadané % stenózy nepripočítava druhýkrát (60 % aj 95 % dá to isté)', n60 === n95, n60+' vs '+n95);
  check('takmer oklúzia znižuje riziko oproti 90 % stenóze bez nej (záporný koeficient)', Number(n95) < Number(r90), n95+' vs '+r90);
  const rep = await page.$eval('#report-output', e=>e.textContent);
  check('správa je po slovensky (áno/nie, nie Yes/No)', /Takmer oklúzia: áno/.test(rep) && !/: Yes|: No/.test(rep));
  check('CAR bez JS chýb', errs.length===0, errs.join(' | '));
  await ctx.close();
}

// ── SVP (Meissner 2021) ──
{
  const {page, ctx, errs} = await open('/tools/SVP/');
  console.log('— SVP —');
  check('prázdne = Sx Vx Px', (await txt(page,'#resultCode')) === 'Sx Vx Px', await txt(page,'#resultCode'));
  await page.check('#symptomsGroup input[value="S3a"]'); await page.check('#symptomsGroup input[value="S2"]');
  await page.check('#varicesGroup input[value="V2"]'); await page.waitForTimeout(100);
  check('viac kódov v doméne: S2,3a (poradie podľa klasifikácie, písmeno raz)', (await txt(page,'#resultCode')).startsWith('S2,3a V2'), await txt(page,'#resultCode'));
  await page.click('#addSegmentBtn');
  await page.selectOption('#anatomySegments select >> nth=0', 'GV'); await page.waitForTimeout(50);
  await page.selectOption('#anatomySegments select >> nth=1', 'left');
  await page.selectOption('#anatomySegments select >> nth=2', 'R');
  await page.selectOption('#anatomySegments select >> nth=3', 'NT'); await page.waitForTimeout(100);
  check('segment P: LGV,R,NT', (await txt(page,'#resultCode')) === 'S2,3a V2 P LGV,R,NT', await txt(page,'#resultCode'));
  await page.click('#interpretBtn');
  await page.fill('#svpInput', 'S2,3a V0 P LGV,R,NT; RCIV,O,T'); await page.click('#interpretSvpBtn'); await page.waitForTimeout(100);
  const it = await txt(page,'#interpretationResult');
  check('interpretácia: S2 aj S3a', it.includes('Chronická panvová bolesť') && it.includes('genitálne symptómy'), it);
  check('interpretácia: V0', it.includes('Bez brušných'), it);
  check('interpretácia: P segmenty vrátane laterality', it.includes('ľavá gonadálna žila – reflux, netrombotická') && it.includes('pravá spoločná ilická žila – obštrukcia, trombotická'), it);
  await page.fill('#svpInput', 'S2,S3aV2PBGV,R,NT'); await page.click('#interpretSvpBtn'); await page.waitForTimeout(100);
  const it2 = await txt(page,'#interpretationResult');
  check('interpretácia rozumie aj starému zápisu S2,S3aV2P…', it2.includes('genitálne symptómy') && it2.includes('obojstranne gonadálna žila'), it2);
  check('SVP bez JS chýb', errs.length===0, errs.join(' | '));
  await ctx.close();
}

// ── Villalta ──
{
  const {page, ctx, errs} = await open('/tools/Villa/');
  console.log('— Villalta —');
  const nastav = async (body) => { for (const n of ['pain','cramps','heaviness','paraesthesia','pruritus','edema','induration','hyperpigmentation','redness','ectasia','calf_pain']) await page.check(`input[name="${n}"][value="${body[n] ?? 0}"]`); await page.waitForTimeout(80); };
  await nastav({pain:1,cramps:1,heaviness:1,paraesthesia:1});
  check('4 body = bez PTS', (await txt(page,'#result-area')).includes('Bez PTS'), await txt(page,'#result-area'));
  await nastav({pain:1,cramps:1,heaviness:1,paraesthesia:1,pruritus:1});
  check('5 bodov = mierny', (await txt(page,'#result-area')).includes('Mierny'));
  await nastav({pain:2,cramps:2,heaviness:2,paraesthesia:2,pruritus:2});
  check('10 bodov = stredne ťažký', (await txt(page,'#result-area')).includes('Stredne'));
  await nastav({pain:3,cramps:3,heaviness:3,paraesthesia:3,pruritus:3});
  check('15 bodov = ťažký', (await txt(page,'#result-area')).includes('Ťažký'));
  await nastav({}); await page.check('#o_ulcer'); await page.waitForTimeout(80);
  check('vred = ťažký bez ohľadu na body', (await txt(page,'#result-area')).includes('Ťažký') && (await txt(page,'#result-area')).includes('Skóre: 0'));
  check('Villalta bez JS chýb', errs.length===0, errs.join(' | '));
  await ctx.close();
}

// ── Trauma aorty ──
{
  const {page, ctx, errs} = await open('/tools/AorticTrauma/');
  console.log('— Trauma aorty —');
  await page.check('#grade_1'); await page.waitForTimeout(100);
  check('stupeň I: konzervatívne, bez sekcie rizikových znakov', (await txt(page,'#result-area')).includes('Konzervatívny') && !(await page.$eval('#hrp-section', e=>e.className)).includes('visible'));
  await page.check('#grade_3'); await page.waitForTimeout(100);
  check('stupeň III: sekcia rizikových znakov sa zobrazí', (await page.$eval('#hrp-section', e=>e.className)).includes('visible'));
  await page.check('#hrp_1'); await page.waitForTimeout(100);
  check('stupeň III + rizikový znak = emergentne', (await txt(page,'#result-area')).includes('emergentn'));
  await page.check('#grade_4'); await page.waitForTimeout(100);
  check('stupeň IV: okamžitá operácia', (await txt(page,'#result-area')).includes('Okamžitá'));
  check('Trauma aorty bez JS chýb', errs.length===0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(failed ? `\n${failed} testov ZLYHALO` : '\nVšetky skórovacie testy prešli.');
process.exit(failed ? 1 : 0);
