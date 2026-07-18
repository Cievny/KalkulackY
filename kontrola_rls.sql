-- ============================================================
-- KONTROLA BEZPEČNOSTI RLS – spustiť v Supabase SQL editore.
-- Iba číta (SELECT) + jeden RAISE test; nič nemení. Bezpečné spustiť kedykoľvek.
-- ============================================================

-- 1) Nebezpečné anon politiky (okrem jedinej povolenej výnimky – verejná schránka).
--    Očakávaný výsledok: 0 riadkov okrem 'anon insert ideas schranka'.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE 'anon' = ANY(roles)
  AND policyname <> 'anon insert ideas schranka'
ORDER BY tablename;

-- 2) Politiky s USING(true) / WITH CHECK(true) na klinických tabuľkách (nemalo by nič vrátiť).
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE (qual = 'true' OR with_check = 'true')
  AND tablename ~ '(vykony|followup|indikacie|program|objednavky|pacient|zaujimav)'
ORDER BY tablename;

-- 3) Tabuľky v public BEZ zapnutej RLS (nemalo by nič vrátiť okrem číselníkov, ak nejaké sú).
SELECT n.nspname AS schema, c.relname AS tabulka
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
ORDER BY 2;

-- 4) Storage politiky na buckete príloh – overte, že OBSAHUJÚ je_povoleny()
--    (nie iba bucket_id). Ak niektorá SELECT politika nemá je_povoleny(), prílohy
--    pacientov si prečíta hociktorý prihlásený Google účet.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;

-- 5) Tvrdý test – zlyhá s výnimkou, ak existuje akákoľvek nebezpečná anon politika.
DO $chk$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE 'anon' = ANY(roles) AND policyname <> 'anon insert ideas schranka';
  IF n > 0 THEN
    RAISE EXCEPTION 'NEBEZPEČNÁ anon politika: % kusov – spustite spustit_na_konci.sql na spevnenie', n;
  END IF;
  RAISE NOTICE 'OK – žiadna nebezpečná anon politika (okrem povolenej schránky).';
END $chk$;
