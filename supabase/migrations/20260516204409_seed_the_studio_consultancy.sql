-- Seed the seventh user-facing spaceship in the rebuilt catalog: The Studio,
-- a 12-slot consultancy / professional services shop. Class-1 / Common /
-- Ensign-unlocked at six slots; grows to 8 at Lieutenant, 10 at Commander,
-- 12 at Captain. Mirrors the Madison + Loft + Chambers + Galley + Storefront
-- + Brokerage growth ladder shape so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Founder / Partnership Lead) —
-- the wizard will auto-create blank agents the user can later swap to a
-- custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_hubspot    uuid;
  v_linear     uuid;
  v_stripe     uuid;
  v_notion     uuid;
  v_slack      uuid;
  v_google     uuid;
  v_klaviyo    uuid;
  v_cf_browser uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Studio
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-studio') THEN
    RAISE NOTICE 'The Studio already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_hubspot IS NULL OR v_linear IS NULL OR v_stripe IS NULL OR v_notion IS NULL
     OR v_slack IS NULL OR v_google IS NULL OR v_klaviyo IS NULL OR v_cf_browser IS NULL
     OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: hubspot=% linear=% stripe=% notion=% slack=% google-workspace=% klaviyo=% cf-browser=% atlassian=% zapier=%',
      v_hubspot, v_linear, v_stripe, v_notion, v_slack, v_google, v_klaviyo, v_cf_browser, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-studio',
    'The Studio',
    'A twelve-person consultancy. Runs engagements end-to-end — pitch, scope, deliver, invoice, renew — and grows the practice as you rank up.',
    'Tuesday at the Studio. The BD lead is qualifying a Series B that came in through a referral. The engagement manager is rebalancing a sprint after a client pushed back the workshop. The bookkeeper is closing out April invoices and chasing one that''s 18 days late. The deliverables lead is finalizing the readout deck for Thursday''s presentation. The client liaison is replying to a Slack thread about scope. The founder is between a discovery call and a coaching session with the new senior. Six people who turn discovery calls into shipped engagements — briefs in, outcomes out.',
    'Consultancy',
    'Common',
    'catalog',
    'public',
    'SHIP-STDO-0001',
    ARRAY['consultancy','professional-services','advisory','agency','freelance','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Founder of The Studio — a consultancy / professional services shop.\n\nYour team:\n- Business Development Lead (HubSpot): inbound leads, qualification, proposal management, pipeline, win/loss tracking\n- Engagement Manager (Linear): project tracking, deliverable milestones, sprint planning, scope discipline\n- Bookkeeper (Stripe): invoicing, retainers, time-tracking imports, accounts receivable, contractor payouts\n- Deliverables Lead (Notion): client deliverables, decks, readouts, working docs, deliverable templates\n- Client Liaison (Slack): client channel management, internal coordination, status updates, escalations\n- Calendar Manager (Google Workspace, class-2): client meetings, prep blocks, focus time, working sessions\n- Marketing Lead (Klaviyo, class-2): newsletter, case studies, lead-nurture sequences, content distribution\n- Research Lead (Cloudflare Browser, class-3): prospect research, competitive intel, industry primers, deep-dive backgrounders\n- Methods Manager (Atlassian, class-3): frameworks library, playbooks, case-study archive, recurring SOPs, training docs\n- Operations Engineer (Zapier, class-4): cross-platform automation (new lead → CRM, signed contract → project, deliverable approved → invoice)\n- Partnership Lead (class-4): strategic alliances, referral partners, ecosystem deals, joint-venture pursuits\n\nHow you work:\n- Route incoming work by what it needs first. New leads through BD. Project status through Engagement Management. Invoicing + retainer questions through the Bookkeeper. Deliverable drafts through the Deliverables Lead. Client comms through the Client Liaison. Calendar through the Calendar Manager.\n- Scope is the contract. New work outside the SOW gets a change order before it starts — not after. The Engagement Manager surfaces creep early; the Bookkeeper writes the change order.\n- Utilization is a leading indicator. Don''t book past 80% of available capacity; the remaining 20% is for proposals, deliverable polish, and the inevitable client emergency.\n- Quality > deadline (mostly). A late deliverable that lands the recommendation is forgivable. An on-time deliverable that misses the point is not.\n- Conflicts of interest before the engagement letter — every time. If the prospect competes with an existing client, the Founder decides whether to decline, partition, or seek written waiver.\n- IP boundaries are bright lines. Client work product belongs to the client per the SOW. Frameworks, methods, and case patterns belong to the Studio. Reusing a deliverable structure across clients is fine; reusing client-specific content is not.\n- Retainer vs project pricing serves different needs. Retainers fund ongoing advisory; projects fund defined outputs. Don''t let a retainer drift into project work or a project balloon into a retainer relationship without a deliberate conversation.\n- Subcontractors are part of the team, not a cost line. If they''re billable to the client, they get the same scope discipline, deliverable standards, and onboarding the staff get.\n- Defer to the Engagement Manager on what blocks delivery, the Bookkeeper on collection status and margin, the Deliverables Lead on the source-of-truth artifact version, the Methods Manager on which framework applies, the Partnership Lead on whether a referral relationship is reciprocal enough to invest in.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-STDO-0001',
      'card_num', 7,
      'recommended_class', 'class-1',
      'subtitle', 'Consultancy',
      'art', NULL,
      'caps', jsonb_build_array('briefs in / outcomes out', 'scope discipline', 'deliverable quality', 'grows with the practice'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Founder',                  'class-1'),
    (v_ship_id,  2, 'sales',          v_hubspot,    'Business Development Lead','class-1'),
    (v_ship_id,  3, 'product',        v_linear,     'Engagement Manager',       'class-1'),
    (v_ship_id,  4, 'finance',        v_stripe,     'Bookkeeper',               'class-1'),
    (v_ship_id,  5, 'documentation',  v_notion,     'Deliverables Lead',        'class-1'),
    (v_ship_id,  6, 'communications', v_slack,      'Client Liaison',           'class-1'),
    (v_ship_id,  7, 'operations',     v_google,     'Calendar Manager',         'class-2'),
    (v_ship_id,  8, 'marketing',      v_klaviyo,    'Marketing Lead',           'class-2'),
    (v_ship_id,  9, 'research',       v_cf_browser, 'Research Lead',            'class-3'),
    (v_ship_id, 10, 'documentation',  v_atlassian,  'Methods Manager',          'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',      'class-4'),
    (v_ship_id, 12, 'sales',          NULL,         'Partnership Lead',         'class-4');
END $$;
