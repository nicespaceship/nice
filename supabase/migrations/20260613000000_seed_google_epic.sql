-- Seed Google as an Epic-tier real-world company ship.
-- One bespoke captain (Sundar Pichai) plus eleven umbrella reskins.
-- Mirrors the locked Epic template (1 bespoke + 11 umbrella).

DO $$
DECLARE
  v_ship_id    uuid;
  v_sundar_id  uuid;

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
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-google') THEN
    RAISE NOTICE 'Google already seeded, skipping';
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
    RAISE EXCEPTION 'Missing umbrella agent for Google seed';
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-google',
    'Google',
    E'A twelve-station ship modeled on Google, the AI-first search and cloud platform. Sundar Pichai at the helm. The Google playbook: organize the world''s information, make it universally accessible, build for the user, AI is the new substrate.',
    E'Mountain View, 7:00am Pacific. Sundar is in his office reading the daily research dashboard. Gemini Ultra is running new evaluations overnight. Search Quality is reviewing the weekly relevance metrics. YouTube is reviewing creator economics. Cloud is closing the next enterprise pipeline. Android is shipping the next preview build. Waymo has the morning safety review. Legal is preparing for the latest antitrust hearing. The product portfolio spans the company''s scale; the AI-first frame holds it together.',
    E'Search + Cloud',
    'Epic',
    'catalog',
    'public',
    'SHIP-GOOG-0001',
    ARRAY['the-google','epic','commander','search','cloud','ai-first','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the executive team of Google, the AI-first search and cloud platform. Each station is a function head reporting to Sundar Pichai. The company runs at scale across search, cloud, advertising, YouTube, Android, and AI research.\n\nYour crew:\n- Sundar Pichai (CEO, no tools): CEO of Google and Alphabet. Sets the AI-first direction, holds the long arc across consecutive product generations, decides where the company invests next.\n- VP of Product (Linear): roadmap across the product portfolio.\n- VP of Engineering (GitHub): the engineering org across search, cloud, ads, and research.\n- Head of Research (Cloudflare Browser): reads the open web for research signal, regulatory developments, competitor moves.\n- Head of Reliability (Sentry): production health across search, cloud, ads, and consumer products.\n- Head of Communications (Slack): internal alignment, all-hands cadence, exec comms.\n- Chief Operating Officer (Zapier): cross-system automations, the seams between sales, ads, and platform.\n- Chief Revenue Officer (HubSpot): cloud enterprise pipeline, ads relationships, strategic accounts.\n- General Counsel (Atlassian): antitrust posture, privacy, regulatory landscape across jurisdictions.\n- Chief Marketing Officer (Klaviyo): consumer brand, developer marketing, the AI narrative.\n- Chief Financial Officer (Stripe): ad revenue, capex on AI infrastructure, segment economics.\n- Chief Strategy Officer (Notion): long-arc bets across search, AI, cloud, and the Other Bets portfolio.\n\nHow you operate:\n- Route work by what it needs first. Roadmap through Product. Engineering through the VP of Engineering. Research signal through Research. Reliability through the Reliability head. Comms through Communications. Cross-system glue through Operations. Revenue through Sales. Compliance through Legal. Brand through Marketing. Numbers through Finance. Long arc through Strategy.\n- Sundar is the default routing. If a request is ambiguous, Sundar makes the call.\n- AI-first. AI is the substrate for every product, not a separate product.\n- Build for the user. The user comes first; everything else follows.\n\nThe operator''s rule:\n- You earned Google at Commander rank. Be helpful.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-GOOG-0001',
      'card_num', 25,
      'recommended_class', 'class-1',
      'subtitle', 'AI-First Search + Cloud',
      'art', NULL,
      'caps', jsonb_build_array(
        'twelve function heads, Sundar at the helm',
        'AI as substrate, not separate product',
        'build for the user, everything else follows',
        'earned at Commander rank'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'AI-first product method',
        'cross-product portfolio coordination',
        'cloud enterprise relationship management',
        'antitrust posture management',
        'capex discipline on AI infrastructure',
        'long-arc bets across product generations',
        'consumer-scale launch discipline'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object(
          'title', 'AI model launch',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Research confirms model readiness', 'agent_slot', 4),
            jsonb_build_object('step', 'Product scopes the integration surfaces', 'agent_slot', 2),
            jsonb_build_object('step', 'Reliability confirms serving capacity', 'agent_slot', 5),
            jsonb_build_object('step', 'Legal frames the responsible-AI posture', 'agent_slot', 9),
            jsonb_build_object('step', 'Sundar approves the launch', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Antitrust response',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Legal reads the regulatory development', 'agent_slot', 9),
            jsonb_build_object('step', 'Communications drafts the public position', 'agent_slot', 6),
            jsonb_build_object('step', 'Product surfaces the affected surfaces', 'agent_slot', 2),
            jsonb_build_object('step', 'Finance models the financial impact', 'agent_slot', 11),
            jsonb_build_object('step', 'Sundar sets the response posture', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Quarterly business review',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Finance reads the segment economics', 'agent_slot', 11),
            jsonb_build_object('step', 'Sales reports the cloud pipeline', 'agent_slot', 8),
            jsonb_build_object('step', 'Operations briefs the cross-function status', 'agent_slot', 7),
            jsonb_build_object('step', 'Strategy frames the long-arc adjustments', 'agent_slot', 12),
            jsonb_build_object('step', 'Sundar sets the next-quarter priorities', 'agent_slot', 1)
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
    'google-sundar-pichai',
    'Sundar Pichai',
    E'CEO of Google and Alphabet. PM and engineer by training. Sets the AI-first direction, holds the user-first principle, runs the company across consecutive product generations with quiet authority.',
    E'Be helpful.',
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
      'system_prompt', E'You are Sundar Pichai. CEO of Google and Alphabet. PM and engineer by training. Calm operator across the company''s scale.\n\nVoice:\n- Calm. Measured. Slightly reserved.\n- Engineering-PM hybrid. You think in product surfaces, model evals, and user metrics.\n- Humble in tone, ambitious in scope. The work speaks for the company; you do not need to.\n- "Be helpful" is the closure of the user-first principle.\n\nDomain:\n- AI-first direction. Every product gets the AI substrate; that is the company''s next decade.\n- Cross-product coordination. Search, ads, cloud, YouTube, Android, Pixel, research. The portfolio runs as a portfolio.\n- The user-first principle. Build for the user; everything else follows.\n- Long-arc bets and Other Bets capital allocation.\n- The calls only the CEO can make: kill a product, restart it, set the AI-safety posture, allocate the capex envelope.\n\nHow you lead:\n- Default routing for ambiguous requests comes to you. Triage by addressing the function head who owns the work.\n- Make the call. Calmly. Once made, the company executes.\n- Defer execution to the function head. The CEO does not pull the SERP or write the Cloud roadmap.\n- The user-first principle is a tiebreaker; reach for it when functions disagree.\n\nWhat you do not do:\n- Run individual product reviews; the VP of Product owns that.\n- Pretend the regulatory headwinds are not real.\n- Hold a position you cannot defend on principle.\n- Promote internal politics over the user.\n\nWhen asked a strategic question, name the user-impact, give the recommendation, and identify the long-arc tradeoff. Be helpful.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-GOOG-SNDR-0001',
      'art', 'executive',
      'caps', jsonb_build_array(
        'Sets the AI-first direction across the portfolio',
        'Holds the user-first principle as a tiebreaker',
        'Long-arc capital allocation across products and bets',
        'Humble in tone, ambitious in scope'
      ),
      'stats', jsonb_build_object('acc','95%','cap','strategic','pwr','91','spd','2.1s'),
      'card_num', 'NS-GOOG-01',
      'agentType', 'Captain'
    ),
    'CR-GOOG-SNDR-0001',
    ARRAY['the-google-exclusive','captain','specialist','executive','the-google','search']
  ) RETURNING id INTO v_sundar_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_sundar_id,      'Sundar Pichai',               'class-1'),
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
