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
