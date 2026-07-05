-- ============================================================
-- Objednávky CEUS / CT – tabuľky + zámok (len prihlásení)
-- Supabase → SQL Editor → New query → vložiť → Run. Idempotentné.
-- ============================================================

-- Odblokované (otvorené) dni: jeden riadok = typ + dátum + počet miest
CREATE TABLE IF NOT EXISTS objednavky_dni (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ        TEXT NOT NULL,                 -- 'ceus' | 'ct'
  datum      DATE NOT NULL,
  kapacita   INT  NOT NULL DEFAULT 0,       -- počet miest (pri časových dňoch = počet 15-min termínov)
  cas_od     TEXT,                          -- 'HH:MM' začiatok termínov (voliteľné)
  cas_do     TEXT,                          -- 'HH:MM' koniec termínov (voliteľné)
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (typ, datum)
);
-- pre už existujúce inštalácie:
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS cas_od TEXT;
ALTER TABLE objednavky_dni ADD COLUMN IF NOT EXISTS cas_do TEXT;

-- Samotné objednávky pacientov
CREATE TABLE IF NOT EXISTS objednavky (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ         TEXT NOT NULL,                -- 'ceus' | 'ct'
  datum       DATE NOT NULL,
  cas         TEXT,                         -- 'HH:MM' termín (pri časových dňoch)
  meno        TEXT,
  rocnik      INT,
  rodne_cislo TEXT,
  diagnoza    TEXT,
  indikacia   TEXT,
  oddelenie   TEXT,
  objednal    TEXT,
  poznamka    TEXT,
  stav        TEXT DEFAULT 'objednany',     -- objednany | hotovy | zruseny
  created_by  TEXT DEFAULT (auth.jwt()->>'email'),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE objednavky ADD COLUMN IF NOT EXISTS cas TEXT; -- pre už existujúce inštalácie
CREATE INDEX IF NOT EXISTS idx_objednavky_typ_datum ON objednavky (typ, datum);

-- RLS: prístup len pre prihlásených (rovnako ako zvyšok databázy)
ALTER TABLE objednavky_dni ENABLE ROW LEVEL SECURITY;
ALTER TABLE objednavky     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all objednavky_dni" ON objednavky_dni;
CREATE POLICY "auth all objednavky_dni" ON objednavky_dni FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all objednavky" ON objednavky;
CREATE POLICY "auth all objednavky" ON objednavky FOR ALL TO authenticated USING (true) WITH CHECK (true);
