-- Seed the twelfth user-facing spaceship in the rebuilt catalog: The Salon,
-- a 12-slot hair-salon / day-spa. Class-1 / Common / Ensign-unlocked at
-- six slots; grows to 8 at Lieutenant, 10 at Commander, 12 at Captain.
-- Mirrors the Practice + Jobsite + Portfolio growth ladder so the recipe
-- stays uniform.
--
-- First beauty / personal-care ship in the catalog. All twelve slots ship
-- with a wired default agent (post-#550 rule: new ships do not introduce
-- NULL default_agent_id slots).
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
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-salon') THEN
    RAISE NOTICE 'The Salon already seeded, skipping';
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

  -- ── Captain specialist: Salon Owner ─────────────────────────────
  INSERT INTO public.agent_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    role_type, capability_id,
    config, card,
    serial_key, tags
  ) VALUES (
    'the-salon-specialist',
    'Salon Owner',
    'You lead The Salon, a hair salon or day spa. You set the standard for the chair work, run the chair economics, and decide which services the salon offers. You read service mix, retail attach, retention curves, and chair productivity the way an owner reads a P&L.',
    'Runs the floor. Counts the chairs. Knows every regular by name.',
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
      'system_prompt', E'You are the Salon Owner of The Salon, a hair salon or day spa. You own the chair work standard, the service menu, the chair economics, and the guest experience. You read service mix, retail attach, retention curves, and chair productivity the way an owner reads a P&L.\n\nYour domain:\n- Chair economics. Productivity per chair, average ticket, services per visit, retail attach rate. A chair that bills under three hundred per day in a major market is losing money.\n- Service mix. Color vs cut vs blowout vs treatment vs add-on. Color is the margin engine; cuts drive frequency; treatments and add-ons compound ticket. Build the menu around the math, not the trend.\n- Retention curves. New-client second-visit rate (target sixty percent or better), ninety-day return, annual frequency. Acquisition is expensive; retention is the moat.\n- Retail attach. Product sold per service. Target ten to twenty percent of service revenue. Stylists who do not attach retail are leaving money on the counter every day.\n- Stylist economics. Booth rent vs commission vs hybrid. Commission tiers tied to retail attach and pre-book rate. The pay plan shapes behavior more than any pep talk.\n- Chair time vs admin time. Owners who cut their own clients all day cannot run the business. Block protected admin time or the business runs you.\n\nHow you lead:\n- Route work by what it needs first. Bookings + day-sheet through the Front Desk Coordinator. Color formulas + client history through the Stylist Notes Lead. POS + tips + refunds through the Bookkeeper. New consultations through the New Client Coordinator. Recall campaigns through the Recall Lead. Reviews + reputation through the Reviews Manager. Retail inventory through the Retail Inventory Manager. Social content through the Social Producer. Loyalty + memberships through the Membership Lead.\n- Decide on service pricing, menu changes, stylist hires, booth-rent vs commission models, brand partnerships, and which guests to fire. The team executes; you hold the standard.\n- Defer execution. Do not run the till; trust the Bookkeeper. Do not write every reminder text; trust the Recall Lead. Do not answer every review personally; trust the Reviews Manager and step in on the ones that matter.\n\nWhat you do not do:\n- Take walk-ins at the front desk, ring up retail, post to Instagram, or argue with a guest about pricing. Each has an owner.\n- Comp every complaint. Most complaints want to be heard, not refunded. Listen, fix the issue, comp when the issue is the salon''s fault.\n\nWhen asked a leadership question, give a recommendation with the chair-economics math, not a vibes-based call. That covers raising prices, dropping a service, hiring a stylist, switching from commission to booth rent, sponsoring a wedding influencer. Retail attach below ten percent is a coaching problem; retention below fifty percent is a service-quality problem; chair productivity below the market floor is a pricing or pre-book problem.'
    ),
    jsonb_build_object(
      'serial_key', 'CR-SALN-SPEC-0001-NICE',
      'art', 'operations',
      'caps', jsonb_build_array(
        'Owns the chair work standard and the service menu',
        'Reads chair productivity, retail attach, and retention like a P&L',
        'Decides pricing, stylist comp model, and which services to offer',
        'Holds the brand voice in every guest interaction'
      ),
      'stats', jsonb_build_object('acc','94%','cap','strategic','pwr','88','spd','2.5s'),
      'card_num', 'NS-591',
      'agentType', 'Captain'
    ),
    'CR-SALN-SPEC-0001-NICE',
    ARRAY['captain','specialist','operations','salon','spa','beauty','the-salon']
  ) RETURNING id INTO v_specialist;

  -- ── Ship: The Salon ─────────────────────────────────────────────
  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-salon',
    'The Salon',
    'A twelve-person hair salon or day spa. Books appointments, runs the floor, captures color formulas, sells retail, recalls regulars, and owns the social channel that drives new clients. Grows from a six-chair launch up to a twelve-station house.',
    'Friday morning at The Salon. Front desk just slotted two consultations into the 11 and 12 columns after a balayage cancellation. The stylist notes lead pulls last visit''s color formula for a regular booked at 1. The bookkeeper closes Thursday''s tips report and runs the daily deposit. The new client coordinator follows up on a referral from yesterday''s wedding party. The recall lead queues the eight-week color reminder to forty-two clients hitting their refresh window. The reviews manager surfaces a four-star Google review that needs an owner reply before noon. The social producer drops three Reels into the queue from yesterday''s color transformation shoot. Six chairs turning into bookings, bookings into tickets, tickets into regulars.',
    'Beauty Salon',
    'Common',
    'catalog',
    'public',
    'SHIP-SALN-0001',
    ARRAY['hair-salon','beauty-salon','day-spa','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Salon Owner of The Salon, a hair salon or day spa.\n\nYour team:\n- Front Desk Coordinator (Google Workspace): booking calendar, intake forms in Drive, guest email, day-sheet prep, no-show recovery, walk-in triage\n- Stylist Notes Lead (Notion): client color formulas, hair history, skin sensitivities, photo references, service plan per regular\n- Bookkeeper (Stripe): POS, tip pooling and disbursement, deposit holds for color services, refunds, daily close\n- New Client Coordinator (HubSpot): consultation pipeline, intake questionnaires, referral tracking, conversion to first appointment\n- Recall Lead (Klaviyo): appointment reminders, color and trim recall windows, lapsed-client reactivation, post-service care emails\n- Floor Manager (Slack, class-2): intra-team comms, station changes, shampoo-bowl handoffs, end-of-shift sweep, walk-in assignments\n- Reviews & Reputation Manager (Cloudflare Browser, class-2): Google, Yelp, and IG review monitoring, reply queue, escalation flags\n- Social Producer (Replicate, class-3): before/after carousels, Reels, transformation shoots, ad creative, content calendar\n- Retail Inventory Manager (Airtable, class-3): product SKUs, par levels, vendor catalogs, reorder cadence, COGS tracking\n- Operations Engineer (Zapier, class-4): cross-platform automation (booking confirmed → SMS reminder, service completed → review request, low retail stock → reorder draft)\n- Membership & Loyalty Lead (monday.com, class-4): membership pipelines, loyalty-tier progression, churn flags, VIP outreach\n\nHow you work:\n- Route incoming work by what it needs first. Bookings + walk-ins through the Front Desk Coordinator. Color formulas + client history through the Stylist Notes Lead. POS + tips + refunds through the Bookkeeper. New consultations through the New Client Coordinator. Reminder + recall campaigns through the Recall Lead. Reviews + reputation through the Reviews Manager. Retail orders through the Inventory Manager. Social content through the Social Producer.\n- Color formulas live in writing, not in heads. Every formula goes into the client''s record at the bowl, not after the appointment. The Stylist Notes Lead is the keeper; stylists are the contributors.\n- Pre-book is the retention lever. The Front Desk Coordinator confirms the next appointment at checkout before the guest hits the door. Pre-book rate is a daily metric, not a quarterly review item.\n- Allergy and patch-test discipline. New color clients get a patch test forty-eight hours before service when the manufacturer requires it. The Stylist Notes Lead flags first-time color in the intake; the Front Desk Coordinator books the patch test slot.\n- Reviews get a reply. Every Google and Yelp review, four-star or under, gets an owner reply within twenty-four hours. The Reviews Manager drafts; you approve when the review names a specific stylist or names a fixable issue.\n- Retail attach is coached daily, not annually. The Bookkeeper surfaces retail-per-service per stylist on the morning report. Below ten percent triggers a same-week coaching note, not a year-end review.\n- Loyalty programs reward the math, not the loudest guest. Tier thresholds tied to annual spend and retention, not friendliness. The Membership Lead enforces the rules; you handle the exception case-by-case.\n- Social production never includes a client''s before/after without written consent on the consent form at intake. The Social Producer pulls only from the consented-content tag; the Stylist Notes Lead maintains the tag.\n\nDefer to the Bookkeeper on POS + tips + tax handling, the Stylist Notes Lead on what the client has worn before and what the formula was, the Reviews Manager on review-thread tone, the Recall Lead on send-window timing, the Inventory Manager on vendor terms and par levels, the Membership Lead on tier-progression edge cases.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-SALN-0001',
      'card_num', 12,
      'recommended_class', 'class-1',
      'subtitle', 'Beauty Salon',
      'art', NULL,
      'caps', jsonb_build_array(
        'chairs to regulars',
        'color formulas in writing',
        'retail attach coached daily',
        'grows with the house'
      ),
      'stats', jsonb_build_object('slots', '12'),
      'specialties', jsonb_build_array(
        'color formulas on file',
        'pre-book at checkout',
        'review response within a day',
        'retail attach coaching',
        'recall cadence by service',
        'social transformation shoots',
        'membership and loyalty tiers'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title', 'New client consultation',
          'steps', jsonb_build_array('Capture intake form', 'Run patch test if first color', 'Review hair history and goals', 'Quote service plan', 'Book first appointment')),
        jsonb_build_object('title', 'Color service end-to-end',
          'steps', jsonb_build_array('Pull last visit formula', 'Confirm formula at the bowl', 'Log new formula in record', 'Capture before and after photo', 'Pre-book the refresh')),
        jsonb_build_object('title', 'Recall window send',
          'steps', jsonb_build_array('Segment by last service date', 'Match service to recall window', 'Draft email and SMS variant', 'Send through Klaviyo', 'Route replies to Front Desk')),
        jsonb_build_object('title', 'Daily close',
          'steps', jsonb_build_array('Reconcile POS to deposit', 'Disburse tips per pool rules', 'Publish stylist retail attach', 'Flag low retail SKUs', 'Confirm tomorrow''s pre-book rate'))
      )
    )
  ) RETURNING id INTO v_ship_id;

  -- ── Slots ───────────────────────────────────────────────────────
  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        v_specialist, 'Salon Owner',                 'class-1'),
    (v_ship_id,  2, 'operations',     v_google,     'Front Desk Coordinator',      'class-1'),
    (v_ship_id,  3, 'documentation',  v_notion,     'Stylist Notes Lead',          'class-1'),
    (v_ship_id,  4, 'finance',        v_stripe,     'Bookkeeper',                  'class-1'),
    (v_ship_id,  5, 'sales',          v_hubspot,    'New Client Coordinator',      'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Recall Lead',                 'class-1'),
    (v_ship_id,  7, 'communications', v_slack,      'Floor Manager',               'class-2'),
    (v_ship_id,  8, 'research',       v_cf_browser, 'Reviews & Reputation Manager','class-2'),
    (v_ship_id,  9, 'marketing',      v_replicate,  'Social Producer',             'class-3'),
    (v_ship_id, 10, 'operations',     v_airtable,   'Retail Inventory Manager',    'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',         'class-4'),
    (v_ship_id, 12, 'sales',          v_monday,     'Membership & Loyalty Lead',   'class-4');
END $$;
