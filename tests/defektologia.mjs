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

// GLASS (GVG 2019) – štádium z rovnakej matice FP x IP ako EVK
const glassTxt = () => page.$eval('#right-glass-result', e=>e.textContent);
check('bez FP/IP je GLASS nezadané', (await glassTxt()).includes('nezadané'), await glassTxt());
await set('#right-glass-fp','0'); await set('#right-glass-ip','0');
check('FP0 + IP0 = bez signifikantnej choroby',
  (await glassTxt()).includes('bez signifikantnej'), await glassTxt());
await set('#right-glass-fp','1'); await set('#right-glass-ip','1');
check('FP1 + IP1 = GLASS I', (await glassTxt()).includes('štádium I (') , await glassTxt());
await set('#right-glass-fp','2'); await set('#right-glass-ip','3');
check('FP2 + IP3 = GLASS II', (await glassTxt()).includes('štádium II '), await glassTxt());
await set('#right-glass-fp','4'); await set('#right-glass-ip','0');
check('FP4 + IP0 = GLASS III', (await glassTxt()).includes('štádium III'), await glassTxt());
await set('#right-glass-im','P2');
check('IM P2 sa vypíše v poznámke',
  (await page.$eval('#right-glass-note', e=>e.textContent)).includes('P2'));
check('bez zvolenej TAP nástroj upozorní',
  (await page.$eval('#right-glass-note', e=>e.textContent)).includes('TAP'));
await set('#right-glass-tap','ATP');
check('po zvolení TAP upozornenie zmizne',
  !(await page.$eval('#right-glass-note', e=>e.textContent)).includes('TAP nie je'));

// celá matica GLASS musí sedieť s tou v staging.js (žiadna druhá kópia)
const glassZhoda = await page.evaluate(()=>{
  const ocak = [[0,1,1,2,3],[1,1,2,2,3],[1,2,2,2,3],[2,2,2,3,3],[3,3,3,3,3]];
  const naz = ['I','II','III'];
  for(let fp=0; fp<5; fp++) for(let ip=0; ip<5; ip++){
    const v = ocak[fp][ip];
    const got = window.Staging.glassStadium(fp, ip);
    if((v===0 ? null : naz[v-1]) !== got) return `FP${fp} IP${ip}: ${got}`;
  }
  return 'ok';
});
check('všetkých 25 kombinácií GLASS sedí s GVG 2019 maticou', glassZhoda === 'ok', glassZhoda);
await set('#right-glass-fp','2'); await set('#right-glass-ip','3');

// VQI CLTI (sekcia 12) – riziko pacienta, počíta zdieľaný /tools/vqi-clti.js
const vqiTxt = () => page.$eval('#vqi-skupina', e=>e.textContent);
const vqiPct = () => page.$eval('#vqi-prezitie', e=>e.textContent);
check('VQI bez vstupov je nezadané', (await vqiTxt()).includes('nezadané'), await vqiTxt());
await set('#vqi-vek','60-70');
check('čiastočný VQI vstup vymenuje, čo chýba',
  (await page.$eval('#vqi-note', e=>e.textContent)).includes('Chýba'));
// profil B z oficiálnej kalkulačky SVS: 88 % / 43 % → vysoké riziko
for (const [k,v] of Object.entries({vek:'71-80', rasa:'biela', indikacia:'tkanivova_strata', ichs:'im_stabilna',
  sz:'ano', chocbp:'liecena', ckd:'3', ambulacia:'leziaci', fajcenie:'aktivny', statin:'ano',
  antiagregans:'ano', betablokator:'nie'})) await set('#vqi-'+k, v);
check('VQI profil B → vysoké riziko', (await vqiTxt()).includes('Vysoké'), await vqiTxt());
check('VQI profil B → 30 dní 88 %, 2 roky 43 % (ako appka SVS)',
  (await vqiPct()).includes('88 %') && (await vqiPct()).includes('43 %'), await vqiPct());
check('VQI karta má triedu vysokého rizika',
  (await page.$eval('#vqi-card', e=>e.className)).includes('risk-stage-3'));
// referent → > 99 % / 96 %
for (const [k,v] of Object.entries({vek:'<60', rasa:'biela', indikacia:'kludova_bolest', ichs:'ziadna',
  sz:'nie', chocbp:'ziadna', ckd:'1', ambulacia:'nezavisly', fajcenie:'nikdy', statin:'nie',
  antiagregans:'nie', betablokator:'nie'})) await set('#vqi-'+k, v);
check('VQI referent → nízke riziko, > 99 % / 96 %',
  (await vqiTxt()).includes('Nízke') && (await vqiPct()).includes('> 99 %') && (await vqiPct()).includes('96 %'), await vqiPct());

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
check('nález obsahuje GLASS štádium', rep.includes('11. Anatómia (GLASS): GLASS štádium II'), rep.split('11. Anatómia')[1]?.slice(0,80));
check('nález obsahuje cieľovú tepnu', rep.includes('a. tibialis posterior'));
check('záver obsahuje GLASS', /ZÁVER[\s\S]*GLASS II/.test(rep));
check('nález obsahuje blok RIZIKO PACIENTA (VQI CLTI)', rep.includes('RIZIKO PACIENTA (VQI CLTI)'));
check('nález uvádza 30-dňové aj 2-ročné prežitie', /30 dní > 99 %, 2 roky 96 %/.test(rep), rep.split('RIZIKO PACIENTA')[1]?.slice(0,160));
check('záver obsahuje rizikovú skupinu VQI', /ZÁVER[\s\S]*Riziko pacienta podľa VQI: nízke/.test(rep));

// Reset
await page.click('#reset-btn');
await page.waitForTimeout(300);
check('reset vyčistí skóre', (await score()).includes('W-'), await score());
check('reset vyčistí VQI', (await vqiTxt()).includes('nezadané'), await vqiTxt());
check('reset skryje ABI upozornenie',
  await page.$eval('#right-abi-warn', e=>e.classList.contains('hidden')));

check('žiadne JS chyby', errs.length===0, errs.join(' | '));

await browser.close();
srv.close();
console.log(failed ? `\n${failed} testov defektológie ZLYHALO` : '\nVšetky testy defektológie prešli.');
process.exit(failed ? 1 : 0);
