-- ============================================================
-- Pozývacie linky – Supabase → SQL Editor → Run. Idempotentné.
-- Admin vytvorí link s tokenom; kolega sa cezeň prihlási a sám sa pridá
-- do allowlistu (cez bezpečnú SECURITY DEFINER funkciu, nie priamy zápis).
-- Vyžaduje už spustený spustit_na_konci.sql (povoleni_pouzivatelia, je_admin()).
-- ============================================================

CREATE TABLE IF NOT EXISTS pozvanky (
  token      TEXT PRIMARY KEY,
  ako_admin  BOOLEAN NOT NULL DEFAULT false,   -- pozvaný sa pridá rovno ako admin?
  poznamka   TEXT,                             -- napr. „pre Dr. Nováka"
  expiruje   TIMESTAMPTZ,                       -- NULL = bez expirácie
  aktivna    BOOLEAN NOT NULL DEFAULT true,     -- zrušenie linku = false
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pozvánky spravujú len administrátori
ALTER TABLE pozvanky ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pozvanky admin" ON pozvanky;
CREATE POLICY "pozvanky admin" ON pozvanky FOR ALL TO authenticated
  USING (je_admin()) WITH CHECK (je_admin());

-- Uplatnenie pozvánky: pridá PRIHLÁSENÉHO používateľa do allowlistu.
-- SECURITY DEFINER = kontrolovane obíde admin-only zápis do povoleni_pouzivatelia,
-- ale spraví len presne toto (a len ak je token platný a aktívny).
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
