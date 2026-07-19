-- ============================================================
-- v2 · PACIENT AKO ENTITA — KROK 2: backfill histórie
-- Existujúcim výkonom s vyplneným RČ dopočíta pacient_id (rovnaký HMAC
-- ako RPC, takže staré aj nové záznamy sa párujú konzistentne).
-- Spustiť AŽ po pacient_entita.sql. Idempotentné: dotýka sa len riadkov
-- s pacient_id IS NULL; opakované spustenie je bezpečné.
--
-- POUŽITIE:  SELECT * FROM backfill_pacienti();
-- (vráti prehľad koľko záznamov spárovaných / bez RČ na tabuľku)
-- ============================================================

CREATE OR REPLACE FUNCTION backfill_pacienti()
RETURNS TABLE(tabulka text, sparovanych int, bez_rc int, preskocena boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  t text; salt text; rec record; clean text; h text; pid uuid; cnt int; nbez int;
  tbls text[] := ARRAY['evk_vykony','cas_vykony','pevar_vykony','ras_vykony',
                       'cz_evk_vykony','cz_cas_vykony','cz_pevar_vykony'];
BEGIN
  SELECT value INTO salt FROM app_secrets WHERE key='rc_salt';
  IF salt IS NULL THEN RAISE EXCEPTION 'chyba salt (rc_salt) – spustite najprv pacient_entita.sql'; END IF;

  FOREACH t IN ARRAY tbls LOOP
    -- preskočiť tabuľku, ktorá nemá potrebné stĺpce (napr. cz bez rodne_cislo)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='rodne_cislo')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='pacient_id') THEN
      tabulka:=t; sparovanych:=0; bez_rc:=0; preskocena:=true; RETURN NEXT; CONTINUE;
    END IF;

    cnt:=0; nbez:=0;
    FOR rec IN EXECUTE format(
      'SELECT id, rodne_cislo, pohlavie FROM %I WHERE pacient_id IS NULL', t) LOOP
      clean := regexp_replace(coalesce(rec.rodne_cislo,''), '\D', '', 'g');
      IF length(clean) < 6 THEN nbez:=nbez+1; CONTINUE; END IF;
      h := encode(extensions.hmac(clean, salt, 'sha256'), 'hex');
      SELECT id INTO pid FROM pacienti WHERE rc_hash = h;
      IF pid IS NULL THEN
        INSERT INTO pacienti(rc_hash, pohlavie) VALUES (h, rec.pohlavie) RETURNING id INTO pid;
      END IF;
      INSERT INTO pacient_rc(pacient_id, rodne_cislo) VALUES (pid, clean)
        ON CONFLICT (pacient_id) DO NOTHING;
      EXECUTE format('UPDATE %I SET pacient_id=$1 WHERE id=$2', t) USING pid, rec.id;
      cnt:=cnt+1;
    END LOOP;
    tabulka:=t; sparovanych:=cnt; bez_rc:=nbez; preskocena:=false; RETURN NEXT;
  END LOOP;
END $$;

-- Spustenie (odkomentujte / spustite samostatne):
--   SELECT * FROM backfill_pacienti();
--
-- Kontrola výsledku:
--   SELECT count(*) AS pacientov FROM pacienti;
--   SELECT 'evk' t, count(*) FILTER (WHERE pacient_id IS NOT NULL) sparovane,
--          count(*) FILTER (WHERE pacient_id IS NULL) nesparovane FROM evk_vykony;
