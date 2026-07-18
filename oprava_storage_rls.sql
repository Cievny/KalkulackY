-- ============================================================
-- OPRAVA STORAGE RLS – prílohy pacientov (aorta-prilohy, oznamy-prilohy)
-- Problém: existujúce politiky kontrolujú len bucket_id → hociktorý
-- prihlásený Google účet (aj mimo allowlistu) číta/maže prílohy pacientov.
-- Táto oprava zmaže VŠETKY staré varianty a nastaví prísne politiky
-- s je_povoleny() (allowlist) AND NOT je_tv() (TV kiosk nesmie zapisovať).
-- Idempotentné – možno spustiť opakovane.
-- ============================================================

-- 1) Zmaž všetky staré (obe pomenovania: s „auth" aj bez neho)
DROP POLICY IF EXISTS "aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage delete" ON storage.objects;
DROP POLICY IF EXISTS "auth aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "auth aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "auth aorta prilohy storage delete" ON storage.objects;
DROP POLICY IF EXISTS "oznamy storage select" ON storage.objects;
DROP POLICY IF EXISTS "oznamy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "oznamy storage delete" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage select" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage delete" ON storage.objects;

-- 2) Poistka: je_povoleny()/je_tv() musia existovať (definuje ich spustit_na_konci.sql)
DO $chk$
BEGIN
  IF to_regproc('public.je_povoleny') IS NULL THEN
    RAISE EXCEPTION 'Chýba funkcia je_povoleny() – najprv spustite spustit_na_konci.sql';
  END IF;
END $chk$;

-- 3) Prísne politiky – aorta-prilohy
CREATE POLICY "aorta prilohy storage select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id='aorta-prilohy' AND je_povoleny());
CREATE POLICY "aorta prilohy storage insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id='aorta-prilohy' AND je_povoleny() AND NOT je_tv());
CREATE POLICY "aorta prilohy storage delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id='aorta-prilohy' AND je_povoleny() AND NOT je_tv());

-- 4) Prísne politiky – oznamy-prilohy
CREATE POLICY "auth oznamy storage select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id='oznamy-prilohy' AND je_povoleny());
CREATE POLICY "auth oznamy storage insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id='oznamy-prilohy' AND je_povoleny() AND NOT je_tv());
CREATE POLICY "auth oznamy storage delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id='oznamy-prilohy' AND je_povoleny() AND NOT je_tv());

-- 5) Overenie – KAŽDÁ politika musí obsahovať je_povoleny(); zlyhá, ak nie
DO $chk2$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND (qual IS NULL OR position('je_povoleny' in coalesce(qual,'')||coalesce(with_check,''))=0)
     AND (qual LIKE '%prilohy%' OR with_check LIKE '%prilohy%');
  IF n > 0 THEN
    RAISE EXCEPTION 'Ostali storage politiky bez je_povoleny(): % ks', n;
  END IF;
  RAISE NOTICE 'OK – všetky storage politiky príloh sú spevnené (je_povoleny).';
END $chk2$;
