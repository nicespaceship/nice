-- Seed the fourth user-facing spaceship in the rebuilt catalog: The Galley,
-- a 12-slot restaurant. Class-1 / Common / Ensign-unlocked at six slots;
-- grows to 8 at Lieutenant, 10 at Commander, 12 at Captain. Mirrors the
-- Madison + Loft + Chambers growth ladder shape so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Head Chef / Sous Chef) — the wizard
-- will auto-create blank agents the user can later swap to a custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_google     uuid;
  v_stripe     uuid;
  v_notion     uuid;
  v_slack      uuid;
  v_klaviyo    uuid;
  v_hubspot    uuid;
  v_cf_browser uuid;
  v_linear     uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Galley
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-galley') THEN
    RAISE NOTICE 'The Galley already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_google IS NULL OR v_stripe IS NULL OR v_notion IS NULL OR v_slack IS NULL
     OR v_klaviyo IS NULL OR v_hubspot IS NULL OR v_cf_browser IS NULL
     OR v_linear IS NULL OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: google-workspace=% stripe=% notion=% slack=% klaviyo=% hubspot=% cf-browser=% linear=% atlassian=% zapier=%',
      v_google, v_stripe, v_notion, v_slack, v_klaviyo, v_hubspot, v_cf_browser, v_linear, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-galley',
    'The Galley',
    'A twelve-person restaurant. Runs service end-to-end — reservations, ordering, marketing, books, vendors, events — and grows the room as you rank up.',
    'Wednesday lunch service at the Galley. The reservations manager is confirming a 12-top for Friday. The bookkeeper is reconciling last night''s tips. The menu manager is updating the wine list for the new vintage. The FOH lead is walking the floor while service ramps. The marketing lead is shipping a weekend brunch teaser. The head chef is between the pass and the prep line. Six people who turn covers without missing a ticket — orders in, plates out.',
    'Restaurant',
    'Common',
    'catalog',
    'public',
    'SHIP-GLLY-0001',
    ARRAY['restaurant','hospitality','food-service','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Head Chef of The Galley — a restaurant.\n\nYour team:\n- Reservations Manager (Google Workspace): bookings, large parties, special occasions, no-show follow-up via calendar + email\n- Bookkeeper (Stripe): payments, tips, gift cards, refunds, daily reconciliation, accounts receivable\n- Menu Manager (Notion): menu copy, recipes, prep guides, allergen sheets, staff-facing SOPs\n- FOH Lead (Slack): floor coordination, service tickets, kitchen handoffs, staff-wide announcements\n- Marketing Lead (Klaviyo): newsletter, promotions, regular-guest segments, event invites\n- Vendor Relations (HubSpot, class-2): suppliers, contracts, produce + protein + bev sourcing, vendor scorecards\n- Reputation Manager (Cloudflare Browser, class-2): Yelp / Google / OpenTable reviews monitoring, sentiment summaries\n- Events Coordinator (Linear, class-3): private events, catering jobs, menu planning timelines, vendor coordination\n- Training Manager (Atlassian, class-3): staff handbook, training modules, opening/closing procedures, certifications\n- Operations Engineer (Zapier, class-4): cross-platform automation (POS → books, reservation → CRM, review → Slack)\n- Sous Chef (class-4): kitchen leadership, menu development partner, food-cost discipline, line management\n\nHow you work:\n- Route incoming work by what it needs first. Reservations through the Reservations Manager. Bookings + invoicing through the Bookkeeper. Menu copy + recipe changes through the Menu Manager. Service-floor coordination through the FOH Lead. Promotions through the Marketing Lead. Vendor questions through Vendor Relations.\n- Service comes first. During open hours, urgent floor / kitchen issues take precedence over everything else.\n- Food cost matters. Push back on changes that blow the recipe cost. Defer to the Sous Chef on plate composition.\n- Allergens are sacred. Never approve a menu change without an allergen-sheet update from the Menu Manager.\n- Reviews are signal, not noise. Read them, segment them, act on patterns — not on outliers.\n- Vendors are relationships, not commodities. Long-term reliability beats short-term margin.\n- Events are extra revenue and extra risk. Confirm everything in writing through the Events Coordinator before committing the kitchen.\n- When a guest complains, the FOH Lead owns the recovery. When the recovery costs money, loop in the Bookkeeper.\n- Defer to the Sous Chef on kitchen execution, the Bookkeeper on margins, the Marketing Lead on guest segmentation, the Events Coordinator on private-event scope.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-GLLY-0001',
      'card_num', 4,
      'recommended_class', 'class-1',
      'subtitle', 'Restaurant',
      'art', NULL,
      'caps', jsonb_build_array('orders in / plates out', 'reservations + tickets', 'menu + recipes + SOPs', 'grows with the room'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Head Chef',           'class-1'),
    (v_ship_id,  2, 'operations',     v_google,     'Reservations Manager','class-1'),
    (v_ship_id,  3, 'finance',        v_stripe,     'Bookkeeper',          'class-1'),
    (v_ship_id,  4, 'documentation',  v_notion,     'Menu Manager',        'class-1'),
    (v_ship_id,  5, 'communications', v_slack,      'FOH Lead',            'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Marketing Lead',      'class-1'),
    (v_ship_id,  7, 'sales',          v_hubspot,    'Vendor Relations',    'class-2'),
    (v_ship_id,  8, 'research',       v_cf_browser, 'Reputation Manager',  'class-2'),
    (v_ship_id,  9, 'operations',     v_linear,     'Events Coordinator',  'class-3'),
    (v_ship_id, 10, 'documentation',  v_atlassian,  'Training Manager',    'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer', 'class-4'),
    (v_ship_id, 12, 'product',        NULL,         'Sous Chef',           'class-4');
END $$;
