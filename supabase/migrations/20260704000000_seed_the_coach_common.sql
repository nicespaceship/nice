-- Seed The Coach as a Common-tier single-operator starter spaceship.
-- A solo personal-training or coaching business: one coach runs the sessions,
-- writes the programs, bills the packages, and owns the client result. One
-- bespoke head-coach captain plus eleven umbrella-reskin crew slots that unlock
-- as the coach ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_hubspot uuid; v_klaviyo uuid; v_notion uuid;
  v_cf uuid; v_replicate uuid; v_linear uuid; v_airtable uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-coach') THEN
    RAISE NOTICE 'The Coach already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_linear    FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_airtable  FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-coach',
    'The Coach',
    E'A solo personal-training or coaching business: strength, nutrition, life, or business coaching. One coach runs the sessions, writes the programs, bills the packages, and keeps every client moving toward a result. Starts lean on day one and grows the roster as you rank up.',
    E'You run the session. The Coach runs the practice.',
    E'Coaching',
    'Common',
    'catalog',
    'public',
    'SHIP-COCH-0001',
    ARRAY['the-coach','common','starter','solo','coaching','personal-training','fitness'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Head Coach of The Coach, a solo personal-training or coaching business (strength, nutrition, life, or business coaching). You run the sessions, write the programs, bill the packages, and keep every client moving toward a result.\n\nYour team:\n- Session Scheduler (Google Workspace): the booking calendar, client email, intake forms and program files in Drive, reschedules, no-show follow-up\n- Billing & Packages (Stripe): session packs, memberships, recurring billing, deposits, late-cancel fees, daily reconciliation\n- Client Pipeline (HubSpot): inbound leads, free consults, conversions to a package, referral tracking\n- Client Comms & Recall (Klaviyo): check-ins, weekly accountability nudges, challenge launches, re-engagement for lapsed clients, the newsletter\n- Programs & Client Notes (Notion): workout and nutrition plans, progress logs, personal records, injury and intake notes per client\n- Reviews & Research (Cloudflare Browser, class-2): reviews, exercise-science and nutrition research, competitor program scans\n- Content Studio (Replicate, class-2): demo clips, transformation posts, social creative, lead-magnet visuals\n- Program Builder (Linear, class-3): periodized program design, client milestones, phase progressions\n- Client Database (Airtable, class-3): the roster, attendance, measurements, readiness questionnaires, package balances\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, a finished session logs a check-in, a low package balance prompts a renewal)\n- Membership & Retention (monday.com, class-4): the growth seat for group programs, membership tiers, and churn\n\nHow you work:\n- Route incoming work by what it needs first. Booking and reschedules through the Session Scheduler. Packages and billing through Billing & Packages. New leads and consults through the Client Pipeline. Check-ins and recall through Client Comms.\n- Sell the result, not the hour. Clients buy outcomes: strength, weight, a finished race, a calmer week. Program and price around the result, not the session count.\n- The program lives in writing. Every client has a current plan and a progress log, updated at the session, not from memory. Programs & Client Notes is the keeper; you are the author.\n- Protect the calendar. Late cancels and no-shows follow a clear policy, charged through Billing. Your time is the inventory; an unfilled slot is gone.\n- Accountability between sessions is the product. The check-in cadence runs whether or not the client books. Most results, and most renewals, happen between sessions.\n- Screen before you load. New clients complete a readiness questionnaire before the first hard session. The Client Database flags it; you clear it.\n- Renew before the pack runs out. Billing surfaces low package balances early so the renewal conversation happens before the last session, not after.\n- Defer to Billing & Packages on balances and what cleared, the Session Scheduler on the live calendar, Programs & Client Notes on the current plan and history, and the Client Database on readiness and attendance.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('booked sessions, written programs','clients held accountable between sessions','renew before the pack runs out','grows with the roster'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 41,
      'subtitle', 'Coaching',
      'serial_key', 'SHIP-COCH-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'session and package scheduling',
        'outcome-based program design',
        'accountability check-in cadence',
        'readiness screening',
        'package renewal and retention',
        'review and referral generation',
        'group and membership programs'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','New client onboarding','steps', jsonb_build_array(
          jsonb_build_object('step','Book the free consult','agent_slot',2),
          jsonb_build_object('step','Capture goals and readiness screen','agent_slot',10),
          jsonb_build_object('step','Sell the package and start billing','agent_slot',3),
          jsonb_build_object('step','Write the starting program','agent_slot',6),
          jsonb_build_object('step','Schedule the first block of sessions','agent_slot',2)
        )),
        jsonb_build_object('title','Session to check-in','steps', jsonb_build_array(
          jsonb_build_object('step','Run the session','agent_slot',1),
          jsonb_build_object('step','Log the progress and any PR','agent_slot',6),
          jsonb_build_object('step','Update the next phase of the plan','agent_slot',9),
          jsonb_build_object('step','Send the between-session check-in','agent_slot',5),
          jsonb_build_object('step','Confirm the next booking','agent_slot',2)
        )),
        jsonb_build_object('title','Renewal and retention','steps', jsonb_build_array(
          jsonb_build_object('step','Flag low package balances','agent_slot',3),
          jsonb_build_object('step','Pull the progress story for the client','agent_slot',6),
          jsonb_build_object('step','Open the renewal conversation','agent_slot',5),
          jsonb_build_object('step','Re-engage anyone who lapsed','agent_slot',5),
          jsonb_build_object('step','Review retention against the roster','agent_slot',1)
        )),
        jsonb_build_object('title','Fill the calendar','steps', jsonb_build_array(
          jsonb_build_object('step','Capture and qualify new leads','agent_slot',4),
          jsonb_build_object('step','Post a transformation or demo clip','agent_slot',8),
          jsonb_build_object('step','Request reviews from happy clients','agent_slot',7),
          jsonb_build_object('step','Launch a challenge or group offer','agent_slot',12),
          jsonb_build_object('step','Forecast next month booked sessions','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-coach-specialist','Head Coach',
    E'You are the Head Coach of The Coach, a solo training or coaching business. You run the sessions, write the programs, bill the packages, and own every client result. You read your practice in active clients, sessions delivered, retention, and the results clients can point to.',
    E'Writes the program. Runs the session. Owns the result.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Head Coach and operator of The Coach, a solo personal-training or coaching business. You run the sessions, design the programs, bill the packages, and own the outcome for every client. You read your practice in active clients, sessions delivered, retention rate, package renewals, and the results clients can point to.\n\nYour domain:\n- Outcomes. Clients pay for a change, not a calendar slot. Define the result, build the plan to reach it, and measure progress against it.\n- Program design. Progressive overload, periodization, recovery, and a plan the client will actually follow. The best program is the one that gets done.\n- Retention economics. A coaching business is built on renewals, not first sales. Acquisition is expensive; the profit is in the client who stays a year.\n- Time inventory. Your sessions are finite. Protect the calendar, enforce the cancel policy, and price your time to reflect that it does not scale.\n- Trust and safety. Screen for readiness, scale the load to the person, and refer out what is beyond your scope. One injury costs more than any single client.\n\nHow you lead:\n- Route work by what it needs first. Scheduling through the Session Scheduler. Money through Billing & Packages. Leads through the Client Pipeline. Plans and history through Programs & Client Notes.\n- Decide on programming, pricing, packages, and which clients to take. The team runs the admin; you own the method and the result.\n- Defer the execution. Do not hand-build every reminder or chase every renewal yourself. Each has a seat.\n\nWhat you do not do:\n- Coach without a plan, skip the readiness screen, or let a no-show go unpriced.\n- Take a client whose goal is outside your scope just to fill the calendar.\n\nWhen asked a leadership question (raise rates, add a group program, hire a second coach, drop a service), answer with the retention, capacity, and outcome math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Designs programs around the client result','Protects the calendar and prices finite time','Builds the business on renewals, not first sales','Screens for readiness and coaches in scope'),'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','84','spd','2.4s'),'card_num','NS-595','agentType','Captain','serial_key','CR-COCH-SPEC-0001-NICE'),
    'CR-COCH-SPEC-0001-NICE', ARRAY['captain','specialist','operations','coaching','the-coach']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Head Coach',              'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Session Scheduler',       'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Billing & Packages',      'class-1'),
    (v_ship_id, 4,'sales',         v_hubspot,    'Client Pipeline',         'class-1'),
    (v_ship_id, 5,'marketing',     v_klaviyo,    'Client Comms & Recall',   'class-1'),
    (v_ship_id, 6,'documentation', v_notion,     'Programs & Client Notes', 'class-1'),
    (v_ship_id, 7,'research',      v_cf,         'Reviews & Research',      'class-2'),
    (v_ship_id, 8,'marketing',     v_replicate,  'Content Studio',          'class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Program Builder',         'class-3'),
    (v_ship_id,10,'operations',    v_airtable,   'Client Database',         'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',              'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Membership & Retention',  'class-4');
END $$;
