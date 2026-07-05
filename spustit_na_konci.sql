-- ============================================================
-- FINÁLNY SQL – spustiť v Supabase → SQL Editor (celé naraz, Run).
-- Idempotentné: dá sa spustiť opakovane bez škody.
-- Obsahuje: (A) tabuľky+stĺpce objednávok CEUS/CT, (B) zoznam povolených
-- používateľov (allowlist) zapojený do RLS – aj pri zapnutom Google
-- prihlásení sa k dátam dostanú IBA emaily na zozname.
-- ============================================================

-- =========================================================
-- (A) OBJEDNÁVKY CEUS / CT – tabuľky a stĺpce
-- =========================================================
CREATE TABLE IF NOT EXISTS objednavky_dni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL, datum DATE NOT NULL, kapacita INT NOT NULL DEFAULT 0,
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (typ, datum)
);
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS cas_od   TEXT;
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS cas_do   TEXT;
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS slot_min INT DEFAULT 15;

CREATE TABLE IF NOT EXISTS objednavky (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL, datum DATE NOT NULL,
  meno TEXT, rocnik INT, rodne_cislo TEXT, diagnoza TEXT, indikacia TEXT,
  oddelenie TEXT, objednal TEXT, poznamka TEXT, stav TEXT DEFAULT 'objednany',
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE objednavky ADD COLUMN IF NOT EXISTS cas   TEXT;
ALTER TABLE objednavky ADD COLUMN IF NOT EXISTS sloty INT DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_objednavky_typ_datum ON objednavky (typ, datum);

-- =========================================================
-- (B) ZOZNAM POVOLENÝCH POUŽÍVATEĽOV (allowlist)
-- =========================================================
CREATE TABLE IF NOT EXISTS povoleni_pouzivatelia (
  email      TEXT PRIMARY KEY,
  meno       TEXT,
  pridal     TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nikto, kto UŽ má konto, nepríde o prístup – naplň zoznam existujúcimi používateľmi
INSERT INTO povoleni_pouzivatelia (email)
SELECT email FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;
-- + istota: kľúčové kontá
INSERT INTO povoleni_pouzivatelia (email) VALUES
  ('vincze.lukas@gmail.com'), ('oira@cievny.sk'), ('tv@cievny.sk')
ON CONFLICT (email) DO NOTHING;

-- Funkcia: je prihlásený email na zozname? (SECURITY DEFINER = číta zoznam bez ohľadu na RLS)
CREATE OR REPLACE FUNCTION je_povoleny() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM povoleni_pouzivatelia
    WHERE lower(email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$fn$;

-- RLS samotného zoznamu: povolení ho vidia; meniť ho môžu len administrátori
ALTER TABLE povoleni_pouzivatelia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "povoleni select" ON povoleni_pouzivatelia;
CREATE POLICY "povoleni select" ON povoleni_pouzivatelia FOR SELECT TO authenticated USING (je_povoleny());
DROP POLICY IF EXISTS "povoleni manage" ON povoleni_pouzivatelia;
CREATE POLICY "povoleni manage" ON povoleni_pouzivatelia FOR ALL TO authenticated
  USING  (lower(coalesce(auth.jwt()->>'email','')) IN ('vincze.lukas@gmail.com','oira@cievny.sk'))
  WITH CHECK (lower(coalesce(auth.jwt()->>'email','')) IN ('vincze.lukas@gmail.com','oira@cievny.sk'));

-- Prepni VŠETKY dátové tabuľky na „len povolený". Najprv zmaž všetky staré politiky
-- (nech nezostane žiadna, ktorá by púšťala každého prihláseného), potom vytvor jednu novú.
DO $do$
DECLARE t text; pol record;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'evk_vykony','cas_vykony','pevar_vykony','evk_followup','pevar_followup','cas_followup',
    'ideas','aorta_indikacie','aorta_prilohy','denny_program','oznamy','objednavky_dni','objednavky',
    'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony','cz_evk_followup','cz_pevar_followup','cz_cas_followup','cz_ideas'
  ]) LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;
      EXECUTE format('CREATE POLICY "povoleni all %1$s" ON public.%1$I FOR ALL TO authenticated USING (je_povoleny()) WITH CHECK (je_povoleny())', t);
    END IF;
  END LOOP;
END $do$;

-- SCHRÁNKA: obnov jedinú anon výnimku (verejný formulár podnetov do „ideas")
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

-- Storage (prílohy) tiež len pre povolených
DROP POLICY IF EXISTS "aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage delete" ON storage.objects;
CREATE POLICY "aorta prilohy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='aorta-prilohy' AND je_povoleny());
CREATE POLICY "aorta prilohy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='aorta-prilohy' AND je_povoleny());
CREATE POLICY "aorta prilohy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='aorta-prilohy' AND je_povoleny());

DROP POLICY IF EXISTS "auth oznamy storage select" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage delete" ON storage.objects;
CREATE POLICY "auth oznamy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='oznamy-prilohy' AND je_povoleny());
CREATE POLICY "auth oznamy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='oznamy-prilohy' AND je_povoleny());
CREATE POLICY "auth oznamy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='oznamy-prilohy' AND je_povoleny());

-- ============================================================
-- SPRÁVA ZOZNAMU (príklady – spúšťajte podľa potreby):
--   pridať:   INSERT INTO povoleni_pouzivatelia(email,meno) VALUES ('novy@gmail.com','Dr. Nový') ON CONFLICT DO NOTHING;
--   odobrať:  DELETE FROM povoleni_pouzivatelia WHERE email='niekto@gmail.com';
--   zoznam:   SELECT * FROM povoleni_pouzivatelia ORDER BY email;
-- ============================================================
