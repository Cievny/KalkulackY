-- EVK výkony
CREATE TABLE IF NOT EXISTS evk_vykony (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  vykon_id    TEXT,
  datum       TEXT,
  operator    TEXT,
  vek         INT,
  pohlavie    TEXT,
  rutherford  TEXT,
  komorbidity TEXT,
  riecisko    TEXT,
  pristup     TEXT,
  anestazia   TEXT,
  kontrast    TEXT,
  intervencie TEXT,
  materialy   TEXT,
  tech_uspech TEXT,
  komplikacie TEXT,
  zaver       TEXT
);

-- CAS výkony (bez rodného čísla – GDPR)
CREATE TABLE IF NOT EXISTS cas_vykony (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  datum_zaznamu         TEXT,
  vek                   INT,
  pohlavie              TEXT,
  lokalizacia           TEXT,
  typ_platu             TEXT,
  anestazia             TEXT,
  strana_pristupu       TEXT,
  pungovana_tepna       TEXT,
  uvodny_sheath         TEXT,
  diag_kateter          TEXT,
  popis_stenozy         TEXT,
  percento_stenozy      TEXT,
  zavaznost_stenozy     TEXT,
  postup                TEXT,
  interv_sheath         TEXT,
  interv_vodic          TEXT,
  emboloprotekcia       TEXT,
  predilatacia_vykonana TEXT,
  predilatacny_balon    TEXT,
  stent                 TEXT,
  domodelovanie_vykonane TEXT,
  domodelovaci_balon    TEXT,
  uzatvaraci_system     TEXT,
  vysledok              TEXT,
  zaver                 TEXT
);

-- RLS: anon môže insertovať aj čítať
ALTER TABLE evk_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas_vykony ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert evk"  ON evk_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select evk"  ON evk_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cas"  ON cas_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select cas"  ON cas_vykony FOR SELECT TO anon USING (true);

-- =============================================
-- MIGRATIONS: add missing columns
-- =============================================

-- evk_vykony: add detailed columns
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS diag TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_arteria TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_technika TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_smer TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_sposob TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_nav TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_kat TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_sheath TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS pristup_sheath_dlz TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS vodic TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS prechod_leziou TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS dsa_nalez TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS intervencie_detail TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS uzaver TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS hemostaza TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS femostop BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS strana TEXT;

-- cas_vykony: add detailed material columns
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS hemostaza_poznamka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS hemostaza_text TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_fr TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_dlzka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic_spec TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_velkost TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent_velkost TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_velkost TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS klinicky_stav TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS nascet_stenoza TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS nascet_metoda TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS vykon_id TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS operator TEXT;

-- evk_followup: new table for follow-up visits
CREATE TABLE IF NOT EXISTS evk_followup (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  vykon_id TEXT,
  datum_kontroly TEXT,
  casovy_bod TEXT,
  rutherford TEXT,
  abi NUMERIC,
  patencia TEXT,
  reintervencia BOOLEAN,
  amputacia TEXT,
  poznamka TEXT
);
ALTER TABLE evk_followup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert followup" ON evk_followup FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select followup" ON evk_followup FOR SELECT TO anon USING (true);
CREATE POLICY "anon delete followup" ON evk_followup FOR DELETE TO anon USING (true);

-- pevar_vykony: PEVAR procedure registry
CREATE TABLE IF NOT EXISTS pevar_vykony (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  datum_zaznamu             TEXT,
  vek                       INT,
  pohlavie                  TEXT,
  diagnoza                  TEXT,
  char_krehky               BOOLEAN,
  char_polymorbidny         BOOLEAN,
  symptomaticky             BOOLEAN,
  indikacia_typ             TEXT,
  anestezia_typ             TEXT,
  pristup_strana            TEXT,
  punkcia_arteria           TEXT,
  punkcia_technika          TEXT,
  usg_nav                   BOOLEAN,
  rtg_nav                   BOOLEAN,
  zabezpecenie_technika     TEXT,
  sheath_velkost            TEXT,
  vodic_typ                 TEXT,
  sg_nazov                  TEXT,
  sg_rozmery                TEXT,
  contra_kateter_typ        TEXT,
  komponent_dx_nazov        TEXT,
  komponent_dx_rozmery      TEXT,
  komponent_sin_nazov       TEXT,
  komponent_sin_rozmery     TEXT,
  implantacia_komentar      TEXT,
  modelovanie_telo          BOOLEAN,
  modelovanie_telo_balon    TEXT,
  modelovanie_extenzie      BOOLEAN,
  modelovanie_extenzie_balon TEXT,
  modelovanie_extenzie_rozmer TEXT,
  endoleak                  BOOLEAN,
  endoleak_typ              TEXT,
  endoleak_zdroj            TEXT,
  komponenty_ok             BOOLEAN,
  uzaver_dx_technika        TEXT,
  uzaver_sin_technika       TEXT,
  hemostaza_dx              BOOLEAN,
  hemostaza_sin             BOOLEAN,
  odporucanie_cas           TEXT,
  zaver_vykonu              TEXT,
  lekari                    TEXT
);
ALTER TABLE pevar_vykony ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert pevar" ON pevar_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select pevar" ON pevar_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon delete pevar"  ON pevar_vykony FOR DELETE TO anon USING (true);

-- pevar_vykony: add identification columns (if table already exists)
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS vykon_id TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS operator TEXT;

-- ============================================================
-- MIGRÁCIA 2026-06-13: štruktúrovaný zber pre štúdie (SVS/SVE)
-- Periprocedurálne metriky + komplikácie + Clavien-Dindo
-- ============================================================

-- EVK
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;

-- CAS
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS tech_uspech        TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS femostop           BOOLEAN;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS kompresia_min      INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS kontrast           TEXT;

-- PEVAR
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;

-- ============================================================
-- Tabuľka NÁPADY (zdieľaný zápisník návrhov)
-- ============================================================
CREATE TABLE IF NOT EXISTS ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  col         TEXT NOT NULL DEFAULT 'napady',
  text        TEXT NOT NULL,
  author      TEXT
);
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon all ideas" ON ideas;
CREATE POLICY "anon all ideas" ON ideas FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- MIGRÁCIA 2026-06-13 (b): baseline parametre
-- ============================================================
ALTER TABLE evk_vykony   ADD COLUMN IF NOT EXISTS antitrombotika   TEXT;
ALTER TABLE cas_vykony   ADD COLUMN IF NOT EXISTS antitrombotika   TEXT;
ALTER TABLE cas_vykony   ADD COLUMN IF NOT EXISTS cas_symptom_days INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS antitrombotika   TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sac_diameter_mm  NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_length_mm   NUMERIC;
