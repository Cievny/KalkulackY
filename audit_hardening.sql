-- ============================================================
-- Spevnenie z auditu (júl 2026) – stačí spustiť tento jeden blok
-- Supabase → SQL Editor → New query → vložiť → Run
-- Je idempotentný (dá sa spustiť opakovane bez škody).
-- ============================================================

-- 1) Chýbajúce stĺpce pre EVK (intervenčný sheath) – inak ukladanie nálezu hlási chybu
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath_dlz TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath_znacka TEXT;

-- 2) Zúžená politika pre verejnú SCHRÁNKU:
--    anon smie IBA vložiť podnet do „ideas“ ako kartu „napady“, v povolenej kategórii,
--    bez hlasov/komentárov a bez podvrhnutého autora. Bráni zaplaveniu nástenky aj falšovaniu hlasov.
DROP POLICY IF EXISTS "anon all ideas" ON ideas;
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

-- (pre istotu) prihlásení majú plný prístup k nápadom
DROP POLICY IF EXISTS "auth all ideas" ON ideas;
CREATE POLICY "auth all ideas" ON ideas FOR ALL TO authenticated USING (true) WITH CHECK (true);
