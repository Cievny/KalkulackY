# Edge funkcia `extrakcia` — AI vyťahovanie údajov z očisteného textu

Bezpečný most medzi appkou a cloud LLM. **Osobné údaje sem nikdy nechodia** —
appka text najprv lokálne očistí (`tools/scrub.js`) a ukáže používateľovi
náhľad, čo odchádza. Funkcia navyše má serverovú poistku: keby v texte
predsa zostal RČ / e-mail / telefón, požiadavku **odmietne** (fail-closed).

Jedna funkcia obsluhuje viac „druhov“ textu (`kind` v tele požiadavky):

| `kind`       | Odkiaľ                                   | Čo vráti                                     |
|--------------|------------------------------------------|----------------------------------------------|
| `poziadavka` | Aorta / požiadavky – 🤖 Skús AI          | polia žiadanky (diagnóza, rozmery, výkon…)   |
| `evk`        | EVK – 🎙️ Z diktátu (`tools/diktat-evk.js`) | štruktúra výkonu (prístup, DSA, intervencie, uzáver…) |

## Ako to celé funguje

1. Používateľ vloží text (žiadanku, alebo heslovitý diktát výkonu) → klikne **🤖 Skús AI** / **🔒 Očistiť a skontrolovať**.
2. Prehliadač lokálne vyškrtne RČ, telefón, e-mail, dátum narodenia, „pacient Meno“, lekára s titulom, obec, lôžko…
3. Ukáže náhľad **presne toho, čo odíde** → používateľ potvrdí (a môže text ešte opraviť).
4. Očistený klinický text ide sem → LLM vráti štruktúrované polia (JSON podľa schémy daného `kind`).
5. Appka z nich **lokálne** vyplní formulár; identifikáciu pacienta (RČ, meno) zadáva lekár ručne.
6. Návrhy AI sú označené 🤖 / podfarbené žlto a **nič sa neuloží automaticky** — človek ich musí skontrolovať a uložiť.

### Diktát EVK (`kind: "evk"`)

Lekár nadiktuje heslovitý protokol (na sále: 🎤 klávesnice telefónu, Win+H,
alebo vloží prepis). V okne je červené upozornenie *nediktovať meno ani RČ*.
Očista beží v **konzervatívnom režime** (štruktúrované identifikátory padnú;
prísne mazanie dvojíc Veľkých slov sa nepoužíva, lebo by zničilo názvy
devices ako „Stent Pulsar“) — preto náhľad pred odoslaním číta lekár.

Odpoveď AI (`fields`) sa mapuje do formulára EVK cez `DiktatEVK.apply()`:
riečisko a laterality → prístup → DSA po tepnách (aj segmenty) → výmena
sheathu / prechod / vodič → intervencie (predilatácia, PTA, DEB, IVL, stent,
postdilatácia, stentgraft, trombektómia, aterektómia, re-entry, kissing,
CERAB) → uzáver, úspech, komplikácie, štúdia, záver. Hodnoty mimo katalógu
idú do voľby „vlastný“ + text; čo sa nedá zaradiť, sa vypíše v zozname
**⚠️ nezaradené**, aby lekár doplnil ručne. Testovací korpus:
`tests/diktat-korpus/*.json` (`node tests/diktat-evk.mjs`).

## Zapnutie (raz, spraví správca)

Potrebné: API kľúč od Anthropic. Kľúč patrí **len** do Supabase (Project
Settings → Edge Functions → Secrets), nikdy do repozitára ani do chatu.

```bash
# 1) prepoj projekt (project ref nájdeš v URL Supabase dashboardu)
supabase link --project-ref ncqtiicfqhaturjlfxcj

# 2) ulož API kľúč ako tajomstvo (alebo cez dashboard: Edge Functions → Secrets)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 3) (voliteľné) iný model; pre diktát EVK odporúčame claude-sonnet-5
supabase secrets set EXTRAKCIA_MODEL=claude-sonnet-5

# 4) nasaď
supabase functions deploy extrakcia
```

V konzole Anthropic nastav mesačný limit výdavkov (spend limit).

Kým to nie je nasadené, tlačidlá fungujú po náhľad očisteného textu
(užitočné aj samo o sebe); po kliknutí *Odoslať* len oznámia
„AI zatiaľ nie je nastavené“ / „Funkcia nie je nasadená“ — appka tým nijako netrpí.

## Limity

- text max. 12 000 znakov; odpoveď max. 4096 tokenov (`evk`), 1024 (`poziadavka`)
- len prihlásený používateľ (Supabase JWT); kiosk účty nie sú vylúčené, ale nemajú čo diktovať

## Právne / GDPR

- S Anthropic uzavrieť **DPA** so **zero-retention** (žiadny tréning, nulové
  uchovávanie) — inak sa aj anonymný text môže niekde odložiť.
- Scrubber + náhľad sú technická poistka; zodpovednosť za to, že v texte nie sú
  osobné údaje, zostáva na odosielateľovi. Náhľad preto ukazuj a čítaj.
- Overenie prístupu: funkcia pustí len prihláseného používateľa (Supabase JWT).
