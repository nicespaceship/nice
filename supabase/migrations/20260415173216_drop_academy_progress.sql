-- Drop academy_progress table
--
-- The Academy LMS plan has been cancelled. The table was created by
-- the initial schema migration (001_initial_schema.sql) but was never
-- populated — no code ever wrote to it. Safe to drop.

DROP TABLE IF EXISTS public.academy_progress;
