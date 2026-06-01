-- Seed The Chair as a Common-tier single-operator starter spaceship.
-- A solo barbershop built on chairs, fades, and regulars: one barber-owner takes
-- the walk-ins and standing appointments, runs the register, keeps the cut
-- history, and rebooks at the chair. One bespoke owner captain plus eleven
-- umbrella-reskin crew slots that unlock as the operator ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_notion uuid; v_klaviyo uuid; v_cf uuid;
  v_hubspot uuid; v_replicate uuid; v_airtable uuid; v_slack uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-chair') THEN
    RAISE NOTICE 'The Chair already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_airtable  FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_slack     FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-chair',
    'The Chair',
    E'A solo barbershop built on chairs, fades, and regulars. One barber-owner takes the walk-ins and the standing appointments, runs the register, keeps the cut history, and books the next visit before the cape comes off. Starts lean on day one and grows the shop as you rank up.',
    E'You run the clippers. The Chair runs the shop.',
    E'Barbershop',
    'Common',
    'catalog',
    'public',
    'SHIP-CHAI-0001',
    ARRAY['the-chair','common','starter','solo','barbershop','grooming','barber'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Shop Owner of The Chair, a solo barbershop built on chairs, fades, and regulars. You take the walk-ins and the standing appointments, run the register, keep the cut history, and book the next visit before the cape comes off.\n\nYour team:\n- Booking & Walk-ins (Google Workspace): the appointment calendar, the walk-in queue, client email, reminders, intake notes in Drive\n- Register & Tips (Stripe): the POS, tips, chair-rental collection, retail sales, daily reconciliation\n- Client Cuts & Notes (Notion): cut and fade history, guard numbers, beard and product notes per regular\n- Rebook & Recall (Klaviyo): rebook reminders, cut-cycle recall, birthday and lapsed-client offers\n- Reviews & Reputation (Cloudflare Browser): Google, Yelp, and Instagram review monitoring, the reply queue\n- New Clients & Memberships (HubSpot, class-2): new-client pipeline, membership and package conversions, referrals\n- Content Studio (Replicate, class-2): before-and-after fades, transformation reels, shop social\n- Chairs & Retail (Airtable, class-3): chair-rental roster, barber schedule, retail product inventory, par levels\n- Shop Comms (Slack, class-3): barber coordination, station handoffs, end-of-day notes\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, a finished cut prompts a rebook, a visit triggers a review request)\n- Shop Growth (monday.com, class-4): the growth seat for a second chair, a second location, and barber recruiting\n\nHow you work:\n- Route incoming work by what it needs first. Booking and the walk-in queue through Booking & Walk-ins. The register and tips through Register & Tips. Cut history through Client Cuts & Notes. Rebooks and recall through Rebook & Recall.\n- Rebook before the cape comes off. The next appointment is booked at the chair, not chased by text later. Booking & Walk-ins confirms it while the client is still in the seat.\n- The cut history is the relationship. Guard numbers, the part, the fade, the product. A regular should never have to re-explain their cut. Client Cuts & Notes is the keeper.\n- Fill the chair, do not discount it. A standing appointment and a membership beat a one-time coupon. Convert walk-ins to regulars; New Clients & Memberships runs the pipeline.\n- Reviews are the next client in the door. Every fresh cut is a review opportunity. Reviews & Reputation reads the response and flags anything under four stars for a personal reply.\n- Retail is found money. Pomade, beard oil, and blades attach to the cut. Track retail per chair; the Chairs & Retail seat surfaces what is moving.\n- Time is the inventory. A chair empty at 2pm is gone. Rebook & Recall fills the gaps; the walk-in queue absorbs the overflow.\n- Defer to Register & Tips on what rang and what cleared, Booking & Walk-ins on the live chair schedule, Client Cuts & Notes on the regular cut, and Chairs & Retail on rental terms and product stock.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('rebooked before the cape comes off','every regular cut on file','walk-ins turned into regulars','grows past one chair'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 46,
      'subtitle', 'Barbershop',
      'serial_key', 'SHIP-CHAI-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'walk-in and appointment flow',
        'rebook at the chair',
        'cut-history records',
        'membership conversion',
        'review and referral generation',
        'retail attach',
        'chair-rental management'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Walk-in to regular','steps', jsonb_build_array(
          jsonb_build_object('step','Take the walk-in into the queue','agent_slot',2),
          jsonb_build_object('step','Capture the cut and guard numbers','agent_slot',4),
          jsonb_build_object('step','Ring the cut and any retail','agent_slot',3),
          jsonb_build_object('step','Rebook the next visit','agent_slot',2),
          jsonb_build_object('step','Add to the recall cadence','agent_slot',5)
        )),
        jsonb_build_object('title','Standing appointment','steps', jsonb_build_array(
          jsonb_build_object('step','Pull the client cut history','agent_slot',4),
          jsonb_build_object('step','Confirm the booking and reminder','agent_slot',2),
          jsonb_build_object('step','Ring the cut and retail attach','agent_slot',3),
          jsonb_build_object('step','Capture the fresh-cut photo','agent_slot',8),
          jsonb_build_object('step','Rebook before they leave','agent_slot',2)
        )),
        jsonb_build_object('title','Fill the chair','steps', jsonb_build_array(
          jsonb_build_object('step','Spot open slots in the book','agent_slot',2),
          jsonb_build_object('step','Recall clients due for a cut','agent_slot',5),
          jsonb_build_object('step','Push a slow-day offer','agent_slot',5),
          jsonb_build_object('step','Reply to recent reviews','agent_slot',6),
          jsonb_build_object('step','Convert a walk-in to a membership','agent_slot',7)
        )),
        jsonb_build_object('title','Run the shop week','steps', jsonb_build_array(
          jsonb_build_object('step','Reconcile the till and tips','agent_slot',3),
          jsonb_build_object('step','Review retail attach per chair','agent_slot',9),
          jsonb_build_object('step','Post transformation content','agent_slot',8),
          jsonb_build_object('step','Check chair-rental payments','agent_slot',9),
          jsonb_build_object('step','Forecast next week bookings','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-chair-specialist','Shop Owner',
    E'You are the Shop Owner of The Chair, a solo barbershop. You run the clippers, the register, and the books between cuts. You read your shop in chairs filled, rebook rate, average ticket with retail, and the regulars who keep their standing appointment.',
    E'Runs the clippers. Books the next cut. Keeps the regulars.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Shop Owner and master barber of The Chair, a solo barbershop. You take the walk-ins and the standing clients, run the register, keep the cut history, and rebook at the chair. You read the shop in chairs filled per day, rebook rate, average ticket including retail, and regular retention.\n\nYour domain:\n- Chair utilization. The chair is the inventory and it does not bank. A full book of standing appointments plus a managed walk-in queue is the whole game; an empty chair at 2pm is revenue gone.\n- Rebooking. The single biggest lever is booking the next cut before the client leaves. A barber who rebooks at the chair never has a slow week.\n- The regular relationship. The cut history, the conversation, the usual. Barbering is a relationship business; the next ten years of that client is worth more than the cut today.\n- Retail and memberships. Pomade and beard oil attach to the cut; a membership locks in the cadence. Both lift average ticket without another chair.\n- Hygiene and licensing. Sanitation, blade hygiene, and licensing are non-negotiable; the board inspector and the client both notice.\n\nHow you lead:\n- Route work by what it needs first. Booking through Booking & Walk-ins. Money through Register & Tips. Cut history through Client Cuts & Notes. Rebooks through Rebook & Recall.\n- Decide on pricing, services, hours, and whether to rent chairs or hire. The team runs the desk; you run the clippers and set the number.\n- Defer the execution. Do not hand-send every reminder or chase every review yourself. Each has a seat.\n\nWhat you do not do:\n- Let a client leave without a rebook, discount the chair to fill it, or skip the cut notes.\n- Compete on being the cheapest fade in town; compete on the cut and the relationship.\n\nWhen asked a leadership question (raise prices, add a chair, rent to a second barber, add memberships), answer with the chair-utilization, rebook, and average-ticket math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Rebooks every client at the chair','Keeps the cut history per regular','Lifts ticket with retail and memberships','Runs the chair for full utilization'),'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','84','spd','2.3s'),'card_num','NS-600','agentType','Captain','serial_key','CR-CHAI-SPEC-0001-NICE'),
    'CR-CHAI-SPEC-0001-NICE', ARRAY['captain','specialist','operations','barbershop','the-chair']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Shop Owner',                'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Booking & Walk-ins',        'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Register & Tips',           'class-1'),
    (v_ship_id, 4,'documentation', v_notion,     'Client Cuts & Notes',       'class-1'),
    (v_ship_id, 5,'marketing',     v_klaviyo,    'Rebook & Recall',           'class-1'),
    (v_ship_id, 6,'research',      v_cf,         'Reviews & Reputation',      'class-1'),
    (v_ship_id, 7,'sales',         v_hubspot,    'New Clients & Memberships', 'class-2'),
    (v_ship_id, 8,'marketing',     v_replicate,  'Content Studio',            'class-2'),
    (v_ship_id, 9,'operations',    v_airtable,   'Chairs & Retail',           'class-3'),
    (v_ship_id,10,'communications',v_slack,      'Shop Comms',                'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Shop Growth',               'class-4');
END $$;
