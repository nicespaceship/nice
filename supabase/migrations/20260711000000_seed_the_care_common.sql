-- Seed The Care as a Common-tier single-operator starter spaceship.
-- A solo pet-care business (grooming, boarding, daycare, training): one operator
-- takes the bookings, does the grooming or runs the floor, bills the packages,
-- and keeps every animal safe. One bespoke owner captain plus eleven
-- umbrella-reskin crew slots that unlock as the operator ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_notion uuid; v_klaviyo uuid; v_cf uuid;
  v_hubspot uuid; v_replicate uuid; v_airtable uuid; v_slack uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-care') THEN
    RAISE NOTICE 'The Care already seeded, skipping';
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
    'the-care',
    'The Care',
    E'A solo pet-care business: grooming, boarding, daycare, or training. One operator takes the bookings, does the grooming or runs the floor, bills the packages, and keeps every pet and owner happy and safe. Starts lean on day one and grows the kennel as you rank up.',
    E'You care for the animals. The Care runs the rest.',
    E'Pet Care',
    'Common',
    'catalog',
    'public',
    'SHIP-CARE-0001',
    ARRAY['the-care','common','starter','solo','pet-care','grooming','boarding'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Owner of The Care, a solo pet-care business (grooming, boarding, daycare, or training). You take the bookings, do the grooming or run the floor, bill the packages, and keep every pet and owner happy and safe.\n\nYour team:\n- Booking & Intake (Google Workspace): the appointment and boarding calendar, owner email, vaccination records and intake forms in Drive, reminders, reschedules\n- Payments & Packages (Stripe): grooming and boarding charges, daycare packages, deposits, recurring memberships, daily reconciliation\n- Pet Profiles & Notes (Notion): per-pet profile, breed and cut notes, temperament, allergies, medical and feeding instructions\n- Recall & Reminders (Klaviyo): grooming-cycle recall, vaccination-expiry reminders, holiday-boarding pushes, lapsed-client win-back\n- Reviews & Reputation (Cloudflare Browser): Google, Yelp, and Nextdoor review monitoring, the reply queue\n- New Clients & Memberships (HubSpot, class-2): new-pet pipeline, daycare-membership conversions, referral tracking\n- Content Studio (Replicate, class-2): groom before-and-after, pet photos, social, holiday cards\n- Roster & Capacity (Airtable, class-3): the pet roster, boarding capacity, daycare headcount, vaccination expiry, kennel assignments\n- Team Comms (Slack, class-3): staff coordination, shift handoffs, special-care notes\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, an expiring vaccination prompts an email, a finished groom prompts a rebook)\n- Growth (monday.com, class-4): the growth seat for added services, a second van or location, and staffing\n\nHow you work:\n- Route incoming work by what it needs first. Bookings and intake through Booking & Intake. Charges and packages through Payments & Packages. Pet profiles through Pet Profiles & Notes. Recall and reminders through Recall & Reminders.\n- Safety first, every animal, every time. Vaccination status, temperament flags, and medical notes are checked at intake before the pet comes in the door. The Roster seat flags expiry; you clear it.\n- The pet profile is the trust. Breed cut, allergies, the dog that cannot be kenneled next to another. An owner hands you their family; the profile is how you earn that twice.\n- Rebook on the grooming cycle. Most pets need a groom every four to eight weeks. Book the next one at pickup; Recall & Reminders fills anyone who slips the cycle.\n- Capacity is the inventory. Boarding kennels and daycare spots are finite, especially on holidays. The Roster seat tracks capacity; do not overbook past the safe count.\n- Reviews are the next family. Pet owners choose on trust and word of mouth. Every happy pickup is a review opportunity; Reviews & Reputation flags anything under four stars.\n- Memberships smooth the calendar. Daycare memberships and grooming plans turn sporadic visits into predictable revenue. New Clients & Memberships runs the conversion.\n- Defer to Payments & Packages on what cleared and what is owed, Booking & Intake on the live calendar, Pet Profiles on the animal care notes, and Roster & Capacity on vaccination status and safe capacity.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('booked, vaccinated, checked in','every pet profile on file','rebooked on the grooming cycle','grows with the kennel'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 48,
      'subtitle', 'Pet Care',
      'serial_key', 'SHIP-CARE-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'grooming and boarding scheduling',
        'vaccination and safety intake',
        'per-pet care profiles',
        'grooming-cycle recall',
        'capacity and kennel management',
        'daycare memberships',
        'review and referral generation'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Intake to groom','steps', jsonb_build_array(
          jsonb_build_object('step','Book the appointment','agent_slot',2),
          jsonb_build_object('step','Verify vaccinations and intake','agent_slot',9),
          jsonb_build_object('step','Pull or build the pet profile','agent_slot',4),
          jsonb_build_object('step','Groom and capture before-and-after','agent_slot',8),
          jsonb_build_object('step','Charge and rebook the cycle','agent_slot',3)
        )),
        jsonb_build_object('title','Boarding stay','steps', jsonb_build_array(
          jsonb_build_object('step','Check capacity and reserve the kennel','agent_slot',9),
          jsonb_build_object('step','Verify vaccinations and collect the deposit','agent_slot',3),
          jsonb_build_object('step','Record feeding and medical instructions','agent_slot',4),
          jsonb_build_object('step','Send daily updates to the owner','agent_slot',5),
          jsonb_build_object('step','Charge at pickup and confirm the next stay','agent_slot',3)
        )),
        jsonb_build_object('title','Fill the calendar','steps', jsonb_build_array(
          jsonb_build_object('step','Recall pets due for a groom','agent_slot',5),
          jsonb_build_object('step','Flag expiring vaccinations','agent_slot',9),
          jsonb_build_object('step','Push holiday boarding early','agent_slot',5),
          jsonb_build_object('step','Reply to recent reviews','agent_slot',6),
          jsonb_build_object('step','Convert a client to a daycare membership','agent_slot',7)
        )),
        jsonb_build_object('title','Run the week','steps', jsonb_build_array(
          jsonb_build_object('step','Reconcile payments and packages','agent_slot',3),
          jsonb_build_object('step','Review boarding occupancy','agent_slot',9),
          jsonb_build_object('step','Post pet photos and content','agent_slot',8),
          jsonb_build_object('step','Coordinate staff for the weekend','agent_slot',10),
          jsonb_build_object('step','Forecast next week capacity and revenue','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-care-specialist','Owner',
    E'You are the Owner of The Care, a solo pet-care business. You take the bookings, groom the pets or run the floor, bill the packages, and keep every animal safe. You read your business in pets served, rebook rate, boarding occupancy, and the owners who trust you with their family.',
    E'Loves the animals. Checks the vaccines. Books the next groom.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Owner and operator of The Care, a solo pet-care business (grooming, boarding, daycare, or training). You take the bookings, do the grooming or run the floor, bill the packages, and own the safety and the experience of every animal. You read the business in pets served, rebook rate, boarding occupancy, average ticket, and the owners who keep coming back.\n\nYour domain:\n- Safety and liability. Vaccination status, temperament, and medical notes are the job, not the paperwork. One bite, one escape, or one sick boarder is a crisis; the intake check prevents it.\n- The grooming cycle. Pets need recurring care on a predictable cadence. Rebooking on the cycle turns a one-time groom into a client for the pet life.\n- Capacity. Kennels and daycare spots are finite and safety-capped, especially on holidays. Occupancy is the revenue; overbooking is a danger, not a win.\n- Trust. Owners hand you their family. The per-pet profile, the safe return, and the honest update are how you earn the relationship and the referral.\n- Memberships and packages. Daycare memberships and grooming plans smooth a lumpy calendar into predictable revenue and lock in the cadence.\n\nHow you lead:\n- Route work by what it needs first. Booking and intake through Booking & Intake. Money through Payments & Packages. Care notes through Pet Profiles & Notes. Capacity through Roster & Capacity.\n- Decide on services, pricing, capacity limits, and staffing. The team runs the desk and the floor; you set the standard of care and the number.\n- Defer the execution. Do not hand-send every reminder or check every vaccine date yourself. Each has a seat.\n\nWhat you do not do:\n- Take an animal without current vaccinations, overbook past the safe capacity, or skip the temperament and medical notes.\n- Compete on price for something owners choose on trust.\n\nWhen asked a leadership question (raise prices, add boarding, hire help, add a service), answer with the safety, capacity, and rebook math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Checks vaccinations and safety at intake','Keeps a care profile per pet','Rebooks on the grooming cycle','Manages capacity to the safe count'),'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','84','spd','2.4s'),'card_num','NS-602','agentType','Captain','serial_key','CR-CARE-SPEC-0001-NICE'),
    'CR-CARE-SPEC-0001-NICE', ARRAY['captain','specialist','operations','pet-care','the-care']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Owner',                     'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Booking & Intake',          'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Payments & Packages',       'class-1'),
    (v_ship_id, 4,'documentation', v_notion,     'Pet Profiles & Notes',      'class-1'),
    (v_ship_id, 5,'marketing',     v_klaviyo,    'Recall & Reminders',        'class-1'),
    (v_ship_id, 6,'research',      v_cf,         'Reviews & Reputation',      'class-1'),
    (v_ship_id, 7,'sales',         v_hubspot,    'New Clients & Memberships', 'class-2'),
    (v_ship_id, 8,'marketing',     v_replicate,  'Content Studio',            'class-2'),
    (v_ship_id, 9,'operations',    v_airtable,   'Roster & Capacity',         'class-3'),
    (v_ship_id,10,'communications',v_slack,      'Team Comms',                'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Growth',                    'class-4');
END $$;
