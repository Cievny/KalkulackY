# cievny.sk – klinické nástroje cievnej chirurgie

Statická webová aplikácia (HTML/JS, bez frameworku) nasadzovaná cez **GitHub Pages z vetvy `main`**.
Backend je **Supabase** (PostgREST REST API, Auth cez e‑mail + heslo, Storage pre prílohy).

## Nástroje
- **📅 Program** (`/tools/Program/`) – denný program výkonov, stavy pacienta + stopky trvania, denný/týždňový/mesačný pohľad, TV režim (`?tv=1`).
- **📥 Požiadavky** (`/tools/Aorta/`) – pipeline indikácií (Aorta + Iné), ESVS 2024 upozornenia, dispenzarizácia, prílohy.
- **🩻 Objednávky CEUS/CT** (`/tools/objednavky/`) – odblokované dni (kapacita alebo časové termíny po nastaviteľnom kroku), objednávanie pacientov na termín, viac termínov na pacienta. Otvárať dni môžu len administrátori.
- **📝 Popisy** – `/tools/EVK/`, `/tools/CAS-generator/`, `/tools/PEVAR/`, `/tools/zaznamy/` (generátory nálezov + NIS‑safe kopírovanie).
- **📢 Oznamy** (`/tools/oznamy/`), **💡 Nápady** (`/tools/ideas/`), **📊 Štatistiky** (`/tools/analytics/`), **💾 Záloha** (`/tools/zaloha/`).
- **🔑 Prístupy** (`/tools/pristupy/`) – správa zoznamu povolených e‑mailov (allowlist); len administrátori.
- **📺 TV brána** (`/tools/tv/`) – kiosk prihlásenie krátkym kódom pod kontom `tv@cievny.sk` (len na čítanie), spustí Program v TV režime.
- **📬 Schránka** (`/schranka/`) – verejný anonymný formulár podnetov (jediný anon zápis do DB).
- Česká verzia je pod `/cz/` (samostatné `cz_*` tabuľky).

## Prihlásenie a bezpečnosť
- Prihlásenie **vlastným e‑mailom a heslom** (kontá sa zakladajú v Supabase → Authentication → Users) alebo **cez Google** (OAuth; treba zapnúť provider v Supabase + OAuth client v Google Cloud s redirect URI `https://<projekt>.supabase.co/auth/v1/callback`). Prihlásenie len heslom (bez e‑mailu) nie je možné. CZ verzia je zámerne len e‑mail+heslo (bez Google).
- **Allowlist**: k dátam sa dostanú iba e‑maily v tabuľke `povoleni_pouzivatelia` (funkcia `je_povoleny()`), aj pri prihlásení cez Google. Spravuje sa na `/tools/pristupy/` alebo priamo v tabuľke.
- **Roly cez RLS**: povolený používateľ číta všetko a zapisuje pacientske dáta; konto `tv@cievny.sk` má **len čítanie**; otváranie dní v objednávkach (`objednavky_dni`) a správu allowlistu smú **len administrátori** (`je_admin()` – zoznam e‑mailov v SQL aj v JS `ADMINS`).
- Jediná anon výnimka je zúžený INSERT do `ideas` pre verejnú schránku.
- Zdieľaná logika (auth, navigácia, PWA, Google, kiosk routing) je v `tools/auth.js` (+ `cz/tools/auth.js`).

## Nasadenie DB (poradie spustenia SQL)
Skripty sú idempotentné, ale **poradie je dôležité**:
1. `supabase_setup.sql` – hlavný skript (SK tabuľky, stĺpce, buckety, základné RLS politiky).
2. `cz/supabase_setup.sql` – české `cz_*` tabuľky a ich RLS.
3. **`spustit_na_konci.sql`** – doplní stĺpce objednávok, zámok proti dvojitému objednaniu a **allowlist + roly (`je_povoleny`/`je_tv`/`je_admin`)**. **Bez tohto kroku ostane DB v režime „ktokoľvek prihlásený" – nezabudnite ho spustiť ako posledný.**

Skripty možno bezpečne spustiť opakovane (`IF NOT EXISTS` / `IF EXISTS`). Overené na Postgres 16.

## Zálohy
- Automaticky: GitHub Actions workflow `.github/workflows/backup.yml` beží **2× denne** (~6:07 a ~16:07 SELČ), stránkuje všetky tabuľky a sťahuje prílohy z bucketov `aorta-prilohy` aj `oznamy-prilohy`. Pri chybe workflow **spadne** (nezamaskuje prázdnu zálohu).
- **Repozitár je verejný, preto sa záloha pred nahraním ako artefakt šifruje (GPG AES256).** Artefakt je bez hesla nečitateľný.
- Potrebné secrets (Settings → Secrets and variables → Actions):
  - `SUPABASE_BACKUP_EMAIL`, `SUPABASE_BACKUP_PASSWORD` – prihlásenie do Supabase (účet s prístupom k dátam),
  - `BACKUP_PASSPHRASE` – heslo na šifrovanie zálohy (uchovajte ho bezpečne mimo repozitára – bez neho zálohu neotvoríte).
- **Dešifrovanie stiahnutého artefaktu:**
  ```
  gpg --output zaloha.tar.gz --decrypt zaloha-RRRR-MM-DD.tar.gz.gpg
  tar xzf zaloha.tar.gz
  ```
- Ručne (bez šifrovania, len na osobné použitie): `/tools/zaloha/` stiahne JSON všetkých tabuliek (bez súborových príloh).

## Vývoj a nasadenie
Zmeny sa musia dostať do `main`, aby boli viditeľné na GitHub Pages. Odporúčaný postup:
```
git add -A && git commit -m "…"
git push origin <feature-branch>
git checkout main && git merge --ff-only <feature-branch> && git push origin main
git checkout <feature-branch>
```
Rýchla kontrola JS: extrahovať `<script>` blok a `node --check`. Smoke testy cez Playwright (Chromium v `/opt/pw-browsers/chromium`) s lokálnym serverom a mockom Supabase.
