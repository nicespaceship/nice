-- Shorten the Enterprise-A crew titles from "Position · USS Enterprise NCC-1701-A"
-- to "Position · USS Enterprise". The hull registry is redundant on an agent card
-- (and overflows it); the full registry stays on the spaceship blueprint name,
-- which is where it disambiguates the NCC-1701-A from the NCC-1701-D.

DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-enterprise-a';
  IF v_ship IS NULL THEN RETURN; END IF;

  UPDATE public.ship_slots
  SET title = replace(title, '· USS Enterprise NCC-1701-A', '· USS Enterprise')
  WHERE spaceship_id = v_ship AND title LIKE '%NCC-1701-A%';

  UPDATE public.agent_blueprints
  SET config = jsonb_set(config, '{title}',
        to_jsonb(replace(config->>'title', '· USS Enterprise NCC-1701-A', '· USS Enterprise')::text))
  WHERE slug LIKE 'enterprise-a-%' AND config->>'title' LIKE '%NCC-1701-A%';
END $$;
