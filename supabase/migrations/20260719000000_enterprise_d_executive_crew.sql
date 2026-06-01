-- Executive-style crew for USS Enterprise NCC-1701-D, second ship in the
-- sci-fi fleet rollout after the NCC-1701-A. Names become clean full names
-- (no rank prefix); the rank and post move to a per-slot "Position · Ship"
-- title. The title carries the short ship name "USS Enterprise" since the
-- hull registry already disambiguates the -D from the -A on the spaceship
-- blueprint name itself. The ship_slots.title / user_ship_slots.title columns
-- were added with the Enterprise-A rollout, so this migration only writes data.

DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-enterprise';
  IF v_ship IS NULL THEN
    RAISE NOTICE 'Enterprise-D not found, skipping';
    RETURN;
  END IF;

  -- Clean every slot label to a full name + set the Position · Ship title.
  UPDATE public.ship_slots s SET label = v.lbl, title = v.ttl
  FROM (VALUES
    (1,  'Jean-Luc Picard',  'Captain · USS Enterprise'),
    (2,  'William Riker',    'First Officer · USS Enterprise'),
    (3,  'Geordi La Forge',  'Chief Engineer · USS Enterprise'),
    (4,  'Data',             'Operations Officer · USS Enterprise'),
    (5,  'Worf',             'Tactical Officer · USS Enterprise'),
    (6,  'Deanna Troi',      'Ship''s Counselor · USS Enterprise'),
    (7,  'Miles O''Brien',   'Transporter Chief · USS Enterprise'),
    (8,  'Ro Laren',         'Conn Officer · USS Enterprise'),
    (9,  'Reginald Barclay', 'Diagnostic Engineer · USS Enterprise'),
    (10, 'Guinan',           'Ten Forward Hostess · USS Enterprise'),
    (11, 'Beverly Crusher',  'Chief Medical Officer · USS Enterprise'),
    (12, 'Wesley Crusher',   'Acting Ensign · USS Enterprise')
  ) AS v(pos, lbl, ttl)
  WHERE s.spaceship_id = v_ship AND s.slot_position = v.pos;

  -- Mirror clean name + title onto the five bespoke crew agents (their own cards).
  UPDATE public.agent_blueprints a
  SET name = v.nm,
      config = jsonb_set(a.config, '{title}', to_jsonb(v.ttl::text))
  FROM (VALUES
    ('enterprise-picard', 'Jean-Luc Picard', 'Captain · USS Enterprise'),
    ('enterprise-riker',  'William Riker',   'First Officer · USS Enterprise'),
    ('enterprise-data',   'Data',            'Operations Officer · USS Enterprise'),
    ('enterprise-worf',   'Worf',            'Tactical Officer · USS Enterprise'),
    ('enterprise-wesley', 'Wesley Crusher',  'Acting Ensign · USS Enterprise')
  ) AS v(slug, nm, ttl)
  WHERE a.slug = v.slug;
END $$;
