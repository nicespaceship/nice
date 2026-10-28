-- Put the database back on NICE after the Longeron revert.
--
-- #908 reverted the September Longeron rename in code, but the data written
-- by its two migrations stayed live: 20260831000000 had swapped NICE for
-- Longeron in catalog and persona text, and 20260831120000 had replaced the
-- default theme's CORE persona with Ada. The revert deleted both files, so
-- nothing undid their data. Found 2026-10-28: 10 active theme personas, the
-- active default persona, 3 agent blueprints and 1 capability still said
-- Longeron.
--
-- This inverts 20260831000000's exact phrase swaps (the 2026-04-22 persona
-- seed confirms every persona said "NICE Spaceship" where it now says
-- "Longeron") and makes CORE v2 the active default persona again. v2 is the
-- row Ada retired; it carries the 20260514204639 hard-rule fix. Ada (v3) stays
-- as inactive history, unedited, like CORE did after 20260831120000.
-- nice-ai reads the active row per request, so no deploy is needed.

BEGIN;

UPDATE agent_blueprints
SET description = replace(replace(description,
      'not Longeron.', 'not NICE.'),
      'than Longeron''s built-in', 'than NICE''s built-in'),
    config = replace(replace(replace(config::text,
      'NOT to Longeron.', 'NOT to NICE.'),
      'Longeron has its own built-in', 'NICE has its own built-in'),
      'not Longeron''s)', 'not NICE''s)')::jsonb
WHERE slug = 'replicate' AND scope = 'catalog';

UPDATE agent_blueprints
SET config = replace(config::text, 'a Longeron umbrella', 'a NICE umbrella')::jsonb
WHERE slug = 'zapier' AND scope = 'catalog';

UPDATE agent_blueprints
SET config = replace(replace(config::text,
      'the Longeron Community Moderator', 'the NICE Community Moderator'),
      'the Longeron Community Policy', 'the NICE Community Policy')::jsonb
WHERE slug = 'community-moderator-arbiter' AND scope = 'system';

UPDATE capabilities
SET description = replace(replace(description,
      'not Longeron.', 'not NICE.'),
      'than Longeron''s built-in', 'than NICE''s built-in')
WHERE slug = 'replicate' AND description LIKE '%Longeron%';

-- 'Longeron terms' first: it came from 'NICE terms', not 'NICE Spaceship'.
UPDATE personas
SET data = replace(replace(data::text, 'Longeron terms', 'NICE terms'), 'Longeron', 'NICE Spaceship')::jsonb,
    voice = replace(replace(voice::text, 'Longeron terms', 'NICE terms'), 'Longeron', 'NICE Spaceship')::jsonb,
    hard_rules = replace(replace(hard_rules::text, 'Longeron terms', 'NICE terms'), 'Longeron', 'NICE Spaceship')::jsonb,
    soft_rules = replace(replace(soft_rules::text, 'Longeron terms', 'NICE terms'), 'Longeron', 'NICE Spaceship')::jsonb,
    lexicon = replace(replace(lexicon::text, 'Longeron terms', 'NICE terms'), 'Longeron', 'NICE Spaceship')::jsonb,
    forbidden_patterns = replace(replace(forbidden_patterns::text, 'Longeron terms', 'NICE terms'), 'Longeron', 'NICE Spaceship')::jsonb
WHERE to_jsonb(personas)::text LIKE '%Longeron%'
  AND NOT (theme_id = 'nice' AND data->>'name' = 'Ada');

-- Retire Ada before reactivating CORE: personas_theme_active_uidx allows one
-- active row per theme.
UPDATE personas
SET is_active = false
WHERE theme_id = 'nice' AND data->>'name' = 'Ada' AND is_active;

UPDATE personas
SET is_active = true
WHERE theme_id = 'nice' AND version = 2 AND data->>'name' = 'CORE';

DO $$
DECLARE
  leftover int;
  active_name text;
BEGIN
  SELECT count(*) INTO leftover FROM (
    SELECT 1 FROM personas p
      WHERE to_jsonb(p)::text LIKE '%Longeron%' AND NOT (p.theme_id = 'nice' AND p.data->>'name' = 'Ada')
    UNION ALL SELECT 1 FROM agent_blueprints a WHERE to_jsonb(a)::text LIKE '%Longeron%'
    UNION ALL SELECT 1 FROM capabilities c WHERE to_jsonb(c)::text LIKE '%Longeron%'
    UNION ALL SELECT 1 FROM spaceship_blueprints s WHERE to_jsonb(s)::text LIKE '%Longeron%'
  ) rows_left;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'restore_nice_content: % rows still mention Longeron', leftover;
  END IF;

  SELECT data->>'name' INTO active_name FROM personas WHERE theme_id = 'nice' AND is_active;
  IF active_name IS DISTINCT FROM 'CORE' THEN
    RAISE EXCEPTION 'restore_nice_content: active nice persona is %, expected CORE', active_name;
  END IF;
END $$;

COMMIT;
