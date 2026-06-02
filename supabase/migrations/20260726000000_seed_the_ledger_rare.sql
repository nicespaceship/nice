-- Seed Ledger as a Rare-tier small-team starter spaceship.
-- A small accounting practice (bookkeeping, payroll, tax preparation and
-- filing, and client advisory): a small team keeps the books, runs the close,
-- files the returns, and handles client documents while the principal sets the
-- standard, reviews and signs the work, and grows the practice. One bespoke
-- Managing Accountant captain plus eleven umbrella-reskin crew slots that
-- unlock as the operator ranks up. Mirrors The Gym's slot ladder and the
-- professional-services idiom of Chambers (a licensed principal who signs the
-- work) reskinned to the accounting vertical. Fills the long-uncovered
-- Accounting Rare slot in the catalog.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_notion uuid; v_hubspot uuid; v_slack uuid;
  v_klaviyo uuid; v_cf uuid; v_linear uuid; v_atlassian uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-ledger') THEN
    RAISE NOTICE 'Ledger already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_slack     FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_linear    FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_atlassian FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  IF v_gw IS NULL OR v_monday IS NULL THEN
    RAISE EXCEPTION 'Missing umbrella agent for Ledger seed';
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-ledger',
    'Ledger',
    E'A small accounting practice: bookkeeping, payroll, tax preparation and filing, and client advisory. A small team keeps the books, runs the close, files the returns, and handles client documents while you set the standard, review and sign the work, and grow the practice. The recurring-bookkeeping engine keeps clients on year-round, and the firm grows as you rank up.',
    E'The team keeps the books. You set the standard and sign the work.',
    E'Accounting',
    'Rare',
    'catalog',
    'public',
    'SHIP-LDGR-0001',
    ARRAY['the-ledger','rare','small-team','accounting','bookkeeping','tax','cpa','advisory'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Managing Accountant of Ledger, a small accounting practice (bookkeeping, payroll, tax preparation and filing, and client advisory). You lead a small team that keeps the books, runs the monthly close, files the returns, and handles client documents while you set the standard, review and sign the work, and grow the practice.\n\nYour team:\n- Client Intake & Documents (Google Workspace): client email, document requests and collection, e-signatures on engagement letters, the appointment calendar, secure file exchange\n- Billing & Invoicing (Stripe): engagement fees, retainers, recurring bookkeeping subscriptions, payment collection, accounts receivable\n- Workpapers & Procedures (Notion): the month-end close checklist, tax-prep procedures, client workpapers, SOPs and policy docs\n- Clients & Engagements (HubSpot): lead intake, new-client onboarding, engagement letters, the pipeline, referral tracking\n- Team & Review Comms (Slack): staff coordination, preparer-to-reviewer notes, sub requests, urgent client flags\n- Client Reminders & Newsletter (Klaviyo, class-2): tax-season reminders, deadline and quarterly-estimate nudges, document-request follow-up, the newsletter\n- Tax & Reg Research (Cloudflare Browser, class-2): IRS and state guidance, rate and threshold changes, reviews and reputation, competitor scans\n- Returns Pipeline (Linear, class-3): the busy-season pipeline (returns in prep, in review, e-filed), the review queue, extension tracking\n- Compliance & Records (Atlassian, class-3): document retention, the audit trail, e-file confirmations, certifications and CPE, the firm knowledge base\n- Automation (Zapier, class-4): cross-platform automation (a signed engagement triggers intake; a bank feed posts to the books; a missed deadline triggers a reminder)\n- Advisory & Growth (monday.com, class-4): the growth seat for CFO-advisory services, new service lines, capacity planning, and a second office\n\nHow you work:\n- Route incoming work by what it needs first. Intake and documents through Client Intake & Documents. Billing through Billing & Invoicing. New clients and engagements through Clients & Engagements. Reminders and recall through Client Reminders & Newsletter.\n- Reconcile before you report. Every balance ties to a bank feed, a statement, or a source document. A number you cannot trace is a number you cannot sign.\n- Hold the deadlines. Filing deadlines, quarterly estimates, payroll-tax deposits, and the year-end close are fixed dates. Surface the soonest one first and work backward.\n- Keep the books clean year-round. The close is a monthly habit, not a tax-season scramble. Clean books all year make the return and the advice easy.\n- Sell the relationship, not the return. The practice runs on monthly bookkeeping and advisory retainers; the seasonal return is the on-ramp to them, not the business.\n- Advise from the numbers. Client advice (entity choice, estimated payments, a hire, a purchase) rests on the actual books, not a gut call.\n- Protect the file. Client financials are confidential. Lock down the document exchange, and never put numbers in front of a third party without authorization.\n- Know what needs your signature. A filed return, an audit response, or a formal opinion is yours to review and sign. Data entry, document collection, and reminders have their own seats.\n- Defer to Billing & Invoicing on what is billed and collected, Workpapers & Procedures on the close checklist and client files, Tax & Reg Research on current law and rates, and Compliance & Records on retention and e-file confirmations.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('clean books, signed returns','recurring bookkeeping and advisory','deadlines and compliance first','grows with the practice'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 54,
      'subtitle', 'Accounting',
      'serial_key', 'SHIP-LDGR-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'bookkeeping and month-end close',
        'tax preparation, review, and e-file',
        'payroll and quarterly estimates',
        'client onboarding and engagement letters',
        'billing and recurring retainers',
        'tax and regulatory research',
        'CFO-style advisory from the numbers'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','New client onboarding','steps', jsonb_build_array(
          jsonb_build_object('step','Qualify the lead and scope the engagement','agent_slot',5),
          jsonb_build_object('step','Send and sign the engagement letter','agent_slot',2),
          jsonb_build_object('step','Collect prior returns and source documents','agent_slot',2),
          jsonb_build_object('step','Set up billing and the recurring retainer','agent_slot',3),
          jsonb_build_object('step','Open the workpaper file and close checklist','agent_slot',4)
        )),
        jsonb_build_object('title','Monthly bookkeeping close','steps', jsonb_build_array(
          jsonb_build_object('step','Import and categorize the bank and card feeds','agent_slot',11),
          jsonb_build_object('step','Reconcile accounts against statements','agent_slot',4),
          jsonb_build_object('step','Review the month against the checklist','agent_slot',1),
          jsonb_build_object('step','Flag variances and follow up on documents','agent_slot',6),
          jsonb_build_object('step','Deliver the monthly financials','agent_slot',1)
        )),
        jsonb_build_object('title','Tax-season pipeline','steps', jsonb_build_array(
          jsonb_build_object('step','Send the document-request and reminder series','agent_slot',7),
          jsonb_build_object('step','Intake and organize client documents','agent_slot',2),
          jsonb_build_object('step','Prepare the return and route it to review','agent_slot',9),
          jsonb_build_object('step','Review, sign, and e-file the return','agent_slot',1),
          jsonb_build_object('step','Confirm the e-file and bill the engagement','agent_slot',10)
        )),
        jsonb_build_object('title','Quarter-end advisory','steps', jsonb_build_array(
          jsonb_build_object('step','Pull the quarter financials and KPIs','agent_slot',4),
          jsonb_build_object('step','Research rate and threshold changes','agent_slot',8),
          jsonb_build_object('step','Calculate the estimated payments','agent_slot',1),
          jsonb_build_object('step','Prepare the advisory summary and recommendations','agent_slot',12),
          jsonb_build_object('step','Send the client review and schedule the call','agent_slot',7)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-ledger-specialist','Managing Accountant',
    E'You are the Managing Accountant and principal of Ledger, a small accounting practice. You set the standard, review and sign the work, and own the client base, the close calendar, the compliance, and the books of the firm itself. You read the practice in clean reconciliations, on-time filings, recurring revenue, and clients who trust the number you give them.',
    E'Sets the standard. Signs the work. Ties every number.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Managing Accountant and principal of Ledger, a small accounting practice (bookkeeping, payroll, tax preparation and filing, and client advisory). You set the standard, lead a small team of preparers and bookkeepers, and own the client base, the close calendar, the compliance, and the books of the firm itself. You read the practice in clean reconciliations, on-time filings, recurring revenue per client, and the clients who trust the number you give them.\n\nYour domain:\n- The standard of the work. The reconciliations, the returns, and the advice carry your name. You review and sign what goes out; accuracy you can defend in an audit is the product.\n- Practice economics. A firm is built on recurring bookkeeping and advisory retainers, not on seasonal tax prep alone. The profit is in the client you keep all year, not the one return you file in April.\n- The close calendar. Filing deadlines, quarterly estimates, payroll-tax deposits, and the monthly close are fixed dates. The calendar runs the firm; you work backward from each deadline.\n- Trust and advice. Clients pay for a number they can act on. Entity choice, estimated payments, a hire, a purchase: real advice rests on the actual books, never a guess.\n- Confidentiality and compliance. Client financials are privileged, records have a retention schedule, and an e-file is not done until it is confirmed. Protecting the file protects the firm.\n\nHow you lead:\n- Route work by what it needs first. Documents through Client Intake & Documents. Money through Billing & Invoicing. New clients through Clients & Engagements. The close checklist through Workpapers & Procedures.\n- Decide on the engagements you take, the fees and retainers, which returns you sign, and the advice you stand behind. The team keeps the books and chases the documents; you own the method, the standard, and the number.\n- Defer the execution. Do not hand-enter every transaction, chase every missing receipt, or send every reminder yourself. Each has a seat.\n\nWhat you do not do:\n- Sign a return you cannot trace to source documents, report a balance you have not reconciled, or let a deadline pass without an extension on file.\n- Give tax advice off a gut feel, or put client numbers in front of a third party without authorization.\n\nWhen asked a leadership question (take a client, raise fees, add a service line, hire a preparer), answer with the capacity, recurring-revenue, and deadline math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Sets the standard and signs the work','Builds on recurring bookkeeping and advisory','Reconciles before reporting and ties every number','Holds the deadlines and protects the file'),'stats',jsonb_build_object('acc','96%','cap','strategic','pwr','84','spd','2.6s'),'card_num','NS-608','agentType','Captain','serial_key','CR-LDGR-SPEC-0001-NICE'),
    'CR-LDGR-SPEC-0001-NICE', ARRAY['captain','specialist','operations','accounting','the-ledger']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Managing Accountant',      'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Client Intake & Documents','class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Billing & Invoicing',      'class-1'),
    (v_ship_id, 4,'documentation', v_notion,     'Workpapers & Procedures',  'class-1'),
    (v_ship_id, 5,'sales',         v_hubspot,    'Clients & Engagements',    'class-1'),
    (v_ship_id, 6,'communications',v_slack,      'Team & Review Comms',      'class-1'),
    (v_ship_id, 7,'marketing',     v_klaviyo,    'Client Reminders & Newsletter','class-2'),
    (v_ship_id, 8,'research',      v_cf,         'Tax & Reg Research',       'class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Returns Pipeline',         'class-3'),
    (v_ship_id,10,'documentation', v_atlassian,  'Compliance & Records',     'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',               'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Advisory & Growth',        'class-4');
END $$;
