-- ============================================================================
-- supabase_rls_fix.sql — Sprísnenie RLS politík pre cievny.sk / cievni.cz
-- ============================================================================
-- PROBLÉM:
--   Aktuálne politiky (viď supabase_setup.sql a cz/supabase_setup.sql,
--   riadky ~296-325) povoľujú role `anon` PLNÝ prístup (FOR ALL vrátane
--   DELETE) ku všetkým tabuľkám:
--     "anon all evk"      ON evk_vykony / cz_evk_vykony
--     "anon all cas"      ON cas_vykony / cz_cas_vykony
--     "anon all pevar"    ON pevar_vykony / cz_pevar_vykony
--     "anon all followup" ON evk_followup / cz_evk_followup
--     "anon all ideas"    ON ideas   |  "anon all cz_ideas" ON cz_ideas
--   Ktokoľvek s publishable (anon) kľúčom — ktorý je viditeľný v zdrojovom
--   kóde stránok — teda môže čítať, meniť aj MAZAŤ všetky záznamy.
--
-- TENTO SKRIPT ponúka dve možnosti:
--   MOŽNOSŤ A (dočasná, bez zmien v aplikácii): odoberie role `anon`
--     právo DELETE; SELECT/INSERT/UPDATE ostávajú (aplikácia ich potrebuje
--     na ukladanie a editáciu). POZOR: tlačidlá "Vymazať/Zmazať" v
--     tools/zaznamy a tools/analytics prestanú fungovať (HTTP 4xx),
--     mazať bude možné len cez Supabase dashboard / service_role.
--   MOŽNOSŤ B (správne riešenie): migrácia na Supabase Auth — prístup
--     len pre prihlásených používateľov (role `authenticated`).
--
-- Spustite VŽDY LEN JEDNU z možností (odkomentujte príslušnú sekciu).
-- Skript je napísaný pre SK aj CZ tabuľky v jednej Supabase inštancii;
-- ak sú v oddelených projektoch, spustite v každom len jeho časť.
-- ============================================================================


-- ============================================================================
-- MOŽNOSŤ A — dočasné riešenie: zrušiť DELETE pre anon
-- (odkomentujte a spustite)
-- ============================================================================
/*
-- --- SK tabuľky -------------------------------------------------------------
DROP POLICY IF EXISTS "anon all evk"      ON evk_vykony;
DROP POLICY IF EXISTS "anon all cas"      ON cas_vykony;
DROP POLICY IF EXISTS "anon all pevar"    ON pevar_vykony;
DROP POLICY IF EXISTS "anon all followup" ON evk_followup;
DROP POLICY IF EXISTS "anon all ideas"    ON ideas;

CREATE POLICY "anon select evk" ON evk_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert evk" ON evk_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update evk" ON evk_vykony FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select cas" ON cas_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cas" ON cas_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update cas" ON cas_vykony FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select pevar" ON pevar_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert pevar" ON pevar_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update pevar" ON pevar_vykony FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select followup" ON evk_followup FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert followup" ON evk_followup FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update followup" ON evk_followup FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select ideas" ON ideas FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert ideas" ON ideas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update ideas" ON ideas FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- --- CZ tabuľky -------------------------------------------------------------
DROP POLICY IF EXISTS "anon all evk"      ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon all cas"      ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon all pevar"    ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon all followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon all cz_ideas" ON cz_ideas;

CREATE POLICY "anon select cz_evk" ON cz_evk_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cz_evk" ON cz_evk_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update cz_evk" ON cz_evk_vykony FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select cz_cas" ON cz_cas_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cz_cas" ON cz_cas_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update cz_cas" ON cz_cas_vykony FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select cz_pevar" ON cz_pevar_vykony FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cz_pevar" ON cz_pevar_vykony FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update cz_pevar" ON cz_pevar_vykony FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select cz_followup" ON cz_evk_followup FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cz_followup" ON cz_evk_followup FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update cz_followup" ON cz_evk_followup FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon select cz_ideas" ON cz_ideas FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert cz_ideas" ON cz_ideas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update cz_ideas" ON cz_ideas FOR UPDATE TO anon USING (true) WITH CHECK (true);
*/


-- ============================================================================
-- MOŽNOSŤ B — správne riešenie: Supabase Auth (len pre prihlásených)
-- ============================================================================
-- Kroky (SQL nižšie + zmeny v aplikácii):
--   1. V Supabase dashboarde zapnite Auth (Email/Password alebo magic link)
--      a vytvorte účty pre lekárov, ktorí majú mať prístup.
--   2. Aplikácia (tools/*/index.html) musí prejsť z čistého REST volania
--      s anon kľúčom na supabase-js klienta s prihlásením:
--        - pridať <script supabase-js>, createClient(SB_URL, SB_KEY),
--        - login obrazovka (signInWithPassword / signInWithOtp),
--        - všetky fetch volania nahradiť supabase.from(...).select()/insert()
--          /update()/delete() — klient potom posiela JWT prihláseného
--          používateľa a requesty bežia pod rolou `authenticated`.
--   3. Až POTOM spustite SQL nižšie — inak ukladanie z aplikácie prestane
--      fungovať (anon už nebude mať žiadne politiky).
/*
-- Zrušiť všetky anon politiky (pôvodné aj prípadné z MOŽNOSTI A):
DROP POLICY IF EXISTS "anon all evk"      ON evk_vykony;
DROP POLICY IF EXISTS "anon all cas"      ON cas_vykony;
DROP POLICY IF EXISTS "anon all pevar"    ON pevar_vykony;
DROP POLICY IF EXISTS "anon all followup" ON evk_followup;
DROP POLICY IF EXISTS "anon all ideas"    ON ideas;
DROP POLICY IF EXISTS "anon select evk" ON evk_vykony;
DROP POLICY IF EXISTS "anon insert evk" ON evk_vykony;
DROP POLICY IF EXISTS "anon update evk" ON evk_vykony;
DROP POLICY IF EXISTS "anon select cas" ON cas_vykony;
DROP POLICY IF EXISTS "anon insert cas" ON cas_vykony;
DROP POLICY IF EXISTS "anon update cas" ON cas_vykony;
DROP POLICY IF EXISTS "anon select pevar" ON pevar_vykony;
DROP POLICY IF EXISTS "anon insert pevar" ON pevar_vykony;
DROP POLICY IF EXISTS "anon update pevar" ON pevar_vykony;
DROP POLICY IF EXISTS "anon select followup" ON evk_followup;
DROP POLICY IF EXISTS "anon insert followup" ON evk_followup;
DROP POLICY IF EXISTS "anon update followup" ON evk_followup;
DROP POLICY IF EXISTS "anon select ideas" ON ideas;
DROP POLICY IF EXISTS "anon insert ideas" ON ideas;
DROP POLICY IF EXISTS "anon update ideas" ON ideas;

DROP POLICY IF EXISTS "anon all evk"      ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon all cas"      ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon all pevar"    ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon all followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon all cz_ideas" ON cz_ideas;
DROP POLICY IF EXISTS "anon select cz_evk" ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon insert cz_evk" ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon update cz_evk" ON cz_evk_vykony;
DROP POLICY IF EXISTS "anon select cz_cas" ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon insert cz_cas" ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon update cz_cas" ON cz_cas_vykony;
DROP POLICY IF EXISTS "anon select cz_pevar" ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon insert cz_pevar" ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon update cz_pevar" ON cz_pevar_vykony;
DROP POLICY IF EXISTS "anon select cz_followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon insert cz_followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon update cz_followup" ON cz_evk_followup;
DROP POLICY IF EXISTS "anon select cz_ideas" ON cz_ideas;
DROP POLICY IF EXISTS "anon insert cz_ideas" ON cz_ideas;
DROP POLICY IF EXISTS "anon update cz_ideas" ON cz_ideas;

-- Politiky len pre prihlásených (authenticated):
CREATE POLICY "auth all evk"      ON evk_vykony      FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all cas"      ON cas_vykony      FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all pevar"    ON pevar_vykony    FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all followup" ON evk_followup    FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all ideas"    ON ideas           FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth all cz_evk"      ON cz_evk_vykony   FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all cz_cas"      ON cz_cas_vykony   FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all cz_pevar"    ON cz_pevar_vykony FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all cz_followup" ON cz_evk_followup FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all cz_ideas"    ON cz_ideas        FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
*/


-- ============================================================================
-- BONUS — UNIQUE constraint na vykon_id
-- ============================================================================
-- Aplikácia používa vykon_id ako identifikátor výkonu; bez UNIQUE constraintu
-- môžu vznikať duplicitné záznamy. PRED pridaním constraintu treba duplicity
-- vyčistiť, inak ALTER TABLE zlyhá.

-- 1) Nájdenie duplicít (spustite pre každú tabuľku; ponechá sa najnovší riadok,
--    staršie treba zmazať alebo zlúčiť ručne):
/*
SELECT vykon_id, COUNT(*) AS pocet, array_agg(id ORDER BY created_at) AS ids
FROM evk_vykony
WHERE vykon_id IS NOT NULL
GROUP BY vykon_id
HAVING COUNT(*) > 1;
-- rovnako pre: cas_vykony, pevar_vykony, cz_evk_vykony, cz_cas_vykony, cz_pevar_vykony
*/

-- 2) Pridanie UNIQUE constraintov (po vyčistení duplicít):
/*
ALTER TABLE evk_vykony      ADD CONSTRAINT evk_vykony_vykon_id_key      UNIQUE (vykon_id);
ALTER TABLE cas_vykony      ADD CONSTRAINT cas_vykony_vykon_id_key      UNIQUE (vykon_id);
ALTER TABLE pevar_vykony    ADD CONSTRAINT pevar_vykony_vykon_id_key    UNIQUE (vykon_id);
ALTER TABLE cz_evk_vykony   ADD CONSTRAINT cz_evk_vykony_vykon_id_key   UNIQUE (vykon_id);
ALTER TABLE cz_cas_vykony   ADD CONSTRAINT cz_cas_vykony_vykon_id_key   UNIQUE (vykon_id);
ALTER TABLE cz_pevar_vykony ADD CONSTRAINT cz_pevar_vykony_vykon_id_key UNIQUE (vykon_id);
*/

-- ============================================================================
-- MIGRÁCIA 2026-07: intervenčný sheath v EVK (výmena pri intervencii)
-- ============================================================================
ALTER TABLE evk_vykony    ADD COLUMN IF NOT EXISTS interv_sheath text,
                          ADD COLUMN IF NOT EXISTS interv_sheath_dlz text,
                          ADD COLUMN IF NOT EXISTS interv_sheath_znacka text;
ALTER TABLE cz_evk_vykony ADD COLUMN IF NOT EXISTS interv_sheath text,
                          ADD COLUMN IF NOT EXISTS interv_sheath_dlz text,
                          ADD COLUMN IF NOT EXISTS interv_sheath_znacka text;
