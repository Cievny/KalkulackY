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
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS indikoval1 TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS indikoval2 TEXT;
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS kategoria TEXT DEFAULT 'aorta'; -- aorta | ine
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS zaver_seminara TEXT; -- záver indikačného seminára (kategória INÉ)
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS vykon_typ TEXT;          -- PEVAR | TEVAR | FEVAR | BEVAR | ISLF+ThEVAR | ISL+EVAR | Embolizácia
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS vykon_cieva TEXT;        -- pri embolizácii: ktorá cieva
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS indikacia_poznamka TEXT; -- poznámka k indikácii (aorta)
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS endoleak_typ TEXT;       -- typ endoleaku (Ia/Ib/II/III/IV/V) pri dg. Endoleak
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS dalsia_kontrola TEXT;    -- dispenzarizácia: dátum ďalšej CT/USG kontroly

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

-- created_by: email prihláseného používateľa (vyplní databáza automaticky z JWT pri INSERTe)
ALTER TABLE aorta_indikacie ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE aorta_prilohy   ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE evk_vykony      ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE cas_vykony      ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE pevar_vykony    ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE evk_followup    ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE IF EXISTS ideas ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email'); -- IF EXISTS: `ideas` sa vytvára nižšie (fresh-install safe)
ALTER TABLE IF EXISTS cz_evk_vykony   ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE IF EXISTS cz_cas_vykony   ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE IF EXISTS cz_pevar_vykony ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE IF EXISTS cz_evk_followup ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');
ALTER TABLE IF EXISTS cz_ideas        ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');

-- pevar_followup – kontroly po EVAR/PEVAR (surveillance)
CREATE TABLE IF NOT EXISTS pevar_followup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  vykon_id TEXT,
  datum_kontroly TEXT,
  casovy_bod TEXT,
  zobrazenie TEXT,
  sac_diameter_mm NUMERIC,
  sac_zmena TEXT,
  endoleak BOOLEAN,
  endoleak_typ TEXT,
  reintervencia BOOLEAN,
  reintervencia_detail TEXT,
  poznamka TEXT,
  created_by TEXT DEFAULT (auth.jwt()->>'email')
);

-- cas_followup – kontroly po CAS
CREATE TABLE IF NOT EXISTS cas_followup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  vykon_id TEXT,
  datum_kontroly TEXT,
  casovy_bod TEXT,
  zobrazenie TEXT,
  restenoza TEXT,
  neuro TEXT,
  reintervencia BOOLEAN,
  reintervencia_detail TEXT,
  poznamka TEXT,
  created_by TEXT DEFAULT (auth.jwt()->>'email')
);

-- CZ zrkadlá follow-upov
CREATE TABLE IF NOT EXISTS cz_pevar_followup (LIKE pevar_followup INCLUDING ALL);
CREATE TABLE IF NOT EXISTS cz_cas_followup   (LIKE cas_followup INCLUDING ALL);

-- denny_program – program výkonov na deň (upravuje sa naživo na rannom sedení)
CREATE TABLE IF NOT EXISTS denny_program (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  datum           TEXT NOT NULL,           -- deň programu (YYYY-MM-DD)
  poradie         INT DEFAULT 0,
  meno            TEXT,                    -- celé meno pacienta
  rocnik          INT,
  diagnoza        TEXT,
  lozko           TEXT,                    -- kde leží (odd./izba)
  cas_okno        TEXT,                    -- časové okno (napr. 8:00–9:30)
  poloha          TEXT,                    -- poloha pacienta na sále
  miesto_punkcie  TEXT,
  poznamka        TEXT,
  stav            TEXT DEFAULT 'planovany', -- planovany | vyradeny
  vyradeny_dovod  TEXT,
  created_by      TEXT DEFAULT (auth.jwt()->>'email')
);
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS stav_vykonu TEXT DEFAULT 'na_oddeleni'; -- na_oddeleni | poslat | caka | na_sale | hotovy
ALTER TABLE denny_program ALTER COLUMN stav_vykonu SET DEFAULT 'na_oddeleni';
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS operator TEXT;
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS poziadavka_id UUID; -- prepojenie na aorta_indikacie
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS vykon TEXT; -- planovany vykon (PEVAR/CAS/PTA...)
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS vykon_start TEXT;  -- stopky: zaciatok (prepnutie na 'na sale')
ALTER TABLE denny_program ADD COLUMN IF NOT EXISTS vykon_koniec TEXT; -- stopky: koniec (prepnutie na 'hotovy')

-- oznamy – nástenka oddelenia
CREATE TABLE IF NOT EXISTS oznamy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nadpis TEXT,
  text TEXT,
  dolezite BOOLEAN DEFAULT false,
  platne_do TEXT,
  created_by TEXT DEFAULT (auth.jwt()->>'email')
);
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS priloha_path TEXT;
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS priloha_nazov TEXT;
ALTER TABLE oznamy ADD COLUMN IF NOT EXISTS priloha_mime TEXT;

-- Storage bucket pre prílohy oznamov (rozpisy služieb a pod.)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('oznamy-prilohy','oznamy-prilohy', false, 20971520)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "auth oznamy storage select" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "auth oznamy storage delete" ON storage.objects;
CREATE POLICY "auth oznamy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='oznamy-prilohy');
CREATE POLICY "auth oznamy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='oznamy-prilohy');
CREATE POLICY "auth oznamy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='oznamy-prilohy');

ALTER TABLE oznamy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all oznamy" ON oznamy;
CREATE POLICY "auth all oznamy" ON oznamy FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ideas – zdieľaný zápisník nápadov
CREATE TABLE IF NOT EXISTS ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  col         TEXT NOT NULL DEFAULT 'napady',
  text        TEXT NOT NULL,
  author      TEXT
);
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS kategoria TEXT DEFAULT 'apka'; -- apka | oddelenie
ALTER TABLE IF EXISTS cz_ideas ADD COLUMN IF NOT EXISTS kategoria TEXT DEFAULT 'apka';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS hlasy INT DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS komentare TEXT; -- JSON [{t,a,d}]
ALTER TABLE IF EXISTS cz_ideas ADD COLUMN IF NOT EXISTS hlasy INT DEFAULT 0;
ALTER TABLE IF EXISTS cz_ideas ADD COLUMN IF NOT EXISTS komentare TEXT;
-- created_by pre `ideas` musí byť až tu (po CREATE TABLE ideas vyššie)
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT (auth.jwt()->>'email');

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
-- intervenčný sheath (samostatný od prístupového) – používa EVK formulár
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath_dlz TEXT;
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath_znacka TEXT;
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
ALTER TABLE evk_vykony ADD COLUMN IF NOT EXISTS ivl_brands        TEXT;
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
-- prístup pre ľavú stranu zvlášť (pri obojstrannom prístupe)
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_arteria_sin       TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS punkcia_technika_sin      TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS zabezpecenie_technika_sin TEXT;
ALTER TABLE pevar_vykony ADD COLUMN IF NOT EXISTS sheath_velkost_sin        TEXT;
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
ALTER TABLE pevar_followup  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas_followup    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_pevar_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_cas_followup   ENABLE ROW LEVEL SECURITY;
ALTER TABLE denny_program     ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- DATABÁZA JE ZAMKNUTÁ: pacientske a klinické dáta iba pre prihlásených (authenticated).
-- Jediná výnimka pre anon je INŠTITUCIONÁLNA SCHRÁNKA – zúžený INSERT do `ideas`.
-- (Táto sekcia nahrádza pôvodné „anon all“ politiky aj samostatný skript zamknutie_databazy.sql.)
-- ------------------------------------------------------------

-- Odstráň všetky staré, príliš otvorené anon politiky
DROP POLICY IF EXISTS "anon all evk"        ON evk_vykony;
DROP POLICY IF EXISTS "anon insert evk"     ON evk_vykony;
DROP POLICY IF EXISTS "anon select evk"     ON evk_vykony;
DROP POLICY IF EXISTS "anon all cas"        ON cas_vykony;
DROP POLICY IF EXISTS "anon insert cas"     ON cas_vykony;
DROP POLICY IF EXISTS "anon select cas"     ON cas_vykony;
DROP POLICY IF EXISTS "anon all pevar"      ON pevar_vykony;
DROP POLICY IF EXISTS "anon insert pevar"   ON pevar_vykony;
DROP POLICY IF EXISTS "anon select pevar"   ON pevar_vykony;
DROP POLICY IF EXISTS "anon delete pevar"   ON pevar_vykony;
DROP POLICY IF EXISTS "anon all followup"   ON evk_followup;
DROP POLICY IF EXISTS "anon insert followup" ON evk_followup;
DROP POLICY IF EXISTS "anon select followup" ON evk_followup;
DROP POLICY IF EXISTS "anon delete followup" ON evk_followup;
DROP POLICY IF EXISTS "anon all ideas"      ON ideas;
DROP POLICY IF EXISTS "anon all aorta"      ON aorta_indikacie;
DROP POLICY IF EXISTS "anon all aorta prilohy" ON aorta_prilohy;
DROP POLICY IF EXISTS "anon all pevar fu"   ON pevar_followup;
DROP POLICY IF EXISTS "anon all cas fu"     ON cas_followup;
DROP POLICY IF EXISTS "anon all cz pevar fu" ON cz_pevar_followup;
DROP POLICY IF EXISTS "anon all cz cas fu"  ON cz_cas_followup;
DROP POLICY IF EXISTS "anon all program"    ON denny_program;

-- Authenticated má plný prístup ku všetkým tabuľkám
DROP POLICY IF EXISTS "auth all evk"        ON evk_vykony;
CREATE POLICY "auth all evk"        ON evk_vykony      FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all cas"        ON cas_vykony;
CREATE POLICY "auth all cas"        ON cas_vykony      FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all pevar"      ON pevar_vykony;
CREATE POLICY "auth all pevar"      ON pevar_vykony    FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all followup"   ON evk_followup;
CREATE POLICY "auth all followup"   ON evk_followup    FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all ideas"      ON ideas;
CREATE POLICY "auth all ideas"      ON ideas           FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all aorta"      ON aorta_indikacie;
CREATE POLICY "auth all aorta"      ON aorta_indikacie FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all aorta prilohy" ON aorta_prilohy;
CREATE POLICY "auth all aorta prilohy" ON aorta_prilohy FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all pevar fu"   ON pevar_followup;
CREATE POLICY "auth all pevar fu"   ON pevar_followup  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all cas fu"     ON cas_followup;
CREATE POLICY "auth all cas fu"     ON cas_followup    FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all cz pevar fu" ON cz_pevar_followup;
CREATE POLICY "auth all cz pevar fu" ON cz_pevar_followup FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all cz cas fu"  ON cz_cas_followup;
CREATE POLICY "auth all cz cas fu"  ON cz_cas_followup FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all program"    ON denny_program;
CREATE POLICY "auth all program"    ON denny_program   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SCHRÁNKA: anon smie IBA vložiť podnet do `ideas`, a to len ako kartu v stĺpci „napady“,
-- v povolenej kategórii, bez hlasov/komentárov a bez podvrhnutého autora (created_by).
-- Bráni to zaplaveniu internej nástenky, falšovaniu hlasov aj XSS cez neplatnú kategóriu.
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

-- Storage politiky pre bucket aorta-prilohy – iba prihlásení (obsahuje pacientske dokumenty/fotky)
DROP POLICY IF EXISTS "aorta prilohy storage select" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage insert" ON storage.objects;
DROP POLICY IF EXISTS "aorta prilohy storage delete" ON storage.objects;
CREATE POLICY "aorta prilohy storage select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='aorta-prilohy');
CREATE POLICY "aorta prilohy storage insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='aorta-prilohy');
CREATE POLICY "aorta prilohy storage delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='aorta-prilohy');

-- ============================================================
-- 5. OBJEDNÁVKY CEUS / CT (odblokované dni + objednávky)
-- ============================================================
CREATE TABLE IF NOT EXISTS objednavky_dni (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ        TEXT NOT NULL,
  datum      DATE NOT NULL,
  kapacita   INT  NOT NULL DEFAULT 0,
  cas_od     TEXT,
  cas_do     TEXT,
  slot_min   INT DEFAULT 15,
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (typ, datum)
);
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS cas_od TEXT;
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS cas_do TEXT;
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS slot_min INT DEFAULT 15;
CREATE TABLE IF NOT EXISTS objednavky (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ         TEXT NOT NULL,
  datum       DATE NOT NULL,
  cas         TEXT,
  meno        TEXT,
  rocnik      INT,
  rodne_cislo TEXT,
  diagnoza    TEXT,
  indikacia   TEXT,
  oddelenie   TEXT,
  objednal    TEXT,
  poznamka    TEXT,
  stav        TEXT DEFAULT 'objednany',
  created_by  TEXT DEFAULT (auth.jwt()->>'email'),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE objednavky ADD COLUMN IF NOT EXISTS cas TEXT;
ALTER TABLE objednavky ADD COLUMN IF NOT EXISTS sloty INT DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_objednavky_typ_datum ON objednavky (typ, datum);
ALTER TABLE objednavky_dni ENABLE ROW LEVEL SECURITY;
ALTER TABLE objednavky     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all objednavky_dni" ON objednavky_dni;
CREATE POLICY "auth all objednavky_dni" ON objednavky_dni FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all objednavky" ON objednavky;
CREATE POLICY "auth all objednavky" ON objednavky FOR ALL TO authenticated USING (true) WITH CHECK (true);
