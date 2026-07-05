-- ============================================================
-- Objednávky CEUS / CT – tabuľky + zámok (len prihlásení)
-- Supabase → SQL Editor → New query → vložiť → Run. Idempotentné.
-- ============================================================

-- Odblokované (otvorené) dni: jeden riadok = typ + dátum + počet miest
CREATE TABLE IF NOT EXISTS objednavky_dni (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ        TEXT NOT NULL,                 -- 'ceus' | 'ct'
  datum      DATE NOT NULL,
  kapacita   INT  NOT NULL DEFAULT 0,       -- počet miest v daný deň
  created_by TEXT DEFAULT (auth.jwt()->>'email'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (typ, datum)
);

-- Samotné objednávky pacientov
CREATE TABLE IF NOT EXISTS objednavky (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ         TEXT NOT NULL,                -- 'ceus' | 'ct'
  datum       DATE NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_objednavky_typ_datum ON objednavky (typ, datum);

-- RLS: prístup len pre prihlásených (rovnako ako zvyšok databázy)
ALTER TABLE objednavky_dni ENABLE ROW LEVEL SECURITY;
ALTER TABLE objednavky     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all objednavky_dni" ON objednavky_dni;
CREATE POLICY "auth all objednavky_dni" ON objednavky_dni FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth all objednavky" ON objednavky;
CREATE POLICY "auth all objednavky" ON objednavky FOR ALL TO authenticated USING (true) WITH CHECK (true);
