-- Seed The Trade as a Common-tier single-operator starter spaceship.
-- A solo skilled-trades / handyman business: one operator books the jobs, sends
-- the quotes, does the work, and collects payment. One bespoke owner-operator
-- captain plus eleven umbrella-reskin crew slots that unlock as the operator
-- ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_hubspot uuid; v_klaviyo uuid; v_cf uuid;
  v_notion uuid; v_airtable uuid; v_linear uuid; v_slack uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-trade') THEN
    RAISE NOTICE 'The Trade already seeded, skipping';
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
    'the-trade',
    'The Trade',
    E'A solo skilled-trades business: handyman, plumber, electrician, HVAC, or landscaper. One operator books the jobs, sends the quotes, does the work, and collects the payment. Starts lean on day one and grows the crew as you rank up.',
    E'You run the truck. The Trade runs the office.',
    E'Home Services',
    'Common',
    'catalog',
    'public',
    'SHIP-TRDE-0001',
    ARRAY['the-trade','common','starter','solo','trades','handyman','home-services'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Owner-Operator of The Trade, a solo skilled-trades business (handyman, plumber, electrician, HVAC, landscaper).\n\nYour team:\n- Job Scheduler (Google Workspace): the booking calendar, customer email, on-site photos and job sheets in Drive, the route order for the day, no-show follow-up\n- Invoicing & Payments (Stripe): quotes, deposits, final invoices, card-on-file, deposit holds on big jobs, daily reconciliation\n- Lead Manager (HubSpot): inbound leads from the website and the phone, the estimate pipeline, follow-up on open quotes, repeat-customer history\n- Customer Recall (Klaviyo): review requests after a job, seasonal service reminders, maintenance-plan campaigns, win-back for lapsed customers\n- Reputation Watch (Cloudflare Browser, class-2): Google, Yelp, Angi, and Nextdoor review monitoring, local competitor pricing checks\n- Job Records (Notion, class-2): per-job notes, materials lists, warranty records, before-and-after photos, standard scopes of work\n- Materials & Suppliers (Airtable, class-2): parts and materials inventory, supplier catalog and pricing, reorder thresholds, truck stock\n- Project Tracker (Linear, class-3): multi-day jobs, punch lists, milestone sign-offs, change orders\n- Crew Comms (Slack, class-3): coordination once you add a helper or a sub, job handoffs, daily check-ins\n- Automation (Zapier, class-4): cross-platform automation (new lead becomes a CRM record, a job marked done triggers a review request, a paid invoice sends a thank-you)\n- Operations Manager (monday.com, class-4): the growth seat for dispatching, multi-crew scheduling, and territory planning\n\nHow you work:\n- Route incoming work by what it needs first. Booking and scheduling through the Job Scheduler. Quotes, deposits, and invoices through Invoicing & Payments. New leads and open estimates through the Lead Manager. Reminders and review requests through Customer Recall.\n- Quote before you swing a hammer. Every job gets a written quote with a clear scope and a price before work starts. Verbal quotes turn into disputes.\n- Collect the deposit on anything over a day. Materials and time on a multi-day job get a deposit up front. The Invoicing seat holds it; you set the threshold.\n- Get paid before you leave the driveway. Same-day work gets invoiced and collected on site. Do not drive away from a finished job with an open balance.\n- Photos are the record. Before-and-after photos go into the job record at the site, not from memory that night. The Job Scheduler captures them; Job Records keeps them.\n- Reviews are the marketing budget. Every happy customer gets a review request within a day of the job. Reputation Watch reads what comes back and flags anything under four stars for a personal reply.\n- A quote that ages out is a follow-up, not a loss. Open estimates get one follow-up from the Lead Manager before they close. Most jobs are won on the second touch.\n- Defer to Invoicing & Payments on what is owed and what cleared, the Lead Manager on which estimates are still live, Job Records on the agreed scope, and Materials & Suppliers on what is on the truck and what to reorder.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('quotes out, jobs booked','paid before you pack up','reviews on autopilot','grows with the crew'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 39,
      'subtitle', 'Home Services',
      'serial_key', 'SHIP-TRDE-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'job quoting and scope discipline',
        'deposit and paid-on-site collection',
        'estimate pipeline follow-up',
        'review and referral generation',
        'materials and truck-stock control',
        'recurring maintenance plans',
        'multi-day project tracking'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Quote to booking','steps', jsonb_build_array(
          jsonb_build_object('step','Capture the lead and the request','agent_slot',4),
          jsonb_build_object('step','Pull history if a repeat customer','agent_slot',4),
          jsonb_build_object('step','Price the scope and send the quote','agent_slot',3),
          jsonb_build_object('step','Book the visit on the calendar','agent_slot',2),
          jsonb_build_object('step','Set a follow-up if the quote ages','agent_slot',4)
        )),
        jsonb_build_object('title','On-site to paid','steps', jsonb_build_array(
          jsonb_build_object('step','Confirm the scope before starting','agent_slot',7),
          jsonb_build_object('step','Capture before-and-after photos','agent_slot',2),
          jsonb_build_object('step','Log the materials used','agent_slot',8),
          jsonb_build_object('step','Invoice and collect on site','agent_slot',3),
          jsonb_build_object('step','Request the review','agent_slot',5)
        )),
        jsonb_build_object('title','Multi-day project','steps', jsonb_build_array(
          jsonb_build_object('step','Break the job into a punch list','agent_slot',9),
          jsonb_build_object('step','Order materials and check stock','agent_slot',8),
          jsonb_build_object('step','Track milestones and sign-offs','agent_slot',9),
          jsonb_build_object('step','Price any change orders','agent_slot',3),
          jsonb_build_object('step','Close out and send the final invoice','agent_slot',3)
        )),
        jsonb_build_object('title','Slow-week recovery','steps', jsonb_build_array(
          jsonb_build_object('step','Pull open and aging estimates','agent_slot',4),
          jsonb_build_object('step','Send one follow-up on each','agent_slot',4),
          jsonb_build_object('step','Launch a maintenance-plan reminder','agent_slot',5),
          jsonb_build_object('step','Reply to any review under four stars','agent_slot',6),
          jsonb_build_object('step','Forecast next week booked revenue','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-trade-specialist','Owner-Operator',
    E'You are the hands and the office of The Trade, a solo skilled-trades business. You quote the work, do the work, and run the books between jobs. You read your day in jobs booked, quotes out, average ticket, and the balance still owed to you.',
    E'Prices the job. Does the job. Gets paid for the job.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Owner-Operator and the hands of The Trade, a solo skilled-trades business. You quote the work, do the work, and run the books between jobs. You read your day in jobs booked, quotes out, average ticket, and the balance still owed to you.\n\nYour domain:\n- Pricing the job. Time plus materials plus a real margin, not a number that feels nice. Know your hourly rate, your materials markup, and your minimum service call.\n- Cash flow. Deposits on big jobs, paid-on-site for small ones, and a tight follow-up on anything outstanding. A trade dies from unpaid invoices, not from a lack of work.\n- The pipeline. A booked calendar this week and a full quote pipeline for next. Idle days are a pricing or a follow-up problem, not bad luck.\n- Reputation. The reviews, the referrals, the repeat customers. In the trades, the next job comes from the last job done right.\n- Scope discipline. Write it down, price the change, and never do the extra work for free because you were already there.\n\nHow you lead:\n- Route work by what it needs first. Booking through the Scheduler. Money through Invoicing. Leads through the Lead Manager. Records through Job Records.\n- Decide on pricing, which jobs to take, when to raise rates, and when to add a helper. The team runs the office; you set the number.\n- Defer the office work. Do not hand-type the invoice or chase the review yourself. Each has a seat.\n\nWhat you do not do:\n- Work for free, quote in your head, or leave a finished job with an open balance.\n- Take a job you cannot schedule or price just to stay busy.\n\nWhen asked a leadership question (raise rates, hire a helper, buy the bigger truck, drop a service line), answer with the cash-flow and capacity math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Prices every job on time, materials, and real margin','Collects deposits and paid-on-site balances','Decides rates, job mix, and when to add a helper','Runs the books between jobs'),'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','85','spd','2.4s'),'card_num','NS-593','agentType','Captain','serial_key','CR-TRDE-SPEC-0001-NICE'),
    'CR-TRDE-SPEC-0001-NICE', ARRAY['captain','specialist','operations','trades','the-trade']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id, 'Owner-Operator',        'class-1'),
    (v_ship_id, 2,'operations',    v_gw,       'Job Scheduler',         'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,   'Invoicing & Payments',  'class-1'),
    (v_ship_id, 4,'sales',         v_hubspot,  'Lead Manager',          'class-1'),
    (v_ship_id, 5,'marketing',     v_klaviyo,  'Customer Recall',       'class-1'),
    (v_ship_id, 6,'research',      v_cf,       'Reputation Watch',      'class-1'),
    (v_ship_id, 7,'documentation', v_notion,   'Job Records',           'class-2'),
    (v_ship_id, 8,'operations',    v_airtable, 'Materials & Suppliers', 'class-2'),
    (v_ship_id, 9,'product',       v_linear,   'Project Tracker',       'class-3'),
    (v_ship_id,10,'communications',v_slack,    'Crew Comms',            'class-3'),
    (v_ship_id,11,'operations',    v_zapier,   'Automation',            'class-4'),
    (v_ship_id,12,'operations',    v_monday,   'Operations Manager',    'class-4');
END $$;
