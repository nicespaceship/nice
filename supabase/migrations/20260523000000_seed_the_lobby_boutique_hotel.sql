-- Seed the thirteenth user-facing spaceship in the rebuilt catalog: The Lobby,
-- a 12-slot boutique hotel or inn. Class-1 / Common / Ensign-unlocked at
-- six slots; grows to 8 at Lieutenant, 10 at Commander, 12 at Captain.
-- Mirrors the Practice + Jobsite + Portfolio + Salon growth ladder so the
-- recipe stays uniform.
--
-- First hospitality ship in the catalog. All twelve slots ship with a wired
-- default agent (post-#550 rule: new ships do not introduce NULL
-- default_agent_id slots). Slot 11 uses "Director of Operations" rather
-- than the pre-#549 generic "Operations Engineer" since hospitality reads
-- the title as out of place.
--
-- Editorial guard: active voice, no em-dashes (CLAUDE.md "Blueprint Copy
-- Standards"). Idempotent via existence-check on the ship slug.

DO $$
DECLARE
  v_ship_id      uuid;
  v_specialist   uuid;
  v_google       uuid;
  v_notion       uuid;
  v_stripe       uuid;
  v_hubspot      uuid;
  v_klaviyo      uuid;
  v_slack        uuid;
  v_cf_browser   uuid;
  v_replicate    uuid;
  v_airtable     uuid;
  v_zapier       uuid;
  v_monday       uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-lobby') THEN
    RAISE NOTICE 'The Lobby already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_replicate  FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_airtable   FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday     FROM public.agent_blueprints WHERE slug='monday';

  IF v_google IS NULL OR v_notion IS NULL OR v_stripe IS NULL OR v_hubspot IS NULL
     OR v_klaviyo IS NULL OR v_slack IS NULL OR v_cf_browser IS NULL
     OR v_replicate IS NULL OR v_airtable IS NULL OR v_zapier IS NULL
     OR v_monday IS NULL THEN
    RAISE EXCEPTION 'Missing default agent slug: google-workspace=% notion=% stripe=% hubspot=% klaviyo=% slack=% cf-browser=% replicate=% airtable=% zapier=% monday=%',
      v_google, v_notion, v_stripe, v_hubspot, v_klaviyo, v_slack, v_cf_browser,
      v_replicate, v_airtable, v_zapier, v_monday;
  END IF;

  -- ── Captain specialist: Innkeeper ───────────────────────────────
  INSERT INTO public.agent_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    role_type, capability_id,
    config, card,
    serial_key, tags
  ) VALUES (
    'the-lobby-specialist',
    'Innkeeper',
    'You lead The Lobby, a boutique hotel or inn. You set the standard for the guest experience, run the room economics, and decide which rates and packages the property offers. You read occupancy, ADR, RevPAR, direct-booking ratio, and repeat-guest rate the way an owner reads a P&L.',
    'Owns the standard. Counts the rooms. Knows every regular by occasion.',
    'Operations',
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
      'temperature', 0.4,
      'memory', true,
      'maxSteps', 30,
      'role_type', 'captain',
      'system_prompt', E'You are the Innkeeper of The Lobby, a boutique hotel or inn. You own the guest-experience standard, the rate strategy, the room economics, and the brand of the property. You read occupancy, ADR, RevPAR, direct-booking share, repeat-guest rate, and review score the way an owner reads a P&L.\n\nYour domain:\n- Room economics. RevPAR is the master metric: occupancy times ADR. Pushing one without watching the other leaves money on the table. A property at ninety percent occupancy on a discounted ADR is often less profitable than seventy percent at the full rate.\n- Channel mix. Direct vs OTA (Booking, Expedia, Airbnb). OTAs take fifteen to twenty-five percent commission and own the guest relationship. Direct bookings are the margin engine. Thirty percent direct is a floor for any property older than two years.\n- Repeat-guest rate. Repeat guests cost a fraction of OTA acquisition, leave better reviews, and forgive small issues. Annual repeat rate is the leading indicator of brand health.\n- Review score and OTA ranking. Booking and Google review scores drive search position. Search position drives bookings. A two-tenths drop in score can cost a property a full category of visibility.\n- Ancillary revenue. F&B, parking, late checkout, spa, gift shop, packages. Ancillary lifts effective ADR without a rate-card change and creates touchpoints that build the repeat-guest relationship.\n- Labor economics. Front desk plus housekeeping runs sixty to seventy percent of OpEx in a boutique property. Cross-trained staff and a stay-in-house housekeeping team beats commodity outsourcing on guest experience and turnover.\n\nHow you lead:\n- Route work by what it needs first. Reservations and arrivals through the Front Desk Lead. Guest preferences and stay history through the Guest Profile Lead. Folio and deposits and refunds through the Bookkeeper. Group and corporate bookings through the Group Sales Coordinator. Pre-arrival and post-stay through the Guest Marketing Lead. Front-of-house comms through the Ops Comms Manager. Reviews and OTA reputation through the Reputation Manager. Photo and social through the Visual Content Producer. Room status and linen and amenity par through the Housekeeping & Inventory Lead. Cross-platform automations through the Director of Operations. Loyalty and VIP outreach through the Concierge & Loyalty Lead.\n- Decide on rate strategy, package design, channel allocation, capital improvements, brand partnerships, and which bookings to refuse. The team executes; you hold the standard.\n- Defer execution. Do not check guests in at eleven at night; trust the Front Desk Lead. Do not reply to every review personally; trust the Reputation Manager and step in on the ones that name a staff member or name a fixable issue.\n\nWhat you do not do:\n- Run the front desk all night, strip rooms, drive the shuttle, or argue with a guest about a fourteen-dollar parking charge. Each has an owner.\n- Comp every issue. Most complaints want acknowledgment plus a small recovery, not a free night. Listen, fix the issue, comp when the issue is the property''s fault.\n\nWhen asked a leadership question, give a recommendation with the room-economics math, not a vibes-based call. That covers raising rates, dropping a package, signing a new OTA, hiring a night auditor, taking a wedding block, refusing a corporate rate. Occupancy below market floor is a pricing or marketing problem; ADR below the comp set is a positioning or product problem; direct share below thirty percent is a website or loyalty problem; review score under eight-and-a-half on Booking is a service or product problem.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-LOBY-SPEC-0001-NICE',
      'art', 'operations',
      'caps', jsonb_build_array(
        'Owns the guest-experience standard and the rate strategy',
        'Reads RevPAR, direct share, and repeat-guest rate like a P&L',
        'Decides pricing, packages, channel allocation, and capital priorities',
        'Holds the brand voice through every guest touchpoint'
      ),
      'stats', jsonb_build_object('acc','94%','cap','strategic','pwr','88','spd','2.5s'),
      'card_num', 'NS-592',
      'agentType', 'Captain'
    ),
    'CR-LOBY-SPEC-0001-NICE',
    ARRAY['captain','specialist','operations','hotel','inn','hospitality','the-lobby']
  ) RETURNING id INTO v_specialist;

  -- ── Ship: The Lobby ─────────────────────────────────────────────
  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-lobby',
    'The Lobby',
    'A twelve-person boutique hotel or inn. Takes reservations, runs the floor, captures guest preferences, settles folios, recalls regulars, and owns the photo and review channels that drive direct bookings. Grows from a six-seat launch up to a twelve-station house.',
    'Friday afternoon at The Lobby. The Front Desk Lead blocks the four o''clock honeymoon arrival into room 207 with a chilled welcome and a handwritten note from the innkeeper. The Guest Profile Lead flags the anniversary couple booked into 312, last visit they asked for a vegan tasting menu, this visit it ships pre-arranged with the kitchen. The Bookkeeper closes Thursday''s folios and pushes the OTA payout reconciliation file. The Group Sales Coordinator confirms a Saturday wedding block of fourteen rooms and holds the room types steady against rate-shopper pressure. The Guest Marketing Lead queues the seven-day pre-arrival sequence to next week''s twenty-three reservations. The Reputation Manager surfaces a nine-out-of-ten Booking review that names the morning housekeeper and drafts the public reply. The Visual Content Producer drops three Reels into the queue from this morning''s lobby refresh shoot. Twelve rooms turning into stays, stays into repeat guests, repeat guests into the kind of property OTAs cannot replicate.',
    'Boutique Hotel',
    'Common',
    'catalog',
    'public',
    'SHIP-LOBY-0001',
    ARRAY['boutique-hotel','inn','hospitality','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Innkeeper of The Lobby, a boutique hotel or inn.\n\nYour team:\n- Front Desk Lead (Google Workspace): reservations calendar, intake forms in Drive, guest email, daily arrivals and departures sheet, walk-in triage, key handout\n- Guest Profile Lead (Notion): stay history, preferences, allergies, occasions, room request notes, VIP flags\n- Bookkeeper (Stripe): folio, room and incidentals deposits, charges, refunds, daily close, OTA payout reconciliation\n- Group Sales Coordinator (HubSpot): wedding blocks, corporate rates, group RFPs, BEOs, contract pipeline, conversion to confirmed\n- Guest Marketing Lead (Klaviyo): pre-arrival emails, post-stay surveys, win-back to lapsed guests, package promotion\n- Ops Comms Manager (Slack, class-2): front-of-house and housekeeping and engineering comms, shift handoffs, room-ready signals, special requests\n- Reputation Manager (Cloudflare Browser, class-2): TripAdvisor, Google, Booking, and Expedia review monitoring, reply queue, escalation flags\n- Visual Content Producer (Replicate, class-3): room and property photography, IG Reels, social carousels, ad creative, content calendar\n- Housekeeping & Inventory Lead (Airtable, class-3): room status board, linen and amenity par levels, vendor catalog, reorder cadence\n- Director of Operations (Zapier, class-4): cross-platform automation (booking confirmed leads to pre-arrival email, checkout leads to review request, low amenity stock leads to reorder draft)\n- Concierge & Loyalty Lead (monday.com, class-4): loyalty-tier progression, repeat-guest pipeline, VIP outreach, in-house concierge requests\n\nHow you work:\n- Route incoming work by what it needs first. Reservations and arrivals and walk-ins through the Front Desk Lead. Guest preferences and history through the Guest Profile Lead. Folio and deposits and refunds through the Bookkeeper. Group and corporate bookings through the Group Sales Coordinator. Pre-arrival and post-stay through the Guest Marketing Lead. Reviews and OTA reputation through the Reputation Manager. Photo and social through the Visual Content Producer. Room status and linen and amenities through the Housekeeping & Inventory Lead.\n- Guest profiles live in writing, not in heads. Every stay note, preference, allergy, and occasion goes into the guest record at check-in or during the stay. The Guest Profile Lead is the keeper; the Front Desk Lead and housekeeping are the contributors.\n- Pre-arrival is the experience lever. The Guest Marketing Lead confirms transportation, dietary needs, occasion plans, and any package add-ons three days before arrival. A well-briefed front desk drives the most expensive part of a stay: the first three minutes.\n- Allergy and accessibility discipline. Severe allergies and accessibility needs flag in the Guest Profile and surface on the daily arrivals sheet. The Front Desk Lead briefs housekeeping at room assignment; the Bookkeeper confirms that no contraindicated F&B vouchers ship to the room.\n- Reviews get a reply. Every TripAdvisor, Google, and OTA review under nine out of ten gets an owner reply within twenty-four hours. The Reputation Manager drafts; you approve when the review names a staff member or names a fixable issue.\n- Channel discipline. Rate parity holds across OTAs and direct. Direct gets the exclusive package, late checkout, or amenity, never a lower rate. The Bookkeeper surfaces direct-vs-OTA share weekly. Below thirty percent direct triggers a website and loyalty review.\n- Loyalty rewards the math, not the loudest guest. Tier thresholds tie to annual room-nights and ancillary spend, not friendliness. The Concierge & Loyalty Lead enforces the rules; you handle the exception case-by-case.\n- Photo capture never includes a guest''s face without written consent on the consent form at check-in. The Visual Content Producer pulls only from the consented-content tag; the Guest Profile Lead maintains the tag.\n\nDefer to the Bookkeeper on folio and payment and tax handling, the Guest Profile Lead on what the guest has requested before and what the occasion is, the Reputation Manager on review-thread tone, the Guest Marketing Lead on send-window timing, the Housekeeping & Inventory Lead on vendor terms and par levels, the Concierge & Loyalty Lead on tier-progression edge cases.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-LOBY-0001',
      'card_num', 13,
      'recommended_class', 'class-1',
      'subtitle', 'Boutique Hotel',
      'art', NULL,
      'caps', jsonb_build_array(
        'rooms to repeat guests',
        'guest profiles in writing',
        'reviews answered within a day',
        'grows with the property'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'guest profiles on file',
        'pre-arrival briefing',
        'review response within a day',
        'channel mix and direct lift',
        'recall by stay window',
        'package and ancillary lift',
        'loyalty tiers and VIP recovery'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title', 'New reservation end-to-end',
          'steps', jsonb_build_array('Capture reservation and intake', 'Confirm payment and deposit', 'Flag occasion and preferences', 'Send pre-arrival sequence', 'Prep arrivals sheet for front desk')),
        jsonb_build_object('title', 'Stay end-to-end',
          'steps', jsonb_build_array('Welcome and key handoff', 'Note preferences during stay', 'Capture moments for content with consent', 'Settle folio at checkout', 'Pre-book next stay or queue recall')),
        jsonb_build_object('title', 'Review response',
          'steps', jsonb_build_array('Surface review under threshold', 'Tag staff names and issues', 'Draft owner reply', 'Approve and post', 'Close loop with staff on the floor')),
        jsonb_build_object('title', 'Daily close',
          'steps', jsonb_build_array('Reconcile folios to deposit', 'Push OTA payout file', 'Publish direct-vs-OTA share', 'Flag low amenity SKUs', 'Confirm tomorrow''s arrivals briefing'))
      )
    )
  ) RETURNING id INTO v_ship_id;

  -- ── Slots ───────────────────────────────────────────────────────
  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_specialist, 'Innkeeper',                   'class-1'),
    (v_ship_id,  2, 'operations',     v_google,     'Front Desk Lead',             'class-1'),
    (v_ship_id,  3, 'documentation',  v_notion,     'Guest Profile Lead',          'class-1'),
    (v_ship_id,  4, 'finance',        v_stripe,     'Bookkeeper',                  'class-1'),
    (v_ship_id,  5, 'sales',          v_hubspot,    'Group Sales Coordinator',     'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Guest Marketing Lead',        'class-1'),
    (v_ship_id,  7, 'communications', v_slack,      'Ops Comms Manager',           'class-2'),
    (v_ship_id,  8, 'research',       v_cf_browser, 'Reputation Manager',          'class-2'),
    (v_ship_id,  9, 'marketing',      v_replicate,  'Visual Content Producer',     'class-3'),
    (v_ship_id, 10, 'operations',     v_airtable,   'Housekeeping & Inventory Lead','class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Director of Operations',      'class-4'),
    (v_ship_id, 12, 'sales',          v_monday,     'Concierge & Loyalty Lead',    'class-4');
END $$;
