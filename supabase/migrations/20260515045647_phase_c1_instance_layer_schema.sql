-- Phase C.1 — instance-layer schema cut.
--
-- Migrates the instance layer onto the three-layer schema:
--   * user_agents.blueprint_id      : text → uuid → agent_blueprints(id)
--   * user_spaceships.blueprint_id  : text → uuid → spaceship_blueprints(id)
--   * user_spaceships.slots         : DROP (legacy jsonb, replaced by user_ship_slots rows in C.2)
--   * agent_blueprints.role_type    : NOT NULL (FK to roles(slug) RESTRICT already in place from Phase A)
--
-- `user_ship_slots.role_type` stays nullable + FK action SET NULL — the column is not
-- load-bearing for dispatch today (mission-runner reads slot_assignments, not slot.role_type),
-- and the builder UIs don't capture per-slot roles for custom ships. Tightening is deferred
-- until builder UIs mature; the catalog-side `ship_slots.role_type` stays NOT NULL.
--
-- All instance tables are empty in prod (Phase 1 wipe + no re-activation since), so the
-- text → uuid casts are trivial — no backfill SQL needed. The existing partial unique index
-- `user_spaceships_one_active_per_blueprint` rebuilds automatically on the column type change.

BEGIN;

-- 1. user_agents.blueprint_id : text → uuid → agent_blueprints(id) ON DELETE SET NULL
ALTER TABLE public.user_agents
  ALTER COLUMN blueprint_id TYPE uuid USING NULL,
  ADD CONSTRAINT user_agents_blueprint_id_fkey
    FOREIGN KEY (blueprint_id) REFERENCES public.agent_blueprints(id) ON DELETE SET NULL;

-- 2. user_spaceships.blueprint_id : text → uuid → spaceship_blueprints(id) ON DELETE SET NULL
ALTER TABLE public.user_spaceships
  ALTER COLUMN blueprint_id TYPE uuid USING NULL,
  ADD CONSTRAINT user_spaceships_blueprint_id_fkey
    FOREIGN KEY (blueprint_id) REFERENCES public.spaceship_blueprints(id) ON DELETE SET NULL;

-- 3. Drop the legacy slots column. C.2 will write user_ship_slots rows instead.
ALTER TABLE public.user_spaceships
  DROP COLUMN slots;

-- 4. Tighten agent_blueprints.role_type to NOT NULL (FK already in place).
ALTER TABLE public.agent_blueprints
  ALTER COLUMN role_type SET NOT NULL;

COMMIT;
