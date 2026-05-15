-- Rename `slot_index` → `slot_position` and shift values to 1-indexed.
--
-- Motivation: human-facing slot numbering. The data layer should match what
-- users read in the UI ("Slot 1" = `slot_position = 1`) so debugging never
-- requires a +1 translation. The name change also moves us off "index"
-- (loaded with 0-indexed programming connotations) onto "position" (ordinal).
--
-- Postgres arrays are natively 1-indexed, so this also aligns the column
-- with PG idioms.
--
-- Scope: `public.ship_slots` (catalog) and `public.user_ship_slots` (instance).
-- Affects The Madison's six seeded rows (slots 0-5 → 1-6) and any
-- `user_ship_slots` rows written by prior activations.

BEGIN;

-- 1. Drop the existing UNIQUE constraints so the value shift can't race
--    against a transient duplicate during the UPDATE.
ALTER TABLE public.ship_slots
  DROP CONSTRAINT IF EXISTS ship_slots_spaceship_id_slot_index_key;
ALTER TABLE public.user_ship_slots
  DROP CONSTRAINT IF EXISTS user_ship_slots_user_spaceship_id_slot_index_key;

-- 2. Rename the column. Indexes and FKs on the column auto-follow.
ALTER TABLE public.ship_slots      RENAME COLUMN slot_index TO slot_position;
ALTER TABLE public.user_ship_slots RENAME COLUMN slot_index TO slot_position;

-- 3. Shift values from 0-indexed to 1-indexed.
UPDATE public.ship_slots      SET slot_position = slot_position + 1;
UPDATE public.user_ship_slots SET slot_position = slot_position + 1;

-- 4. Re-add the UNIQUE constraints under the new column name.
ALTER TABLE public.ship_slots
  ADD CONSTRAINT ship_slots_spaceship_id_slot_position_key
  UNIQUE (spaceship_id, slot_position);
ALTER TABLE public.user_ship_slots
  ADD CONSTRAINT user_ship_slots_user_spaceship_id_slot_position_key
  UNIQUE (user_spaceship_id, slot_position);

-- 5. Enforce the 1-indexed floor. Slots are uncapped at the schema level
--    (presentation/gating happens elsewhere) but they can never be 0 or
--    negative — a row with slot_position < 1 is data corruption.
ALTER TABLE public.ship_slots
  ADD CONSTRAINT ship_slots_slot_position_positive CHECK (slot_position >= 1);
ALTER TABLE public.user_ship_slots
  ADD CONSTRAINT user_ship_slots_slot_position_positive CHECK (slot_position >= 1);

COMMIT;
