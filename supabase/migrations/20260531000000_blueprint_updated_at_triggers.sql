-- agent_blueprints + spaceship_blueprints both have updated_at columns but
-- no trigger to bump them on UPDATE. The dropped public.blueprints table
-- had this trigger (migration 20260423222332); the new normalized tables
-- inherited the column but not the behavior. Without it, the builder's
-- "last edited" surface (and any future differential sync) sees stale
-- timestamps even after a real save.
--
-- public.set_updated_at() was created in 20260423222332 and survived the
-- D.7 drop, so we reuse the existing function.

DROP TRIGGER IF EXISTS agent_blueprints_set_updated_at ON public.agent_blueprints;
CREATE TRIGGER agent_blueprints_set_updated_at
  BEFORE UPDATE ON public.agent_blueprints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS spaceship_blueprints_set_updated_at ON public.spaceship_blueprints;
CREATE TRIGGER spaceship_blueprints_set_updated_at
  BEFORE UPDATE ON public.spaceship_blueprints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
