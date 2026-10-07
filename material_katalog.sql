-- ============================================================
-- Katalóg materiálu OIRA – číselník (dodávateľ, objednávkové číslo, NIS)
-- Supabase → SQL Editor → New query → vložiť → Run. Idempotentné.
-- Spúšťať PO spustit_na_konci.sql (používa je_povoleny / je_tv / je_admin).
-- Dáta sa NEUKLADAJÚ do repozitára (je verejný) – nahrávajú sa cez
-- /tools/material/ → „Nahrať katalóg (JSON)" (len administrátor).
-- ============================================================

CREATE TABLE IF NOT EXISTS material_katalog (
  id          BIGSERIAL PRIMARY KEY,
  dodavatel   TEXT,              -- distribútor (napr. Intermedical Plus)
  vyrobca     TEXT,
  rada        TEXT,              -- produktová rada
  nazov       TEXT,
  ref         TEXT,              -- objednávkové / katalógové číslo (REF)
  order_no    TEXT,              -- Cook Order No. (G-číslo) a pod.
  nis_kod     TEXT,              -- kód materiálu v NIS
  nis_nazov   TEXT,
  cena        NUMERIC,           -- cena z NIS s DPH (€)
  cena_bez_dph NUMERIC,          -- cenník / zmluva / ponuka dodávateľa bez DPH (€)
  vydaj_12m   NUMERIC,           -- výdaj za 12 mesiacov (ks)
  rezim       TEXT,              -- Konsignácia / Vlastný sklad / …
  priemer     TEXT,
  dlzka       TEXT,
  shaft       TEXT,
  hladanie    TEXT,              -- normalizovaný text na vyhľadávanie (bez diakritiky)
  verzia      TEXT,              -- dátum/označenie importu
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE material_katalog ADD COLUMN IF NOT EXISTS cena_bez_dph NUMERIC;
CREATE INDEX IF NOT EXISTS material_katalog_ref_idx ON material_katalog (ref);
CREATE INDEX IF NOT EXISTS material_katalog_nis_idx ON material_katalog (nis_kod);

-- RLS: čítajú všetci povolení (aj TV), meniť (import) môže len administrátor
ALTER TABLE material_katalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pov sel material_katalog" ON material_katalog;
DROP POLICY IF EXISTS "adm all material_katalog" ON material_katalog;
CREATE POLICY "pov sel material_katalog" ON material_katalog FOR SELECT TO authenticated USING (je_povoleny());
CREATE POLICY "adm all material_katalog" ON material_katalog FOR ALL TO authenticated USING (je_admin()) WITH CHECK (je_admin());
