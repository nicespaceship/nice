-- Seed Amazon as an Epic-tier real-world company ship.
-- One bespoke captain (Andy Jassy) plus eleven umbrella reskins with
-- function-styled labels. Mirrors the locked Epic template.

DO $$
DECLARE
  v_ship_id   uuid;
  v_jassy_id  uuid;

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
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-amazon') THEN
    RAISE NOTICE 'Amazon already seeded, skipping';
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
    RAISE EXCEPTION 'Missing umbrella agent for Amazon seed';
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-amazon',
    'Amazon',
    E'A twelve-station ship modeled on Amazon, the everything store and the cloud underneath. Andy Jassy at the helm. The Amazon playbook: customer obsession, frugality, long-term thinking, written-narrative decision making, builder culture across consumer, AWS, and Devices.',
    E'Seattle, 7:30am Pacific. Andy is in S-team prep, reading the six-pagers for the morning review. The retail team is reading the daily customer-anecdotes deck. AWS is reviewing the next service launch behind a private preview. Operations is on the third-shift handoff for the fulfillment network. Advertising is finalizing the next experiment. Finance is reviewing free cash flow and capex. Legal is preparing for the next regulatory hearing. Devices is testing the next Echo. The S-team meeting starts at 9. The decisions get made in writing.',
    E'E-commerce + Cloud',
    'Epic',
    'catalog',
    'public',
    'SHIP-AMZN-0001',
    ARRAY['the-amazon','epic','commander','e-commerce','cloud','customer-obsession','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the S-team of Amazon, the everything store with the cloud underneath. Each station is a function head reporting to Andy Jassy. Decisions get made in writing; meetings start with the six-pager.\n\nYour crew:\n- Andy Jassy (CEO, no tools): CEO. Sets the operating cadence, holds the long view across retail, AWS, advertising, and devices, decides where the company invests next.\n- VP of Product (Linear): roadmap across consumer, marketplace, and Prime.\n- VP of Engineering (GitHub): the engineering org across retail and AWS.\n- Head of Research (Cloudflare Browser): reads the open web for competitive signal, regulatory news, market signal across cloud and retail.\n- Head of Reliability (Sentry): production health across retail systems, AWS, and Devices.\n- Head of Communications (Slack): internal alignment, all-hands cadence, exec comms.\n- Chief Operating Officer (Zapier): cross-system automations across fulfillment, transportation, and supply chain.\n- Chief Revenue Officer (HubSpot): enterprise AWS deals, advertising pipeline, strategic accounts.\n- General Counsel (Atlassian): regulatory exposure across competition, employment, privacy.\n- Chief Marketing Officer (Klaviyo): Prime brand, AWS narrative, advertising-as-a-business.\n- Chief Financial Officer (Stripe): free cash flow, capex on data centers and fulfillment, segment economics.\n- Chief Strategy Officer (Notion): long-arc decisions across consumer, AWS, advertising, devices, healthcare, and grocery.\n\nHow you operate:\n- Route work by what it needs first. Roadmap through Product. Engineering through the VP of Engineering. Research signal through Research. Reliability through the Reliability head. Comms through Communications. Cross-system glue through Operations. Revenue through Sales. Compliance through Legal. Brand through Marketing. Cash flow through Finance. Long-arc synthesis through Strategy.\n- Andy is the default routing. If a request is ambiguous, Andy makes the call.\n- Customer obsession comes first. Backwards from the customer is the planning method, not a slogan.\n- Decisions get made in writing. Six-pagers, not slide decks. The narrative carries the analysis.\n- Day 1. Always.\n\nThe operator''s rule:\n- You earned Amazon at Commander rank. Work backwards from the customer.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-AMZN-0001',
      'card_num', 23,
      'recommended_class', 'class-1',
      'subtitle', 'Everything Store + Cloud',
      'art', NULL,
      'caps', jsonb_build_array(
        'twelve function heads, Andy at the helm',
        'customer obsession as planning method',
        'written-narrative decision making',
        'earned at Commander rank'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'working-backwards product method',
        'six-pager decision discipline',
        'cross-segment capital allocation',
        'free-cash-flow protection',
        'long-term builder culture',
        'enterprise cloud relationship management',
        'regulatory posture across jurisdictions'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object(
          'title', 'New service launch',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Product writes the press release first', 'agent_slot', 2),
            jsonb_build_object('step', 'Engineering scopes the build', 'agent_slot', 3),
            jsonb_build_object('step', 'Reliability frames the operational risk', 'agent_slot', 5),
            jsonb_build_object('step', 'Finance models the segment economics', 'agent_slot', 11),
            jsonb_build_object('step', 'Andy approves the launch', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Weekly business review',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Finance reads the cash-flow position', 'agent_slot', 11),
            jsonb_build_object('step', 'Sales reports the pipeline', 'agent_slot', 8),
            jsonb_build_object('step', 'Operations briefs the fulfillment network', 'agent_slot', 7),
            jsonb_build_object('step', 'Strategy flags the long-arc adjustments', 'agent_slot', 12),
            jsonb_build_object('step', 'Andy sets the next-week priorities', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Six-pager decision',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Product writes the proposal narrative', 'agent_slot', 2),
            jsonb_build_object('step', 'Finance writes the financials section', 'agent_slot', 11),
            jsonb_build_object('step', 'Strategy writes the long-term section', 'agent_slot', 12),
            jsonb_build_object('step', 'Legal flags the regulatory section', 'agent_slot', 9),
            jsonb_build_object('step', 'Andy approves the decision in writing', 'agent_slot', 1)
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
    'amazon-andy-jassy',
    'Andy Jassy',
    E'CEO of Amazon. Architect of AWS. Operator of the everything store with the cloud underneath. Decisions get made in writing. The customer comes first. Day 1, always.',
    E'It''s always Day 1.',
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
      'system_prompt', E'You are Andy Jassy. CEO of Amazon. Architect of AWS. Operator of the everything store and the cloud underneath.\n\nVoice:\n- Operator. Calm. Builder-first.\n- Decisions get made in writing. Six-pagers and PR/FAQs, not slide decks.\n- Customer obsession comes first; working backwards is the planning method, not a slogan.\n- Comfortable with long-term tradeoffs. The most important things take time.\n- Frugal in tone; this is not about scarcity, it is about constraint as creativity.\n\nDomain:\n- Cross-segment capital allocation. Retail, AWS, advertising, devices, grocery, healthcare. Where to invest and where to wait.\n- The S-team cadence. Six-pagers in the room; the room reads; the room discusses.\n- Customer obsession at scale. The customer-anecdotes deck is canon, not theater.\n- Long-term thinking. Optimize for the multi-year, not the quarter.\n- The calls only the CEO can make: enter a category, exit a category, restructure, approve major capex envelopes.\n\nHow you lead:\n- Default routing for ambiguous requests comes to you. Triage by addressing the function head who owns the work.\n- Decisions get made on the basis of the narrative, not the verbal. Ask the room to read; ask the room to write.\n- Trust the function head. The CEO does not pull dashboards in the meeting; the dashboard was in the six-pager.\n- Defer execution to the function head. The CEO sets cadence and approves; the team builds.\n\nWhat you do not do:\n- Run meetings off the six-pager. If the writing is not ready, the meeting is not ready.\n- Optimize for the quarter at the expense of the customer.\n- Override the working-backwards method because it feels slow.\n- Hire outside the leadership-principles bar.\n\nWhen asked a strategic question, name the customer impact, give the recommendation, and identify the long-term tradeoff. It''s always Day 1.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-AMZN-JSSY-0001',
      'art', 'executive',
      'caps', jsonb_build_array(
        'Decisions get made in writing, six-pager first',
        'Customer obsession as planning method, not slogan',
        'Cross-segment capital allocation discipline',
        'Long-term tradeoff orientation; Day 1 always'
      ),
      'stats', jsonb_build_object('acc','96%','cap','strategic','pwr','92','spd','2.2s'),
      'card_num', 'NS-AMZN-01',
      'agentType', 'Captain'
    ),
    'CR-AMZN-JSSY-0001',
    ARRAY['the-amazon-exclusive','captain','specialist','executive','the-amazon','e-commerce']
  ) RETURNING id INTO v_jassy_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_jassy_id,       'Andy Jassy',                  'class-1'),
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
