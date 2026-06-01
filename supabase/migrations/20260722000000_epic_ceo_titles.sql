-- Give the eight Epic real-company ships' CEOs their real executive title.
-- Their slots are already clean named people (Jensen Huang, Tim Cook, ...), but
-- the captain role_type rendered a generic "Captain" overline on the schematic.
-- A per-slot "Title · Company" fixes that. The generic C-suite slots (VP of
-- Product, CFO, ...) are role labels, not named people, and already render
-- their function overline correctly, so they are left as-is.

-- Slot 1 (CEO) title on each real-company ship.
UPDATE public.ship_slots s SET title = v.ttl
FROM (VALUES
  ('the-amazon',    'CEO · Amazon'),
  ('the-anthropic', 'Co-Founder & CEO · Anthropic'),
  ('the-apple',     'CEO · Apple'),
  ('the-google',    'CEO · Google'),
  ('the-meta',      'Founder & CEO · Meta'),
  ('the-microsoft', 'Chairman & CEO · Microsoft'),
  ('the-nvidia',    'Founder & CEO · NVIDIA'),
  ('the-spacex',    'Founder & CEO · SpaceX')
) AS v(ship_slug, ttl)
JOIN public.spaceship_blueprints sb ON sb.slug = v.ship_slug
WHERE s.spaceship_id = sb.id AND s.slot_position = 1;

-- Mirror the title onto each CEO's bespoke agent (their own card).
UPDATE public.agent_blueprints a
SET config = jsonb_set(a.config, '{title}', to_jsonb(v.ttl::text))
FROM (VALUES
  ('amazon-andy-jassy',        'CEO · Amazon'),
  ('anthropic-dario-amodei',   'Co-Founder & CEO · Anthropic'),
  ('apple-tim-cook',           'CEO · Apple'),
  ('google-sundar-pichai',     'CEO · Google'),
  ('meta-mark-zuckerberg',     'Founder & CEO · Meta'),
  ('microsoft-satya-nadella',  'Chairman & CEO · Microsoft'),
  ('nvidia-jensen-huang',      'Founder & CEO · NVIDIA'),
  ('spacex-elon-musk',         'Founder & CEO · SpaceX')
) AS v(slug, ttl)
WHERE a.slug = v.slug;
