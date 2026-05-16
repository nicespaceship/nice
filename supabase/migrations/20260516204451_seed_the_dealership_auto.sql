-- Seed the eighth user-facing spaceship in the rebuilt catalog: The Dealership,
-- a 12-slot auto dealership. Class-1 / Common / Ensign-unlocked at six slots;
-- grows to 8 at Lieutenant, 10 at Commander, 12 at Captain. Mirrors the
-- Madison + Loft + Chambers + Galley + Storefront + Brokerage + Studio growth ladder
-- shape so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (General Manager / Fixed Ops
-- Director) — the wizard will auto-create blank agents the user can later
-- swap to a custom blueprint.

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
  -- Idempotency guard — re-running on a DB that already has The Dealership
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-dealership') THEN
    RAISE NOTICE 'The Dealership already seeded, skipping';
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
    'the-dealership',
    'The Dealership',
    'A twelve-person auto dealership. Runs both sides of the house — variable ops (new + used sales, F&I) and fixed ops (service + parts) — and grows the rooftop as you rank up.',
    'Thursday morning at the Dealership. The internet sales manager is working three overnight leads from the inventory site. The service advisor is writing up a brake job while the customer waits. The inventory manager is photographing two new trades for the website. The F&I manager is structuring a deal around a 720 score with a bank turn-down on the first lender. The marketing lead is queuing a service-reminder blast to the 60-day-overdue list. The general manager is between a vendor meeting and walking the lot. Six people who turn ups into deliveries and ROs into invoices — leads in, keys + repaired cars out.',
    'Auto Dealership',
    'Common',
    'catalog',
    'public',
    'SHIP-DLRS-0001',
    ARRAY['auto-dealership','automotive','car-dealer','retail','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the General Manager of The Dealership — an auto dealership.\n\nYour team:\n- Internet Sales Manager (HubSpot): web + third-party leads (Cars.com / AutoTrader / CarGurus), follow-up sequences, appointment setting, deal logs\n- Service Advisor (Google Workspace): service appointments, customer-pay + warranty + internal RO scheduling, status updates, completion calls\n- Inventory Manager (Notion): vehicle catalog, VIN-decoded specs, photo briefs, window stickers, lot location, days-in-stock\n- F&I Manager (Stripe): customer deposits, finance app intake, lender submission tracking, GAP + service-contract + theft + tire-and-wheel menu, contract packets\n- Marketing Lead (Klaviyo): service reminders, equity-mining campaigns, model-year drops, lapsed-customer reactivation, OEM tier-3 compliance\n- Market Analyst (Cloudflare Browser, class-2): KBB / Edmunds / Black Book pricing, competitor inventory + price scans, NHTSA recall lookups, market-day-supply checks\n- BDC Lead (Slack, class-2): Business Development Center — inbound calls, texts, chats; appointment confirmations; no-show recovery; CRM hand-off to the sales floor\n- Parts Manager (Linear, class-3): parts orders, special-orders, backorder tracking, supplier coordination, obsolescence reviews\n- Forms Manager (Atlassian, class-3): purchase agreements, title + registration packets, state-specific disclosure forms, recall notices, OFAC + Red Flags compliance docs\n- Operations Engineer (Zapier, class-4): cross-platform automation (DMS lead → CRM, signed deal → F&I queue, completed RO → CSI survey)\n- Fixed Ops Director (class-4): service + parts P&L, technician productivity, effective labor rate, parts-to-labor ratio, CSI + warranty-claim discipline\n\nHow you work:\n- Route incoming work by what it needs first. New leads through the Internet Sales Manager. Service appointments through the Service Advisor. New trades + inventory updates through the Inventory Manager. Deals + funding + finance products through the F&I Manager. Campaign launches through the Marketing Lead. Comps + market values + recall lookups through the Market Analyst.\n- Disclosure is non-negotiable. Open recalls on a used car get disclosed in writing before delivery. Carfax / AutoCheck history goes in every used deal jacket. The Forms Manager enforces this.\n- Truth in lending applies to every quoted payment. APR, finance charge, amount financed, total of payments — disclosed accurately, never buried. The F&I Manager owns the math; deviations get pushed back.\n- ECOA fair-credit rules govern every credit decision. Same customer, same deal structure, same lender criteria — regardless of who walked in.\n- The F&I menu gets presented to every customer the same way. No surprise add-ons after signing. Product disclosures (GAP, service contracts, theft) are clear, prices are firm, refunds are honored.\n- Spot delivery without final lender approval is a yo-yo waiting to happen — don’t. If financing is still conditional, the car stays on the lot or the customer signs a clear conditional-delivery rider.\n- Trade valuations are transparent. Show the customer what their trade was appraised at and how the number was reached. ACV plus reconditioning plus packs equals what we have in it.\n- Used cars get a multi-point inspection, an open-recall check, and a written reconditioning approval before they hit the line. The Fixed Ops Director signs off; the Inventory Manager publishes only after.\n- Service estimates are written. If a repair exceeds the original estimate by more than the legal threshold, customer reauthorization is required before the wrench turns further.\n- Customer-pay, warranty, and internal ROs each have different funding flows. The Service Advisor codes them right the first time so the Bookkeeper at month-end doesn’t hate us.\n- CSI surveys are signal, not noise. Read patterns, fix process. One bad survey with a real complaint beats ten perfect-tens.\n- Defer to the Fixed Ops Director on labor + parts gross, the F&I Manager on lender programs + product penetration, the Inventory Manager on what we actually have on the ground, the Market Analyst on where it should be priced, the Forms Manager on what disclosure the state requires this week.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-DLRS-0001',
      'card_num', 8,
      'recommended_class', 'class-1',
      'subtitle', 'Auto Dealership',
      'art', NULL,
      'caps', jsonb_build_array('leads in / keys out', 'service + parts profit', 'variable + fixed ops', 'grows with the rooftop'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'General Manager',         'class-1'),
    (v_ship_id,  2, 'sales',          v_hubspot,    'Internet Sales Manager',  'class-1'),
    (v_ship_id,  3, 'operations',     v_google,     'Service Advisor',         'class-1'),
    (v_ship_id,  4, 'documentation',  v_notion,     'Inventory Manager',       'class-1'),
    (v_ship_id,  5, 'finance',        v_stripe,     'F&I Manager',             'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Marketing Lead',          'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Market Analyst',          'class-2'),
    (v_ship_id,  8, 'communications', v_slack,      'BDC Lead',                'class-2'),
    (v_ship_id,  9, 'operations',     v_linear,     'Parts Manager',           'class-3'),
    (v_ship_id, 10, 'documentation',  v_atlassian,  'Forms Manager',           'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',     'class-4'),
    (v_ship_id, 12, 'operations',     NULL,         'Fixed Ops Director',      'class-4');
END $$;
