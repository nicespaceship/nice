-- Add Tier 1/2/3 schema-parity columns to user_spaceships
--
-- user_agents already follows the pattern: dedicated top-level columns for
-- the fields we filter/sort/gate on (name, status, rarity) plus a `config`
-- JSONB for the rest. user_spaceships historically used a single `slots`
-- JSONB bag that mixed category/description/flavor/tags with slot_assignments
-- and derived stats/caps. Reading this shape back from the DB required the
-- blueprint-store loader to dig through `s.slots.*`, and the builder had no
-- parity with the agent builder's Tier 1/2/3 form.
--
-- This migration is additive and reversible:
--   * `config` JSONB — new home for description/flavor/tags/slot_assignments
--     and the forthcoming approval_mode / schedule_default fields.
--   * `category` TEXT — hoisted to top-level so server-side filtering (and
--     the future community publish flow) doesn't need JSONB path ops.
--   * `rarity` TEXT — mirrors the rarity column on user_agents; derived
--     from class + crew composition at save time by the builder.
--
-- The legacy `slots` column is left in place and still readable. The builder
-- will dual-write to both `config` and `slots` for one release while the
-- loader reads `config ?? slots`, then a later migration will drop `slots`.
--
-- All 10 existing rows in production have `slots = '{}'::jsonb` (catalog
-- activations, not builder outputs), so the backfill is effectively a no-op
-- but is kept for correctness if any hand-edited rows exist.

BEGIN;

ALTER TABLE public.user_spaceships
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'Common';

-- Backfill: move the slots bag into config for any row that has content.
-- `config = '{}'::jsonb` guard keeps this idempotent and safe to re-run.
UPDATE public.user_spaceships
SET config = slots
WHERE config = '{}'::jsonb
  AND slots IS NOT NULL
  AND slots <> '{}'::jsonb;

-- Hoist category out of the bag if present.
UPDATE public.user_spaceships
SET category = slots->>'category'
WHERE category IS NULL
  AND slots ? 'category';

COMMIT;
