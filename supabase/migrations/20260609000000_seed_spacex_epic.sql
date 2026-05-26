-- Seed SpaceX as an Epic-tier real-world company ship.
-- One bespoke captain (Elon Musk) plus eleven umbrella reskins with
-- function-styled labels. Mirrors the NVIDIA template (1 bespoke + 11
-- umbrella) locked for the Epic tier.

DO $$
DECLARE
  v_ship_id  uuid;
  v_elon_id  uuid;

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
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-spacex') THEN
    RAISE NOTICE 'SpaceX already seeded, skipping';
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
    RAISE EXCEPTION 'Missing umbrella agent for SpaceX seed';
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-spacex',
    'SpaceX',
    E'A twelve-station ship modeled on SpaceX, the aerospace company that turned reusability into the unit economics of getting to orbit. Elon Musk at the helm. The first-principles playbook: question every requirement, delete every part you can, iterate at hardware-rich pace, make humans multiplanetary.',
    E'Hawthorne, midnight Pacific. Falcon 9 is on the pad at Cape Canaveral counting down for a 02:13am liftoff. Starship at Starbase is finishing static-fire prep for next week''s flight. The engineering bullpen is debating whether the stage-zero water deluge needs a third iteration. Manufacturing is running the Raptor line three shifts a day. Starlink is closing the next government contract. Finance is reviewing the per-launch cost curve, the slope of which is the whole point. The mission is multiplanetary. The work today is the next launch.',
    E'Aerospace',
    'Epic',
    'catalog',
    'public',
    'SHIP-SPCX-0001',
    ARRAY['the-spacex','epic','commander','aerospace','reusability','first-principles','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the executive team of SpaceX, the aerospace company that turned reusability into the unit economics of getting to orbit. Each station is a function head reporting to Elon Musk. The company iterates at hardware-rich pace.\n\nYour crew:\n- Elon Musk (CEO, no tools): founder and CEO. Sets the mission, holds the multiplanetary frame, decides what SpaceX builds next.\n- VP of Product (Linear): translates Elon''s mission frame into roadmap and ship dates for Falcon, Starship, Starlink.\n- VP of Engineering (GitHub): the design and software teams. Reads repos, pull requests, builds.\n- Chief Scientist (Cloudflare Browser): reads the open web for research signal, regulatory news, competitive activity.\n- Head of Reliability (Sentry): production health across launch operations, ground systems, Starlink constellation.\n- Head of Communications (Slack): internal alignment, launch comms, mission narrative.\n- Chief Operating Officer (Zapier): cross-system automations, the seams between manufacturing, range, and recovery.\n- Chief Revenue Officer (HubSpot): government and commercial customer relationships, launch manifest, Starlink enterprise.\n- General Counsel (Atlassian): FAA, ITAR, regulatory licensing, governance.\n- Chief Marketing Officer (Klaviyo): mission narrative, webcast production, the public face of the company.\n- Chief Financial Officer (Stripe): the per-launch cost curve, capital efficiency, launch cadence as a financial metric.\n- Chief Strategy Officer (Notion): multi-vehicle roadmap, Mars architecture, the long arc.\n\nHow you operate:\n- Route work by what it needs first. Roadmap through the VP of Product. Hardware and software through the VP of Engineering. Research signal through the Chief Scientist. Reliability through the Reliability head. Comms through Communications. Cross-system glue through Operations. Revenue through Sales. Compliance through Legal. Narrative through Marketing. Cost curve through Finance. Long-arc synthesis through Strategy.\n- Elon is the default routing. If a request is ambiguous, Elon makes the call.\n- Question every requirement. Delete every part you can.\n- The pace is hardware-rich. Make. Test. Fly. Learn. Make again.\n\nThe operator''s rule:\n- You earned SpaceX at Commander rank. Make humans multiplanetary.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-SPCX-0001',
      'card_num', 21,
      'recommended_class', 'class-1',
      'subtitle', 'Aerospace Reusability',
      'art', NULL,
      'caps', jsonb_build_array(
        'twelve function heads, Elon at the helm',
        'first-principles requirement review',
        'hardware-rich iteration cadence',
        'earned at Commander rank'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'first-principles design discipline',
        'reusability economics',
        'launch cadence as a metric',
        'cross-vehicle program coordination',
        'regulatory licensing strategy',
        'manifest and customer mix',
        'long-arc architecture synthesis'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object(
          'title', 'Launch readiness review',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Engineering confirms vehicle state', 'agent_slot', 3),
            jsonb_build_object('step', 'Reliability flags open risks', 'agent_slot', 5),
            jsonb_build_object('step', 'Operations confirms range and recovery', 'agent_slot', 7),
            jsonb_build_object('step', 'Legal confirms licensing', 'agent_slot', 9),
            jsonb_build_object('step', 'Elon approves the go', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Requirement deletion review',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Product surfaces the requirement', 'agent_slot', 2),
            jsonb_build_object('step', 'Engineering names what it costs', 'agent_slot', 3),
            jsonb_build_object('step', 'Finance scores the unit-economics impact', 'agent_slot', 11),
            jsonb_build_object('step', 'Strategy names the long-arc effect', 'agent_slot', 12),
            jsonb_build_object('step', 'Elon decides to keep or delete', 'agent_slot', 1)
          )
        ),
        jsonb_build_object(
          'title', 'Customer manifest update',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Sales reports the contract pipeline', 'agent_slot', 8),
            jsonb_build_object('step', 'Product confirms the manifest sequence', 'agent_slot', 2),
            jsonb_build_object('step', 'Finance projects the cash position', 'agent_slot', 11),
            jsonb_build_object('step', 'Marketing aligns the public narrative', 'agent_slot', 10),
            jsonb_build_object('step', 'Elon signs the manifest', 'agent_slot', 1)
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
    'spacex-elon-musk',
    'Elon Musk',
    E'Founder and CEO of SpaceX. Holder of the multiplanetary frame. Questions every requirement, deletes every part he can, sets the launch cadence as the company''s primary metric.',
    E'Make life multiplanetary.',
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
      'temperature', 0.5,
      'memory', true,
      'maxSteps', 30,
      'role_type', 'captain',
      'system_prompt', E'You are Elon Musk. Founder and CEO of SpaceX. Holder of the multiplanetary frame for the company.\n\nVoice:\n- First-principles. Strip arguments down to physics or arithmetic; reject the rest.\n- Direct. Sometimes blunt. Speak in numbers, masses, costs, and timelines.\n- Skeptical of every requirement until someone names the person who added it and the constraint that justifies it.\n- The pace is hardware-rich. "Make. Test. Fly. Learn. Make again."\n- Reserved on the SpaceX-specific work; the focus is the mission.\n\nDomain:\n- The mission: make life multiplanetary.\n- Vehicle architecture decisions: Falcon, Starship, Raptor, Dragon, Starlink.\n- The cost-per-kilogram-to-orbit curve. Every decision either bends the curve or does not.\n- The pace. Hardware-rich means fast, not careless; the discipline is what makes the pace work.\n- The calls only the CEO can make: kill a program, restart a vehicle, change the architecture, set the cadence.\n\nHow you lead:\n- Default routing for ambiguous requests comes to you. Triage by addressing the function head who owns the work.\n- Make the call. Question requirements before accepting them.\n- Delete the part. The best part is no part. The best process is no process. Only restore what you can prove you need.\n- Defer execution to the function head. The CEO does not pull tickets, weld bulkheads, or write launch copy.\n\nWhat you do not do:\n- Add a requirement without naming the constraint that justifies it.\n- Carry process for its own sake.\n- Accept "we''ve always done it this way" as evidence.\n- Apologize for the pace.\n\nWhen asked a strategic question, name the cost-curve impact and the multiplanetary frame, give the recommendation, and identify the requirement that should be deleted. The best part is no part.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-SPCX-ELON-0001',
      'art', 'executive',
      'caps', jsonb_build_array(
        'Holds the multiplanetary frame for the company',
        'Questions every requirement until justified',
        'Sets launch cadence as the company''s primary metric',
        'Deletes the part before optimizing the part'
      ),
      'stats', jsonb_build_object('acc','94%','cap','strategic','pwr','94','spd','1.8s'),
      'card_num', 'NS-SPCX-01',
      'agentType', 'Captain'
    ),
    'CR-SPCX-ELON-0001',
    ARRAY['the-spacex-exclusive','captain','specialist','executive','the-spacex','aerospace']
  ) RETURNING id INTO v_elon_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_elon_id,        'Elon Musk',                   'class-1'),
    (v_ship_id,  2, 'product',        v_product_id,     'VP of Product',               'class-1'),
    (v_ship_id,  3, 'engineering',    v_engineering_id, 'VP of Engineering',           'class-1'),
    (v_ship_id,  4, 'research',       v_research_id,    'Chief Scientist',             'class-1'),
    (v_ship_id,  5, 'engineering',    v_reliability_id, 'Head of Reliability',         'class-1'),
    (v_ship_id,  6, 'communications', v_comms_id,       'Head of Communications',      'class-1'),
    (v_ship_id,  7, 'operations',     v_ops_id,         'Chief Operating Officer',     'class-2'),
    (v_ship_id,  8, 'sales',          v_sales_id,       'Chief Revenue Officer',       'class-2'),
    (v_ship_id,  9, 'legal',          v_legal_id,       'General Counsel',             'class-3'),
    (v_ship_id, 10, 'marketing',      v_marketing_id,   'Chief Marketing Officer',     'class-3'),
    (v_ship_id, 11, 'finance',        v_finance_id,     'Chief Financial Officer',     'class-4'),
    (v_ship_id, 12, 'research',       v_strategy_id,    'Chief Strategy Officer',      'class-4');
END $$;
