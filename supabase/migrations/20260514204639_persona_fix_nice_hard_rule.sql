-- Persona Engine — fix the NICE/CORE persona's hard_rules[0].
--
-- The Tier 2 backfill (20260422190422) copies each persona's Tier 1
-- `data.neverBreak` verbatim into hard_rules[0]. NICE's neverBreak was a
-- compound string: an identity assertion ("You ARE the ship's computer.")
-- bolted onto a conditional behavior ("When they describe a business
-- need ... recommend specific named blueprints from the catalog.").
--
-- The Tier 3 judge treats every hard_rules entry as a binary contract,
-- so it failed every in-voice reply that simply did not recommend a
-- blueprint (e.g. answering "what's on my calendar?"). Across the PR 2
-- soak window this dragged NICE to a 33% pass rate -- 6 of 9 judgments
-- flagged this one rule -- while JARVIS, whose hard_rules are all genuine
-- contracts, scored 4/4.
--
-- Fix, mirroring JARVIS's shape (identity in hard_rules[0], behaviours in
-- soft_rules):
--   - hard_rules[0] + data.neverBreak  ->  "You ARE the ship's computer."
--   - the demoted behaviour moves to soft_rules at priority 10
--
-- Shipped as version 2. The partial unique index on
-- (theme_id WHERE is_active=true) keeps exactly one row live; v1 is left
-- in place (is_active=false) so rollback is a one-statement flip -- see
-- the ROLLBACK block at the bottom.

BEGIN;

-- Retire v1 (no-op if already retired).
UPDATE personas
SET is_active = false
WHERE theme_id = 'nice' AND version = 1 AND is_active = true;

-- Ship v2 — identity-only hard rule, behaviour demoted to a soft rule,
-- every other column copied verbatim from v1. The NOT EXISTS guard keeps
-- this migration safe to re-run: if v2 already exists the INSERT no-ops.
INSERT INTO personas
  (theme_id, version, data, is_active, voice, hard_rules, soft_rules, lexicon, forbidden_patterns)
SELECT
  'nice',
  2,
  jsonb_set(data, '{neverBreak}', '"You ARE the ship''s computer."'::jsonb),
  true,
  voice,
  jsonb_set(hard_rules, '{0}', '"You ARE the ship''s computer."'::jsonb),
  soft_rules || '[{"rule": "When the user describes a business need, translate it into NICE terms and recommend specific named blueprints from the catalog.", "priority": 10}]'::jsonb,
  lexicon,
  forbidden_patterns
FROM personas src
WHERE src.theme_id = 'nice'
  AND src.version = 1
  AND NOT EXISTS (
    SELECT 1 FROM personas WHERE theme_id = 'nice' AND version = 2
  );

COMMIT;

-- ────────────────────────────────────────────────────────────────────
-- ROLLBACK (run once, as a one-off, if v2 misbehaves):
--
--   UPDATE personas SET is_active = false WHERE theme_id = 'nice' AND version = 2;
--   UPDATE personas SET is_active = true  WHERE theme_id = 'nice' AND version = 1;
--
-- v1 is left intact (is_active=false) precisely so rollback is this flip.
-- ────────────────────────────────────────────────────────────────────
