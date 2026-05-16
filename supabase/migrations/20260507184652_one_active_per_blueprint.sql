-- Activation invariant: one active spaceship per blueprint per user.
--
-- Bug 2026-05-08: every spaceship-activation entry point creates a fresh
-- user_spaceships row regardless of whether the user already has one for
-- the same blueprint. With 8 entry points and no DB-level constraint,
-- duplicates accumulated. Symptom: schematic shows "Empty / Assign agent"
-- and "Error: Agent not found" because the prompt panel resolves to one
-- of the empty duplicates instead of the populated one.
--
-- App-side fix: Blueprints.findOrCreateActiveShip helper centralises the
-- find-or-create logic across the 8 call sites.
--
-- DB-side backstop (this migration):
--   1. Auto-archive existing duplicates per (user_id, blueprint_id).
--      Heuristic: keep the row with non-empty slot data; on tie, keep the
--      newest. Custom-built ships (blueprint_id IS NULL) are exempt —
--      they're unique-per-instance by definition.
--   2. Unique partial index that makes future duplicate inserts fail
--      loudly. Helper handles the conflict by returning the existing row.

BEGIN;

-- 1. Soft cleanup: archive duplicates, preferring rows that look populated.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, blueprint_id
           ORDER BY
             -- Has slot_assignments inside slots jsonb (most call sites) OR config jsonb (setup-wizard)
             (CASE
               WHEN (slots IS NOT NULL AND slots != '{}'::jsonb AND slots::text != 'null')
                 OR (config IS NOT NULL AND config ? 'slot_assignments' AND config->'slot_assignments' != '{}'::jsonb)
               THEN 1 ELSE 0
             END) DESC,
             created_at DESC
         ) AS rn
  FROM public.user_spaceships
  WHERE blueprint_id IS NOT NULL AND status != 'archived'
)
UPDATE public.user_spaceships
SET status = 'archived', updated_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Unique partial index. Postgres treats NULL blueprint_id rows as
--    distinct in unique indexes, so custom-built ships are unaffected
--    even without the explicit `blueprint_id IS NOT NULL` clause — but
--    we include it to make the intent explicit for future readers.
CREATE UNIQUE INDEX IF NOT EXISTS user_spaceships_one_active_per_blueprint
  ON public.user_spaceships (user_id, blueprint_id)
  WHERE status != 'archived' AND blueprint_id IS NOT NULL;

COMMENT ON INDEX public.user_spaceships_one_active_per_blueprint IS
  'Enforces one active (non-archived) spaceship per (user_id, blueprint_id). Custom builds with NULL blueprint_id are exempt. Backstops the Blueprints.findOrCreateActiveShip helper.';

COMMIT;
