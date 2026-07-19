// Smoke testy cievny.sk – spúšťané v CI na každý push (node tests/smoke.mjs).
// Overia, že kľúčové nástroje sa načítajú bez JS chýb a generujú výstup.
import {createServer} from 'http';
const {chromium} = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
import {readFileSync} from 'fs';
import {join, extname} from 'path';

const ROOT = process.env.REPO_ROOT || process.cwd();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const srv = createServer((req,res)=>{
  let p = req.url.split('?')[0];
  if(p.endsWith('/')) p += 'index.html';
  try{
    const body = readFileSync(join(ROOT,p));
    res.writeHead(200,{'Content-Type':MIME[extname(p)]||'text/plain'});
    res.end(body);
  }catch(e){ res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>srv.listen(8199,r));

const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
let failed = 0;
const check = (name, cond) => { console.log((cond?'✅':'❌')+' '+name); if(!cond) failed++; };

async function openPage(path){
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/ncqtiicfqhaturjlfxcj.supabase.co/**', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.addInitScript(()=>{
    sessionStorage.setItem('cievny_auth','1');
    sessionStorage.setItem('cievny_auth_at','tok');
    sessionStorage.setItem('cievny_auth_exp',String(Date.now()+3600000));
    sessionStorage.setItem('cievny_auth_email','test@cievny.sk');
  });
  const errs = [];
  page.on('pageerror', e=>errs.push(e.message));
  await page.goto('http://localhost:8199'+path,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(700);
  return {page, ctx, errs};
}

// EVK: načítanie + panvové riečisko (regresia "ao")
{
  const {page, ctx, errs} = await openPage('/tools/EVK/');
  await page.selectOption('#territory','pelv').catch(()=>{});
  await page.waitForTimeout(400);
  const out = await page.$eval('#out',e=>e.value).catch(()=>'');
  check('EVK načítanie + panvové riečisko bez chýb', errs.length===0 && out.length>50);
  await page.selectOption('#territory','both').catch(()=>{});
  await page.waitForTimeout(300);
  check('EVK obe riečiská bez chýb', errs.length===0);
  await ctx.close();
}

// PEVAR: načítanie + DRG tab
{
  const {page, ctx, errs} = await openPage('/tools/PEVAR/');
  await page.click('#tnb-drg').catch(()=>{});
  await page.waitForTimeout(300);
  const drg = await page.$eval('#drg_output',e=>e.textContent).catch(()=>'');
  check('PEVAR načítanie + DRG (8r8q3)', errs.length===0 && drg.includes('8r8q3'));
  await ctx.close();
}

// CAS: načítanie + DRG tab
{
  const {page, ctx, errs} = await openPage('/tools/CAS-generator/');
  await page.click('#tnb-drg').catch(()=>{});
  await page.waitForTimeout(300);
  const drg = await page.$eval('#drg_output',e=>e.textContent).catch(()=>'');
  check('CAS načítanie + DRG (32301.2)', errs.length===0 && drg.includes('32301.2'));
  await ctx.close();
}

// Board nástroje – len načítanie bez JS chýb
for(const [name,path] of [['RAS','/tools/RAS/'],['Program','/tools/Program/'],['Objednávky','/tools/objednavky/'],['Aorta','/tools/Aorta/'],['Štatistiky','/tools/analytics/'],['Záznamy','/tools/zaznamy/'],['Kontroly','/tools/kontroly/'],['Cesta pacienta','/tools/pacient/']]){
  const {ctx, errs} = await openPage(path);
  check(name+' bez JS chýb', errs.length===0);
  await ctx.close();
}

// CZ EVK – načítanie bez chýb
{
  const {ctx, errs} = await openPage('/cz/tools/EVK/');
  check('CZ EVK bez JS chýb', errs.length===0);
  await ctx.close();
}

// Veľín (tablet) – s platnou reláciou preskočí bránu a ukáže board bez JS chýb
{
  const {page, ctx, errs} = await openPage('/tools/velin/');
  const boardVisible = await page.isVisible('#board').catch(()=>false);
  check('Veľín board bez JS chýb', errs.length===0 && boardVisible);
  await ctx.close();
}

await browser.close();
srv.close();
console.log(failed ? `\n${failed} testov ZLYHALO` : '\nVšetky smoke testy prešli.');
process.exit(failed ? 1 : 0);
