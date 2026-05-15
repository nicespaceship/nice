-- Seed the first real user-facing spaceship in the rebuilt catalog: The Madison,
-- a 6-slot marketing agency. Defaults each functional slot to a wired-MCP umbrella
-- agent by slug lookup (no hardcoded uuids). Class-1 / Common / Ensign-unlocked.
-- Slots 6-11 are designed but not shipped here; they require a `ship_slots.min_class`
-- column + slot-lock UX, scoped to a follow-up PR.
DO $$
DECLARE
  v_ship_id uuid;
  v_hubspot uuid;
  v_miro    uuid;
  v_klaviyo uuid;
  v_linear  uuid;
  v_notion  uuid;
BEGIN
  SELECT id INTO v_hubspot FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_miro    FROM public.agent_blueprints WHERE slug='miro';
  SELECT id INTO v_klaviyo FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_linear  FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_notion  FROM public.agent_blueprints WHERE slug='notion';

  IF v_hubspot IS NULL OR v_miro IS NULL OR v_klaviyo IS NULL OR v_linear IS NULL OR v_notion IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: hubspot=% miro=% klaviyo=% linear=% notion=%',
      v_hubspot, v_miro, v_klaviyo, v_linear, v_notion;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-madison',
    'The Madison',
    'A six-person senior marketing agency. Builds and ships brand campaigns end-to-end — strategy, creative, copy, production, deployment.',
    'Department-store pitch Wednesday. Spirits-brand brief Friday. The copy deck for the auto launch is in the third draft and the Creative Director still hates it. Send the team home at six and ship clean work at noon tomorrow. The Madison runs lean — senior people, no rounds three through seven, one client at a time. Briefs in, work out.',
    'Agency',
    'Common',
    'catalog',
    'public',
    'SHIP-MADI-0001',
    ARRAY['agency','marketing','creative','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Agency Director of The Madison — a senior marketing agency.\n\nYour team:\n- Account Director (HubSpot): client relationships, briefs, scope\n- Creative Director (Miro): visual direction, creative review, boards\n- Campaign Manager (Klaviyo): email campaigns, segmentation, performance\n- Project Manager (Linear): timelines, deliverables, capacity\n- Copywriter (Notion): copy decks, brand docs, briefs\n\nHow you work:\n- Route incoming work by what it needs first. Briefs through the Account Director. Creative review through the Creative Director. Campaign deployment through the Campaign Manager. Timelines and dependencies through the PM. Copy and documentation through the Copywriter.\n- Hold every project to one standard: on-brand, on-budget, on-time.\n- Push back when a client ask compromises the work — politely, with a counter-proposal.\n- Defer to the Creative Director on craft, the Account Director on scope, the PM on dates.\n- The Madison runs lean. Senior people only. One client at a time. No rounds three through seven.\n- When a brief is thin, ask one clarifying question and move.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-MADI-0001',
      'card_num', 1,
      'recommended_class', 'class-1',
      'subtitle', 'Marketing Agency',
      'art', NULL,
      'caps', jsonb_build_array('briefs in / work out', 'creative direction', 'campaign deployment', 'client management'),
      'stats', jsonb_build_object('slots', '6')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_index, role_type, default_agent_id, label) VALUES
    (v_ship_id, 0, 'captain',       NULL,      'Agency Director'),
    (v_ship_id, 1, 'sales',         v_hubspot, 'Account Director'),
    (v_ship_id, 2, 'design',        v_miro,    'Creative Director'),
    (v_ship_id, 3, 'marketing',     v_klaviyo, 'Campaign Manager'),
    (v_ship_id, 4, 'product',       v_linear,  'Project Manager'),
    (v_ship_id, 5, 'documentation', v_notion,  'Copywriter');
END $$;
