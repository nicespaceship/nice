-- Backfill `user_agents.blueprint_id` for captain slot agents.
--
-- Auto-created slot agents shipped with `blueprint_id = NULL` because the
-- wizard's `_persistSlotAgent` never forwarded the field to the INSERT
-- (the wizard's synthetic per-slot ids like `the-loft-crew-1` aren't UUIDs
-- and would have failed the FK to `agent_blueprints`).
--
-- For captain slots specifically, `ship_slots.default_agent_id` IS a real
-- UUID (the the-<ship>-specialist agent_blueprint). This migration wires
-- the existing captain `user_agents` rows to that specialist so the
-- runtime can resolve the captain's tools and prompt via the normal
-- blueprint-id resolver path. Worker slots keep `blueprint_id = NULL`
-- (their synthetic ids are tracked in config.blueprint_id only — that
-- abstraction question is deferred to the broader post-D.7 cleanup).
--
-- Idempotent: only writes where blueprint_id is still NULL on captain rows.

UPDATE public.user_agents ua
SET blueprint_id = ss.default_agent_id,
    updated_at = now()
FROM public.user_ship_slots uss
JOIN public.user_spaceships us ON us.id = uss.user_spaceship_id
JOIN public.ship_slots ss ON ss.spaceship_id = us.blueprint_id AND ss.slot_position = uss.slot_position
WHERE ua.id = uss.user_agent_id
  AND ua.blueprint_id IS NULL
  AND ss.default_agent_id IS NOT NULL
  AND ss.role_type = 'captain';
