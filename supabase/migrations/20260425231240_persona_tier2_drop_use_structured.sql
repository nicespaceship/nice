-- Persona Engine Tier 2 — close-out: drop the `use_structured` cutover flag.
--
-- Tier 2 introduced `personas.use_structured BOOLEAN` (migration
-- 20260422183659) so the compiler could fall back to the Tier 1 legacy path
-- per row during the staged rollout. Cutover finished 2026-04-24 — all 11
-- active personas were flipped to `use_structured=true`. Soak window passed
-- clean (no compile errors, prompts shaped as expected across providers).
--
-- This migration retires the flag:
-- - Drops the partial index `personas_use_structured_idx` (predicate uses
--   the column, so the index must go before the column).
-- - Drops the column itself.
--
-- Paired with a `nice-ai` edge function deploy that removes
-- `compileTier1Legacy`, `shouldUseStructured`, and the `use_structured`
-- field from the persona SELECT — see PR for the full change set.
--
-- Pre-flight check (run before applying):
--   SELECT theme_id, use_structured FROM personas WHERE is_active = true;
-- All rows must be use_structured=true. Verified 2026-04-25 before this
-- migration was authored (11/11 rows).
--
-- Rollback path: this migration's reverse is
--   ALTER TABLE personas
--     ADD COLUMN use_structured BOOLEAN NOT NULL DEFAULT false;
--   UPDATE personas SET use_structured = true WHERE is_active = true;
--   CREATE INDEX personas_use_structured_idx
--     ON personas (theme_id)
--     WHERE use_structured = true AND is_active = true;
-- ...combined with reverting the edge function deploy. Tier 1 source is
-- preserved in git history.

BEGIN;

DROP INDEX IF EXISTS personas_use_structured_idx;

ALTER TABLE public.personas
  DROP COLUMN IF EXISTS use_structured;

COMMIT;
