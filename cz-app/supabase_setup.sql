-- ============================================================
-- NEZÁVISLÁ CZ INŠTANCIA – databáza pre Požiadavky (aorta_indikacie)
-- Spustiť v NOVOM Supabase projekte: SQL Editor → New query → vložiť celé → Run.
-- Idempotentné (dá sa spúšťať opakovane). Kópia 1:1 slovenskej schémy pre
-- nástroj Požiadavky; ostatné nástroje sa doplnia neskôr samostatnými sekciami.
--
-- PRED SPUSTENÍM upravte riadok „PRVÝ ADMINISTRÁTOR" nižšie (e-mail konta,
-- ktoré založíte v Authentication → Users).
-- ============================================================

-- ── 1) Allowlist používateľov + roly ─────────────────────────
CREATE TABLE IF NOT EXISTS povoleni_pouzivatelia (
  email      TEXT PRIMARY KEY,
  meno       TEXT,
  admin      BOOLEAN NOT NULL DEFAULT false,
  pridal     TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRVÝ ADMINISTRÁTOR (upravte e-mail; ďalších potom pridáte cez SQL alebo neskôr cez nástroj Prístupy)
INSERT INTO povoleni_pouzivatelia (email, admin) VALUES ('ADMIN@DOPLNIT.CZ', true)
ON CONFLICT (email) DO UPDATE SET admin = true;

-- Pomocné funkcie (SECURITY DEFINER = čítajú zoznam bez ohľadu na RLS)
CREATE OR REPLACE FUNCTION je_povoleny() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM povoleni_pouzivatelia
    WHERE lower(email) = lower(coalesce(auth.jwt()->>'email',''))); $fn$;
-- kioskové konto (TV) v CZ inštancii zatiaľ nie je – funkcia ostáva kvôli 1:1 politikám
CREATE OR REPLACE FUNCTION je_tv() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT false; $fn$;
CREATE OR REPLACE FUNCTION je_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM povoleni_pouzivatelia
    WHERE lower(email) = lower(coalesce(auth.jwt()->>'email','')) AND admin = true); $fn$;

ALTER TABLE povoleni_pouzivatelia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "povoleni select" ON povoleni_pouzivatelia;
CREATE POLICY "povoleni select" ON povoleni_pouzivatelia FOR SELECT TO authenticated USING ((SELECT je_povoleny()));
DROP POLICY IF EXISTS "povoleni manage" ON povoleni_pouzivatelia;
CREATE POLICY "povoleni manage" ON povoleni_pouzivatelia FOR ALL TO authenticated
  USING ((SELECT je_admin())) WITH CHECK ((SELECT je_admin()));

-- ── 2) Požiadavky – aorta_indikacie (všetky stĺpce ako v SK) ──
CREATE TABLE IF NOT EXISTS aorta_indikacie (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  created_by         TEXT DEFAULT (auth.jwt()->>'email'),
  status             TEXT NOT NULL DEFAULT 'poziadavka', -- poziadavka | prezerane | indikovane | chirurgia | konzervativa | endo_material | endo_termin | archiv
  kategoria          TEXT DEFAULT 'aorta',               -- aorta | ine
  -- pacient
  inicialy           TEXT,
  rocnik             INT,
  pohlavie           TEXT,
  rodne_cislo        TEXT,
  telefon            TEXT,
  -- žiadanka
  ziadatel           TEXT,
  datum_poziadavky   TEXT,
  urgencia           TEXT,
  epikriza           TEXT,
  -- indikácia a morfológia
  diagnoza           TEXT,
  symptomy           TEXT,
  priemer_mm         NUMERIC,
  rast_mm_rok        NUMERIC,
  datum_ct           TEXT,
  endoleak_typ       TEXT,
  -- anatómia
  krcok_dlzka_mm     NUMERIC,
  krcok_priemer_mm   NUMERIC,
  krcok_angulacia    TEXT,
  iliaky             TEXT,
  sizing             TEXT,   -- JSON meraní z CT
  -- fitness & riziko
  kardio             TEXT,
  renalne            TEXT,
  pulmo              TEXT,
  frailty            BOOLEAN,
  dozitie            TEXT,
  medikacia          TEXT,
  -- indikácia
  indikoval1         TEXT,
  indikoval2         TEXT,
  vykon_typ          TEXT,
  vykon_cieva        TEXT,
  indikacia_poznamka TEXT,
  zaver_seminara     TEXT,
  -- endovaskulárny plán
  material           TEXT,
  material_objednany TEXT,
  material_dodany    BOOLEAN,
  termin             TEXT,
  -- nález / dispenzár
  nalez_tool         TEXT,
  nalez_vykon_id     TEXT,
  dalsia_kontrola    TEXT,
  -- ostatné
  poznamka           TEXT,
  vysledok           TEXT,   -- dôvod uzavretia (archív)
  historia           TEXT    -- JSON log zmien statusu [{s,d}]
);
-- pre prípad staršej tabuľky – doplnenie stĺpcov (rovnaké ako v SK)
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS kategoria TEXT DEFAULT 'aorta';
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS rodne_cislo TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS telefon TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS epikriza TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS endoleak_typ TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS sizing TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS indikoval1 TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS indikoval2 TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS vykon_typ TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS vykon_cieva TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS indikacia_poznamka TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS zaver_seminara TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS nalez_tool TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS nalez_vykon_id TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS dalsia_kontrola TEXT;

-- prílohy k požiadavke (prepis mailu, dokument, fotka)
CREATE TABLE IF NOT EXISTS aorta_prilohy (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    TEXT DEFAULT (auth.jwt()->>'email'),
  indikacia_id  UUID REFERENCES aorta_indikacie(id) ON DELETE CASCADE,
  typ           TEXT NOT NULL DEFAULT 'text', -- text | subor
  nazov         TEXT,
  obsah         TEXT,
  storage_path  TEXT,   -- cesta v Storage buckete aorta-prilohy
  mime          TEXT
);
ALTER TABLE aorta_prilohy ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');

-- Storage bucket pre súborové prílohy (privátny, max 20 MB/súbor)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('aorta-prilohy','aorta-prilohy', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- ── 3) RLS: čítať smie povolený, zapisovať povolený okrem kiosku ──
DO $do$
DECLARE t text; pol record;
BEGIN
  FOR t IN SELECT unnest(ARRAY['aorta_indikacie','aorta_prilohy']) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "pov sel %1$s" ON public.%1$I FOR SELECT TO authenticated USING ((SELECT je_povoleny()))', t);
    EXECUTE format('CREATE POLICY "pov ins %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK ((SELECT je_povoleny() AND NOT je_tv()))', t);
    EXECUTE format('CREATE POLICY "pov upd %1$s" ON public.%1$I FOR UPDATE TO authenticated USING ((SELECT je_povoleny() AND NOT je_tv())) WITH CHECK ((SELECT je_povoleny() AND NOT je_tv()))', t);
    EXECUTE format('CREATE POLICY "pov del %1$s" ON public.%1$I FOR DELETE TO authenticated USING ((SELECT je_povoleny() AND NOT je_tv()))', t);
  END LOOP;
END $do$;

-- Storage (prílohy): čítať povolený, zapisovať povolený okrem kiosku
DROP POLICY IF EXISTS "aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage delete" ON storage.objects;
CREATE POLICY "aorta prilohy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='aorta-prilohy' AND (SELECT je_povoleny()));
CREATE POLICY "aorta prilohy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='aorta-prilohy' AND (SELECT je_povoleny() AND NOT je_tv()));
CREATE POLICY "aorta prilohy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='aorta-prilohy' AND (SELECT je_povoleny() AND NOT je_tv()));

-- ── KONTROLA ──
-- SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public';
-- SELECT * FROM povoleni_pouzivatelia;
