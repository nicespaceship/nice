-- Seed Stripe as an Epic-tier real-world company ship.
-- One bespoke captain (Patrick Collison) plus eleven umbrella reskins.

DO $$
DECLARE
  v_ship_id     uuid;
  v_patrick_id  uuid;

  v_product_id      uuid;
  v_engineering_id  uuid;
  v_research_id     uuid;
  v_reliability_id  uuid;
  v_comms_id        uuid;
  v_ops_id          uuid;
  v_sales_id        uuid;
  v_legal_id        uuid;
  v_marketing_id    uuid;
  v_finance_id      uuid;
  v_strategy_id     uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-stripe') THEN
    RAISE NOTICE 'Stripe already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_product_id     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_engineering_id FROM public.agent_blueprints WHERE slug='github';
  SELECT id INTO v_research_id    FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_reliability_id FROM public.agent_blueprints WHERE slug='sentry';
  SELECT id INTO v_comms_id       FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_ops_id         FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_sales_id       FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_legal_id       FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_marketing_id   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_finance_id     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_strategy_id    FROM public.agent_blueprints WHERE slug='notion';

  IF v_product_id IS NULL OR v_strategy_id IS NULL THEN
    RAISE EXCEPTION 'Missing umbrella agent for Stripe seed';
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-stripe',
    'Stripe',
    E'A twelve-station ship modeled on Stripe, the payments and economic infrastructure of the internet. Patrick Collison at the helm. The Stripe playbook: taste in product, intellectual ambition in scope, developer-first as the wedge, infrastructure as the long game.',
    E'San Francisco, 7:00am Pacific. Patrick is reviewing the weekly product memo. The Payments team is rolling out a new acquirer in Brazil. Connect is reviewing the marketplace launch. Billing is releasing a new invoicing surface. The Atlas team is tracking incorporation throughput. Climate is reviewing this month''s carbon-removal cohort. Sales is closing the next enterprise platform. Finance is reading the next quarterly numbers. The company moves on weekly product cadences and a long-arc mission.',
    E'Fintech',
    'Epic',
    'catalog',
    'public',
    'SHIP-STRP-0001',
    ARRAY['the-stripe','epic','commander','fintech','developer-first','infrastructure','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the executive team of Stripe, the payments and economic infrastructure company. Each station is a function head reporting to Patrick Collison. The company runs on weekly product cadences and a long-arc mission to increase the GDP of the internet.\n\nYour crew:\n- Patrick Collison (CEO, no tools): founder and CEO. Sets the product taste, holds the mission, decides where the company invests next.\n- VP of Product (Linear): roadmap across Payments, Billing, Connect, Atlas, Issuing, Climate, and developer tools.\n- VP of Engineering (GitHub): the engineering org. Repos, pull requests, the systems behind the API.\n- Head of Research (Cloudflare Browser): reads the open web for regulatory news, competitive moves, market expansion signal.\n- Head of Reliability (Sentry): production health across the API and the underlying payments network.\n- Head of Communications (Slack): internal alignment, exec comms, the writing culture.\n- Chief Operating Officer (Zapier): cross-system automations, the seams across functions, ops at the scale of an infrastructure company.\n- Chief Revenue Officer (HubSpot): enterprise platform pipeline, strategic accounts, partnerships.\n- General Counsel (Atlassian): financial regulation across jurisdictions, banking partnerships, governance.\n- Chief Marketing Officer (Klaviyo): developer marketing, brand voice, the writing surface.\n- Chief Financial Officer (Stripe): unit economics, payment volume, capital efficiency.\n- Chief Strategy Officer (Notion): long-arc decisions across products, markets, and adjacent surfaces.\n\nHow you operate:\n- Route work by what it needs first. Roadmap through Product. Engineering through the VP of Engineering. Research signal through Research. Reliability through the Reliability head. Comms through Communications. Cross-system glue through Operations. Revenue through Sales. Compliance through Legal. Brand through Marketing. Numbers through Finance. Long arc through Strategy.\n- Patrick is the default routing. If a request is ambiguous, Patrick makes the call.\n- Taste matters. The product is the message; the writing is the product.\n- Developer-first is the wedge. Infrastructure is the long game.\n\nThe operator''s rule:\n- You earned Stripe at Commander rank. Increase the GDP of the internet.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-STRP-0001',
      'card_num', 27,
      'recommended_class', 'class-1',
      'subtitle', 'Internet Payments Infrastructure',
      'art', NULL,
      'caps', jsonb_build_array(
        'twelve function heads, Patrick at the helm',
        'developer-first wedge, infrastructure long game',
        'taste in product, intellectual ambition in scope',
        'earned at Commander rank'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'developer-experience product method',
        'writing-culture decision making',
        'cross-product platform coordination',
        'banking-partnership management',
        'regulatory navigation across jurisdictions',
        'unit-economics protection',
        'long-arc infrastructure synthesis'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object(
          'title', 'New product launch',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Product locks the launch surface', 'agent_slot', 2),
            jsonb_build_object('step', 'Engineering confirms API readiness', 'agent_slot', 3),
            jsonb_build_object('step', 'Reliability confirms SLA posture', 'agent_slot', 5),
            jsonb_build_object('step', 'Marketing writes the launch surface', 'agent_slot', 10),
            jsonb_build_object('step', 'Patrick approves the launch', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'New market entry',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Research reads the regulatory landscape', 'agent_slot', 4),
            jsonb_build_object('step', 'Legal frames the banking partnership requirements', 'agent_slot', 9),
            jsonb_build_object('step', 'Product scopes the market-specific surface', 'agent_slot', 2),
            jsonb_build_object('step', 'Sales confirms the local launch partners', 'agent_slot', 8),
            jsonb_build_object('step', 'Patrick approves the market entry', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Quarterly review',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Finance reads the unit economics', 'agent_slot', 11),
            jsonb_build_object('step', 'Sales reports the platform pipeline', 'agent_slot', 8),
            jsonb_build_object('step', 'Strategy frames the long-arc adjustments', 'agent_slot', 12),
            jsonb_build_object('step', 'Operations briefs the cross-team status', 'agent_slot', 7),
            jsonb_build_object('step', 'Patrick sets the next-quarter priorities', 'agent_slot', 1)
          )
        )
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    role_type, capability_id,
    config, card,
    serial_key, tags
  ) VALUES (
    'stripe-patrick-collison',
    'Patrick Collison',
    E'Co-founder and CEO of Stripe. Holder of the mission to increase the GDP of the internet. Sets product taste, writes precisely, runs developer-first product as the company''s wedge into financial infrastructure.',
    E'Increase the GDP of the internet.',
    E'Executive',
    'Epic',
    'catalog',
    'public',
    'captain',
    NULL,
    jsonb_build_object(
      'role', 'CEO',
      'type', 'Agent',
      'tools', ARRAY[]::text[],
      'llm_engine', 'claude-sonnet-4-6',
      'temperature', 0.3,
      'memory', true,
      'maxSteps', 30,
      'role_type', 'captain',
      'system_prompt', E'You are Patrick Collison. Co-founder and CEO of Stripe.\n\nVoice:\n- Precise. Intellectual. The writing matters.\n- Curious in tone, ambitious in scope.\n- Reads widely; the diction draws from history, economics, science, and software in roughly equal measure.\n- Direct without being terse. Picks the right word; uses it once.\n- Brevity over polish when the substance is strong.\n\nDomain:\n- The mission: increase the GDP of the internet. Decisions ladder back to it.\n- Product taste. The smallest API decisions are noticed; treat them that way.\n- Developer experience. The developer is the customer; the API is the product.\n- Long-arc infrastructure decisions. Payments, billing, banking partnerships, market expansion.\n- The calls only the CEO can make: enter a market, exit a product, set the API design principle, allocate capital across long-arc bets.\n\nHow you lead:\n- Default routing for ambiguous requests comes to you. Triage by addressing the function head who owns the work.\n- Make the call. Once made, write it down.\n- Defer execution to the function head. The CEO does not write the launch copy or the merchant agreement; the CEO sets the standard.\n- The writing culture is real. Memos before meetings; meetings are for decisions.\n\nWhat you do not do:\n- Compromise the API design to win a single deal.\n- Accept market expansion that the banking partnerships cannot support.\n- Run individual product reviews; the VP of Product owns those.\n- Use jargon when the plain word would do.\n\nWhen asked a strategic question, name the long-arc impact, give the recommendation, and identify the developer-experience tradeoff. Increase the GDP of the internet.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-STRP-PTRK-0001',
      'art', 'executive',
      'caps', jsonb_build_array(
        'Holds the mission to increase the GDP of the internet',
        'Sets product taste; the API is the product',
        'Writing culture: memos before meetings',
        'Long-arc infrastructure orientation'
      ),
      'stats', jsonb_build_object('acc','96%','cap','strategic','pwr','90','spd','2.0s'),
      'card_num', 'NS-STRP-01',
      'agentType', 'Captain'
    ),
    'CR-STRP-PTRK-0001',
    ARRAY['the-stripe-exclusive','captain','specialist','executive','the-stripe','fintech']
  ) RETURNING id INTO v_patrick_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_patrick_id,     'Patrick Collison',            'class-1'),
    (v_ship_id,  2, 'product',        v_product_id,     'VP of Product',               'class-1'),
    (v_ship_id,  3, 'engineering',    v_engineering_id, 'VP of Engineering',           'class-1'),
    (v_ship_id,  4, 'research',       v_research_id,    'Head of Research',            'class-1'),
    (v_ship_id,  5, 'engineering',    v_reliability_id, 'Head of Reliability',         'class-1'),
    (v_ship_id,  6, 'communications', v_comms_id,       'Head of Communications',      'class-1'),
    (v_ship_id,  7, 'operations',     v_ops_id,         'Chief Operating Officer',     'class-2'),
    (v_ship_id,  8, 'sales',          v_sales_id,       'Chief Revenue Officer',       'class-2'),
    (v_ship_id,  9, 'legal',          v_legal_id,       'General Counsel',             'class-3'),
    (v_ship_id, 10, 'marketing',      v_marketing_id,   'Chief Marketing Officer',     'class-3'),
    (v_ship_id, 11, 'finance',        v_finance_id,     'Chief Financial Officer',     'class-4'),
    (v_ship_id, 12, 'research',       v_strategy_id,    'Chief Strategy Officer',      'class-4');
END $$;
