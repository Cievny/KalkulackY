-- =====================================================================
--  cievny.sk – SQL na spustenie TERAZ (Supabase → SQL Editor → Run)
--  Bezpečné spúšťať aj opakovane (IF NOT EXISTS / IF EXISTS).
--  Predpoklad: už ste raz spustili spustit_na_konci.sql
--  (existujú funkcie je_povoleny() / je_tv() / je_admin()).
-- =====================================================================

-- 1) EVK – IVL katétre (Shockwave/Shockfast/vlastný) do štatistík
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS ivl_brands TEXT;

-- 2) PEVAR – samostatný prístup pre každú stranu (ľavá strana = _sin)
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_arteria_sin       TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_technika_sin      TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS zabezpecenie_technika_sin TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sheath_velkost_sin        TEXT;

-- 3) Oznamy – komentáre + prihlasovanie (workshopy / akcie)
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS povolit_komentare     BOOLEAN DEFAULT false;
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS povolit_prihlasovanie BOOLEAN DEFAULT false;
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS kapacita              INT;

CREATE TABLE IF NOT EXISTS oznam_reakcie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oznam_id UUID NOT NULL REFERENCES oznamy(id) ON DELETE CASCADE,
  typ TEXT NOT NULL DEFAULT 'komentar',   -- 'komentar' | 'prihlaska'
  text TEXT,
  meno TEXT,                              -- voliteľné celé meno prihláseného
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: čítať smie každý povolený; písať/mazať povolený OKREM TV kiosku
ALTER TABLE oznam_reakcie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reakcie sel" ON oznam_reakcie;
DROP POLICY IF EXISTS "reakcie ins" ON oznam_reakcie;
DROP POLICY IF EXISTS "reakcie upd" ON oznam_reakcie;
DROP POLICY IF EXISTS "reakcie del" ON oznam_reakcie;
CREATE POLICY "reakcie sel" ON oznam_reakcie FOR SELECT TO authenticated USING (je_povoleny());
CREATE POLICY "reakcie ins" ON oznam_reakcie FOR INSERT TO authenticated WITH CHECK (je_povoleny() AND NOT je_tv());
CREATE POLICY "reakcie upd" ON oznam_reakcie FOR UPDATE TO authenticated USING (je_povoleny() AND NOT je_tv()) WITH CHECK (je_povoleny() AND NOT je_tv());
CREATE POLICY "reakcie del" ON oznam_reakcie FOR DELETE TO authenticated USING (je_povoleny() AND NOT je_tv());

-- Hotovo. Poznámka: DSA „viac segmentov v jednej tepne" nepotrebuje žiadnu
-- zmenu v databáze (ukladá sa do existujúceho stĺpca dsa_nalez).
