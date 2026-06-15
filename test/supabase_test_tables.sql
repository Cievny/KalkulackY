-- Test environment tables for cievny.sk / VFN CZ
-- Creates test copies of all production tables using LIKE ... INCLUDING ALL
-- Run this in the Supabase SQL editor once to set up the test environment.

-- ============================================================
-- SK test tables
-- ============================================================

CREATE TABLE IF NOT EXISTS test_evk_vykony (LIKE evk_vykony INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_cas_vykony (LIKE cas_vykony INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_pevar_vykony (LIKE pevar_vykony INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_evk_followup (LIKE evk_followup INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_ideas (LIKE ideas INCLUDING ALL);

-- Enable RLS
ALTER TABLE test_evk_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cas_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_pevar_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_evk_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_ideas ENABLE ROW LEVEL SECURITY;

-- Anon policies (same as production)
CREATE POLICY IF NOT EXISTS "anon all test_evk_vykony"
  ON test_evk_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_cas_vykony"
  ON test_cas_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_pevar_vykony"
  ON test_pevar_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_evk_followup"
  ON test_evk_followup FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_ideas"
  ON test_ideas FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- CZ test tables
-- ============================================================

CREATE TABLE IF NOT EXISTS test_cz_evk_vykony (LIKE cz_evk_vykony INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_cz_cas_vykony (LIKE cz_cas_vykony INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_cz_pevar_vykony (LIKE cz_pevar_vykony INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_cz_evk_followup (LIKE cz_evk_followup INCLUDING ALL);
CREATE TABLE IF NOT EXISTS test_cz_ideas (LIKE cz_ideas INCLUDING ALL);

-- Enable RLS
ALTER TABLE test_cz_evk_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cz_cas_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cz_pevar_vykony ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cz_evk_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cz_ideas ENABLE ROW LEVEL SECURITY;

-- Anon policies (same as production)
CREATE POLICY IF NOT EXISTS "anon all test_cz_evk_vykony"
  ON test_cz_evk_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_cz_cas_vykony"
  ON test_cz_cas_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_cz_pevar_vykony"
  ON test_cz_pevar_vykony FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_cz_evk_followup"
  ON test_cz_evk_followup FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon all test_cz_ideas"
  ON test_cz_ideas FOR ALL TO anon USING (true) WITH CHECK (true);
