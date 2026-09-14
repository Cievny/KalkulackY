// Testy WIfI logiky nástroja Defektológia (/tools/defektologia/).
// Overujú stupne W / I / fI proti definíciám SVS WIfI (Mills 2014) a IDSA/IWGDF
// a to, že nevyplnená končatina sa v náleze nehlási ako "bez defektu".
// Spustenie: node tests/defektologia.mjs
import {createServer} from 'http';
import {readFileSync} from 'fs';
import {join, extname} from 'path';
const {chromium} = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = process.env.REPO_ROOT || process.cwd();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const srv = createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  try{
    res.writeHead(200,{'Content-Type':MIME[extname(p)]||'text/plain'});
    res.end(readFileSync(join(ROOT,p)));
  }catch(e){ res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>srv.listen(8241,r));

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.route('**/cdn.tailwindcss.com/**', r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
await page.route('**/fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
const errs = [];
page.on('pageerror', e=>errs.push(e.message));
await page.goto('http://localhost:8241/tools/defektologia/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(500);

let failed = 0;
const check = (name, cond, extra='') => { console.log((cond?'✅':'❌')+' '+name+(cond?'':'   → '+extra)); if(!cond) failed++; };
const score = () => page.$eval('#right-wifi-score', e=>e.textContent);
const stage = () => page.$eval('#right-clinical-stage', e=>e.textContent);
const note  = () => page.$eval('#right-wifi-note', e=>e.textContent);
const set  = async (s,v)=>{ await page.selectOption(s,v); await page.waitForTimeout(100); };
const fill = async (s,v)=>{ await page.fill(s,v); await page.waitForTimeout(100); };
const chk  = async (n,v)=>{ await page.check(`input[name="right-${n}"][value="${v}"]`); await page.waitForTimeout(100); };
const unchk= async (n,v)=>{ await page.uncheck(`input[name="right-${n}"][value="${v}"]`); await page.waitForTimeout(100); };

// Neúplné vstupy sa nesmú dopočítať nulou
check('prázdny formulár nedopočíta štádium', (await stage()).includes('-'), await stage());
check('prázdny formulár vypíše čo chýba', (await note()).includes('chýba'), await note());
await fill('#right-velkost-l','20'); await fill('#right-velkost-w','15');
check('rozmer bez hĺbky nedá potichu W1', (await score()).startsWith('W-'), await score());

// Wound – rozhoduje gangréna a postihnuté štruktúry, nie rozmer v mm
await set('#right-w-gangrena','extenzivna');
check('extenzívna gangréna = W3', (await score()).startsWith('W3'), await score());
await set('#right-w-gangrena','prsty');
check('gangréna obmedzená na prsty = W2', (await score()).startsWith('W2'), await score());
await set('#right-w-gangrena','ziadna'); await set('#right-w-struktury','povrch');
check('malý plytký vred = W1', (await score()).startsWith('W1'), await score());
await set('#right-w-struktury','kost_falanga');
check('obnažená kosť distálnej falangy = W1', (await score()).startsWith('W1'), await score());
await set('#right-w-struktury','kost');
check('obnažená kosť/kĺb/šľacha = W2', (await score()).startsWith('W2'), await score());
await set('#right-w-struktury','peta_plytka');
check('plytký vred päty bez kalkanea = W2', (await score()).startsWith('W2'), await score());
await set('#right-w-struktury','rozsiahly');
check('rozsiahly vred prednožia/stredonožia = W3', (await score()).startsWith('W3'), await score());
await set('#right-w-struktury','peta_hlboka');
check('vred päty plnej hrúbky = W3', (await score()).startsWith('W3'), await score());
await set('#right-w-struktury','kost');

// foot Infection – IDSA/IWGDF
await chk('infekcia','Opuch/Indurácia');
check('1 lokálny znak = fI0 (nie je to ešte infekcia)', (await score()).endsWith('fI0'), await score());
await chk('infekcia','Lokálna citlivosť/bolesť');
check('2 lokálne znaky = fI1', (await score()).endsWith('fI1'), await score());
await set('#right-erytem-rozsah','velke');
check('erytém > 2 cm = fI2', (await score()).endsWith('fI2'), await score());
await set('#right-erytem-rozsah','male');
await chk('sirs','Tachykardia > 90/min');
check('1 SIRS kritérium nedá fI3', (await score()).endsWith('fI1'), await score());
await chk('sirs','Tachypnoe > 20/min alebo PaCO₂ < 32 mmHg');
check('2 SIRS kritériá = fI3', (await score()).endsWith('fI3'), await score());
await unchk('sirs','Tachykardia > 90/min');
await unchk('sirs','Tachypnoe > 20/min alebo PaCO₂ < 32 mmHg');
await unchk('infekcia','Opuch/Indurácia');
await unchk('infekcia','Lokálna citlivosť/bolesť');
await chk('hlbke','Osteomyelitída');
check('osteomyelitída sama = fI2', (await score()).endsWith('fI2'), await score());

// Ischémia – TP má prednosť, ABI > 1,3 je nevýpovedné
await fill('#right-cievy-abi','1.45');
check('ABI 1,45 neodvodí ischemický stupeň', (await score()).includes('I- '), await score());
check('ABI > 1,3 zobrazí upozornenie na mediokalcinózu',
  await page.$eval('#right-abi-warn', e=>!e.classList.contains('hidden')));
await fill('#right-cievy-tp','25');
check('TP 25 mmHg = I3 (TP má prednosť pred ABI)', (await score()).includes('I3'), await score());
await fill('#right-cievy-tp','70');
check('TP 70 mmHg = I0', (await score()).includes('I0'), await score());
await fill('#right-cievy-tp','');
await fill('#right-cievy-abi','0.80');
check('ABI 0,80 = I0', (await score()).includes('I0'), await score());
await fill('#right-cievy-abi','0.39');
check('ABI 0,39 = I3', (await score()).includes('I3'), await score());

// Štádium sa berie zo zdieľanej tabuľky v staging.js
await fill('#right-cievy-abi','0.85');   // I0
await set('#right-w-struktury','kost');  // W2
const ocakavane = await page.evaluate(()=>window.Staging.wifi(2,0,2).stadium);
check('štádium sa berie zo zdieľanej tabuľky v staging.js (W2 I0 fI2)',
  ocakavane === 3 && (await stage()).includes(String(ocakavane)), (await score())+' / '+(await stage()));
check('defektológia nemá vlastnú kópiu WIfI matice',
  !(await page.content()).includes('riskMatrix'));

// Nález: nevyplnená končatina sa nesmie hlásiť ako "bez defektu"
await page.click('#generate-report-btn');
await page.waitForTimeout(300);
const rep = await page.$eval('#report-output', e=>e.value);
check('nevyplnená ľavá DK nie je v náleze "bez defektu"',
  !/ĽAVÁ DOLNÁ KONČATINA\n-+\nKončatina bez defektu/.test(rep));
check('nevyplnená ľavá DK je označená ako nehodnotená', rep.includes('Nehodnotené – údaje neboli zadané'));
check('záver priznáva nehodnotenú ľavú DK', /ľavej DK nehodnotená/.test(rep));
check('nález obsahuje rozsah rany a gangrénu', rep.includes('2b. Rozsah rany'));
check('nález obsahuje hlbšie štruktúry', rep.includes('Hlbšie štruktúry: Osteomyelitída'));

// Reset
await page.click('#reset-btn');
await page.waitForTimeout(300);
check('reset vyčistí skóre', (await score()).includes('W-'), await score());
check('reset skryje ABI upozornenie',
  await page.$eval('#right-abi-warn', e=>e.classList.contains('hidden')));

check('žiadne JS chyby', errs.length===0, errs.join(' | '));

await browser.close();
srv.close();
console.log(failed ? `\n${failed} testov defektológie ZLYHALO` : '\nVšetky testy defektológie prešli.');
process.exit(failed ? 1 : 0);
