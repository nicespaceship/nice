-- Bring every catalog spaceship's stats.slots up to its class minimum.
--
-- Audit found 18 ships off-by-2 from their class: 5 Class-2 ships at
-- 6 slots (should be 8) and 13 Class-3 ships at 8 slots (should be
-- 10). Pattern suggests the original 2026-03-23 seed used Class_N - 2
-- systematically. Doesn't matter why; fixing them in one sweep.
--
-- Class slot minimums (from app/js/lib/gamification.js):
--   class-1 → 6    class-4 → 12
--   class-2 → 8    class-5 → 12
--   class-3 → 10
--
-- Consequence of the current values: ShipSetupWizard renders too few
-- stations, hiding crew-extension capacity. A Class-3 Rocinante should
-- take 10 agents; today it takes 8. Same Inbox-Captain-bug, just
-- scaled across the catalog.
--
-- Additive. jsonb_set is idempotent. Only bumps UP — never shrinks
-- slots, which protects any already-deployed user ships from suddenly
-- losing stations they filled.

BEGIN;

UPDATE public.blueprints
SET stats = jsonb_set(
  stats,
  '{slots}',
  to_jsonb(
    CASE metadata->>'recommended_class'
      WHEN 'class-1' THEN '6'
      WHEN 'class-2' THEN '8'
      WHEN 'class-3' THEN '10'
      WHEN 'class-4' THEN '12'
      WHEN 'class-5' THEN '12'
      ELSE '6'
    END
  )
),
updated_at = now()
WHERE type = 'spaceship'
  AND scope = 'catalog'
  AND stats ? 'slots'
  AND (stats->>'slots')::int < CASE metadata->>'recommended_class'
    WHEN 'class-1' THEN 6
    WHEN 'class-2' THEN 8
    WHEN 'class-3' THEN 10
    WHEN 'class-4' THEN 12
    WHEN 'class-5' THEN 12
    ELSE 6
  END;

COMMIT;
