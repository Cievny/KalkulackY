# cz-app – nezávislá česká kópia (vlastná databáza, vlastné nasadenie)

Samostatný web s **vlastným Supabase projektom** a **vlastným Vercel projektom**.
So slovenskou prevádzkou nezdieľa nič – ani dáta, ani prihlásenie, ani používateľov.
Rozsah zatiaľ: **📥 Požiadavky na terapiu** (`/tools/Aorta/`). Ďalšie nástroje sa
doplnia neskôr. Kópia má **červenú tému** (navigácia, nadpisy, tlačidlá, pozadie),
aby sa na prvý pohľad odlíšila od slovenskej; farby stavov na nástenke ostávajú.

## Ako je to postavené

Súbory v tomto priečinku sú **generované** zo slovenských zdrojov skriptom
`scripts/build_cz_app.py` – kópia je vždy 1:1 so SK verziou. **Needitujte ich ručne**,
pri ďalšom generovaní by sa zmeny prepísali (a CI test `tests/cz-app.mjs` kontroluje,
že kópia zodpovedá zdrojom). Všetko špecifické pre túto inštanciu je v `config.json`.

```
cz-app/
  config.json          ← URL + anon kľúč českého Supabase projektu, názov (JEDINÉ ručne editované)
  supabase_setup.sql   ← schéma pre nový projekt (allowlist, roly, požiadavky, prílohy, RLS)
  tools/config.js      ← generované z config.json
  tools/auth.js        ← prihlásenie + navigácia (len nástroje v kópii)
  tools/login/         ← e-mail + heslo, Google (OAuth cez český projekt)
  tools/Aorta/         ← Požiadavky
  middleware.js, lib/  ← server-side brána (Vercel), rovnaká ako v SK
  vercel.json          ← hlavičky + CSP s URL českého projektu
```

## Zapnutie (raz)

1. **Supabase** → New project (región EU). Z Project Settings → API skopírujte
   *Project URL* a *publishable (anon) key* do `cz-app/config.json`
   a spustite `python3 scripts/build_cz_app.py`. Commit.
2. **Supabase → SQL Editor** → vložte celý `cz-app/supabase_setup.sql`, pred spustením
   upravte riadok **PRVÝ ADMINISTRÁTOR** (e-mail) → Run.
3. **Supabase → Authentication → Users** → Add user (ten istý e-mail, heslo, **Auto Confirm User**).
   **Google prihlásenie:** Google Cloud Console → OAuth client (Web) s redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback` → Client ID + Secret do
   Supabase → Authentication → Providers → Google (Enable). V Authentication → URL
   Configuration nastavte *Site URL* na adresu nasadenia (napr.
   `https://kalkulacky-cz-app.vercel.app`) a pridajte *Redirect URL*
   `https://<adresa>/tools/login/`. Google účet sa pustí ďalej len vtedy, keď je jeho
   e-mail v `povoleni_pouzivatelia` (rovnako ako pri hesle).
4. **Vercel** → Add New Project → tento repozitár → *Root Directory* = `cz-app`
   → Deploy. Voliteľné env premenné `SUPABASE_URL`, `SUPABASE_ANON_KEY` (inak sa
   použijú hodnoty z `config.json`). Vlastná doména podľa potreby.
5. Otvorte `/tools/login/`, prihláste sa, Požiadavky sú na `/tools/Aorta/`.

Ďalších lekárov pridáte do `povoleni_pouzivatelia` (SQL) a založíte im konto
v Authentication → Users. Nástroj Prístupy sa doplní s ďalšou fázou.

## Čo v tejto fáze chýba (zámerne)

- tlačidlá „Napísať nález“ (PEVAR) a odkaz na Záznamy vedú na nástroje, ktoré
  v kópii ešte nie sú – doplnia sa pri rozšírení rozsahu v `TOOLS` v generátore
- AI import požiadavky (🤖 Skús AI) potrebuje edge funkciu `extrakcia` nasadenú
  v českom projekte + vlastný API kľúč; bez nej stránka funguje po náhľad očisteného textu
- texty sú zatiaľ slovenské (1:1 kópia); preklad do češtiny je samostatný krok

## Bezpečnosť

Rovnaké pravidlá ako v SK: databáza default-deny (RLS cez allowlist), server-side brána
pred každou chránenou stránkou, osobné údaje nikdy neopúšťajú inštanciu. Anon kľúč je
verejný identifikátor projektu (patrí do repozitára); `service_role` kľúč sem nikdy.
