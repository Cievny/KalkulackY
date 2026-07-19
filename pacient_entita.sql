-- ============================================================
-- v2 · PACIENT AKO ENTITA — KROK 0: infraštruktúra (bez dopadu na appku)
-- Spustiť v Supabase SQL editore. Idempotentné (možno spustiť opakovane).
-- Appka sa NEMENÍ – tento skript len pripraví tabuľky, salt a RPC.
-- ============================================================

-- pgcrypto pre HMAC a náhodné bajty (Supabase: schéma extensions)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Kioskové kontá (TV/sála) NESMÚ vidieť rodné čísla ──
CREATE OR REPLACE FUNCTION je_kiosk() RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT coalesce((auth.jwt() ->> 'email') IN ('tv@cievny.sk','sala@cievny.sk'), false)
$$;

-- ── Súkromný trezor tajomstiev (salt) – nečíta ho NIKTO okrem SECURITY DEFINER funkcií ──
CREATE TABLE IF NOT EXISTS app_secrets (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
-- žiadna policy = žiadny prístup pre klienta (ani anon, ani authenticated);
-- pristupujú len funkcie so SECURITY DEFINER nižšie
DO $rmpol$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='app_secrets' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.app_secrets', p.policyname);
  END LOOP;
END $rmpol$;

-- ── Centrálna evidencia pacienta ──
-- rc_hash = HMAC(RČ, salt) – deterministický párovací kľúč; RČ tu NIE JE.
CREATE TABLE IF NOT EXISTS pacienti (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_hash    text UNIQUE,
  rocnik     int,
  pohlavie   text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pacienti ENABLE ROW LEVEL SECURITY;

-- Otvorené RČ – oddelene, prísne chránené (nie kiosk), do exportov NIKDY.
CREATE TABLE IF NOT EXISTS pacient_rc (
  pacient_id  uuid PRIMARY KEY REFERENCES pacienti(id) ON DELETE CASCADE,
  rodne_cislo text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE pacient_rc ENABLE ROW LEVEL SECURITY;

-- RLS: pacienti (len hash/ročník/pohlavie) číta každý povolený; zápis len cez RPC
DO $rls$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('pacienti','pacient_rc') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $rls$;
CREATE POLICY "pac sel" ON pacienti FOR SELECT TO authenticated USING (je_povoleny());
-- žiadne INSERT/UPDATE/DELETE policy pre klienta → zapisuje len SECURITY DEFINER RPC

-- RLS: pacient_rc – číta len povolený NEkioskový účet; zápis len cez RPC
CREATE POLICY "rc sel" ON pacient_rc FOR SELECT TO authenticated
  USING (je_povoleny() AND NOT je_kiosk() AND NOT je_tv());

-- ── RPC: nájdi alebo založ pacienta podľa RČ ──
-- Klient posiela RČ, dostáva späť LEN pacient_id (nikdy hash ani cudzie RČ).
CREATE OR REPLACE FUNCTION najdi_alebo_zaloz_pacienta(
  p_rc text, p_rocnik int DEFAULT NULL, p_pohlavie text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE clean text; salt text; h text; pid uuid;
BEGIN
  IF NOT je_povoleny() OR je_kiosk() THEN RAISE EXCEPTION 'neopravneny pristup'; END IF;
  clean := regexp_replace(coalesce(p_rc,''), '\D', '', 'g');
  IF length(clean) < 6 THEN RETURN NULL; END IF;           -- neúplné RČ → bez párovania
  SELECT value INTO salt FROM app_secrets WHERE key='rc_salt';
  IF salt IS NULL THEN RAISE EXCEPTION 'chyba salt (rc_salt) v app_secrets'; END IF;
  h := encode(extensions.hmac(clean, salt, 'sha256'), 'hex');
  SELECT id INTO pid FROM pacienti WHERE rc_hash = h;
  IF pid IS NULL THEN
    INSERT INTO pacienti(rc_hash, rocnik, pohlavie) VALUES (h, p_rocnik, p_pohlavie)
    RETURNING id INTO pid;
  ELSE
    UPDATE pacienti SET rocnik=coalesce(rocnik,p_rocnik), pohlavie=coalesce(pohlavie,p_pohlavie)
    WHERE id=pid;
  END IF;
  -- otvorené RČ ulož do chráneného trezora (idempotentne)
  INSERT INTO pacient_rc(pacient_id, rodne_cislo) VALUES (pid, clean)
  ON CONFLICT (pacient_id) DO NOTHING;
  RETURN pid;
END $$;
GRANT EXECUTE ON FUNCTION najdi_alebo_zaloz_pacienta(text,int,text) TO authenticated;

-- ── Overenie ──
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_secrets WHERE key='rc_salt') THEN
    RAISE NOTICE '⚠️  Ešte nie je nastavený salt. Spustite blok 2 nižšie (vygeneruje a uloží salt).';
  ELSE
    RAISE NOTICE '✓ Infraštruktúra pacient-entity pripravená (salt je nastavený).';
  END IF;
END $chk$;

-- ============================================================
-- BLOK 2 (spustiť RAZ, samostatne) — vygeneruje a uloží tajný salt.
-- Hodnotu vygeneruje databáza; nikam ju nekopírujte, netreba ju poznať.
-- Ak ho spustíte druhýkrát, ON CONFLICT ho NEZMENÍ (salt sa nesmie meniť,
-- inak by staré hashe prestali sedieť).
--
--   INSERT INTO app_secrets(key, value)
--   VALUES ('rc_salt', encode(extensions.gen_random_bytes(32), 'hex'))
--   ON CONFLICT (key) DO NOTHING;
--
-- ============================================================
