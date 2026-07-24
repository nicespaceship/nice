-- Wire the dead Deploys counter.
--
-- Every card, tile, and detail view renders blueprint activation_count as
-- "Deploys", and blueprint-search reads it as a ranking signal, but nothing
-- has ever written it: no client path, no trigger, no edge function. Real
-- activations exist in user_spaceships / user_agents while every catalog
-- card shows 0.
--
-- Server-side by necessity: catalog blueprint rows have no UPDATE policy
-- for authenticated users (correctly), so the activating client cannot
-- bump the counter itself. SECURITY DEFINER triggers on the activation
-- INSERTs are the right place. Lifetime counters: increments only, no
-- decrement on deactivation.
--
-- Custom builds whose blueprint_id matches no catalog row update nothing,
-- by design. Backfill below snapshots current truth before the triggers
-- take over. Verified end-to-end with a BEGIN; ROLLBACK; dry-run.

CREATE OR REPLACE FUNCTION public.bump_spaceship_activation_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.blueprint_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET activation_count = COALESCE(activation_count, 0) + 1
    WHERE id = NEW.blueprint_id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.bump_agent_activation_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.blueprint_id IS NOT NULL THEN
    UPDATE public.agent_blueprints
    SET activation_count = COALESCE(activation_count, 0) + 1
    WHERE id = NEW.blueprint_id;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Trigger functions are not client-callable; keep them out of the
-- anon/authenticated-executable SECURITY DEFINER surface the nightly
-- launch audit baselines.
REVOKE EXECUTE ON FUNCTION public.bump_spaceship_activation_count() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_agent_activation_count() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS on_user_spaceship_created_bump_activation ON public.user_spaceships;
CREATE TRIGGER on_user_spaceship_created_bump_activation
  AFTER INSERT ON public.user_spaceships
  FOR EACH ROW EXECUTE FUNCTION public.bump_spaceship_activation_count();

DROP TRIGGER IF EXISTS on_user_agent_created_bump_activation ON public.user_agents;
CREATE TRIGGER on_user_agent_created_bump_activation
  AFTER INSERT ON public.user_agents
  FOR EACH ROW EXECUTE FUNCTION public.bump_agent_activation_count();

-- Backfill from current activations so the counters start truthful.
UPDATE public.spaceship_blueprints sb
SET activation_count = c.n
FROM (SELECT blueprint_id, COUNT(*) AS n FROM public.user_spaceships WHERE blueprint_id IS NOT NULL GROUP BY 1) c
WHERE sb.id = c.blueprint_id;

UPDATE public.agent_blueprints ab
SET activation_count = c.n
FROM (SELECT blueprint_id, COUNT(*) AS n FROM public.user_agents WHERE blueprint_id IS NOT NULL GROUP BY 1) c
WHERE ab.id = c.blueprint_id;

-- Apply-gate: confirm both functions + triggers materialized.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'bump_spaceship_activation_count') = 1,
    'bump_spaceship_activation_count function missing';
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'bump_agent_activation_count') = 1,
    'bump_agent_activation_count function missing';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname = 'on_user_spaceship_created_bump_activation') = 1,
    'on_user_spaceship_created_bump_activation trigger missing';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname = 'on_user_agent_created_bump_activation') = 1,
    'on_user_agent_created_bump_activation trigger missing';
END;
$smoke$;
