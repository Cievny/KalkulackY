# Edge funkcia `extrakcia` — AI vyťahovanie údajov z očisteného textu

Bezpečný most medzi appkou a cloud LLM. **Osobné údaje sem nikdy nechodia** —
appka text najprv lokálne očistí (`tools/scrub.js`) a ukáže používateľovi
náhľad, čo odchádza. Funkcia navyše má serverovú poistku: keby v texte
predsa zostal RČ / e-mail / telefón, požiadavku **odmietne** (fail-closed).

## Ako to celé funguje

1. Používateľ vloží text žiadanky/CT → klikne **🤖 Skús AI**.
2. Prehliadač lokálne vyškrtne mená, RČ, telefón, dátum narodenia, obec, lôžko…
3. Ukáže náhľad **presne toho, čo odíde** → používateľ potvrdí.
4. Očistený klinický text ide sem → LLM vráti štruktúrované polia.
5. RČ a iniciály doplní appka **lokálne** (z pôvodného textu, nikdy nešli von).
6. Návrhy AI sú označené 🤖 a **neodškrtnuté** — človek ich musí potvrdiť.

## Zapnutie (raz, spraví správca)

Potrebné: [Supabase CLI](https://supabase.com/docs/guides/cli) a API kľúč od Anthropic.

```bash
# 1) prepoj projekt (project ref nájdeš v URL Supabase dashboardu)
supabase link --project-ref ncqtiicfqhaturjlfxcj

# 2) ulož API kľúč ako tajomstvo (do repozitára NIKDY nepatrí)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 3) (voliteľné) iný model, default je lacný a rýchly Haiku
supabase secrets set EXTRAKCIA_MODEL=claude-haiku-4-5-20251001

# 4) nasaď
supabase functions deploy extrakcia
```

Kým to nie je nasadené, tlačidlo **🤖 Skús AI** funguje po náhľad očisteného
textu (užitočné aj samo o sebe); po kliknutí *Odoslať* len oznámi
„AI zatiaľ nie je nastavené“ — appka tým nijako netrpí.

## Právne / GDPR

- S Anthropic uzavrieť **DPA** so **zero-retention** (žiadny tréning, nulové
  uchovávanie) — inak sa aj anonymný text môže niekde odložiť.
- Scrubber + náhľad sú technická poistka; zodpovednosť za to, že v texte nie sú
  osobné údaje, zostáva na odosielateľovi. Náhľad preto ukazuj a čítaj.
- Overenie prístupu: funkcia pustí len prihláseného používateľa (Supabase JWT).
