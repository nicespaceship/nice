-- Executive-style crew naming, proven on USS Enterprise NCC-1701-A before rollout
-- to the other sci-fi ships. Names become clean full names (no rank prefix), and
-- the rank/role moves to a new per-slot "title" rendered as "Position · Ship",
-- matching how the real-company ships show "Andy Jassy" + "CEO".
--
-- Adds ship_slots.title (and the instance mirror user_ship_slots.title). The
-- per-slot title is required because the reskin crew (Chekov, Sulu, Rand...) share
-- a generic umbrella agent, so the title cannot live on the agent.

ALTER TABLE public.ship_slots ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.user_ship_slots ADD COLUMN IF NOT EXISTS title text;

DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-enterprise-a';
  IF v_ship IS NULL THEN
    RAISE NOTICE 'Enterprise-A not found, skipping';
    RETURN;
  END IF;

  -- Clean every slot label to a full name + set the Position · Ship title.
  UPDATE public.ship_slots s SET label = v.lbl, title = v.ttl
  FROM (VALUES
    (1,  'James T. Kirk',     'Captain · USS Enterprise NCC-1701-A'),
    (2,  'Pavel Chekov',      'Navigator · USS Enterprise NCC-1701-A'),
    (3,  'Montgomery Scott',  'Chief Engineer · USS Enterprise NCC-1701-A'),
    (4,  'Spock',             'Science Officer · USS Enterprise NCC-1701-A'),
    (5,  'Hikaru Sulu',       'Helmsman · USS Enterprise NCC-1701-A'),
    (6,  'Nyota Uhura',       'Communications Officer · USS Enterprise NCC-1701-A'),
    (7,  'Janice Rand',       'Captain''s Yeoman · USS Enterprise NCC-1701-A'),
    (8,  'Christine Chapel',  'Head Nurse · USS Enterprise NCC-1701-A'),
    (9,  'Saavik',            'Tactical Officer · USS Enterprise NCC-1701-A'),
    (10, 'Kevin Riley',       'Operations Officer · USS Enterprise NCC-1701-A'),
    (11, 'John Kyle',         'Transporter Chief · USS Enterprise NCC-1701-A'),
    (12, 'Leonard McCoy',     'Chief Medical Officer · USS Enterprise NCC-1701-A')
  ) AS v(pos, lbl, ttl)
  WHERE s.spaceship_id = v_ship AND s.slot_position = v.pos;

  -- Mirror clean name + title onto the five bespoke crew agents (their own cards).
  UPDATE public.agent_blueprints a
  SET name = v.nm,
      config = jsonb_set(a.config, '{title}', to_jsonb(v.ttl::text))
  FROM (VALUES
    ('enterprise-a-kirk',   'James T. Kirk',    'Captain · USS Enterprise NCC-1701-A'),
    ('enterprise-a-scotty', 'Montgomery Scott', 'Chief Engineer · USS Enterprise NCC-1701-A'),
    ('enterprise-a-spock',  'Spock',            'Science Officer · USS Enterprise NCC-1701-A'),
    ('enterprise-a-uhura',  'Nyota Uhura',      'Communications Officer · USS Enterprise NCC-1701-A'),
    ('enterprise-a-mccoy',  'Leonard McCoy',    'Chief Medical Officer · USS Enterprise NCC-1701-A')
  ) AS v(slug, nm, ttl)
  WHERE a.slug = v.slug;
END $$;
