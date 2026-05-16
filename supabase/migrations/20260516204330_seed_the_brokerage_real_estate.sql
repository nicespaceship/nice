-- Seed the sixth user-facing spaceship in the rebuilt catalog: The Brokerage,
-- a 12-slot real estate agency. Class-1 / Common / Ensign-unlocked at six slots;
-- grows to 8 at Lieutenant, 10 at Commander, 12 at Captain. Mirrors the
-- Madison + Loft + Chambers + Galley + Storefront growth ladder shape so
-- the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Broker-Owner / Recruiting Lead) —
-- the wizard will auto-create blank agents the user can later swap to a
-- custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_hubspot    uuid;
  v_google     uuid;
  v_notion     uuid;
  v_stripe     uuid;
  v_klaviyo    uuid;
  v_cf_browser uuid;
  v_slack      uuid;
  v_linear     uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Brokerage
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-brokerage') THEN
    RAISE NOTICE 'The Brokerage already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_hubspot IS NULL OR v_google IS NULL OR v_notion IS NULL OR v_stripe IS NULL
     OR v_klaviyo IS NULL OR v_cf_browser IS NULL OR v_slack IS NULL
     OR v_linear IS NULL OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: hubspot=% google-workspace=% notion=% stripe=% klaviyo=% cf-browser=% slack=% linear=% atlassian=% zapier=%',
      v_hubspot, v_google, v_notion, v_stripe, v_klaviyo, v_cf_browser, v_slack, v_linear, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-brokerage',
    'The Brokerage',
    'A twelve-person real estate agency. Runs deals end-to-end — leads, listings, showings, contracts, closings — and grows the practice as you rank up.',
    'Wednesday at the Brokerage. The lead manager is qualifying three Zillow inquiries before the inbox closes. The showings coordinator is rearranging a Saturday tour around a kid''s soccer game. The listings manager is staging photos for a new exclusive and writing the copy. The transaction coordinator is chasing a wire confirmation for tomorrow''s closing. The marketing lead is queuing a just-listed email to the buyer farm. The broker-owner is between a counter-offer call and a coaching session. Six people who turn front-door interest into signed papers — leads in, keys out.',
    'Real Estate',
    'Common',
    'catalog',
    'public',
    'SHIP-BRKR-0001',
    ARRAY['real-estate','brokerage','agency','realtor','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Broker-Owner of The Brokerage — a real estate agency.\n\nYour team:\n- Lead Manager (HubSpot): buyer + seller leads, qualification, contact records, nurture sequences, source attribution\n- Showings Coordinator (Google Workspace): calendar, tour scheduling, open-house blocks, agent availability\n- Listings Manager (Notion): property database, listing copy, photo briefs, comps notes, MLS prep\n- Transaction Coordinator (Stripe): earnest money tracking, commission splits, closing fee reconciliation, agent payouts\n- Marketing Lead (Klaviyo): just-listed emails, open-house invites, buyer + seller drip campaigns, monthly market reports\n- Market Analyst (Cloudflare Browser, class-2): Zillow / Redfin / Realtor.com comp pulls, competitor listing scans, neighborhood market data\n- Closing Liaison (Slack, class-2): lender, title, inspector, appraiser coordination — keeps the third parties moving\n- Closing Coordinator (Linear, class-3): contract-to-close checklist, contingency deadlines, inspection / appraisal / financing milestone tracking\n- Forms Manager (Atlassian, class-3): purchase agreements, disclosures, addenda library, state-specific forms, signed-doc archive\n- Operations Engineer (Zapier, class-4): cross-platform automation (new lead → CRM, signed contract → checklist, closing complete → commission split)\n- Recruiting Lead (class-4): agent recruiting + retention, brokerage growth, split negotiations, onboarding new agents\n\nHow you work:\n- Route incoming work by what it needs first. New leads through the Lead Manager. Showing requests through the Showings Coordinator. New listings through the Listings Manager. Earnest money + commission questions through the Transaction Coordinator. Email campaigns through the Marketing Lead. Comp pulls through the Market Analyst.\n- Disclosure is non-negotiable. Material facts get disclosed in writing — every time, on every property, regardless of whose interest it serves short-term.\n- Deadlines are the deal. Contingency dates, financing deadlines, inspection windows — if one slips without an extension in writing, the contract is at risk. The Closing Coordinator surfaces the soonest one first.\n- Dual agency is a regulated minefield. Default to single representation; if dual agency comes up, written informed consent before anything substantive happens.\n- Fair-housing rules apply to every public communication — listings, emails, social, scripts. The Marketing Lead reviews copy through that lens before sending.\n- Trust accounts stay trust accounts. Earnest money is held, not borrowed against. The Transaction Coordinator enforces the firewall.\n- Comps are evidence, not opinion. Three to five recent, like-kind, like-area sales support every list price recommendation.\n- Defer to the Listings Manager on the source-of-truth property data, the Market Analyst on neighborhood pricing trends, the Forms Manager on which addendum applies, the Closing Coordinator on what blocks the closing, the Recruiting Lead on split economics and agent fit.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-BRKR-0001',
      'card_num', 6,
      'recommended_class', 'class-1',
      'subtitle', 'Real Estate',
      'art', NULL,
      'caps', jsonb_build_array('leads in / keys out', 'listings + showings + comps', 'contract-to-close discipline', 'grows with the brokerage'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Broker-Owner',          'class-1'),
    (v_ship_id,  2, 'sales',          v_hubspot,    'Lead Manager',          'class-1'),
    (v_ship_id,  3, 'operations',     v_google,     'Showings Coordinator',  'class-1'),
    (v_ship_id,  4, 'documentation',  v_notion,     'Listings Manager',      'class-1'),
    (v_ship_id,  5, 'finance',        v_stripe,     'Transaction Coordinator','class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Marketing Lead',        'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Market Analyst',        'class-2'),
    (v_ship_id,  8, 'communications', v_slack,      'Closing Liaison',       'class-2'),
    (v_ship_id,  9, 'operations',     v_linear,     'Closing Coordinator',   'class-3'),
    (v_ship_id, 10, 'documentation',  v_atlassian,  'Forms Manager',         'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',   'class-4'),
    (v_ship_id, 12, 'sales',          NULL,         'Recruiting Lead',       'class-4');
END $$;
