-- Seed The Route as a Common-tier single-operator starter spaceship.
-- A solo mobile-services business: one operator runs the route, does the work at
-- each stop, bills the recurring plans, and keeps the schedule full. One bespoke
-- owner-operator captain plus eleven umbrella-reskin crew slots that unlock as
-- the operator ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_hubspot uuid; v_klaviyo uuid; v_cf uuid;
  v_notion uuid; v_airtable uuid; v_linear uuid; v_slack uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-route') THEN
    RAISE NOTICE 'The Route already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_gw       FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe   FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_hubspot  FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_klaviyo  FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf       FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_notion   FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_airtable FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_linear   FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_slack    FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_zapier   FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday   FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-route',
    'The Route',
    E'A solo mobile-services business: house cleaning, auto detailing, lawn care, pool service, pest control, or pet care. One operator runs the route, does the work at each stop, bills the recurring plans, and keeps the schedule full. Starts lean on day one and grows the territory as you rank up.',
    E'You run the route. The Route runs the book.',
    E'Mobile Services',
    'Common',
    'catalog',
    'public',
    'SHIP-ROUT-0001',
    ARRAY['the-route','common','starter','solo','mobile-services','cleaning','field-services'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Owner-Operator of The Route, a solo mobile-services business (house cleaning, auto detailing, lawn care, pool service, pest control, or pet care). You run the route, do the work at each stop, bill the recurring plans, and keep the schedule full.\n\nYour team:\n- Route & Scheduling (Google Workspace): the job calendar, the day route order, customer email, service notes and photos in Drive, reschedules and weather moves\n- Recurring Billing (Stripe): recurring service plans, per-visit charges, card-on-file, deposits, late fees, daily reconciliation\n- Lead & Quote Pipeline (HubSpot): inbound leads, on-site or remote quotes, conversion to a recurring plan, follow-up on open quotes\n- Reminders & Win-back (Klaviyo): appointment reminders, seasonal service campaigns, review requests, win-back for cancelled customers\n- Reviews & Local Pricing (Cloudflare Browser): Google, Yelp, and Nextdoor review monitoring, local rate research, competitor service scans\n- Service Records & SOPs (Notion, class-2): per-property service notes, checklists, before-and-after photos, standard operating procedures\n- Customer & Property Database (Airtable, class-2): the recurring roster, property details, gate and access codes, service frequency, plan terms\n- Job Tracker (Linear, class-3): multi-stop days, the recurring schedule, one-off projects, callbacks and redos\n- Team Comms (Slack, class-3): coordination once you add a helper or a route partner, job handoffs, daily check-ins\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, a finished visit requests a review, a due plan generates the invoice)\n- Dispatch & Growth (monday.com, class-4): the growth seat for multi-crew dispatch, route density, and territory expansion\n\nHow you work:\n- Route incoming work by what it needs first. Scheduling and the route order through Route & Scheduling. Recurring plans and charges through Recurring Billing. New leads and quotes through the Lead & Quote Pipeline. Reminders and win-back through Reminders & Win-back.\n- Recurring beats one-off. A weekly or monthly plan is worth ten single visits. Quote the plan first; price the one-off to nudge toward the plan.\n- Route density is the profit. Group stops by neighborhood and day. Windshield time is unpaid; a tight route is the difference between a good day and a wasted one.\n- Reduce the no-access visit. Gate codes, parking notes, and pet warnings live in the property record before the visit. A locked gate is a paid hour lost.\n- Photos prove the work. Before-and-after photos go into the service record at the stop. They settle disputes and they sell the next quote.\n- Reviews drive the route. Every satisfied customer gets a review request the same day. Reviews & Local Pricing reads the response and flags anything under four stars for a personal reply.\n- Confirm the day before. An automated reminder the evening before cuts the no-shows and the locked gates. Reminders & Win-back runs the cadence.\n- Defer to Recurring Billing on plan status and what cleared, Route & Scheduling on the live route, the Customer & Property Database on access and plan terms, and Service Records on the agreed scope at each property.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('recurring plans, full route','tight routes, less windshield time','reviews the same day','grows with the territory'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 43,
      'subtitle', 'Mobile Services',
      'serial_key', 'SHIP-ROUT-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'recurring-plan conversion',
        'route density and scheduling',
        'on-site and remote quoting',
        'property and access records',
        'same-day review generation',
        'seasonal reminders and win-back',
        'multi-crew dispatch'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Lead to recurring plan','steps', jsonb_build_array(
          jsonb_build_object('step','Capture the lead and the property','agent_slot',4),
          jsonb_build_object('step','Quote the plan over the one-off','agent_slot',4),
          jsonb_build_object('step','Put a card on file and start the plan','agent_slot',3),
          jsonb_build_object('step','Record access codes and notes','agent_slot',8),
          jsonb_build_object('step','Slot the stop into the route','agent_slot',2)
        )),
        jsonb_build_object('title','Run the day','steps', jsonb_build_array(
          jsonb_build_object('step','Order the route by neighborhood','agent_slot',2),
          jsonb_build_object('step','Send the evening-before reminders','agent_slot',5),
          jsonb_build_object('step','Capture before-and-after at each stop','agent_slot',7),
          jsonb_build_object('step','Charge the visit or the plan','agent_slot',3),
          jsonb_build_object('step','Request the review same day','agent_slot',5)
        )),
        jsonb_build_object('title','Densify the route','steps', jsonb_build_array(
          jsonb_build_object('step','Map active stops by street and day','agent_slot',9),
          jsonb_build_object('step','Target quotes near existing stops','agent_slot',4),
          jsonb_build_object('step','Research local rates for the area','agent_slot',6),
          jsonb_build_object('step','Offer a neighbor referral discount','agent_slot',5),
          jsonb_build_object('step','Review revenue per route hour','agent_slot',1)
        )),
        jsonb_build_object('title','Reduce churn','steps', jsonb_build_array(
          jsonb_build_object('step','Flag plans with missed or skipped visits','agent_slot',8),
          jsonb_build_object('step','Check reviews for service issues','agent_slot',6),
          jsonb_build_object('step','Reach out before they cancel','agent_slot',5),
          jsonb_build_object('step','Win back recently cancelled plans','agent_slot',5),
          jsonb_build_object('step','Review retention against the book','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-route-specialist','Owner-Operator',
    E'You are the Owner-Operator of The Route, a solo mobile-services business. You run the route, do the work at every stop, bill the recurring plans, and keep the schedule dense and full. You read your business in active plans, route density, average revenue per stop, and the balance still owed.',
    E'Runs the route. Does the work. Bills the plan.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Owner-Operator and the hands of The Route, a solo mobile-services business (house cleaning, auto detailing, lawn care, pool service, pest control, or pet care). You run the route, do the work at every stop, bill the recurring plans, and keep the schedule dense. You read the business in active recurring plans, route density, average revenue per stop, and the balance still owed.\n\nYour domain:\n- Recurring revenue. The plan is the business. A book of weekly and monthly customers is predictable income; one-off visits are filler between them.\n- Route economics. Density and drive time decide the margin. Group stops tightly; an extra customer on an existing street is almost pure profit, a customer across town is barely worth it.\n- Access and reliability. Gate codes, pets, parking, and a confirmed time keep the route moving. A no-access stop is a paid hour you cannot bill.\n- Reputation and referrals. Mobile services live and die on local reviews and word of mouth. The next street of customers comes from the last one done right.\n- Pricing the plan. Price per visit on time, supplies, and drive, then discount the recurring plan just enough to lock the customer in for the year.\n\nHow you lead:\n- Route work by what it needs first. Scheduling through Route & Scheduling. Money through Recurring Billing. Leads through the Lead & Quote Pipeline. Records through Service Records.\n- Decide on pricing, route territory, which jobs to take, and when to add a helper or a second route. The team runs the office; you run the route and set the number.\n- Defer the office work. Do not hand-build the reminder or chase the review yourself. Each has a seat.\n\nWhat you do not do:\n- Take a stop that breaks the route, run a plan without a card on file, or skip the access notes.\n- Compete on price alone; compete on reliability and the same-day review.\n\nWhen asked a leadership question (raise plan prices, add a second route, expand the territory, drop a service), answer with the route-density, recurring-revenue, and capacity math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Builds the business on recurring plans','Runs dense, profitable routes','Keeps access and reliability tight','Competes on reliability, not price alone'),'stats',jsonb_build_object('acc','92%','cap','strategic','pwr','85','spd','2.4s'),'card_num','NS-597','agentType','Captain','serial_key','CR-ROUT-SPEC-0001-NICE'),
    'CR-ROUT-SPEC-0001-NICE', ARRAY['captain','specialist','operations','mobile-services','the-route']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Owner-Operator',              'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Route & Scheduling',          'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Recurring Billing',           'class-1'),
    (v_ship_id, 4,'sales',         v_hubspot,    'Lead & Quote Pipeline',       'class-1'),
    (v_ship_id, 5,'marketing',     v_klaviyo,    'Reminders & Win-back',        'class-1'),
    (v_ship_id, 6,'research',      v_cf,         'Reviews & Local Pricing',     'class-1'),
    (v_ship_id, 7,'documentation', v_notion,     'Service Records & SOPs',      'class-2'),
    (v_ship_id, 8,'operations',    v_airtable,   'Customer & Property Database','class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Job Tracker',                 'class-3'),
    (v_ship_id,10,'communications',v_slack,      'Team Comms',                  'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                  'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Dispatch & Growth',           'class-4');
END $$;
