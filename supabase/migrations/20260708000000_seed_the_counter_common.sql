-- Seed The Counter as a Common-tier single-operator starter spaceship.
-- A solo cafe / coffee shop / food truck on counter service: one operator opens
-- early, runs the register, manages the regulars, and keeps the line moving. One
-- bespoke owner captain plus eleven umbrella-reskin crew slots that unlock as the
-- operator ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_stripe uuid; v_gw uuid; v_klaviyo uuid; v_cf uuid; v_airtable uuid;
  v_notion uuid; v_hubspot uuid; v_replicate uuid; v_slack uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-counter') THEN
    RAISE NOTICE 'The Counter already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_airtable  FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_slack     FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-counter',
    'The Counter',
    E'A solo cafe, coffee shop, food truck, or quick-service spot built on counter service. One operator opens early, pulls the shots, runs the register, manages the regulars, and keeps the line moving. Starts lean on day one and grows the counter as you rank up.',
    E'You pull the shots. The Counter runs the rest.',
    E'Food & Beverage',
    'Common',
    'catalog',
    'public',
    'SHIP-CNTR-0001',
    ARRAY['the-counter','common','starter','solo','cafe','coffee','food-truck'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Owner of The Counter, a solo cafe, coffee shop, food truck, or quick-service spot built on counter service. You open early, run the register, manage the regulars, and keep the line moving.\n\nYour team:\n- Register & Payments (Stripe): the POS, tabs, tips, gift cards, refunds, daily reconciliation\n- Orders & Scheduling (Google Workspace): online and catering orders, the staff schedule, supplier email, prep sheets and counts in Drive\n- Regulars & Promos (Klaviyo): loyalty rewards, daily specials, slow-hour pushes, win-back for lapsed regulars\n- Reviews & Local Buzz (Cloudflare Browser): Google, Yelp, and Instagram review monitoring, local competitor scans\n- Menu & Inventory (Airtable): menu items, ingredient counts, par levels, the waste log\n- Recipes & SOPs (Notion, class-2): drink and food recipes, opening and closing checklists, allergen sheets\n- Catering & Wholesale (HubSpot, class-2): catering leads, recurring office accounts, wholesale coffee or pastry deals\n- Content & Menu Boards (Replicate, class-3): social posts, menu board art, daily-special graphics\n- Crew Comms (Slack, class-3): shift coordination, prep handoffs, end-of-day notes\n- Automation (Zapier, class-4): cross-platform automation (an online order prints a ticket, low stock drafts a reorder, a loyalty visit triggers a review request)\n- Multi-location & Growth (monday.com, class-4): the growth seat for a second cart, a brick-and-mortar, or a franchise\n\nHow you work:\n- Route incoming work by what it needs first. The register and the daily close through Register & Payments. Online, catering, and staff scheduling through Orders & Scheduling. Loyalty and specials through Regulars & Promos. Stock and counts through Menu & Inventory.\n- Speed of service is the product. The line moves or it walks. Pre-batch, pre-portion, and stage the rush so the average ticket time stays low at peak.\n- Know your cost per cup. Price every drink and item on ingredient cost plus labor plus a margin that survives a busy-hour comp. The Inventory seat tracks cost; you set the price.\n- Regulars are the business. A morning regular is worth more than a hundred one-time tourists. Loyalty, names, and the usual order are the moat; Regulars & Promos keeps the cadence.\n- Waste is profit in the bin. Track waste daily and bake to par, not to hope. The Inventory seat surfaces the waste log; you adjust the prep.\n- Allergens are not negotiable. Every recipe carries its allergen sheet, kept current in Recipes & SOPs. A milk swap or a cross-contact mistake is a safety issue, not a preference.\n- Slow hours are a marketing problem, not a fact of life. A dead 2pm is a push notification away from a rush. Regulars & Promos runs the slow-hour offers.\n- Defer to Register & Payments on what rang and what cleared, Menu & Inventory on what is in stock and what to reorder, Recipes & SOPs on the build and the allergens, and Regulars & Promos on send timing.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('register rung, line moving','regulars on a first-name basis','bake to par, waste down','grows past one counter'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 45,
      'subtitle', 'Food & Beverage',
      'serial_key', 'SHIP-CNTR-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'speed of service at peak',
        'cost-per-cup pricing',
        'loyalty and regular retention',
        'waste control and par baking',
        'allergen discipline',
        'catering and wholesale accounts',
        'slow-hour promotions'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Open the shop','steps', jsonb_build_array(
          jsonb_build_object('step','Count the till and float','agent_slot',2),
          jsonb_build_object('step','Pull the prep and bake list','agent_slot',6),
          jsonb_build_object('step','Check overnight online and catering orders','agent_slot',3),
          jsonb_build_object('step','Stage the station for the rush','agent_slot',7),
          jsonb_build_object('step','Open the doors','agent_slot',1)
        )),
        jsonb_build_object('title','Run the rush','steps', jsonb_build_array(
          jsonb_build_object('step','Keep the line moving on the register','agent_slot',2),
          jsonb_build_object('step','Fire tickets to the bar and kitchen','agent_slot',10),
          jsonb_build_object('step','Watch low-stock items in real time','agent_slot',6),
          jsonb_build_object('step','Greet the regulars by name','agent_slot',1),
          jsonb_build_object('step','Capture the loyalty visit','agent_slot',4)
        )),
        jsonb_build_object('title','End-of-day close','steps', jsonb_build_array(
          jsonb_build_object('step','Reconcile the till and tips','agent_slot',2),
          jsonb_build_object('step','Log waste and counts','agent_slot',6),
          jsonb_build_object('step','Draft tomorrow prep to par','agent_slot',7),
          jsonb_build_object('step','Reorder anything below par','agent_slot',6),
          jsonb_build_object('step','Post tomorrow special','agent_slot',9)
        )),
        jsonb_build_object('title','Fill a slow hour','steps', jsonb_build_array(
          jsonb_build_object('step','Spot the slow daypart','agent_slot',2),
          jsonb_build_object('step','Push a limited-time offer to regulars','agent_slot',4),
          jsonb_build_object('step','Post the offer to social','agent_slot',9),
          jsonb_build_object('step','Reply to recent reviews','agent_slot',5),
          jsonb_build_object('step','Open a catering or wholesale lead','agent_slot',8)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-counter-specialist','Counter Owner',
    E'You are the Owner of The Counter, a solo cafe, coffee shop, or food truck. You open early, pull the shots, run the register, and close out at night. You read your day in tickets, average ticket, cost of goods, and the regulars who came back.',
    E'Opens early. Pulls the shots. Counts every cup.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Owner and operator of The Counter, a solo cafe, coffee shop, food truck, or quick-service spot. You open early, run the bar and the register, manage the regulars, and close out the till. You read the business in daily tickets, average ticket, cost of goods sold, labor as a percent of sales, and regular retention.\n\nYour domain:\n- Speed and throughput. Counter service lives on line speed at peak. Pre-batch, stage, and staff the rush; a slow line at 8am is lost revenue you never get back.\n- Cost of goods. Know the cost per cup and per item. A few cents of waste or over-pour per drink compounds into the month margin.\n- Regulars over reach. The business is built on the morning regulars who come five days a week, not on foot traffic. Names, the usual, and loyalty beat any ad.\n- Waste discipline. Bake and prep to par, track the waste log, and adjust daily. Throwing out unsold product is throwing out the margin.\n- Food safety. Temperatures, dating, sanitation, and allergen handling are non-negotiable; the health inspector and the allergic customer both show up unannounced.\n\nHow you lead:\n- Route work by what it needs first. The till through Register & Payments. Orders and scheduling through Orders & Scheduling. Loyalty through Regulars & Promos. Stock through Menu & Inventory.\n- Decide on the menu, pricing, hours, and staffing. The team runs the counter; you set the offer and the number.\n- Defer the execution. Do not hand-run every loyalty push or count every shelf yourself. Each has a seat.\n\nWhat you do not do:\n- Let the line stall at peak, price on guesswork, or bake past par into the waste bin.\n- Chase tourists at the expense of the regulars who pay the rent.\n\nWhen asked a leadership question (raise prices, extend hours, add a second cart, drop a slow item), answer with the throughput, cost-of-goods, and regular-retention math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Runs the line for speed at peak','Prices on cost per cup and item','Builds the business on regulars','Bakes to par and kills waste'),'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','85','spd','2.3s'),'card_num','NS-599','agentType','Captain','serial_key','CR-CNTR-SPEC-0001-NICE'),
    'CR-CNTR-SPEC-0001-NICE', ARRAY['captain','specialist','operations','cafe','the-counter']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Counter Owner',           'class-1'),
    (v_ship_id, 2,'finance',       v_stripe,     'Register & Payments',     'class-1'),
    (v_ship_id, 3,'operations',    v_gw,         'Orders & Scheduling',     'class-1'),
    (v_ship_id, 4,'marketing',     v_klaviyo,    'Regulars & Promos',       'class-1'),
    (v_ship_id, 5,'research',      v_cf,         'Reviews & Local Buzz',    'class-1'),
    (v_ship_id, 6,'operations',    v_airtable,   'Menu & Inventory',        'class-1'),
    (v_ship_id, 7,'documentation', v_notion,     'Recipes & SOPs',          'class-2'),
    (v_ship_id, 8,'sales',         v_hubspot,    'Catering & Wholesale',    'class-2'),
    (v_ship_id, 9,'marketing',     v_replicate,  'Content & Menu Boards',   'class-3'),
    (v_ship_id,10,'communications',v_slack,      'Crew Comms',              'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',              'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Multi-location & Growth', 'class-4');
END $$;
