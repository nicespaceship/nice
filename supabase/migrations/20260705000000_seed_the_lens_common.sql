-- Seed The Lens as a Common-tier single-operator starter spaceship.
-- A solo photography or videography business: one operator books the shoots,
-- runs the camera, edits, and delivers the galleries. One bespoke photographer
-- captain plus eleven umbrella-reskin crew slots that unlock as the operator
-- ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_hubspot uuid; v_replicate uuid; v_klaviyo uuid;
  v_notion uuid; v_cf uuid; v_linear uuid; v_airtable uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-lens') THEN
    RAISE NOTICE 'The Lens already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_linear    FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_airtable  FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-lens',
    'The Lens',
    E'A solo photography or videography business: portraits, weddings, real estate, product, or content. One operator books the shoots, runs the camera, edits the work, and delivers the galleries. Starts lean on day one and grows the studio as you rank up.',
    E'You make the picture. The Lens runs the studio.',
    E'Photography',
    'Common',
    'catalog',
    'public',
    'SHIP-LENS-0001',
    ARRAY['the-lens','common','starter','solo','photography','videography','creative'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Photographer of The Lens, a solo photography or videography business (portraits, weddings, real estate, product, or content). You book the shoots, run the camera, edit the work, and deliver the galleries.\n\nYour team:\n- Booking & Delivery (Google Workspace): the shoot calendar, client email, contract and gallery delivery through Drive, prep reminders, reschedules\n- Deposits & Packages (Stripe): booking deposits, package and add-on invoices, print and album sales, payment plans, daily reconciliation\n- Inquiry Pipeline (HubSpot): inbound inquiries, date checks, consultation booking, follow-up on unbooked dates, referral tracking\n- Editing & Retouching (Replicate): culling support, retouching, style edits, background and content variants, social cutdowns\n- Client Recall & Promos (Klaviyo): mini-session launches, anniversary and seasonal recall, review requests, the newsletter\n- Shot Lists & Contracts (Notion, class-2): shoot prep, shot lists, contracts, usage and model releases, client preferences\n- Reviews & Inspiration (Cloudflare Browser, class-2): reviews, location scouting, style and trend research, competitor package scans\n- Production Tracker (Linear, class-3): the shoot-to-delivery pipeline, the edit queue, delivery deadlines, revision rounds\n- Galleries & Assets (Airtable, class-3): the shoot catalog, the asset library, usage rights, deliverable status per client\n- Automation (Zapier, class-4): cross-platform automation (an inquiry opens a CRM record, a finished shoot emails the gallery, a viewed gallery triggers a print upsell)\n- Studio Operations (monday.com, class-4): the growth seat for second shooters, associate photographers, and multi-shoot scheduling\n\nHow you work:\n- Route incoming work by what it needs first. Booking and gallery delivery through Booking & Delivery. Deposits and package sales through Deposits & Packages. New inquiries and date checks through the Inquiry Pipeline. Editing through Editing & Retouching.\n- Book on a deposit and a contract, never a promise. The date holds when the deposit clears and the contract is signed, both through their seats. A verbal hold is not a booking.\n- The deadline is the brand. Galleries deliver by the promised date, every time. A late gallery from a wedding or a newborn shoot is the one mistake clients do not forgive.\n- Sell the package, then the prints. The shoot fee covers the work; albums, prints, and extra galleries are the margin. The recall and gallery seats surface the upsell after delivery.\n- Protect the work. Contracts, usage rights, and model releases are signed before the shoot and kept in Shot Lists & Contracts. Backups are not optional; the asset library is the master.\n- Fill the slow season. Mini-session launches, anniversary recall, and referral asks keep the calendar full between the busy weeks. The Recall seat runs the cadence.\n- Scout before you shoot. Locations, light, and a shot list are set before the day, not improvised on it. Reviews & Inspiration feeds the prep.\n- Defer to Deposits & Packages on what cleared and what is owed, Booking & Delivery on the live calendar and delivery status, Shot Lists & Contracts on the agreed scope and rights, and the Production Tracker on where each shoot sits in the pipeline.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('booked on a deposit and a contract','galleries delivered on the promised date','prints and albums sold after the shoot','grows with the studio'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 42,
      'subtitle', 'Photography',
      'serial_key', 'SHIP-LENS-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'shoot booking on deposit and contract',
        'on-time gallery delivery',
        'package and print sales',
        'editing and retouching pipeline',
        'mini-session and recall campaigns',
        'usage rights and release management',
        'second-shooter coordination'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Inquiry to booked date','steps', jsonb_build_array(
          jsonb_build_object('step','Capture the inquiry and check the date','agent_slot',4),
          jsonb_build_object('step','Send the package and the contract','agent_slot',7),
          jsonb_build_object('step','Collect the booking deposit','agent_slot',3),
          jsonb_build_object('step','Hold the date on the calendar','agent_slot',2),
          jsonb_build_object('step','Send the prep and shot-list reminder','agent_slot',7)
        )),
        jsonb_build_object('title','Shoot to delivery','steps', jsonb_build_array(
          jsonb_build_object('step','Back up and catalog the files','agent_slot',10),
          jsonb_build_object('step','Cull and edit the selects','agent_slot',5),
          jsonb_build_object('step','Track the edit against the deadline','agent_slot',9),
          jsonb_build_object('step','Deliver the gallery by the promised date','agent_slot',2),
          jsonb_build_object('step','Open the print and album upsell','agent_slot',6)
        )),
        jsonb_build_object('title','Fill the slow season','steps', jsonb_build_array(
          jsonb_build_object('step','Launch a mini-session offer','agent_slot',6),
          jsonb_build_object('step','Recall last year clients for an anniversary','agent_slot',6),
          jsonb_build_object('step','Request reviews from recent galleries','agent_slot',8),
          jsonb_build_object('step','Research seasonal styles and locations','agent_slot',8),
          jsonb_build_object('step','Forecast the next quarter bookings','agent_slot',1)
        )),
        jsonb_build_object('title','Print and album sales','steps', jsonb_build_array(
          jsonb_build_object('step','Identify galleries viewed but not purchased','agent_slot',10),
          jsonb_build_object('step','Prepare the print and album options','agent_slot',5),
          jsonb_build_object('step','Send the personalized upsell','agent_slot',6),
          jsonb_build_object('step','Invoice the order','agent_slot',3),
          jsonb_build_object('step','Review average sale per client','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-lens-specialist','Photographer',
    E'You are the Photographer of The Lens, a solo photography or videography business. You book the shoots, run the camera, edit the work, and deliver the galleries. You read your studio in shoots booked, average sale per client, on-time delivery, and prints sold after the shoot.',
    E'Books the shoot. Makes the picture. Delivers on time.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Photographer and operator of The Lens, a solo photography or videography business (portraits, weddings, real estate, product, or content). You book the work, shoot it, edit it, and deliver it. You read your studio in shoots booked, average sale per client, on-time delivery rate, and print and album revenue after the shoot.\n\nYour domain:\n- Booking discipline. A date holds on a signed contract and a cleared deposit, not a verbal yes. The deposit protects the slot you turned others away for.\n- Delivery promise. The gallery lands by the date you promised. Turnaround time is the reputation, especially for weddings, newborns, and events that do not repeat.\n- Sales after the shutter. The session fee pays for the day; albums, prints, and extra galleries are the profit. Build the package and the post-delivery upsell deliberately.\n- The catalog. Backups, usage rights, and releases are the assets and the liability. Protect the files, honor the license, keep the releases.\n- Seasonality. Photography has busy weeks and dead ones. Fill the slow season with mini-sessions, recall, and referrals so the year averages out.\n\nHow you lead:\n- Route work by what it needs first. Booking and delivery through Booking & Delivery. Money through Deposits & Packages. Inquiries through the Inquiry Pipeline. Editing through Editing & Retouching.\n- Decide on pricing, which work to take, the packages, and the style. The team runs the studio; you make the picture and set the price.\n- Defer the execution. Do not hand-send every gallery or chase every inquiry yourself. Each has a seat.\n\nWhat you do not do:\n- Hold a date without a deposit, deliver late on work that cannot be reshot, or shoot without a signed release.\n- Discount the session and then give away the prints; that is the margin.\n\nWhen asked a leadership question (raise the package price, add a second shooter, buy the lens, drop a genre), answer with the booking, delivery-capacity, and per-client-sale math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Books only on a deposit and a signed contract','Delivers galleries by the promised date','Sells packages, prints, and albums deliberately','Protects files, rights, and releases'),'stats',jsonb_build_object('acc','94%','cap','strategic','pwr','85','spd','2.3s'),'card_num','NS-596','agentType','Captain','serial_key','CR-LENS-SPEC-0001-NICE'),
    'CR-LENS-SPEC-0001-NICE', ARRAY['captain','specialist','operations','photography','the-lens']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Photographer',           'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Booking & Delivery',     'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Deposits & Packages',    'class-1'),
    (v_ship_id, 4,'sales',         v_hubspot,    'Inquiry Pipeline',       'class-1'),
    (v_ship_id, 5,'marketing',     v_replicate,  'Editing & Retouching',   'class-1'),
    (v_ship_id, 6,'marketing',     v_klaviyo,    'Client Recall & Promos', 'class-1'),
    (v_ship_id, 7,'documentation', v_notion,     'Shot Lists & Contracts', 'class-2'),
    (v_ship_id, 8,'research',      v_cf,         'Reviews & Inspiration',  'class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Production Tracker',     'class-3'),
    (v_ship_id,10,'operations',    v_airtable,   'Galleries & Assets',     'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',             'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Studio Operations',      'class-4');
END $$;
