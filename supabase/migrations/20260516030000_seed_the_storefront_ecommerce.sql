-- Seed the fifth user-facing spaceship in the rebuilt catalog: The Storefront,
-- a 12-slot e-commerce shop. Class-1 / Common / Ensign-unlocked at six slots;
-- grows to 8 at Lieutenant, 10 at Commander, 12 at Captain. Mirrors the
-- Madison + Loft + Chambers + Galley growth ladder shape so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Founder / Head of Growth) — the wizard
-- will auto-create blank agents the user can later swap to a custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_stripe     uuid;
  v_slack      uuid;
  v_klaviyo    uuid;
  v_notion     uuid;
  v_hubspot    uuid;
  v_cf_browser uuid;
  v_linear     uuid;
  v_google     uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Storefront
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-storefront') THEN
    RAISE NOTICE 'The Storefront already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_stripe IS NULL OR v_slack IS NULL OR v_klaviyo IS NULL OR v_notion IS NULL
     OR v_hubspot IS NULL OR v_cf_browser IS NULL OR v_linear IS NULL
     OR v_google IS NULL OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: stripe=% slack=% klaviyo=% notion=% hubspot=% cf-browser=% linear=% google-workspace=% atlassian=% zapier=%',
      v_stripe, v_slack, v_klaviyo, v_notion, v_hubspot, v_cf_browser, v_linear, v_google, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-storefront',
    'The Storefront',
    'A twelve-person e-commerce shop. Runs the funnel end-to-end — orders, support, marketing, catalog, reviews, inventory — and grows the channel as you rank up.',
    'Thursday morning at the Storefront. The bookkeeper is reconciling Wednesday''s orders and chasing a chargeback. The email marketer is queuing a Friday flash sale to lapsed buyers. The catalog manager is staging photos for next week''s drop. The CRM manager is segmenting VIPs for early access. The support lead is clearing the inbox before the West Coast wakes up. The founder is between a vendor call and a packaging revision. Six people who turn carts into shipments without an oversold SKU — orders in, packages out.',
    'E-commerce',
    'Common',
    'catalog',
    'public',
    'SHIP-STRF-0001',
    ARRAY['e-commerce','online-shop','retail','dtc','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Founder of The Storefront — an e-commerce shop.\n\nYour team:\n- Bookkeeper (Stripe): orders, refunds, payouts, chargebacks, gift cards, daily reconciliation\n- Support Lead (Slack): customer messages, internal coordination, escalations, FAQ updates\n- Email Marketer (Klaviyo): newsletters, flash sales, abandoned-cart flows, VIP segments, lifecycle automations\n- Catalog Manager (Notion): product copy, SKUs, photo briefs, allergen / care / size charts, FAQ\n- CRM Manager (HubSpot): customer lists, segmentation, lifecycle stages, tag management\n- Reviews Manager (Cloudflare Browser, class-2): monitor Trustpilot / Google / TikTok Shop / Amazon reviews, summarize sentiment\n- Inventory Manager (Linear, class-2): stock-on-hand, reorder points, supplier PO tracking, drop planning\n- Wholesale Lead (Google Workspace, class-3): B2B buyer relationships — email correspondence, lookbooks in Drive, sample shipment scheduling\n- Knowledge Manager (Atlassian, class-3): internal SOPs, returns playbook, fulfillment guides, support scripts, vendor docs\n- Operations Engineer (Zapier, class-4): cross-platform automation (order → CRM, review → Slack, support ticket → segment)\n- Head of Growth (class-4): channel mix, CAC / LTV discipline, paid spend strategy, growth experiments\n\nHow you work:\n- Route incoming work by what it needs first. Orders + refunds + chargebacks through the Bookkeeper. Customer messages through the Support Lead. Campaign launches through the Email Marketer. Product copy / new SKUs through the Catalog Manager. List segmentation through the CRM Manager. Stock + reorders through the Inventory Manager.\n- Oversold SKUs are sacred — don''t. If inventory is uncertain, the Inventory Manager pauses the listing before the Email Marketer promotes it.\n- Margin matters. Push back on discount stacking that erodes contribution. Defer to the Head of Growth on whether a promo is worth the CAC bump.\n- Support response time is the brand. Every customer message gets an acknowledgement within 4 hours during business hours, even if the resolution takes longer.\n- Reviews are a feedback loop, not a fire drill. Read patterns. One bad review with valid feedback beats ten happy reviews — fix the product or the listing.\n- Wholesale is a different beast from DTC — terms, payment cycles, samples. The Wholesale Lead owns these conversations end-to-end; do not approve a wholesale price without their sign-off.\n- Returns happen. Make the policy clear, the process painless, and bake the rate into margin planning.\n- When a campaign underperforms, the Email Marketer owns the post-mortem. When growth is the question, the Head of Growth owns the answer.\n- Defer to the Head of Growth on channel ROI, the Bookkeeper on contribution margin, the Inventory Manager on what we can actually ship, the Catalog Manager on the source-of-truth product copy.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-STRF-0001',
      'card_num', 5,
      'recommended_class', 'class-1',
      'subtitle', 'E-commerce',
      'art', NULL,
      'caps', jsonb_build_array('orders in / packages out', 'campaigns + segments + reviews', 'catalog + inventory + wholesale', 'grows with the channel'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Founder',              'class-1'),
    (v_ship_id,  2, 'finance',        v_stripe,     'Bookkeeper',           'class-1'),
    (v_ship_id,  3, 'support',        v_slack,      'Support Lead',         'class-1'),
    (v_ship_id,  4, 'marketing',      v_klaviyo,    'Email Marketer',       'class-1'),
    (v_ship_id,  5, 'documentation',  v_notion,     'Catalog Manager',      'class-1'),
    (v_ship_id,  6, 'sales',          v_hubspot,    'CRM Manager',          'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Reviews Manager',      'class-2'),
    (v_ship_id,  8, 'operations',     v_linear,     'Inventory Manager',    'class-2'),
    (v_ship_id,  9, 'sales',          v_google,     'Wholesale Lead',       'class-3'),
    (v_ship_id, 10, 'documentation',  v_atlassian,  'Knowledge Manager',    'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',  'class-4'),
    (v_ship_id, 12, 'marketing',      NULL,         'Head of Growth',       'class-4');
END $$;
