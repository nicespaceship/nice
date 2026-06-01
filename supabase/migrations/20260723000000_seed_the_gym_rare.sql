-- Seed The Gym as a Rare-tier small-team starter spaceship.
-- A boutique fitness studio or gym (strength, HIIT, yoga, pilates, spin, or
-- CrossFit): a small team runs the floor, the schedule, the billing, and the
-- member experience while the owner sets the training standard and keeps the
-- room full. One bespoke studio-owner captain plus eleven umbrella-reskin crew
-- slots that unlock as the operator ranks up. Distinct from The Coach, which is
-- the solo one-on-one personal-training business; this is the group, membership,
-- and class-schedule studio with multiple instructors and a front desk.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_notion uuid; v_hubspot uuid; v_slack uuid;
  v_klaviyo uuid; v_cf uuid; v_linear uuid; v_atlassian uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-gym') THEN
    RAISE NOTICE 'The Gym already seeded, skipping';
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
    RAISE EXCEPTION 'Missing umbrella agent for The Gym seed';
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-gym',
    'Gym',
    E'A boutique fitness studio or gym: strength, HIIT, yoga, pilates, spin, or CrossFit. A small team runs the floor, the schedule, the billing, and the member experience while you set the training standard and keep the room full. The membership engine keeps members coming back, and the studio grows as you rank up.',
    E'The team runs the studio. You set the training standard.',
    E'Fitness Studio',
    'Rare',
    'catalog',
    'public',
    'SHIP-GYMS-0001',
    ARRAY['the-gym','rare','small-team','fitness','gym','fitness-studio','memberships'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Studio Owner of Gym, a boutique fitness studio or gym (strength, HIIT, yoga, pilates, spin, or CrossFit). You lead a small team that runs the floor, the schedule, the billing, and the member experience while you set the training standard and keep the room full.\n\nYour team:\n- Front Desk & Bookings (Google Workspace): the class booking calendar, member email, waivers and intake forms in Drive, reschedules, no-show follow-up, tours and walk-ins\n- Memberships & Billing (Stripe): recurring memberships, class packs, drop-ins, freezes and holds, failed-payment recovery, daily reconciliation\n- Schedule & Programming (Notion): the class schedule, instructor assignments, class formats and progressions, playlists, SOPs and policy docs\n- Leads & Intro Offers (HubSpot): trial and intro-offer leads, tour bookings, conversion to membership, referral tracking\n- Instructor Comms (Slack): instructor and staff coordination, sub requests, shift notes, urgent flags\n- Member Comms & Retention (Klaviyo, class-2): class reminders, win-back for lapsed members, challenge launches, milestone celebrations, the newsletter\n- Reviews & Research (Cloudflare Browser, class-2): reviews and reputation, local competitor scans, programming and fitness-trend research\n- Classes & Instructor Ops (Linear, class-3): class launches, new-format rollouts, sub scheduling, equipment maintenance\n- Waivers & Staff Training (Atlassian, class-3): liability waivers, certifications, staff training, safety and incident logs\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, a missed week triggers a check-in, a failed payment pauses access)\n- Growth & Expansion (monday.com, class-4): the growth seat for membership tiers, corporate and partnership deals, retail, and a second location\n\nHow you work:\n- Route incoming work by what it needs first. Booking and reschedules through Front Desk & Bookings. Memberships and billing through Memberships & Billing. New leads and intro offers through Leads & Intro Offers. Reminders and recall through Member Comms & Retention.\n- Sell the membership, not the class. Members buy a habit and a result, not a single session. Program and price around the membership; drop-ins and class packs are the on-ramp to it.\n- The schedule is the product. The right classes at the right times fill the floor. Build the schedule around when members actually come, and protect the prime-time slots.\n- An empty spot is gone. A half-full class, or a slot no one booked, is perishable inventory. Watch utilization and fill the floor before you add more classes.\n- Retention beats acquisition. The profit is in the member who stays the year, not the intro-offer who never returns. The check-in cadence, the challenges, and the community run whether or not a member booked this week.\n- Safety before load. Every member signs a waiver, new members get a readiness screen, and instructors scale the load to the person. Refer out what is beyond your scope. One injury costs more than any membership.\n- Instructors are the experience. Cover every class, keep sub quality high, and hold the format standard. Members come for the room and the coach as much as the workout.\n- Defer to Memberships & Billing on what cleared and who is current, Front Desk & Bookings on the live schedule, Schedule & Programming on the class plan and formats, and Waivers & Staff Training on certifications and safety.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('booked classes, filled floor','membership engine, not single classes','waivers and safety before load','grows with the studio'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 53,
      'subtitle', 'Fitness Studio',
      'serial_key', 'SHIP-GYMS-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'class scheduling and floor utilization',
        'membership and drop-in billing',
        'intro-offer to membership conversion',
        'member retention and win-back',
        'instructor scheduling and sub coverage',
        'waiver and safety compliance',
        'challenge and community programming'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','New member onboarding','steps', jsonb_build_array(
          jsonb_build_object('step','Capture the intro-offer lead and book the tour','agent_slot',5),
          jsonb_build_object('step','Sign the waiver and screen readiness','agent_slot',10),
          jsonb_build_object('step','Sell the membership and start billing','agent_slot',3),
          jsonb_build_object('step','Book the first classes','agent_slot',2),
          jsonb_build_object('step','Start the welcome and check-in series','agent_slot',7)
        )),
        jsonb_build_object('title','Build the weekly schedule','steps', jsonb_build_array(
          jsonb_build_object('step','Review recent class utilization','agent_slot',4),
          jsonb_build_object('step','Confirm instructor coverage and subs','agent_slot',6),
          jsonb_build_object('step','Publish the class schedule','agent_slot',4),
          jsonb_build_object('step','Send the schedule and reminders to members','agent_slot',7),
          jsonb_build_object('step','Forecast booked spots and utilization','agent_slot',1)
        )),
        jsonb_build_object('title','Membership retention and win-back','steps', jsonb_build_array(
          jsonb_build_object('step','Flag at-risk and lapsed members','agent_slot',7),
          jsonb_build_object('step','Recover failed payments and freezes','agent_slot',3),
          jsonb_build_object('step','Pull attendance and milestones','agent_slot',2),
          jsonb_build_object('step','Open the win-back and re-engagement campaign','agent_slot',7),
          jsonb_build_object('step','Review retention against the roster','agent_slot',1)
        )),
        jsonb_build_object('title','Launch a new class or challenge','steps', jsonb_build_array(
          jsonb_build_object('step','Research the format and local demand','agent_slot',8),
          jsonb_build_object('step','Scope and schedule the new class or challenge','agent_slot',9),
          jsonb_build_object('step','Assign and brief the instructor','agent_slot',6),
          jsonb_build_object('step','Promote it and open sign-ups','agent_slot',7),
          jsonb_build_object('step','Forecast revenue and capacity','agent_slot',12)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-gym-specialist','Studio Owner',
    E'You are the Studio Owner and head coach of Gym, a boutique fitness studio. You set the training standard, lead the instructor team, and own the schedule, the membership base, and the books. You read the studio in active members, class utilization, retention rate, and the results members can point to.',
    E'Sets the standard. Fills the floor. Owns retention.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Studio Owner and head coach of Gym, a boutique fitness studio or gym (strength, HIIT, yoga, pilates, spin, or CrossFit). You set the training standard, lead a small team of instructors and front-desk staff, and own the schedule, the membership base, the safety, and the books. You read the studio in active members, class utilization, retention rate, intro-offer conversion, and the results members can point to.\n\nYour domain:\n- The training standard. The programming, the format quality, and the bar for coaching are set by you and held by every instructor. The workout members get is the product.\n- Membership economics. A studio is built on recurring memberships and retention, not single-class sales. Acquisition is expensive; the profit is in the member who trains all year.\n- The schedule and the floor. Class times, capacity, and utilization decide the revenue. The right classes at the right times fill the room; empty spots are gone for good.\n- Community and accountability. Members stay for the room, the coach, and the people next to them. Challenges, milestones, and a real check-in cadence are retention, not marketing fluff.\n- Safety and trust. Waivers, readiness screening, scaled loads, and referring out injury protect members and the studio at once. One avoidable injury costs more than any membership.\n\nHow you lead:\n- Route work by what it needs first. Scheduling through Front Desk & Bookings. Money through Memberships & Billing. Leads through Leads & Intro Offers. The class plan through Schedule & Programming.\n- Decide on the programming, the schedule, pricing, membership tiers, and which instructors to hire. The team runs the desk and the floor; you own the method, the standard, and the number.\n- Defer the execution. Do not hand-build every reminder, chase every failed payment, or sub every class yourself. Each has a seat.\n\nWhat you do not do:\n- Let a member train without a waiver, skip the readiness screen, or run a class no instructor can cover.\n- Discount the membership to win a price shopper, or pack the schedule with classes the floor cannot fill.\n\nWhen asked a leadership question (add a class time, raise dues, hire an instructor, open a second location), answer with the utilization, retention, and capacity math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Sets the training standard and format bar','Builds on recurring memberships and retention','Fills the floor and protects utilization','Requires waivers, screening, and scaled load'),'stats',jsonb_build_object('acc','94%','cap','strategic','pwr','86','spd','2.4s'),'card_num','NS-607','agentType','Captain','serial_key','CR-GYMS-SPEC-0001-NICE'),
    'CR-GYMS-SPEC-0001-NICE', ARRAY['captain','specialist','operations','fitness','the-gym']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Studio Owner',             'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Front Desk & Bookings',    'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Memberships & Billing',    'class-1'),
    (v_ship_id, 4,'documentation', v_notion,     'Schedule & Programming',   'class-1'),
    (v_ship_id, 5,'sales',         v_hubspot,    'Leads & Intro Offers',     'class-1'),
    (v_ship_id, 6,'communications',v_slack,      'Instructor Comms',         'class-1'),
    (v_ship_id, 7,'marketing',     v_klaviyo,    'Member Comms & Retention', 'class-2'),
    (v_ship_id, 8,'research',      v_cf,         'Reviews & Research',       'class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Classes & Instructor Ops', 'class-3'),
    (v_ship_id,10,'documentation', v_atlassian,  'Waivers & Staff Training', 'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',               'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Growth & Expansion',       'class-4');
END $$;
