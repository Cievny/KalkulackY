# cievny.sk – klinické nástroje cievnej chirurgie

Statická webová aplikácia (HTML/JS, bez frameworku) nasadzovaná cez **GitHub Pages z vetvy `main`**.
Backend je **Supabase** (PostgREST REST API, Auth cez e‑mail + heslo, Storage pre prílohy).

## Nástroje
- **📅 Program** (`/tools/Program/`) – denný program výkonov, stavy pacienta + stopky trvania, denný/týždňový/mesačný pohľad, TV režim (`?tv=1`).
- **📥 Požiadavky** (`/tools/Aorta/`) – pipeline indikácií (Aorta + Iné), ESVS 2024 upozornenia, dispenzarizácia, prílohy.
- **📝 Popisy** – `/tools/EVK/`, `/tools/CAS-generator/`, `/tools/PEVAR/`, `/tools/zaznamy/` (generátory nálezov + NIS‑safe kopírovanie).
- **📢 Oznamy** (`/tools/oznamy/`), **💡 Nápady** (`/tools/ideas/`), **📊 Štatistiky** (`/tools/analytics/`), **💾 Záloha** (`/tools/zaloha/`).
- **📬 Schránka** (`/schranka/`) – verejný anonymný formulár podnetov (jediný anon zápis do DB).
- Česká verzia je pod `/cz/` (samostatné `cz_*` tabuľky).

## Prihlásenie a bezpečnosť
- Každý používateľ sa prihlasuje **vlastným e‑mailom a heslom** (kontá sa zakladajú v Supabase → Authentication → Users). Prihlásenie len heslom už nie je možné.
- **Databáza je zamknutá**: RLS povoľuje prístup k pacientskym/klinickým dátam iba role `authenticated`. Jediná anon výnimka je zúžený INSERT do `ideas` pre verejnú schránku.
- Zdieľaná logika (auth, navigácia, PWA) je v `tools/auth.js` (+ `cz/tools/auth.js`).

## Nasadenie DB (poradie spustenia SQL)
Skripty sú idempotentné, ale **poradie je dôležité** kvôli zdieľaným tabuľkám:
1. `supabase_setup.sql` – hlavný skript (všetky SK tabuľky, stĺpce, RLS zámok, buckety).
2. `cz/supabase_setup.sql` – české `cz_*` tabuľky a ich RLS.

Skripty možno bezpečne spustiť opakovane (`IF NOT EXISTS` / `IF EXISTS`).

## Zálohy
- Automaticky: GitHub Actions workflow `.github/workflows/backup.yml` beží **2× denne** (~6:07 a ~16:07 SELČ), stránkuje všetky tabuľky a sťahuje prílohy z bucketov `aorta-prilohy` aj `oznamy-prilohy`. Vyžaduje secrets `SUPABASE_BACKUP_EMAIL` a `SUPABASE_BACKUP_PASSWORD`. Pri chybe workflow **spadne** (nezamaskuje prázdnu zálohu).
- Ručne: `/tools/zaloha/` stiahne JSON všetkých tabuliek (bez súborových príloh).

## Vývoj a nasadenie
Zmeny sa musia dostať do `main`, aby boli viditeľné na GitHub Pages. Odporúčaný postup:
```
git add -A && git commit -m "…"
git push origin <feature-branch>
git checkout main && git merge --ff-only <feature-branch> && git push origin main
git checkout <feature-branch>
```
Rýchla kontrola JS: extrahovať `<script>` blok a `node --check`. Smoke testy cez Playwright (Chromium v `/opt/pw-browsers/chromium`) s lokálnym serverom a mockom Supabase.
