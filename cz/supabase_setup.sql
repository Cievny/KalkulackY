-- ============================================================
-- cievny.sk – Endovaskulárne nástroje (EVK / CAS / PEVAR)
-- Kompletný idempotentný setup pre Supabase.
-- Možno spustiť opakovane bez chýb (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- ============================================================
-- 1. TABUĽKY
-- ============================================================

-- EVK výkony
CREATE TABLE IF NOT EXISTS cz_evk_vykony (
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
CREATE TABLE IF NOT EXISTS cz_cas_vykony (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  datum_zaznamu         TEXT,
  vek                   INT,
  pohlavie              TEXT,
  lokalizacia           TEXT,
  typ_platu             TEXT,
  anestazia             TEXT,
  postup                TEXT,
  uzatvaraci_system     TEXT,
  vysledok              TEXT,
  zaver                 TEXT
);

-- PEVAR výkony
CREATE TABLE IF NOT EXISTS cz_pevar_vykony (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  vykon_id                  TEXT,
  operator                  TEXT,
  datum_zaznamu             TEXT,
  vek                       INT,
  pohlavie                  TEXT,
  diagnoza                  TEXT,
  zaver_vykonu              TEXT,
  lekari                    TEXT
);

-- cz_evk_followup – kontroly (pre budúce použitie)
CREATE TABLE IF NOT EXISTS cz_evk_followup (
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

-- cz_ideas – zdieľaný zápisník nápadov
CREATE TABLE IF NOT EXISTS cz_ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  col         TEXT NOT NULL DEFAULT 'napady',
  text        TEXT NOT NULL,
  author      TEXT
);
ALTER TABLE cz_ideas ADD COLUMN IF NOT EXISTS note TEXT;

-- ============================================================
-- 2. STĹPCE (ADD COLUMN IF NOT EXISTS – bezpečné opakovane)
-- ============================================================

-- --- EVK: prístup, materiály, DSA ---
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS diag TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_arteria TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_technika TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_smer TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_sposob TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_nav TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_kat TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_sheath TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS pristup_sheath_dlz TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS vodic TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS prechod_leziou TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS dsa_nalez TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS intervencie_detail TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS uzaver TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS hemostaza TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS femostop BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS strana TEXT;

-- --- EVK: štúdijné (SVS/SVE) + baseline ---
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS antitrombotika     TEXT;

-- --- EVK: materiály flatten (publikačné) ---
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS stent_count       INT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS stent_brands      TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS stent_types       TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS stent_sizes       TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS stent_segments    TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS balloon_count     INT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS balloon_brands    TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS balloon_sizes     TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS ivl_count         INT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS ivl_sizes         TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_vessel_prep  BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_predilat     BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_aterektomia  BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_ivl          BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_reentry      BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_trombektomia BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_pta          BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_deb          BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_stenting     BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_stentgraft   BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_postdilat    BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_kissing      BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS tech_cerab        BOOLEAN;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS sg_count           INTEGER;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS sg_brands          TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS sg_sizes           TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS aterektomia_count  INTEGER;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS aterektomia_detail TEXT;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS trombektomia_count INTEGER;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS trombektomia_detail TEXT;

-- --- CAS: identifikácia, prístup, DSA, materiály ---
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS vykon_id TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS klinicky_stav TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS cas_symptom_days INT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS pristupova_arteria TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS strana_pristupu TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS pristup_smer TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS pristup_technika TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS pristup_sposob TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS navadzanie TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS uvodny_sheath TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS diag_kateter TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS nascet_stenoza_sin TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS nascet_metoda_sin TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS nascet_stenoza_dx TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS nascet_metoda_dx TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_fr TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_dlzka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_znacka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic_spec TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic_znacka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS emboloprotekcia TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS predilatacia_vykonana TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_velkost TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_znacka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS stent TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS stent_velkost TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS stent_znacka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS domodelovanie_vykonane TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_velkost TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_znacka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS hemostaza_text TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS kompresia_min INT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS femostop BOOLEAN;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS kontrast TEXT;

-- --- CAS: štúdijné (SVS/SVE) + baseline ---
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS tech_uspech        TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS antitrombotika     TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS komorbidity        TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_nalez          TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_acc_sin        TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_aci_sin        TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_ace_sin        TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_av_sin         TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_acc_dx         TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_aci_dx         TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_ace_dx         TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS dsa_av_dx          TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS popis_stenozy      TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS percento_stenozy   TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS zavaznost_stenozy  TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS hemostaza_poznamka TEXT;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_diameter_mm NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_length_mm   NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS stent_diameter_mm             NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS stent_length_mm               NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_diameter_mm NUMERIC;
ALTER TABLE cz_cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_length_mm   NUMERIC;

-- --- PEVAR: identifikácia, prístup, materiály ---
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS char_krehky               BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS char_polymorbidny         BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS symptomaticky             BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS indikacia_typ             TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sg_konfiguracia           TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS anestezia_typ             TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS pristup_strana            TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_arteria           TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_technika          TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS usg_nav                   BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS rtg_nav                   BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS zabezpecenie_technika     TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sheath_velkost            TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS vodic_typ                 TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sg_nazov                  TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sg_rozmery                TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS contra_kateter_typ        TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS implantacia_komentar      TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_telo          BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_telo_balon    TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_extenzie      BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_extenzie_balon TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_extenzie_rozmer TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS endoleak                  BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS endoleak_typ              TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS endoleak_zdroj            TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS komponenty_ok             BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS uzaver_dx_technika        TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS uzaver_sin_technika       TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS kompresia_dx_min          INT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS kompresia_sin_min         INT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS hemostaza_dx              TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS hemostaza_sin             TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS femostop_dx               BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS femostop_sin              BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS odporucanie_cas           TEXT;

-- --- PEVAR: štúdijné (SVS/SVE) + baseline ---
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS antitrombotika     TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS komorbidity        TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_diameter_mm   NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_angle_alpha   INTEGER;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_angle_beta    INTEGER;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_shape         TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_calcification TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_thrombus      TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS iliac_diameter_dx  NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS iliac_diameter_sin NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_ifu           TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sg_diameter_prox_mm NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sg_length_mm        NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sg_diameter_dist_mm NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS ext_count           INTEGER;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS ext_brands          TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS ext_sizes           TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS ext_strany          TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS extenzie_detail     TEXT;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS sac_diameter_mm    NUMERIC;
ALTER TABLE cz_pevar_vykony ADD COLUMN IF NOT EXISTS neck_length_mm     NUMERIC;

-- ============================================================
-- 3. RLS + POLITIKY (anon insert/select/delete) – idempotentné
-- ============================================================
ALTER TABLE cz_evk_vykony   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_cas_vykony   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_pevar_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_evk_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_ideas        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all evk"      ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon insert evk"   ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon select evk"   ON cz_evk_vykony;
CREATE POLICY "anon all evk"   ON cz_evk_vykony   FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all cas"      ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon insert cas"   ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon select cas"   ON cz_cas_vykony;
CREATE POLICY "anon all cas"   ON cz_cas_vykony   FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all pevar"    ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon insert pevar" ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon select pevar" ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon delete pevar" ON cz_pevar_vykony;
CREATE POLICY "anon all pevar" ON cz_pevar_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon insert followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon select followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon delete followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon all followup"    ON cz_evk_followup;
CREATE POLICY "anon all followup" ON cz_evk_followup FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all cz_ideas" ON cz_ideas;
CREATE POLICY "anon all cz_ideas" ON cz_ideas FOR ALL TO anon USING (true) WITH CHECK (true);
