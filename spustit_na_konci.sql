-- ============================================================
-- FINÁLNY SQL – spustiť v Supabase → SQL Editor (celé naraz, Run).
-- Idempotentné: dá sa spustiť opakovane bez škody.
-- Obsahuje: (A) tabuľky+stĺpce objednávok CEUS/CT + zámok proti dvojitému objednaniu,
-- (B) zoznam povolených používateľov (allowlist) zapojený do RLS.
-- Roly: povolený = číta všetko + zapisuje pacientske dáta; TV konto = LEN čítanie;
--       správu otvorených dní (objednavky_dni) a zoznam povolených menia LEN administrátori.
-- ============================================================

-- =========================================================
-- (A) OBJEDNÁVKY CEUS / CT – tabuľky, stĺpce, zámok slotu
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
-- zámok proti dvojitému objednaniu na ten istý začiatok termínu (zrušené a bezčasové sa nerátajú)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_objednavky_slot
  ON objednavky (typ, datum, cas)
  WHERE cas IS NOT NULL AND stav <> 'zruseny';

-- =========================================================
-- (B) ZOZNAM POVOLENÝCH POUŽÍVATEĽOV (allowlist) + ROLY
-- =========================================================
CREATE TABLE IF NOT EXISTS povoleni_pouzivatelia (
  email      TEXT PRIMARY KEY,
  meno       TEXT,
  admin      BOOLEAN NOT NULL DEFAULT false,   -- administrátor (spravuje zoznam + otvára dni)
  pridal     TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE povoleni_pouzivatelia ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL DEFAULT false;

-- Nikto, kto UŽ má konto, nepríde o prístup – naplň zoznam existujúcimi používateľmi
INSERT INTO povoleni_pouzivatelia (email)
SELECT email FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;
-- + istota: kľúčové kontá (vrátane TV a zálohovacieho, nech nikdy nevypadnú)
INSERT INTO povoleni_pouzivatelia (email) VALUES
  ('vincze.lukas@gmail.com'), ('oira@cievny.sk'), ('tv@cievny.sk')
ON CONFLICT (email) DO NOTHING;
-- prví administrátori (odteraz sa dá admin meniť v appke /tools/pristupy/)
UPDATE povoleni_pouzivatelia SET admin=true
  WHERE lower(email) IN ('vincze.lukas@gmail.com','oira@cievny.sk');

-- Pomocné funkcie (SECURITY DEFINER = čítajú zoznam bez ohľadu na RLS)
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

-- RLS samotného zoznamu: povolení ho vidia; meniť ho môžu len administrátori
ALTER TABLE povoleni_pouzivatelia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "povoleni select" ON povoleni_pouzivatelia;
CREATE POLICY "povoleni select" ON povoleni_pouzivatelia FOR SELECT TO authenticated USING (je_povoleny());
DROP POLICY IF EXISTS "povoleni manage" ON povoleni_pouzivatelia;
CREATE POLICY "povoleni manage" ON povoleni_pouzivatelia FOR ALL TO authenticated
  USING (je_admin()) WITH CHECK (je_admin());

-- Oznamy: komentáre + prihlasovanie (workshopy/akcie) + tabuľka reakcií
ALTER TABLE IF EXISTS oznamy ADD COLUMN IF NOT EXISTS povolit_komentare BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS oznamy ADD COLUMN IF NOT EXISTS povolit_prihlasovanie BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS oznamy ADD COLUMN IF NOT EXISTS kapacita INT;
CREATE TABLE IF NOT EXISTS oznam_reakcie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oznam_id UUID NOT NULL REFERENCES oznamy(id) ON DELETE CASCADE,
  typ TEXT NOT NULL DEFAULT 'komentar',   -- 'komentar' | 'prihlaska'
  text TEXT,
  meno TEXT,                              -- voliteľné celé meno prihláseného
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prepni VŠETKY dátové tabuľky na role. Najprv zmaž všetky staré politiky,
-- potom vytvor 4 samostatné (SELECT / INSERT / UPDATE / DELETE):
--   čítať smie každý povolený; zapisovať povolený OKREM TV konta;
--   pri objednavky_dni (otváranie dní) smú zapisovať LEN administrátori.
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
      -- kto smie zapisovať do tejto tabuľky
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

-- Storage (prílohy): čítať povolený, zapisovať povolený okrem TV
DROP POLICY IF EXISTS "aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage delete" ON storage.objects;
CREATE POLICY "aorta prilohy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='aorta-prilohy' AND je_povoleny());
CREATE POLICY "aorta prilohy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='aorta-prilohy' AND je_povoleny() AND NOT je_tv());
CREATE POLICY "aorta prilohy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='aorta-prilohy' AND je_povoleny() AND NOT je_tv());

DROP POLICY IF EXISTS "auth oznamy storage select" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage delete" ON storage.objects;
CREATE POLICY "auth oznamy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='oznamy-prilohy' AND je_povoleny());
CREATE POLICY "auth oznamy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='oznamy-prilohy' AND je_povoleny() AND NOT je_tv());
CREATE POLICY "auth oznamy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='oznamy-prilohy' AND je_povoleny() AND NOT je_tv());

-- ============================================================
-- SPRÁVA ZOZNAMU (príklady):
--   pridať:   INSERT INTO povoleni_pouzivatelia(email,meno) VALUES ('novy@gmail.com','Dr. Nový') ON CONFLICT DO NOTHING;
--   odobrať:  DELETE FROM povoleni_pouzivatelia WHERE email='niekto@gmail.com';
--   zoznam:   SELECT * FROM povoleni_pouzivatelia ORDER BY email;
-- ============================================================

-- =========================================================
-- (C) POZÝVACIE LINKY (self-onboarding cez token)
-- =========================================================
CREATE TABLE IF NOT EXISTS pozvanky (
  token TEXT PRIMARY KEY,
  ako_admin BOOLEAN NOT NULL DEFAULT false,
  poznamka TEXT, expiruje TIMESTAMPTZ, aktivna BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT DEFAULT (auth.jwt()->>'email'), created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pozvanky ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pozvanky admin" ON pozvanky;
CREATE POLICY "pozvanky admin" ON pozvanky FOR ALL TO authenticated USING (je_admin()) WITH CHECK (je_admin());
CREATE OR REPLACE FUNCTION uplatni_pozvanku(p_token TEXT) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r pozvanky%rowtype; myemail text;
BEGIN
  myemail := lower(coalesce(auth.jwt()->>'email',''));
  IF myemail = '' THEN RETURN 'NEPRIHLASENY'; END IF;
  SELECT * INTO r FROM pozvanky WHERE token = p_token;
  IF NOT FOUND OR NOT r.aktivna THEN RETURN 'NEPLATNA'; END IF;
  IF r.expiruje IS NOT NULL AND r.expiruje < now() THEN RETURN 'EXPIROVANA'; END IF;
  INSERT INTO povoleni_pouzivatelia(email, admin) VALUES (myemail, r.ako_admin)
    ON CONFLICT (email) DO UPDATE SET admin = (povoleni_pouzivatelia.admin OR r.ako_admin);
  RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION uplatni_pozvanku(text) FROM public;
GRANT EXECUTE ON FUNCTION uplatni_pozvanku(text) TO authenticated;
