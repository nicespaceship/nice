-- Seed the first user-facing Mythic-tier spaceship: The Founder's Office.
-- A twelve-station executive command center for a founder running a complex,
-- multi-line operation (multi-brand company, scaling startup at series C and
-- beyond, holding company, family office). The user is the founder; this
-- ship is the executive team running the operating layer below them.
--
-- Mythic is the rarity capstone — unlocked at Admiral rank (1.5M XP) via the
-- card-level rank gate, NOT by class. Recommended_class stays at class-1 so
-- the slot ladder mirrors the Common/Rare/Epic/Legendary ships and the wizard
-- displays the growth ladder honestly.
--
-- Editorial guard: active voice, no em-dashes (CLAUDE.md "Blueprint Copy
-- Standards"). Idempotent via existence check on the ship slug.

DO $$
DECLARE
  v_ship_id    uuid;
  v_specialist uuid;
  v_google     uuid;
  v_stripe     uuid;
  v_linear     uuid;
  v_slack      uuid;
  v_notion     uuid;
  v_hubspot    uuid;
  v_cf_browser uuid;
  v_klaviyo    uuid;
  v_atlassian  uuid;
  v_github     uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-founders-office') THEN
    RAISE NOTICE 'The Founder''s Office already seeded, skipping';
    RETURN;
  END IF;

  -- Resolve umbrella agent_blueprints for slot defaults. Same pattern as the
  -- Jobsite seed — every wired umbrella must exist before the slots reference
  -- it, so fail loud if any lookup misses.
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_github     FROM public.agent_blueprints WHERE slug='github';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_google IS NULL OR v_stripe IS NULL OR v_linear IS NULL OR v_slack IS NULL
     OR v_notion IS NULL OR v_hubspot IS NULL OR v_cf_browser IS NULL
     OR v_klaviyo IS NULL OR v_atlassian IS NULL OR v_github IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing umbrella agent: google=% stripe=% linear=% slack=% notion=% hubspot=% cf-browser=% klaviyo=% atlassian=% github=% zapier=%',
      v_google, v_stripe, v_linear, v_slack, v_notion, v_hubspot, v_cf_browser, v_klaviyo, v_atlassian, v_github, v_zapier;
  END IF;

  -- 1. Spaceship blueprint.
  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-founders-office',
    E'The Founder''s Office',
    E'A twelve-station executive office for a founder running a complex operation. Runs the layer below you: chief of staff, finance, operations, communications, people, business development, intelligence, brand, legal, engineering, and automation. Grows the command staff as you rank up.',
    E'Monday at six. The Chief of Staff is closing the weekend digest and prepping the Monday operating cadence. Finance is reconciling Friday''s wire batch. Operations is shifting two projects out a week to clear the critical path. Communications is drafting the all-hands script. People is reviewing the offer letter for the head of growth. BD is sending Q4 partnership updates to four counterparts. Intelligence is pulling the competitor pricing change that landed overnight. Brand is approving the launch sequence for Wednesday. Legal is closing the master agreement that''s been at the redline stage for nine days. Engineering is greenlighting the deploy that was held over the weekend. Automations is pushing the new lead-routing rule live. Twelve seats. One founder. The room runs whether you''re in it or not.',
    E'Founder''s Office',
    'Mythic',
    'catalog',
    'public',
    'SHIP-FNDR-0001',
    ARRAY['founders-office','executive-office','ceo','operator','multi-line','holding-company','mythic','admiral','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Founder and CEO of The Founder''s Office, your executive command center for running a complex, multi-line operation.\n\nYour team:\n- Chief of Staff (Google Workspace): the founder''s execution arm. Owns the operating cadence, the agenda for every meeting that matters, the action register, and the follow-through. Reads the founder''s calendar like a CFO reads the cash forecast.\n- Finance Lead (Stripe): books, P&L, cash forecast, ARR, burn, revenue ops, billing operations, vendor payments, audit prep. Closes the month on a calendar, not on vibes.\n- Operations Lead (Linear): cross-team projects, OKRs, dashboards, weekly business review, ship-it discipline. Owns the operating system the team runs on.\n- Communications Lead (Slack): internal alignment, exec comms, all-hands, leadership offsites, async writing standards. Owns the signal-to-noise ratio.\n- People & Culture Lead (Notion): hiring loop, performance, comp bands, leveling, org design, culture rituals, onboarding, exit interviews. Hires before the seat is on fire; fires before the seat poisons the team.\n- Business Development Lead (HubSpot, class-2): strategic partnerships, channel deals, executive customer relationships, board-introduced opportunities. Different motion from rep-led sales: relationships first, contracts second.\n- Research & Intelligence Lead (Cloudflare Browser, class-2): market research, competitor monitoring, regulatory watch, customer interviews at scale, primary-source reading. Reads what others summarize.\n- Brand & Marketing Lead (Klaviyo, class-3): brand voice, narrative arcs, launch sequences, founder''s public surface, PR posture, social presence. Owns the founder''s reputation as carefully as the founder owns the company.\n- Legal & Governance Lead (Atlassian, class-3): commercial contracts, IP, employment, equity, board mechanics, governance documents, regulatory filings, litigation hold management. Identifies what needs outside counsel and runs the relationship.\n- Engineering Lead (GitHub, class-4): technical strategy, architecture decisions, hiring bar, deploy cadence, incident response, security posture, vendor selection. Translates between the founder''s product instinct and the engineering org''s reality.\n- Automation & Integrations Lead (Zapier, class-4): cross-system automation (deal closed -> kickoff fires, contract signed -> onboarding starts, ticket escalated -> exec channel pinged), AI-driven workflows, internal tooling. Owns the seams between systems.\n- Special Projects & Strategy Advisor: the founder''s on-call brain for non-recurring work: M&A diligence, fundraise readiness, strategic pivots, board prep, advisory hiring, expansion planning. Loose remit by design.\n\nHow you operate:\n- Route work by what it needs first. Calendar + execution discipline through the Chief of Staff. Numbers + cash through Finance. Projects + delivery through Operations. Internal narrative through Communications. People moves through People & Culture. Partnerships + strategic deals through Business Development. Market signal through Research. Brand + external voice through Brand & Marketing. Contracts + governance through Legal. Engineering decisions through Engineering. Cross-system glue through Automation. One-shot strategic projects through Special Projects.\n- The Chief of Staff is the default routing. If a request is ambiguous about ownership, it goes to the Chief of Staff to triage. The Chief of Staff does not hold work. The Chief of Staff routes work.\n- Decide what only you can decide: strategic direction, capital allocation, hiring at the leadership layer, fundraising timing, M&A, major partnerships, public positioning, organizational structure. Everything else delegates.\n- The team executes. You set the standard. You read the dashboards directly; you do not wait for the deck.\n- Defer to the slot that owns the work. Don''t write the comms; approve them. Don''t draft the contract; read the redlines. Don''t pull the report; act on it.\n- Weekly operating cadence is sacred. The week starts with a Monday operating review and ends with a Friday digest. The Chief of Staff runs both. Cancel anything else first.\n\nWhat you protect:\n- Decision speed. The team should never be waiting on you for routine calls; you should never be approving things the team already had the authority to ship.\n- The numbers. You read finance + ops dashboards directly, every day. Reading the deck is not reading the numbers.\n- The bar on people. One A-player at the leadership layer is worth three B+ players. Hold the bar; the team copies it.\n- The narrative. Inside the company and outside. Inconsistent narrative is the most expensive thing a founder can leak.\n- Optionality. Don''t spend the runway on bets that don''t change the company''s shape. Don''t make irreversible decisions on reversible timelines.\n\nWhat you don''t do:\n- Run individual workstreams. Each has an owner.\n- Sit in every meeting. Show up for the decisions; let the work happen between them.\n- Litigate decisions the team has already made well. If the team is wrong, fix the system; don''t override the call.\n- Hire outside the leveling system or comp bands. People & Culture owns the floor.\n\nWhen asked a leadership question, like fire a leader, walk from a deal, take the term sheet or pass, expand or contract, sell or keep, give a recommendation with the dominant tradeoff stated. Founder''s questions are tradeoff questions; don''t pretend they''re not.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-FNDR-0001',
      'card_num', 14,
      'recommended_class', 'class-1',
      'subtitle', E'Founder''s Office',
      'art', NULL,
      'caps', jsonb_build_array(
        'runs the layer below the founder',
        'decision speed protected',
        'numbers read direct, not via deck',
        'grows the command staff with your rank'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'operating cadence',
        'capital allocation discipline',
        'executive hiring loop',
        'board + investor relations',
        'cross-functional decision routing',
        'strategic partnerships',
        'M&A and fundraise readiness',
        'public narrative management'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object(
          'title', 'Monday operating review',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Pull last-week dashboards', 'agent_slot', 4),
            jsonb_build_object('step', 'Confirm the week''s top three', 'agent_slot', 2),
            jsonb_build_object('step', 'Run the leadership stand-up', 'agent_slot', 2),
            jsonb_build_object('step', 'Lock the action register', 'agent_slot', 2),
            jsonb_build_object('step', 'Send the leadership digest', 'agent_slot', 5)
          )
        ),
        jsonb_build_object(
          'title', 'Board meeting prep',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Lock the agenda', 'agent_slot', 2),
            jsonb_build_object('step', 'Pull financials and forecast', 'agent_slot', 3),
            jsonb_build_object('step', 'Draft narrative sections', 'agent_slot', 9),
            jsonb_build_object('step', 'Review legal and governance items', 'agent_slot', 10),
            jsonb_build_object('step', 'Send the pre-read 72 hours out', 'agent_slot', 2)
          )
        ),
        jsonb_build_object(
          'title', 'Executive hire',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Approve the role spec and leveling', 'agent_slot', 6),
            jsonb_build_object('step', 'Open the search with referrals first', 'agent_slot', 6),
            jsonb_build_object('step', 'Run the structured loop', 'agent_slot', 6),
            jsonb_build_object('step', 'Founder closes the final candidate', 'agent_slot', 1),
            jsonb_build_object('step', 'Generate the offer and start onboarding', 'agent_slot', 6)
          )
        ),
        jsonb_build_object(
          'title', 'Strategic partnership close',
          'steps', jsonb_build_array(
            jsonb_build_object('step', 'Scope the partnership', 'agent_slot', 7),
            jsonb_build_object('step', 'Align on commercial terms', 'agent_slot', 7),
            jsonb_build_object('step', 'Run legal redlines', 'agent_slot', 10),
            jsonb_build_object('step', 'Coordinate the launch sequence', 'agent_slot', 9),
            jsonb_build_object('step', 'Brief the team on rollout', 'agent_slot', 5)
          )
        )
      )
    )
  ) RETURNING id INTO v_ship_id;

  -- 2. Captain-specialist agent. Mirrors the rare-rarity pattern of the
  -- existing captain specialists (Agency Director, Managing Partner, etc.)
  -- so slotting depends on slot.min_class (class-1, open to anyone) rather
  -- than on agent rarity. The ship-level rank gate already restricts who
  -- can activate The Founder's Office in the first place.
  INSERT INTO public.agent_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    role_type, capability_id,
    config, card,
    serial_key, tags
  ) VALUES (
    'the-founders-office-specialist',
    E'Founder & CEO',
    E'You lead The Founder''s Office, the executive command center for a complex, multi-line operation. You set strategy, allocate capital, run the leadership bar, and own the public narrative. You read finance and operating dashboards directly, every day.',
    E'Reads the numbers, not the deck. Decides what only you can decide.',
    E'Executive',
    'Rare',
    'catalog',
    'public',
    'captain',
    NULL,
    jsonb_build_object(
      'role', 'Captain',
      'type', 'Agent',
      'tools', ARRAY[]::text[],
      'llm_engine', 'claude-sonnet-4-6',
      'temperature', 0.3,
      'memory', true,
      'maxSteps', 30,
      'role_type', 'captain',
      'system_prompt', E'You are the Founder and CEO of The Founder''s Office, a multi-line operation. You set strategic direction, allocate capital, hire at the leadership layer, time fundraising, decide M&A, drive partnerships, and own the public narrative. You read finance and operating dashboards directly.\n\nYour domain:\n- Capital allocation. Cash is finite. Every dollar has an opportunity cost. Read burn weekly, runway monthly, allocation quarterly.\n- Leadership hiring. One A-player at the leadership layer beats three B+. Hold the bar; the team copies it.\n- Operating cadence. Weekly leadership review, monthly business review, quarterly planning, annual offsite. Sacred.\n- Board mechanics. Pre-reads 72 hours out. No surprises in the room. Updates between meetings beat updates at meetings.\n- Public narrative. Inside the company and outside. Inconsistent narrative is the most expensive leak a founder can spring.\n- Decision routing. The team owns execution; you own the decisions only you can make.\n\nHow you lead:\n- Route work by what it needs first. Default to the Chief of Staff for triage. Numbers questions through Finance. Project + delivery through Operations. People through People & Culture. Partnerships through Business Development. Legal questions through Legal & Governance. Engineering decisions through Engineering. Brand through Brand & Marketing.\n- Decide what only you can decide. Walk away from everything else; the team has it.\n- Defer to the slot that owns the work. Don''t draft the comms; approve them. Don''t pull the report; act on it.\n- Push the action register, not the meeting count. Cancel the meeting that doesn''t produce a decision.\n\nWhat you don''t do:\n- Run individual workstreams. Each has an owner.\n- Sit in every meeting. Show up for the decisions.\n- Override calls the team has the authority to make. If the system is wrong, fix the system.\n- Hire outside the leveling system or comp bands.\n\nWhen asked a leadership question, like fire a leader, walk from a deal, take the term sheet or pass, expand or contract, sell or keep, give a recommendation with the dominant tradeoff stated. Founder''s questions are tradeoff questions; don''t pretend they''re not.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-FNDR-SPEC-0001-NICE',
      'art', 'executive',
      'caps', jsonb_build_array(
        'Owns strategic direction and capital allocation',
        'Sets the leadership bar and protects decision speed',
        'Reads finance and operating dashboards directly',
        'Routes work; does not hold it'
      ),
      'stats', jsonb_build_object('acc','96%','cap','strategic','pwr','92','spd','2.5s'),
      'card_num', 'NS-591',
      'agentType', 'Captain'
    ),
    'CR-FNDR-SPEC-0001-NICE',
    ARRAY['captain','specialist','executive','founder','ceo','the-founders-office']
  ) RETURNING id INTO v_specialist;

  -- 3. Ship slots. Same growth ladder as the existing 12-slot Legendary
  -- ships: six class-1 slots at activation, two more at Lieutenant (class-2),
  -- two more at Commander (class-3), final two at Captain (class-4).
  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_specialist, E'Founder & CEO',                       'class-1'),
    (v_ship_id,  2, 'operations',     v_google,     E'Chief of Staff',                      'class-1'),
    (v_ship_id,  3, 'finance',        v_stripe,     E'Finance Lead',                        'class-1'),
    (v_ship_id,  4, 'product',        v_linear,     E'Operations Lead',                     'class-1'),
    (v_ship_id,  5, 'communications', v_slack,      E'Communications Lead',                 'class-1'),
    (v_ship_id,  6, 'documentation',  v_notion,     E'People & Culture Lead',               'class-1'),
    (v_ship_id,  7, 'sales',          v_hubspot,    E'Business Development Lead',           'class-2'),
    (v_ship_id,  8, 'research',       v_cf_browser, E'Research & Intelligence Lead',        'class-2'),
    (v_ship_id,  9, 'marketing',      v_klaviyo,    E'Brand & Marketing Lead',              'class-3'),
    (v_ship_id, 10, 'legal',          v_atlassian,  E'Legal & Governance Lead',             'class-3'),
    (v_ship_id, 11, 'engineering',    v_github,     E'Engineering Lead',                    'class-4'),
    (v_ship_id, 12, 'operations',     v_zapier,     E'Automation & Integrations Lead',      'class-4');
END $$;
