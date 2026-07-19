-- ============================================================
-- v2 · PACIENT AKO ENTITA — kompletný setup na JEDNO spustenie.
-- Skopíruj CELÝ obsah, vlož do Supabase SQL editora a stlač Run.
-- Idempotentné: opakované spustenie nič nepokazí a salt nezmení.
-- Appka sa nezmení – toto je len príprava databázy.
-- ============================================================

-- pgcrypto (HMAC, náhodné bajty) v schéme extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Kioskové kontá (TV/sála) nesmú vidieť rodné čísla
-- (SET search_path = '' – fixný search_path, odporúčanie Supabase lintera; auth.jwt() je kvalifikované)
CREATE OR REPLACE FUNCTION je_kiosk() RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((auth.jwt() ->> 'email') IN ('tv@cievny.sk','sala@cievny.sk'), false)
$$;

-- Trezor tajomstiev (salt) – klient ho nikdy nečíta (žiadna RLS policy = deny)
CREATE TABLE IF NOT EXISTS app_secrets (key text PRIMARY KEY, value text NOT NULL);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- Centrálny pacient (rc_hash = HMAC z RČ; samotné RČ tu NIE JE)
CREATE TABLE IF NOT EXISTS pacienti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_hash text UNIQUE, rocnik int, pohlavie text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pacienti ENABLE ROW LEVEL SECURITY;

-- Otvorené RČ – oddelene, prísne chránené (nie kiosk/TV), do exportov nikdy
CREATE TABLE IF NOT EXISTS pacient_rc (
  pacient_id uuid PRIMARY KEY REFERENCES pacienti(id) ON DELETE CASCADE,
  rodne_cislo text NOT NULL, created_at timestamptz DEFAULT now()
);
ALTER TABLE pacient_rc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pac sel" ON pacienti;
CREATE POLICY "pac sel" ON pacienti FOR SELECT TO authenticated USING (je_povoleny());
DROP POLICY IF EXISTS "rc sel" ON pacient_rc;
CREATE POLICY "rc sel" ON pacient_rc FOR SELECT TO authenticated
  USING (je_povoleny() AND NOT je_kiosk() AND NOT je_tv());

-- RPC: klient pošle RČ, dostane LEN pacient_id (nikdy hash ani cudzie RČ)
CREATE OR REPLACE FUNCTION najdi_alebo_zaloz_pacienta(
  p_rc text, p_rocnik int DEFAULT NULL, p_pohlavie text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, extensions AS $$
DECLARE clean text; salt text; h text; pid uuid;
BEGIN
  IF NOT je_povoleny() OR je_kiosk() THEN RAISE EXCEPTION 'neopravneny pristup'; END IF;
  clean := regexp_replace(coalesce(p_rc,''), '\D', '', 'g');
  IF length(clean) < 6 THEN RETURN NULL; END IF;
  SELECT value INTO salt FROM app_secrets WHERE key='rc_salt';
  IF salt IS NULL THEN RAISE EXCEPTION 'chyba salt (rc_salt)'; END IF;
  h := encode(extensions.hmac(clean, salt, 'sha256'), 'hex');
  SELECT id INTO pid FROM pacienti WHERE rc_hash = h;
  IF pid IS NULL THEN
    INSERT INTO pacienti(rc_hash, rocnik, pohlavie) VALUES (h, p_rocnik, p_pohlavie) RETURNING id INTO pid;
  ELSE
    UPDATE pacienti SET rocnik=coalesce(rocnik,p_rocnik), pohlavie=coalesce(pohlavie,p_pohlavie) WHERE id=pid;
  END IF;
  INSERT INTO pacient_rc(pacient_id, rodne_cislo) VALUES (pid, clean) ON CONFLICT (pacient_id) DO NOTHING;
  RETURN pid;
END $$;
-- len prihlásení (authenticated) smú volať; anon/public nie (linter 0028)
REVOKE EXECUTE ON FUNCTION najdi_alebo_zaloz_pacienta(text,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION najdi_alebo_zaloz_pacienta(text,int,text) TO authenticated;

-- Salt (vygeneruje databáza; druhé spustenie ho vďaka ON CONFLICT nezmení)
INSERT INTO app_secrets(key, value)
VALUES ('rc_salt', encode(extensions.gen_random_bytes(32),'hex'))
ON CONFLICT (key) DO NOTHING;

-- Väzba výkon → pacient (stĺpec + index, ON DELETE SET NULL)
ALTER TABLE evk_vykony      ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
ALTER TABLE cas_vykony      ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
ALTER TABLE pevar_vykony    ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
ALTER TABLE ras_vykony      ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
ALTER TABLE cz_evk_vykony   ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
ALTER TABLE cz_cas_vykony   ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS pacient_id uuid REFERENCES pacienti(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS evk_vykony_pacient_idx      ON evk_vykony(pacient_id);
CREATE INDEX IF NOT EXISTS cas_vykony_pacient_idx      ON cas_vykony(pacient_id);
CREATE INDEX IF NOT EXISTS pevar_vykony_pacient_idx    ON pevar_vykony(pacient_id);
CREATE INDEX IF NOT EXISTS ras_vykony_pacient_idx      ON ras_vykony(pacient_id);
CREATE INDEX IF NOT EXISTS cz_evk_vykony_pacient_idx   ON cz_evk_vykony(pacient_id);
CREATE INDEX IF NOT EXISTS cz_cas_vykony_pacient_idx   ON cz_cas_vykony(pacient_id);
CREATE INDEX IF NOT EXISTS cz_pevar_vykony_pacient_idx ON cz_pevar_vykony(pacient_id);
