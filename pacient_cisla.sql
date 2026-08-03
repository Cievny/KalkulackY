-- ============================================================
-- v2 · PACIENT ID ČÍSLA — automatické prideľovanie od 4. 8. 2026.
-- Spusti v Supabase SQL editore PRED nasadením (appka má fallback,
-- takže ak to spustíš neskôr, len sa dovtedy neprideľujú čísla).
-- Idempotentné: opakované spustenie nič nepokazí.
--
-- Čo pridáva:
--   • pacienti.cislo – krátke poradové číslo pacienta (1, 2, 3…),
--     pridelené automaticky; existujúci pacienti ho dostanú tiež
--   • RPC najdi_alebo_zaloz_pacienta_v2 – appka pošle RČ a/alebo
--     Pacient ID; server spáruje / založí a vráti {id, cislo}.
--     Nesúlad (ID patrí inému RČ) vráti error – nič sa nerozbije.
-- ============================================================

-- 1) číslo pacienta
CREATE SEQUENCE IF NOT EXISTS pacienti_cislo_seq;
ALTER TABLE pacienti ADD COLUMN IF NOT EXISTS cislo int UNIQUE DEFAULT nextval('pacienti_cislo_seq');
UPDATE pacienti SET cislo = nextval('pacienti_cislo_seq') WHERE cislo IS NULL;

-- 2) párovacia RPC (RČ a/alebo číslo; bez oboch založí anonymného pacienta)
CREATE OR REPLACE FUNCTION najdi_alebo_zaloz_pacienta_v2(
  p_rc text DEFAULT NULL, p_cislo int DEFAULT NULL,
  p_rocnik int DEFAULT NULL, p_pohlavie text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, extensions AS $$
DECLARE clean text; salt text; h text; pid uuid; pc int; ex_hash text;
BEGIN
  IF NOT je_povoleny() OR je_kiosk() THEN RAISE EXCEPTION 'neopravneny pristup'; END IF;
  clean := regexp_replace(coalesce(p_rc,''), '\D', '', 'g');
  IF length(clean) < 6 THEN clean := NULL; END IF;
  IF clean IS NOT NULL THEN
    SELECT value INTO salt FROM app_secrets WHERE key='rc_salt';
    IF salt IS NULL THEN RAISE EXCEPTION 'chyba salt (rc_salt)'; END IF;
    h := encode(extensions.hmac(clean, salt, 'sha256'), 'hex');
  END IF;

  IF p_cislo IS NOT NULL THEN
    -- zadané Pacient ID → nájdi; RČ (ak prišlo) sa naň dopáruje
    SELECT id, cislo, rc_hash INTO pid, pc, ex_hash FROM pacienti WHERE cislo = p_cislo;
    IF pid IS NULL THEN RETURN json_build_object('error', 'Pacient s ID '||p_cislo||' neexistuje.'); END IF;
    IF h IS NOT NULL THEN
      IF ex_hash IS NULL THEN
        IF EXISTS (SELECT 1 FROM pacienti WHERE rc_hash = h AND id <> pid) THEN
          RETURN json_build_object('error', 'Toto RČ už patrí inému pacientovi (má iné ID).');
        END IF;
        UPDATE pacienti SET rc_hash = h,
          rocnik = coalesce(rocnik, p_rocnik), pohlavie = coalesce(pohlavie, p_pohlavie)
          WHERE id = pid;
        INSERT INTO pacient_rc(pacient_id, rodne_cislo) VALUES (pid, clean)
          ON CONFLICT (pacient_id) DO NOTHING;
      ELSIF ex_hash <> h THEN
        RETURN json_build_object('error', 'Pacient ID '||p_cislo||' má v evidencii iné RČ – skontrolujte zadanie.');
      END IF;
    END IF;
  ELSIF h IS NOT NULL THEN
    -- zadané len RČ → ako doteraz (nájdi podľa hashu alebo založ)
    SELECT id, cislo INTO pid, pc FROM pacienti WHERE rc_hash = h;
    IF pid IS NULL THEN
      INSERT INTO pacienti(rc_hash, rocnik, pohlavie) VALUES (h, p_rocnik, p_pohlavie)
        RETURNING id, cislo INTO pid, pc;
    ELSE
      UPDATE pacienti SET rocnik = coalesce(rocnik, p_rocnik), pohlavie = coalesce(pohlavie, p_pohlavie) WHERE id = pid;
    END IF;
    INSERT INTO pacient_rc(pacient_id, rodne_cislo) VALUES (pid, clean)
      ON CONFLICT (pacient_id) DO NOTHING;
  ELSE
    -- nič nezadané → nový pacient s novým číslom (RČ sa dopáruje neskôr)
    INSERT INTO pacienti(rocnik, pohlavie) VALUES (p_rocnik, p_pohlavie)
      RETURNING id, cislo INTO pid, pc;
  END IF;

  IF pc IS NULL THEN SELECT cislo INTO pc FROM pacienti WHERE id = pid; END IF;
  RETURN json_build_object('id', pid, 'cislo', pc);
END $$;
REVOKE EXECUTE ON FUNCTION najdi_alebo_zaloz_pacienta_v2(text,int,int,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION najdi_alebo_zaloz_pacienta_v2(text,int,int,text) TO authenticated;

-- Kontrola:
--   SELECT cislo, rc_hash IS NOT NULL AS ma_rc, created_at FROM pacienti ORDER BY cislo;
