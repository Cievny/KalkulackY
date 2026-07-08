-- =====================================================================
--  cievny.sk – SQL na spustenie TERAZ (Supabase → SQL Editor → Run)
--  Bezpečné spúšťať aj opakovane (IF NOT EXISTS / DO bloky).
--  Predpoklad: už bežal spustit_na_konci.sql (funkcie je_povoleny/je_tv/je_admin).
-- =====================================================================

-- 0) POISTKA: allowlist + pomocné funkcie so SECURITY DEFINER.
--    Ak databáza mala staršiu verziu je_povoleny() BEZ „SECURITY DEFINER",
--    čítanie tabuliek padalo na „permission denied for schema auth" (500 →
--    v appke „Chyba spojenia"). Tu ich predefinujeme na správnu verziu,
--    aby časť 6 (role politiky) fungovala bez ohľadu na to, čo tam bolo.
CREATE TABLE IF NOT EXISTS povoleni_pouzivatelia (
  email      TEXT PRIMARY KEY,
  meno       TEXT,
  admin      BOOLEAN NOT NULL DEFAULT false,
  pridal     TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION je_povoleny() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM povoleni_pouzivatelia
    WHERE lower(email) = lower(coalesce(auth.jwt()->>'email',''))); $fn$;
CREATE OR REPLACE FUNCTION je_tv() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT lower(coalesce(auth.jwt()->>'email','')) = 'tv@cievny.sk'; $fn$;
CREATE OR REPLACE FUNCTION je_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM povoleni_pouzivatelia
    WHERE lower(email) = lower(coalesce(auth.jwt()->>'email','')) AND admin = true); $fn$;
-- istota, že hlavné účty sú v zozname (inak by po sprísnení RLS videli prázdno)
INSERT INTO povoleni_pouzivatelia(email,meno,admin) VALUES
  ('vincze.lukas@gmail.com','Dr. Vincze',true),
  ('oira@cievny.sk','OIRA',true)
ON CONFLICT (email) DO UPDATE SET admin = true;

-- 1) EVK – IVL katétre (Shockwave/Shockfast/vlastný) do štatistík
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS ivl_brands TEXT;

-- 2) PEVAR – samostatný prístup pre každú stranu (ľavá strana = _sin)
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_arteria_sin       TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_technika_sin      TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS zabezpecenie_technika_sin TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sheath_velkost_sin        TEXT;

-- 3) CZ – chýbajúce stĺpce (bez nich CZ EVK ukladanie padá na chybe 400)
--    a parita s novými SK funkciami
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath        TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath_dlz    TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath_znacka TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS ivl_brands           TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_arteria_sin       TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_technika_sin      TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS zabezpecenie_technika_sin TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sheath_velkost_sin        TEXT;

-- 3b) Denný program – dve sály (Sála OIRA A / Sála OIRA B).
--     Staré záznamy = 'A'; UI sekcie sa objavia, až keď má B pacientov.
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS sala TEXT DEFAULT 'A';
-- prepojenie pacienta v programe na napísaný nález (EVK/CAS/PEVAR)
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS nalez_tool     TEXT;
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS nalez_vykon_id TEXT;

-- 3c) VÝSKUMNÝ ZBER – polia pre publikácie:
--     rodné číslo (unikátni pacienti), eGFR, baseline ABI (EVK)
--     a exitus vo follow-upoch (celkové prežívanie, MAE).
DO $do$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['evk_vykony','cas_vykony','pevar_vykony',
                               'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony']) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS rodne_cislo TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS egfr NUMERIC', t);
    END IF;
  END LOOP;
  FOR t IN SELECT unnest(ARRAY['evk_vykony','cz_evk_vykony']) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS abi_pred TEXT', t);
    END IF;
  END LOOP;
  FOR t IN SELECT unnest(ARRAY['evk_followup','cas_followup','pevar_followup',
                               'cz_evk_followup','cz_cas_followup','cz_pevar_followup']) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS exitus BOOLEAN DEFAULT false', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS exitus_datum TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS exitus_suvis TEXT', t);
    END IF;
  END LOOP;
END $do$;

-- 3d) AORTÁLNY MODUL – FEVAR / BEVAR / TEVAR / ChEVAR / ISLF / hybrid
--     (typ výkonu, segment, Ishimaru zóny, LSA, drenáž, etiológia,
--     vetvy/fenestrácie ako JSON; follow-up: per-vetva stav + FL trombóza)
DO $do$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['pevar_vykony','cz_pevar_vykony']) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS typ_vykonu TEXT DEFAULT ''EVAR''', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS segment_aorty TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS zona_prox TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS zona_dist TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS lsa_manazment TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS spinalna_drenaz BOOLEAN', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS etiologia TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS vetvy_detail TEXT', t);
    END IF;
  END LOOP;
  FOR t IN SELECT unnest(ARRAY['pevar_followup','cz_pevar_followup']) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS vetvy_fu TEXT', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS fl_tromboza TEXT', t);
    END IF;
  END LOOP;
END $do$;

-- 3e) ZAUJÍMAVÍ PACIENTI – hviezdička v popisoch nálezov
CREATE TABLE IF NOT EXISTS zaujimavi_pacienti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  tool TEXT NOT NULL,              -- 'EVK' | 'CAS' | 'PEVAR'
  vykon_id TEXT NOT NULL,
  rodne_cislo TEXT,
  popis TEXT,
  poznamka TEXT,
  created_by TEXT DEFAULT (auth.jwt()->>'email')
);
CREATE TABLE IF NOT EXISTS cz_zaujimavi_pacienti (LIKE zaujimavi_pacienti INCLUDING ALL);

-- 4) Oznamy – komentáre + prihlasovanie (workshopy / akcie)
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS povolit_komentare     BOOLEAN DEFAULT false;
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS povolit_prihlasovanie BOOLEAN DEFAULT false;
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS kapacita              INT;

CREATE TABLE IF NOT EXISTS oznam_reakcie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oznam_id UUID NOT NULL REFERENCES oznamy(id) ON DELETE CASCADE,
  typ TEXT NOT NULL DEFAULT 'komentar',   -- 'komentar' | 'prihlaska'
  text TEXT,
  meno TEXT,
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5) UNIKÁTNE ID VÝKONOV – zabráni dvom záznamom s rovnakým EVK-2026-001.
--    Ak už duplicity existujú, index sa pre danú tabuľku nevytvorí a vypíše
--    sa WARNING so zoznamom duplicít (premenujte ich a spustite znova).
DO $do$
DECLARE t text; dup record; has_dup boolean;
BEGIN
  FOR t IN SELECT unnest(ARRAY['evk_vykony','cas_vykony','pevar_vykony',
                               'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony']) LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    has_dup := false;
    FOR dup IN EXECUTE format(
      'SELECT vykon_id, count(*) c FROM public.%I
        WHERE vykon_id IS NOT NULL AND position(''???'' in vykon_id) = 0
        GROUP BY vykon_id HAVING count(*) > 1', t) LOOP
      has_dup := true;
      RAISE WARNING 'DUPLICITA v %: % (počet %) – premenujte a spustite znova', t, dup.vykon_id, dup.c;
    END LOOP;
    IF NOT has_dup THEN
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS uniq_%s_vykon_id ON public.%I(vykon_id)
          WHERE vykon_id IS NOT NULL AND position(''???'' in vykon_id) = 0', t, t);
    END IF;
  END LOOP;
END $do$;

-- 6) ZNOVU-APLIKUJ ROLE POLITIKY na všetky dátové tabuľky.
--    Rovnaký blok ako v spustit_na_konci.sql – zmaže staré/permisívne
--    politiky (vrátane širokého "auth all ... USING(true)", ak ho omylom
--    obnovil starý setup skript) a nastaví: čítanie = povolený;
--    zápis = povolený okrem TV; objednavky_dni zápis = len admin.
DO $do$
DECLARE t text; pol record; write_expr text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'evk_vykony','cas_vykony','pevar_vykony','evk_followup','pevar_followup','cas_followup',
    'ideas','aorta_indikacie','aorta_prilohy','denny_program','oznamy','oznam_reakcie','objednavky_dni','objednavky',
    'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony','cz_evk_followup','cz_pevar_followup','cz_cas_followup','cz_ideas',
    'zaujimavi_pacienti','cz_zaujimavi_pacienti'
  ]) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;
      IF t = 'objednavky_dni' THEN write_expr := 'je_admin()';
      ELSE write_expr := 'je_povoleny() AND NOT je_tv()';
      END IF;
      EXECUTE format('CREATE POLICY "pov sel %1$s" ON public.%1$I FOR SELECT TO authenticated USING (je_povoleny())', t);
      EXECUTE format('CREATE POLICY "pov ins %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (%2$s)', t, write_expr);
      EXECUTE format('CREATE POLICY "pov upd %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (%2$s) WITH CHECK (%2$s)', t, write_expr);
      EXECUTE format('CREATE POLICY "pov del %1$s" ON public.%1$I FOR DELETE TO authenticated USING (%2$s)', t, write_expr);
    END IF;
  END LOOP;
END $do$;

-- Schránka: obnov jedinú anon výnimku (verejný formulár podnetov do „ideas")
DROP POLICY IF EXISTS "anon insert ideas schranka" ON ideas;
CREATE POLICY "anon insert ideas schranka" ON ideas
  FOR INSERT TO anon
  WITH CHECK (
    col = 'napady'
    AND coalesce(kategoria,'apka') IN ('apka','oddelenie')
    AND created_by IS NULL
    AND coalesce(hlasy,0) = 0
    AND komentare IS NULL
  );

-- Hotovo. Ak sa vypísali WARNINGY o duplicitných vykon_id:
--   1. nájdite ich:  SELECT id, vykon_id, datum FROM evk_vykony WHERE vykon_id='EVK-2026-001';
--   2. premenujte:   UPDATE evk_vykony SET vykon_id='EVK-2026-001b' WHERE id='<uuid>';
--   3. spustite tento skript znova (vytvorí unikátny index).
