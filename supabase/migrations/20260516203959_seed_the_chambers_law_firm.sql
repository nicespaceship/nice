-- Seed the third user-facing spaceship in the rebuilt catalog: The Chambers,
-- a 12-slot law firm. Class-1 / Common / Ensign-unlocked at six slots;
-- grows to 8 at Lieutenant, 10 at Commander, 12 at Captain. Mirrors the
-- Madison + Loft growth ladder shape so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Managing Partner / Senior
-- Counsel) — the wizard will auto-create blank agents the user can later
-- swap to a custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_hubspot    uuid;
  v_notion     uuid;
  v_linear     uuid;
  v_stripe     uuid;
  v_slack      uuid;
  v_cf_browser uuid;
  v_klaviyo    uuid;
  v_google     uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Chambers
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-chambers') THEN
    RAISE NOTICE 'The Chambers already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_hubspot IS NULL OR v_notion IS NULL OR v_linear IS NULL OR v_stripe IS NULL
     OR v_slack IS NULL OR v_cf_browser IS NULL OR v_klaviyo IS NULL
     OR v_google IS NULL OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: hubspot=% notion=% linear=% stripe=% slack=% cf-browser=% klaviyo=% google-workspace=% atlassian=% zapier=%',
      v_hubspot, v_notion, v_linear, v_stripe, v_slack, v_cf_browser, v_klaviyo, v_google, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-chambers',
    'The Chambers',
    'A twelve-person law firm. Runs matters end-to-end — intake, research, drafting, discovery, billing — and grows the practice as you rank up.',
    'Tuesday at the Chambers. The intake coordinator is running a conflict check on a new injury case. The paralegal is redlining a contract that needs to ship by close of business. The case manager just noticed the response is due in fourteen days, not twenty-one. Billing is reconciling the trust account. The managing partner is between a settlement call and a deposition prep. Six people who hold court without a courtroom — matters in, outcomes out.',
    'Law Firm',
    'Common',
    'catalog',
    'public',
    'SHIP-CHMB-0001',
    ARRAY['legal','law-firm','professional-services','practice','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Managing Partner of The Chambers — a law firm.\n\nYour team:\n- Intake Coordinator (HubSpot): client intake, conflict checks, lead qualification, matter creation\n- Paralegal (Notion): legal docs, drafting, brief preparation, internal knowledge base\n- Case Manager (Linear): matter tracking, deadlines, statutes of limitations, task dispatch\n- Billing Lead (Stripe): retainers, invoicing, trust accounting, accounts receivable\n- Client Liaison (Slack): client communications, internal coordination, status updates\n- Legal Researcher (Cloudflare Browser, class-2): case law research, statutory analysis, legal precedents via web\n- Marketing Lead (Klaviyo, class-2): newsletters, lead nurturing, content marketing to prospects\n- Discovery Lead (Google Workspace, class-3): eDiscovery, document review, email evidence, drive documents\n- Knowledge Manager (Atlassian, class-3): firm wiki, matter knowledge base, precedent library\n- Office Manager (Zapier, class-4): cross-platform automation, workflow integration, operations\n- Senior Counsel (class-4): complex matter advisory, oversight, second chair on significant cases\n\nHow you work:\n- Route incoming work by what it needs first. Intake through the Intake Coordinator. Drafting through the Paralegal. Research through the Legal Researcher. Matters and deadlines through the Case Manager. Billing through the Billing Lead. Client communications through the Client Liaison.\n- Conflict checks before substantive work — always. No exceptions.\n- Deadlines are sacred. Court deadlines, statute deadlines, client deadlines. Surface the soonest one first.\n- Cite your sources. Every legal claim needs a case, statute, or rule.\n- Practice ethically. Bill hours honestly. Treat every communication as privileged unless waived.\n- When a matter is novel, research first, draft second. When a matter is routine, lean on the precedent library.\n- Push back on scope creep — politely. New work means a new engagement letter.\n- Defer to the Paralegal on procedure, the Legal Researcher on case law, the Billing Lead on retainer status, the Senior Counsel on strategy.\n- When a question is privileged, treat it as such — no third parties on the call.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-CHMB-0001',
      'card_num', 3,
      'recommended_class', 'class-1',
      'subtitle', 'Law Firm',
      'art', NULL,
      'caps', jsonb_build_array('matters in / outcomes out', 'legal research', 'document drafting', 'grows with the practice'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Managing Partner',  'class-1'),
    (v_ship_id,  2, 'sales',          v_hubspot,    'Intake Coordinator','class-1'),
    (v_ship_id,  3, 'documentation',  v_notion,     'Paralegal',         'class-1'),
    (v_ship_id,  4, 'operations',     v_linear,     'Case Manager',      'class-1'),
    (v_ship_id,  5, 'finance',        v_stripe,     'Billing Lead',      'class-1'),
    (v_ship_id,  6, 'communications', v_slack,      'Client Liaison',    'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Legal Researcher',  'class-2'),
    (v_ship_id,  8, 'marketing',      v_klaviyo,    'Marketing Lead',    'class-2'),
    (v_ship_id,  9, 'legal',          v_google,     'Discovery Lead',    'class-3'),
    (v_ship_id, 10, 'documentation',  v_atlassian,  'Knowledge Manager', 'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Office Manager',    'class-4'),
    (v_ship_id, 12, 'legal',          NULL,         'Senior Counsel',    'class-4');
END $$;
