# Kontrola Supabase – 8. 9. 2026

Kontrolovaný projekt: **Výkony** (`ncqtiicfqhaturjlfxcj`, Postgres 17.6) – databáza za `cievny.sk`.
Doplnkovo prezretý aj projekt **USG objednávanie** (`cfavtobowqevetlumktt`), lebo v ňom beží
verejné objednávanie a v projekte Výkony po ňom ostali zvyšky.

Kontrola bola **len čítacia** – v databáze sa nič nemenilo.

## Čo je v poriadku

- **Žiadna nebezpečná `anon` politika.** Jediná anon politika je zúžený INSERT do `ideas`
  pre verejnú schránku (`anon insert ideas schranka`) – presne ako to popisuje README.
- **Všetkých 40 tabuliek v `public` má zapnuté RLS.** Žiadna tabuľka nie je bez RLS.
- **Klinické tabuľky sú správne zamknuté.** Všetky `*_vykony`, `*_followup`, `aorta_*`,
  `denny_program`, `objednavky`, `oznamy`, `kalendar_udalosti`, `material_pouzitie`,
  `zaujimavi_pacienti`, `ideas` aj celá `cz_*` sada: SELECT cez `je_povoleny()`,
  zápis navyše `AND NOT je_tv()`. Žiadne `USING (true)` na pacientskych dátach.
- **Kiosk je blokovaný správne.** Politiky „kiosk nesmie citat …" sú `RESTRICTIVE`,
  takže reálne uberajú prístup (permisívna politika by naopak prístup pridala).
- **Storage.** Obe politikové sady (`aorta-prilohy`, `oznamy-prilohy`) obsahujú
  `je_povoleny()`, zápis a mazanie navyše `NOT je_tv()`. Prílohy si teda neprečíta
  hociktoré prihlásené Google konto.
- **Allowlist a admin funkcie** (`je_povoleny`, `je_admin`, `je_tv`, `je_kiosk`) majú
  nastavený `search_path` a `anon` ich vie zavolať len s výsledkom `false`.
- `app_secrets` má RLS bez politík – cez REST API sa k nemu nikto nedostane.
- Allowlist má 13 e‑mailov, `auth.users` tiež 13 – žiadne konto navyše mimo allowlistu.

## Nálezy (projekt Výkony)

Všetko podstatné pochádza zo **zvyškov prototypu verejného objednávania**
(`orders`, `open_slots`, `pricelist`, `settings`, `app_secrets` + RPC funkcie).
Ostrá verzia tejto aplikácie beží v projekte `cfavtobowqevetlumktt`; tu sú
`orders` aj `open_slots` prázdne, takže dnes žiadne dáta neunikajú – diera je však otvorená.

| # | Závažnosť | Nález |
|---|-----------|-------|
| 1 | **Vysoká** | `orders` má politiku `FOR ALL USING (auth.role() = 'authenticated')` – **obchádza allowlist**. Ktorékoľvek prihlásené konto (aj Google účet mimo `povoleni_pouzivatelia`, aj kiosk `tv@cievny.sk`) môže čítať aj meniť objednávky vrátane mena, dátumu narodenia, telefónu, e‑mailu a poisťovne pacienta. Tabuľka je momentálne prázdna. |
| 2 | **Vysoká** | Vo funkcii `notify_order_emails()` je **natvrdo zapísaný webhook secret** (hlavička `x-webhook-secret`) a URL edge funkcie druhého projektu. Rovnaký secret chráni edge funkciu `order-emails`, ktorá je nasadená aj tu s `verify_jwt = false`, teda je verejne volateľná. Secret treba **rotovať** a držať v premennej prostredia, nie v tele funkcie. |
| 3 | Stredná | `settings` má `SELECT USING (true)` pre `public` – celú tabuľku číta aj **neprihlásený** návštevník. Sú v nej 4 riadky vrátane `notify_email` (osobný e‑mail) a `iban`. |
| 4 | Stredná | `open_slots` a `pricelist` majú tú istú chybu ako `orders` v zápisovej politike (`auth.role() = 'authenticated'`) – zapisovať môže hociktoré prihlásené konto. |
| 5 | Nízka | RPC `create_order`, `lookup_order`, `cancel_order`, `get_booked_slots` sú volateľné rolou `anon`, hoci tu appka nebeží. `lookup_order`/`cancel_order` overujú len ID objednávky + posledných 9 číslic telefónu, bez limitu pokusov. |
| 6 | Nízka | Rozšírenie `pg_net` je nainštalované v schéme `public` ([odporúčanie](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)). |
| 7 | Nízka | V Auth je **vypnutá ochrana pred prezradenými heslami** (HaveIBeenPwned). Zapína sa jedným prepínačom v Authentication → Policies. |

### Výkon (nie bezpečnosť)
- `auth_rls_initplan` na `orders`, `open_slots`, `pricelist`, `settings` – `auth.role()` sa
  vyhodnocuje pre každý riadok; rieši sa zápisom `(select auth.role())`. Po odstránení
  zvyškov (nižšie) padá aj toto.
- Cudzie kľúče bez indexu: `aorta_prilohy.indikacia_id`, `oznam_reakcie.oznam_id`.
- 7 nikdy nepoužitých indexov (`*_vykony_pacient_idx`, `idx_avf_vykony_pacient`,
  `idx_vis_vykony_pacient`) – zostali po zavedení entity pacienta.

## Odporúčaný postup

1. Spustiť **časť A** skriptu [`oprava_zvysky_objednavania.sql`](oprava_zvysky_objednavania.sql)
   – zamkne `orders`, `open_slots`, `pricelist`, `settings` za `je_povoleny()`/`je_admin()`
   a odoberie `anon` právo volať RPC objednávania. Je idempotentná a nič nemaže.
2. **Rotovať webhook secret** edge funkcie `order-emails` (v oboch projektoch) a v novej
   verzii ho čítať z premennej prostredia. Zvážiť zapnutie `verify_jwt` alebo aspoň
   odstránenie nepoužívanej kópie funkcie z projektu Výkony.
3. Keď je isté, že sa zvyšky v projekte Výkony nepoužívajú, odkomentovať a spustiť
   **časť B** – dropne tabuľky, funkcie aj trigger (a tým aj natvrdo zapísaný secret).
4. Zapnúť ochranu pred prezradenými heslami v Auth.
5. Voliteľne: index na `aorta_prilohy.indikacia_id` a `oznam_reakcie.oznam_id`,
   zmazať nepoužívané indexy.

## Projekt USG objednávanie (`cfavtobowqevetlumktt`) – krátka poznámka

Ostrá appka je spravená čisto: prístup ide cez `my_role()` (`superadmin`/`sestra`/`lekar`),
lekár vidí len vlastné objednávky, verejné čítanie `settings` je zúžené na whitelist kľúčov,
tabuľky `fio_requests`, `invoice_counters`, `lookup_attempts`, `phone_verifications` majú RLS
bez politík (dostupné len cez `service_role`). Zvyšné upozornenia linterov sú kozmetické:
6 funkcií bez `search_path`, `pg_net` a `btree_gist` v `public`, veľa `SECURITY DEFINER`
funkcií volateľných rolou `anon` (pri verejnom objednávaní je to zámer, ale trigger funkcie
ako `angio_notify_trigger`, `adhoc_paid_trigger` a spol. by mali mať `REVOKE EXECUTE … FROM anon`)
a rovnako vypnutá ochrana pred prezradenými heslami.
