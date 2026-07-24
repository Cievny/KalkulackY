-- ============================================================
-- RESET DATABÁZY K 1. 9. 2026 — čistý štart ostrej prevádzky.
--
-- ⚠️ PRED SPUSTENÍM (v tomto poradí):
--   1. GitHub → Actions → „Zálohy" → Run workflow → stiahni artefakt
--      (posledná úplná záloha skúšobnej prevádzky mimo Supabase).
--   2. Prečítaj si sekcie B a C – rozhodni, či ich odkomentuješ.
--   3. Celé vlož do Supabase SQL editora a spusti.
--
-- Čo skript robí:
--   KROK 1  skopíruje všetky klinické dáta do schémy `archiv`
--           (appka ju nevidí – nie je v API; len ty cez SQL editor)
--   KROK 2  vyprázdni klinické tabuľky (výkony, follow-upy, materiál,
--           zaujímaví pacienti, pacienti + RČ) – SK aj CZ
--   B/C     voliteľné: program/požiadavky/oznamy/kalendár (odkomentuj)
--
-- Čo NIKDY nemaže: povolení používatelia (prihlasovanie!), app_secrets.
-- Opakované spustenie nič nepokazí (archív sa nezdvojí, truncate je truncate).
-- ============================================================

-- ── KONTROLA PRED: koľko čoho je (spusti aj samostatne) ──
-- SELECT relname AS tabulka, n_live_tup AS riadkov
-- FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC;

-- ── KROK 1 + 2: archív a vyprázdnenie klinických dát ──
CREATE SCHEMA IF NOT EXISTS archiv;
REVOKE ALL ON SCHEMA archiv FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
  tabulky text[] := ARRAY[
    'evk_vykony','cas_vykony','pevar_vykony','ras_vykony',
    'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony',
    'evk_followup','cas_followup','pevar_followup','ras_followup',
    'cz_evk_followup','cz_cas_followup','cz_pevar_followup',
    'zaujimavi_pacienti','cz_zaujimavi_pacienti',
    'material_pouzitie',
    'pacient_rc','pacienti'
  ];
BEGIN
  FOREACH t IN ARRAY tabulky LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      -- snapshot skúšobnej prevádzky (ak archív z tohto behu už existuje, nechá ho)
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS archiv.%I AS SELECT * FROM public.%I',
        t || '_skusobna_2026', t);
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- ── SEKCIA B (voliteľné – odkomentuj, čo chceš):
-- Program a požiadavky sú ŽIVÁ agenda – septembrový program a čakačka
-- pacientov pravdepodobne majú ostať! Preto default = nemazať.
--
-- B1: zmazať len STARÉ dni programu (september a novšie ostávajú):
-- DELETE FROM denny_program WHERE datum <> 'zasobnik' AND datum < '2026-09-01';
--
-- B2: zmazať len ARCHIVOVANÉ požiadavky (aktívna čakačka ostáva):
-- CREATE TABLE IF NOT EXISTS archiv.aorta_indikacie_skusobna_2026 AS
--   SELECT * FROM aorta_indikacie WHERE status='archiv';
-- DELETE FROM aorta_prilohy WHERE indikacia_id IN (SELECT id FROM aorta_indikacie WHERE status='archiv');
-- DELETE FROM aorta_indikacie WHERE status='archiv';
--
-- B3: ÚPLNÉ vymazanie programu aj požiadaviek (ak fakt chceš nulu):
-- TRUNCATE TABLE denny_program CASCADE;
-- TRUNCATE TABLE aorta_prilohy, aorta_indikacie CASCADE;
--   → potom v Supabase dashboarde vyprázdni aj Storage bucket „aorta-prilohy"
--     (súbory príloh; SQL ich nemaže)

-- ── SEKCIA C (voliteľné – organizačné drobnosti):
-- C1: oznamy + reakcie:
-- TRUNCATE TABLE oznam_reakcie, oznamy CASCADE;
--   → prílohy oznamov: vyprázdni Storage bucket „oznamy-prilohy" v dashboarde
-- C2: nápady:
-- TRUNCATE TABLE ideas CASCADE;  -- (+ cz_ideas ak existuje)
-- C3: kalendár – len UDALOSTI PRED septembrom (budúce ostávajú):
-- DELETE FROM kalendar_udalosti WHERE datum < '2026-09-01';
-- C4: pozvánky na seminár:
-- TRUNCATE TABLE pozvanky CASCADE;

-- ── VOLITEĽNÉ: nová soľ pre hashovanie RČ (čistý štart aj kryptograficky).
-- Bezpečné len PO vyprázdnení pacienti/pacient_rc (inak by sa staré
-- záznamy prestali párovať). Archív v schéme archiv tým nie je dotknutý.
-- UPDATE app_secrets SET value = encode(extensions.gen_random_bytes(32),'hex') WHERE key='rc_salt';

-- ── KONTROLA PO: všetko klinické má byť 0 ──
-- SELECT relname AS tabulka, n_live_tup AS riadkov
-- FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC;
-- Archív: SELECT count(*) FROM archiv.evk_vykony_skusobna_2026;  atď.

-- ============================================================
-- PO RESETE V APPKE NETREBA NIČ – štruktúra, políčka, používatelia
-- aj zabezpečenie ostávajú; appka len začne s prázdnymi zoznamami.
-- ============================================================
