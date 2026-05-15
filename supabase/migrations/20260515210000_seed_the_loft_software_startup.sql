-- Seed the second user-facing spaceship in the rebuilt catalog: The Loft,
-- a 12-slot software startup. Class-1 / Common / Ensign-unlocked at six
-- slots; grows to 8 at Lieutenant, 10 at Commander, 12 at Captain. Mirrors
-- The Madison's growth ladder shape so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Three slots ship without a default agent (Founder / Data Lead / People
-- Lead) — the wizard will auto-create blank agents the user can later
-- swap to a custom blueprint.

DO $$
DECLARE
  v_ship_id   uuid;
  v_github    uuid;
  v_miro      uuid;
  v_linear    uuid;
  v_notion    uuid;
  v_slack     uuid;
  v_hubspot   uuid;
  v_klaviyo   uuid;
  v_sentry    uuid;
  v_stripe    uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Loft
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-loft') THEN
    RAISE NOTICE 'The Loft already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_github   FROM public.agent_blueprints WHERE slug='github';
  SELECT id INTO v_miro     FROM public.agent_blueprints WHERE slug='miro';
  SELECT id INTO v_linear   FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_notion   FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_slack    FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_hubspot  FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_klaviyo  FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_sentry   FROM public.agent_blueprints WHERE slug='sentry';
  SELECT id INTO v_stripe   FROM public.agent_blueprints WHERE slug='stripe';

  IF v_github IS NULL OR v_miro IS NULL OR v_linear IS NULL OR v_notion IS NULL
     OR v_slack IS NULL OR v_hubspot IS NULL OR v_klaviyo IS NULL
     OR v_sentry IS NULL OR v_stripe IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: github=% miro=% linear=% notion=% slack=% hubspot=% klaviyo=% sentry=% stripe=%',
      v_github, v_miro, v_linear, v_notion, v_slack, v_hubspot, v_klaviyo, v_sentry, v_stripe;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-loft',
    'The Loft',
    'A twelve-person software startup. Ships product end-to-end — code, design, sell, support — and grows the team as you rank up.',
    'Six people on a Tuesday. The eng lead is reviewing a PR, the designer is in Figma, the PM is rewriting next sprint, ops is fixing the deploy script that broke at 4am, customer success is on a call. The founder is making coffee and trying not to interrupt anyone. Six months from now there will be twelve. The product still has bugs. The roadmap is still wrong. Something is shipping at noon.',
    'Startup',
    'Common',
    'catalog',
    'public',
    'SHIP-LOFT-0001',
    ARRAY['startup','software','engineering','product','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Founder of The Loft — a software startup.\n\nYour team:\n- Engineering Lead (GitHub): code, PRs, releases, technical decisions\n- Designer (Miro): product design, user flows, design reviews\n- Product Manager (Linear): roadmap, sprints, prioritization, specs\n- Operations (Notion): internal docs, processes, knowledge base\n- Customer Success (Slack): user conversations, feedback, retention\n- Sales Lead (HubSpot, class-2): pipeline, deals, ICP\n- Marketing Lead (Klaviyo, class-2): launches, email, growth experiments\n- Data Lead (class-3): analytics, dashboards, experimentation\n- Security Lead (Sentry, class-3): observability, incidents, hardening\n- Finance Lead (Stripe, class-4): billing, runway, models\n- People Lead (class-4): hiring, onboarding, culture\n\nHow you work:\n- Route by what the work needs first. Code questions through Engineering. Design through the Designer. Roadmap through the PM. User issues through Customer Success. Pipeline through Sales. Launches through Marketing.\n- Ship small, ship often. Prefer the merge over the meeting.\n- Default to writing it down — the Operations agent owns the docs system.\n- Push back on scope creep. Ask "what does the user actually need" before building.\n- The Loft is six people who will be twelve. Avoid hiring in front of the work. Avoid process in front of the team.\n- When a question is blocking, ask the most senior person who can answer in five minutes — not the most relevant person who answers in two days.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-LOFT-0001',
      'card_num', 2,
      'recommended_class', 'class-1',
      'subtitle', 'Software Startup',
      'art', NULL,
      'caps', jsonb_build_array('ship product end-to-end', 'engineering velocity', 'user-facing iteration', 'grows with the team'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',         NULL,      'Founder',           'class-1'),
    (v_ship_id,  2, 'engineering',     v_github,  'Engineering Lead',  'class-1'),
    (v_ship_id,  3, 'design',          v_miro,    'Designer',          'class-1'),
    (v_ship_id,  4, 'product',         v_linear,  'Product Manager',   'class-1'),
    (v_ship_id,  5, 'operations',      v_notion,  'Operations',        'class-1'),
    (v_ship_id,  6, 'support',         v_slack,   'Customer Success',  'class-1'),
    (v_ship_id,  7, 'sales',           v_hubspot, 'Sales Lead',        'class-2'),
    (v_ship_id,  8, 'marketing',       v_klaviyo, 'Marketing Lead',    'class-2'),
    (v_ship_id,  9, 'analytics',       NULL,      'Data Lead',         'class-3'),
    (v_ship_id, 10, 'security',        v_sentry,  'Security Lead',     'class-3'),
    (v_ship_id, 11, 'finance',         v_stripe,  'Finance Lead',      'class-4'),
    (v_ship_id, 12, 'people',          NULL,      'People Lead',       'class-4');
END $$;
