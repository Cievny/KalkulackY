-- ============================================================
-- cievny.sk – Endovaskulárne nástroje (EVK / CAS / PEVAR)
-- Kompletný idempotentný setup pre Supabase.
-- Možno spustiť opakovane bez chýb (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

-- ============================================================
-- 1. TABUĽKY
-- ============================================================

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
  postup                TEXT,
  uzatvaraci_system     TEXT,
  vysledok              TEXT,
  zaver                 TEXT
);

-- PEVAR výkony
CREATE TABLE IF NOT EXISTS pevar_vykony (
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

-- evk_followup – kontroly (pre budúce použitie)
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

-- aorta_indikacie – pipeline pacientov na terapiu aorty
CREATE TABLE IF NOT EXISTS aorta_indikacie (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  status             TEXT NOT NULL DEFAULT 'poziadavka', -- poziadavka | prezerane | indikovane | chirurgia | konzervativa | endo_material | endo_termin | archiv
  -- pacient (GDPR: len iniciály + ročník, bez mena a RČ)
  inicialy           TEXT,
  rocnik             INT,
  pohlavie           TEXT,
  -- žiadanka
  ziadatel           TEXT,
  datum_poziadavky   TEXT,
  urgencia           TEXT,
  -- indikácia a morfológia
  diagnoza           TEXT,
  symptomy           TEXT,
  priemer_mm         NUMERIC,
  rast_mm_rok        NUMERIC,
  datum_ct           TEXT,
  -- anatómia
  krcok_dlzka_mm     NUMERIC,
  krcok_priemer_mm   NUMERIC,
  krcok_angulacia    TEXT,
  iliaky             TEXT,
  -- fitness & riziko
  kardio             TEXT,
  renalne            TEXT,
  pulmo              TEXT,
  frailty            BOOLEAN,
  dozitie            TEXT,
  medikacia          TEXT,
  -- endovaskulárny plán
  material           TEXT,
  material_objednany TEXT,
  material_dodany    BOOLEAN,
  termin             TEXT,
  -- ostatné
  poznamka           TEXT,
  vysledok           TEXT,  -- dôvod uzavretia (archív)
  historia           TEXT   -- JSON log zmien statusu [{s,d}]
);
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS rodne_cislo TEXT;

-- aorta_prilohy – prílohy k požiadavke (prepis mailu, dokument, fotka)
CREATE TABLE IF NOT EXISTS aorta_prilohy (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  indikacia_id  UUID REFERENCES aorta_indikacie(id) ON DELETE CASCADE,
  typ           TEXT NOT NULL DEFAULT 'text', -- text | subor
  nazov         TEXT,
  obsah         TEXT,   -- voľný text (prepis mailu)
  storage_path  TEXT,   -- cesta v Storage buckete aorta-prilohy
  mime          TEXT
);

-- Storage bucket pre súborové prílohy (privátny, max 20 MB/súbor)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('aorta-prilohy','aorta-prilohy', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- ideas – zdieľaný zápisník nápadov
CREATE TABLE IF NOT EXISTS ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  col         TEXT NOT NULL DEFAULT 'napady',
  text        TEXT NOT NULL,
  author      TEXT
);
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS note TEXT;

-- ============================================================
-- 2. STĹPCE (ADD COLUMN IF NOT EXISTS – bezpečné opakovane)
-- ============================================================

-- --- EVK: prístup, materiály, DSA ---
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

-- --- EVK: štúdijné (SVS/SVE) + baseline ---
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS antitrombotika     TEXT;

-- --- EVK: materiály flatten (publikačné) ---
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS stent_count       INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS stent_brands      TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS stent_types       TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS stent_sizes       TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS stent_segments    TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS balloon_count     INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS balloon_brands    TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS balloon_sizes     TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS ivl_count         INT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS ivl_sizes         TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_vessel_prep  BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_predilat     BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_aterektomia  BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_ivl          BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_reentry      BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_trombektomia BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_pta          BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_deb          BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_stenting     BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_stentgraft   BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_postdilat    BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_kissing      BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS tech_cerab        BOOLEAN;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS sg_count           INTEGER;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS sg_brands          TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS sg_sizes           TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS aterektomia_count  INTEGER;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS aterektomia_detail TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS trombektomia_count INTEGER;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS trombektomia_detail TEXT;

-- --- CAS: identifikácia, prístup, DSA, materiály ---
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS vykon_id TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS klinicky_stav TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS cas_symptom_days INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS pristupova_arteria TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS strana_pristupu TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS pristup_smer TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS pristup_technika TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS pristup_sposob TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS navadzanie TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS uvodny_sheath TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS diag_kateter TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS nascet_stenoza_sin TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS nascet_metoda_sin TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS nascet_stenoza_dx TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS nascet_metoda_dx TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_fr TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_dlzka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_sheath_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic_spec TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS interv_vodic_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS emboloprotekcia TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacia_vykonana TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_velkost TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent_velkost TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovanie_vykonane TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_velkost TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_znacka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS hemostaza_text TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS kompresia_min INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS femostop BOOLEAN;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS kontrast TEXT;

-- --- CAS: štúdijné (SVS/SVE) + baseline ---
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS tech_uspech        TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS antitrombotika     TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS komorbidity        TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_nalez          TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_acc_sin        TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_aci_sin        TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_ace_sin        TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_av_sin         TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_acc_dx         TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_aci_dx         TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_ace_dx         TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS dsa_av_dx          TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS popis_stenozy      TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS percento_stenozy   TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS zavaznost_stenozy  TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS hemostaza_poznamka TEXT;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_diameter_mm NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS predilatacny_balon_length_mm   NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent_diameter_mm             NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS stent_length_mm               NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_diameter_mm NUMERIC;
ALTER TABLE cas_vykony ADD COLUMN IF NOT EXISTS domodelovaci_balon_length_mm   NUMERIC;

-- --- PEVAR: identifikácia, prístup, materiály ---
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS char_krehky               BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS char_polymorbidny         BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS symptomaticky             BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS indikacia_typ             TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sg_konfiguracia           TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS anestezia_typ             TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS pristup_strana            TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_arteria           TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_technika          TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS usg_nav                   BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS rtg_nav                   BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS zabezpecenie_technika     TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sheath_velkost            TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS vodic_typ                 TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sg_nazov                  TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sg_rozmery                TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS contra_kateter_typ        TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS implantacia_komentar      TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_telo          BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_telo_balon    TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_extenzie      BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_extenzie_balon TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS modelovanie_extenzie_rozmer TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS endoleak                  BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS endoleak_typ              TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS endoleak_zdroj            TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS komponenty_ok             BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS uzaver_dx_technika        TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS uzaver_sin_technika       TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS kompresia_dx_min          INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS kompresia_sin_min         INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS hemostaza_dx              TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS hemostaza_sin             TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS femostop_dx               BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS femostop_sin              BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS odporucanie_cas           TEXT;

-- --- PEVAR: štúdijné (SVS/SVE) + baseline ---
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS proc_duration_min  INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS fluoro_time_min    NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS dap                NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS contrast_ml        INT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS komplikacie_struct TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS konverzia          BOOLEAN;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS clavien_dindo      TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS antitrombotika     TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS komorbidity        TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_diameter_mm   NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_angle_alpha   INTEGER;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_angle_beta    INTEGER;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_shape         TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_calcification TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_thrombus      TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS iliac_diameter_dx  NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS iliac_diameter_sin NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_ifu           TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sg_diameter_prox_mm NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sg_length_mm        NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sg_diameter_dist_mm NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS ext_count           INTEGER;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS ext_brands          TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS ext_sizes           TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS ext_strany          TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS extenzie_detail     TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sac_diameter_mm    NUMERIC;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS neck_length_mm     NUMERIC;

-- ============================================================
-- 3. RLS + POLITIKY (anon insert/select/delete) – idempotentné
-- ============================================================
ALTER TABLE evk_vykony   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas_vykony   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pevar_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE evk_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aorta_indikacie ENABLE ROW LEVEL SECURITY;
ALTER TABLE aorta_prilohy   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all evk"      ON evk_vykony;
DROP POLICY IF EXISTS "anon insert evk"   ON evk_vykony;
DROP POLICY IF EXISTS "anon select evk"   ON evk_vykony;
CREATE POLICY "anon all evk"   ON evk_vykony   FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all cas"      ON cas_vykony;
DROP POLICY IF EXISTS "anon insert cas"   ON cas_vykony;
DROP POLICY IF EXISTS "anon select cas"   ON cas_vykony;
CREATE POLICY "anon all cas"   ON cas_vykony   FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all pevar"    ON pevar_vykony;
DROP POLICY IF EXISTS "anon insert pevar" ON pevar_vykony;
DROP POLICY IF EXISTS "anon select pevar" ON pevar_vykony;
DROP POLICY IF EXISTS "anon delete pevar" ON pevar_vykony;
CREATE POLICY "anon all pevar" ON pevar_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon insert followup" ON evk_followup;
DROP POLICY IF EXISTS "anon select followup" ON evk_followup;
DROP POLICY IF EXISTS "anon delete followup" ON evk_followup;
DROP POLICY IF EXISTS "anon all followup"    ON evk_followup;
CREATE POLICY "anon all followup" ON evk_followup FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all ideas" ON ideas;
CREATE POLICY "anon all ideas" ON ideas FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all aorta" ON aorta_indikacie;
CREATE POLICY "anon all aorta" ON aorta_indikacie FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon all aorta prilohy" ON aorta_prilohy;
CREATE POLICY "anon all aorta prilohy" ON aorta_prilohy FOR ALL TO anon USING (true) WITH CHECK (true);

-- Storage politiky pre bucket aorta-prilohy (anon aj authenticated)
DROP POLICY IF EXISTS "aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage delete" ON storage.objects;
CREATE POLICY "aorta prilohy storage select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id='aorta-prilohy');
CREATE POLICY "aorta prilohy storage insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id='aorta-prilohy');
CREATE POLICY "aorta prilohy storage delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id='aorta-prilohy');
