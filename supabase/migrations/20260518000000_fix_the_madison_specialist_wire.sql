-- Fix-forward for 20260517050000_seed_ship_specialists.sql.
-- That migration assumed The Madison's captain slot was zero-indexed
-- (`slot_position = 0`) and skipped the wire when it didn't match.
-- All ship_slots rows are 1-indexed; the UPDATE matched zero rows and
-- The Madison's slot 1 stayed `default_agent_id = NULL` in prod.
-- Idempotent: only writes when slot 1 is still unwired.

UPDATE public.ship_slots
SET default_agent_id = (SELECT id FROM public.agent_blueprints WHERE slug = 'the-madison-specialist')
WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-madison')
  AND slot_position = 1
  AND role_type = 'captain'
  AND default_agent_id IS NULL;
