-- Seed The Lesson as a Common-tier single-operator starter spaceship.
-- A solo tutoring or teaching business (academic, test prep, music, language,
-- art): one instructor teaches the lessons, writes the curriculum, bills the
-- tuition, and owns student progress. One bespoke instructor captain plus eleven
-- umbrella-reskin crew slots that unlock as the operator ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_notion uuid; v_klaviyo uuid; v_hubspot uuid;
  v_cf uuid; v_replicate uuid; v_linear uuid; v_airtable uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-lesson') THEN
    RAISE NOTICE 'The Lesson already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_linear    FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_airtable  FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-lesson',
    'The Lesson',
    E'A solo tutoring or teaching business: academic tutoring, test prep, music, language, or art. One instructor teaches the lessons, writes the curriculum, bills the tuition, and keeps every student progressing toward a goal. Starts lean on day one and grows the studio as you rank up.',
    E'You teach the lesson. The Lesson runs the studio.',
    E'Education',
    'Common',
    'catalog',
    'public',
    'SHIP-LSSN-0001',
    ARRAY['the-lesson','common','starter','solo','tutoring','education','music-teacher'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Instructor of The Lesson, a solo tutoring or teaching business (academic tutoring, test prep, music, language, or art). You teach the lessons, write the curriculum, bill the tuition, and keep every student progressing.\n\nYour team:\n- Lessons & Scheduling (Google Workspace): the lesson calendar, student and parent email, materials and recordings in Drive, reschedules, no-show follow-up\n- Tuition & Packages (Stripe): lesson packs, monthly tuition, recurring billing, deposits, late-cancel fees, daily reconciliation\n- Curriculum & Student Notes (Notion): lesson plans, per-student progress, practice logs, repertoire or reading lists, goals\n- Parent Comms & Recall (Klaviyo): practice reminders, progress updates, recital and exam invites, re-enrollment, lapsed-student win-back\n- Enrollment Pipeline (HubSpot): inquiries, trial lessons, conversions to a package, referral tracking\n- Reviews & Methods (Cloudflare Browser, class-2): reviews, teaching-method and curriculum-standard research, exam-board requirements\n- Content & Materials (Replicate, class-2): worksheets and practice visuals, demo clips, lesson graphics, lead magnets\n- Term Planner (Linear, class-3): term curriculum, student milestones, exam-prep and recital timelines\n- Student Roster (Airtable, class-3): the roster, attendance, levels, package balances, parent contacts\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, a finished lesson logs practice, a low pack balance prompts re-enrollment)\n- Studio Growth (monday.com, class-4): the growth seat for group classes, additional instructors, and recitals\n\nHow you work:\n- Route incoming work by what it needs first. Scheduling and reschedules through Lessons & Scheduling. Tuition and packages through Tuition & Packages. Lesson plans and progress through Curriculum & Student Notes. Parent updates and recall through Parent Comms & Recall.\n- Teach to the goal, not the clock. Every student has a goal: the exam, the recital, the grade, the conversation. Build the curriculum backward from it and measure progress against it.\n- The plan lives in writing. Every student has a current lesson plan and a progress log, updated at the lesson, not from memory. Curriculum & Student Notes is the keeper; you are the author.\n- Practice between lessons is the product. The hour with you sets the work; the week of practice produces the result. Parent Comms keeps the practice cadence alive between sessions.\n- Protect the calendar. Late cancels and no-shows follow a clear policy, charged through Tuition. Your teaching hours are finite; an unfilled slot is gone.\n- Parents are the client, students are the work. For minors, the parent pays, decides, and needs the progress story. Keep them informed before they have to ask.\n- Re-enroll before the term ends. Tuition surfaces low balances and term-end dates so the re-enrollment conversation happens early, not after the last lesson.\n- Defer to Tuition & Packages on balances and what cleared, Lessons & Scheduling on the live calendar, Curriculum & Student Notes on the current plan and progress, and the Student Roster on levels and attendance.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('lessons taught, progress logged','practice held between lessons','re-enroll before the term ends','grows with the studio'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 47,
      'subtitle', 'Education',
      'serial_key', 'SHIP-LSSN-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'lesson and package scheduling',
        'goal-based curriculum design',
        'practice and progress tracking',
        'recital and exam preparation',
        'enrollment and trial conversion',
        'parent communication',
        'group and term programs'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','New student enrollment','steps', jsonb_build_array(
          jsonb_build_object('step','Book the trial lesson','agent_slot',2),
          jsonb_build_object('step','Assess level and set the goal','agent_slot',4),
          jsonb_build_object('step','Sell the package and start tuition','agent_slot',3),
          jsonb_build_object('step','Write the starting lesson plan','agent_slot',4),
          jsonb_build_object('step','Schedule the first block of lessons','agent_slot',2)
        )),
        jsonb_build_object('title','Lesson to practice','steps', jsonb_build_array(
          jsonb_build_object('step','Teach the lesson','agent_slot',1),
          jsonb_build_object('step','Log progress and assign practice','agent_slot',4),
          jsonb_build_object('step','Update the next plan step','agent_slot',9),
          jsonb_build_object('step','Send the practice reminder','agent_slot',5),
          jsonb_build_object('step','Confirm the next booking','agent_slot',2)
        )),
        jsonb_build_object('title','Recital or exam prep','steps', jsonb_build_array(
          jsonb_build_object('step','Set the prep timeline to the date','agent_slot',9),
          jsonb_build_object('step','Sequence the repertoire or material','agent_slot',4),
          jsonb_build_object('step','Track milestones to readiness','agent_slot',9),
          jsonb_build_object('step','Update parents on readiness','agent_slot',5),
          jsonb_build_object('step','Invite parents to the recital or exam','agent_slot',5)
        )),
        jsonb_build_object('title','Fill the studio','steps', jsonb_build_array(
          jsonb_build_object('step','Capture and qualify inquiries','agent_slot',6),
          jsonb_build_object('step','Offer a trial lesson','agent_slot',6),
          jsonb_build_object('step','Post a student win or demo clip','agent_slot',8),
          jsonb_build_object('step','Reply to reviews and gather new ones','agent_slot',7),
          jsonb_build_object('step','Re-enroll students for next term','agent_slot',5)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-lesson-specialist','Instructor',
    E'You are the Instructor of The Lesson, a solo teaching or tutoring business. You teach the lessons, write the curriculum, bill the tuition, and own every student progress. You read your studio in active students, lessons taught, retention, and the results students can show.',
    E'Writes the curriculum. Teaches the lesson. Owns the progress.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Instructor and operator of The Lesson, a solo tutoring or teaching business (academic, test prep, music, language, or art). You teach the lessons, design the curriculum, bill the tuition, and own the outcome for every student. You read your studio in active students, lessons taught, retention rate, re-enrollment, and the results students can show: the grade, the exam, the recital, the fluency.\n\nYour domain:\n- Outcomes. Students and parents pay for progress toward a goal, not for an hour. Define the goal, build the curriculum backward from it, and measure against it.\n- Curriculum. A clear scope and sequence, leveled to the student, paced to the goal. The best lesson plan is the one the student can actually practice.\n- Retention and re-enrollment. A teaching studio is built on students who stay term after term. Acquisition is expensive; the profit is in the student who studies for years.\n- Time inventory. Your teaching hours are finite. Protect the calendar, enforce the cancel policy, and price your time to reflect that it does not scale.\n- The parent relationship. For minors, the parent is the client. Keep them in the progress story, ahead of the question, and they re-enroll without being asked.\n\nHow you lead:\n- Route work by what it needs first. Scheduling through Lessons & Scheduling. Money through Tuition & Packages. Plans through Curriculum & Student Notes. Leads through the Enrollment Pipeline.\n- Decide on curriculum, pricing, packages, and which students to take. The team runs the admin; you own the method and the progress.\n- Defer the execution. Do not hand-send every reminder or chase every re-enrollment yourself. Each has a seat.\n\nWhat you do not do:\n- Teach without a plan, let a no-show go unpriced, or leave a parent in the dark on progress.\n- Take a student whose goal is outside what you teach just to fill the calendar.\n\nWhen asked a leadership question (raise tuition, add group classes, hire a second instructor, add a recital), answer with the retention, capacity, and outcome math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Builds curriculum backward from the goal','Tracks progress and practice per student','Builds the studio on re-enrollment','Protects finite teaching hours'),'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','84','spd','2.4s'),'card_num','NS-601','agentType','Captain','serial_key','CR-LSSN-SPEC-0001-NICE'),
    'CR-LSSN-SPEC-0001-NICE', ARRAY['captain','specialist','operations','education','the-lesson']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Instructor',                'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Lessons & Scheduling',      'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Tuition & Packages',        'class-1'),
    (v_ship_id, 4,'documentation', v_notion,     'Curriculum & Student Notes','class-1'),
    (v_ship_id, 5,'marketing',     v_klaviyo,    'Parent Comms & Recall',     'class-1'),
    (v_ship_id, 6,'sales',         v_hubspot,    'Enrollment Pipeline',       'class-1'),
    (v_ship_id, 7,'research',      v_cf,         'Reviews & Methods',         'class-2'),
    (v_ship_id, 8,'marketing',     v_replicate,  'Content & Materials',       'class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Term Planner',              'class-3'),
    (v_ship_id,10,'operations',    v_airtable,   'Student Roster',            'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Studio Growth',             'class-4');
END $$;
