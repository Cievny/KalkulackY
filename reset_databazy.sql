-- ============================================================
-- RESET DATABÁZY K 1. 10. 2026 (pôvodne 1.9., posunuté) — čistý štart ostrej prevádzky.
--
-- ZACHOVÁVA SA (dohoda 24.7.):
--   • Požiadavky (čakačka) + prílohy       • Program (denný/zásobník)
--   • Kalendár                             • Zaujímaví pacienti – VRÁTANE
--     ich nálezov, follow-upov a väzby na pacienta (hviezdička bez nálezu
--     by bola nanič)
--   • povolení používatelia, app_secrets (soľ RČ), oznamy, nápady
--
-- MAŽE SA (najprv kópia do schémy archiv – appka ju nevidí, len SQL editor):
--   • všetky ostatné výkony EVK/CAS/PEVAR/RAS (SK aj CZ) + ich follow-upy
--   • materiálový register k zmazaným výkonom
--   • pacienti + RČ, ktorí po vyčistení nemajú žiadny výkon
--
-- ⚠️ PRED SPUSTENÍM: GitHub → Actions → „Zálohy" → Run workflow
--    → stiahni artefakt (última úplná záloha skúšobnej prevádzky).
-- Potom celé vlož do Supabase SQL editora a spusti. Opakované spustenie
-- nič nepokazí (archív sa nezdvojí, mazanie je idempotentné).
-- ============================================================

-- ── KONTROLA PRED (spusti aj samostatne): ──
-- SELECT relname AS tabulka, n_live_tup AS riadkov
-- FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC;

-- ── KROK 1: archív celej skúšobnej prevádzky ──
CREATE SCHEMA IF NOT EXISTS archiv;
REVOKE ALL ON SCHEMA archiv FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
  tabulky text[] := ARRAY[
    'evk_vykony','cas_vykony','pevar_vykony','ras_vykony','avf_vykony','vis_vykony',
    'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony',
    'evk_followup','cas_followup','pevar_followup','ras_followup','avf_followup','vis_followup',
    'cz_evk_followup','cz_cas_followup','cz_pevar_followup',
    'zaujimavi_pacienti','cz_zaujimavi_pacienti',
    'material_pouzitie','pacient_rc','pacienti'
  ];
BEGIN
  FOREACH t IN ARRAY tabulky LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS archiv.%I AS SELECT * FROM public.%I',
        t || '_skusobna_2026', t);
    END IF;
  END LOOP;
END $$;

-- ── KROK 2: výkony – zmazať všetko OKREM zaujímavých pacientov ──
-- (zaujimavi_pacienti drží tool + vykon_id; RAS hviezdičku nemá → maže sa celý)
DELETE FROM evk_vykony   WHERE vykon_id IS NULL OR vykon_id NOT IN
  (SELECT vykon_id FROM zaujimavi_pacienti WHERE tool='EVK'   AND vykon_id IS NOT NULL);
DELETE FROM cas_vykony   WHERE vykon_id IS NULL OR vykon_id NOT IN
  (SELECT vykon_id FROM zaujimavi_pacienti WHERE tool='CAS'   AND vykon_id IS NOT NULL);
DELETE FROM pevar_vykony WHERE vykon_id IS NULL OR vykon_id NOT IN
  (SELECT vykon_id FROM zaujimavi_pacienti WHERE tool='PEVAR' AND vykon_id IS NOT NULL);
DELETE FROM ras_vykony;
-- AVF + VIS (hviezdičku nemajú → mažú sa celé; tabuľky nemusia ešte existovať)
DO $$ BEGIN
  IF to_regclass('public.avf_vykony') IS NOT NULL THEN DELETE FROM avf_vykony; END IF;
  IF to_regclass('public.avf_followup') IS NOT NULL THEN DELETE FROM avf_followup; END IF;
  IF to_regclass('public.vis_vykony') IS NOT NULL THEN DELETE FROM vis_vykony; END IF;
  IF to_regclass('public.vis_followup') IS NOT NULL THEN DELETE FROM vis_followup; END IF;
END $$;

DELETE FROM cz_evk_vykony   WHERE vykon_id IS NULL OR vykon_id NOT IN
  (SELECT vykon_id FROM cz_zaujimavi_pacienti WHERE tool='EVK'   AND vykon_id IS NOT NULL);
DELETE FROM cz_cas_vykony   WHERE vykon_id IS NULL OR vykon_id NOT IN
  (SELECT vykon_id FROM cz_zaujimavi_pacienti WHERE tool='CAS'   AND vykon_id IS NOT NULL);
DELETE FROM cz_pevar_vykony WHERE vykon_id IS NULL OR vykon_id NOT IN
  (SELECT vykon_id FROM cz_zaujimavi_pacienti WHERE tool='PEVAR' AND vykon_id IS NOT NULL);

-- osirotené hviezdičky (ukazovali na výkon, ktorý už neexistoval) – preč
DELETE FROM zaujimavi_pacienti z WHERE NOT (
  (z.tool='EVK'   AND EXISTS (SELECT 1 FROM evk_vykony   v WHERE v.vykon_id=z.vykon_id)) OR
  (z.tool='CAS'   AND EXISTS (SELECT 1 FROM cas_vykony   v WHERE v.vykon_id=z.vykon_id)) OR
  (z.tool='PEVAR' AND EXISTS (SELECT 1 FROM pevar_vykony v WHERE v.vykon_id=z.vykon_id)));
DELETE FROM cz_zaujimavi_pacienti z WHERE NOT (
  (z.tool='EVK'   AND EXISTS (SELECT 1 FROM cz_evk_vykony   v WHERE v.vykon_id=z.vykon_id)) OR
  (z.tool='CAS'   AND EXISTS (SELECT 1 FROM cz_cas_vykony   v WHERE v.vykon_id=z.vykon_id)) OR
  (z.tool='PEVAR' AND EXISTS (SELECT 1 FROM cz_pevar_vykony v WHERE v.vykon_id=z.vykon_id)));

-- ── KROK 3: follow-upy – ostávajú len tie k zachovaným výkonom ──
DELETE FROM evk_followup   WHERE vykon_id IS NULL OR vykon_id NOT IN (SELECT vykon_id FROM evk_vykony   WHERE vykon_id IS NOT NULL);
DELETE FROM cas_followup   WHERE vykon_id IS NULL OR vykon_id NOT IN (SELECT vykon_id FROM cas_vykony   WHERE vykon_id IS NOT NULL);
DELETE FROM pevar_followup WHERE vykon_id IS NULL OR vykon_id NOT IN (SELECT vykon_id FROM pevar_vykony WHERE vykon_id IS NOT NULL);
DELETE FROM ras_followup;
DELETE FROM cz_evk_followup   WHERE vykon_id IS NULL OR vykon_id NOT IN (SELECT vykon_id FROM cz_evk_vykony   WHERE vykon_id IS NOT NULL);
DELETE FROM cz_cas_followup   WHERE vykon_id IS NULL OR vykon_id NOT IN (SELECT vykon_id FROM cz_cas_vykony   WHERE vykon_id IS NOT NULL);
DELETE FROM cz_pevar_followup WHERE vykon_id IS NULL OR vykon_id NOT IN (SELECT vykon_id FROM cz_pevar_vykony WHERE vykon_id IS NOT NULL);

-- ── KROK 4: materiálový register – len k zachovaným výkonom ──
DELETE FROM material_pouzitie WHERE vykon_id IS NULL OR vykon_id NOT IN (
  SELECT vykon_id FROM evk_vykony   WHERE vykon_id IS NOT NULL UNION
  SELECT vykon_id FROM cas_vykony   WHERE vykon_id IS NOT NULL UNION
  SELECT vykon_id FROM pevar_vykony WHERE vykon_id IS NOT NULL);

-- ── KROK 5: pacienti – ostávajú len tí, na ktorých ukazuje zachovaný výkon ──
-- (pacient_rc sa maže automaticky cez ON DELETE CASCADE; soľ sa NEMENÍ,
--  aby sa zachovaní pacienti párovali aj s budúcimi výkonmi)
DELETE FROM pacienti WHERE id NOT IN (
  SELECT pacient_id FROM evk_vykony      WHERE pacient_id IS NOT NULL UNION
  SELECT pacient_id FROM cas_vykony      WHERE pacient_id IS NOT NULL UNION
  SELECT pacient_id FROM pevar_vykony    WHERE pacient_id IS NOT NULL UNION
  SELECT pacient_id FROM cz_evk_vykony   WHERE pacient_id IS NOT NULL UNION
  SELECT pacient_id FROM cz_cas_vykony   WHERE pacient_id IS NOT NULL UNION
  SELECT pacient_id FROM cz_pevar_vykony WHERE pacient_id IS NOT NULL);

-- ── VOLITEĽNÉ (odkomentuj, ak chceš vyčistiť aj toto): ──
-- Oznamy + reakcie:   TRUNCATE TABLE oznam_reakcie, oznamy CASCADE;
--   (potom vyprázdni Storage bucket „oznamy-prilohy" v dashboarde)
-- Nápady:             TRUNCATE TABLE ideas CASCADE;
-- Pozvánky seminára:  TRUNCATE TABLE pozvanky CASCADE;

-- ── KONTROLA PO: ──
-- SELECT relname AS tabulka, n_live_tup AS riadkov
-- FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC;
--   → výkony = len zaujímaví; ras=0; požiadavky/program/kalendár nezmenené
-- Archív: SELECT count(*) FROM archiv.evk_vykony_skusobna_2026;  atď.

-- ============================================================
-- PO RESETE V APPKE NETREBA NIČ – štruktúra, políčka, používatelia,
-- zabezpečenie aj Storage prílohy požiadaviek ostávajú nedotknuté.
-- ============================================================
