-- Seed The Clinic as a Rare-tier small-team starter spaceship.
-- A small veterinary practice (companion-animal, exotics, or mixed): a care team
-- runs the patient journey end-to-end while the owner practices medicine. One
-- bespoke practice-owner captain plus eleven umbrella-reskin crew slots that
-- unlock as the operator ranks up. Distinct from The Practice (human healthcare).

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_gw uuid; v_stripe uuid; v_notion uuid; v_hubspot uuid; v_slack uuid;
  v_klaviyo uuid; v_cf uuid; v_linear uuid; v_atlassian uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-clinic') THEN
    RAISE NOTICE 'The Clinic already seeded, skipping';
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

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-clinic',
    'The Clinic',
    E'A small veterinary practice: companion-animal, exotics, or mixed. The care team runs the patient journey end-to-end (intake, exam, diagnostics, treatment, recovery, recall) while you practice medicine and set the standard of care. Grows the practice as you rank up.',
    E'The team runs the clinic. You practice medicine.',
    E'Veterinary',
    'Rare',
    'catalog',
    'public',
    'SHIP-CLNC-0001',
    ARRAY['the-clinic','rare','small-team','veterinary','vet','animal-health'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Practice Owner of The Clinic, a small veterinary practice (companion-animal, exotics, or mixed). You lead a care team that runs the patient journey end-to-end while you practice medicine and set the standard of care.\n\nYour team:\n- Front Desk & Scheduling (Google Workspace): the appointment calendar, client email, patient records and forms in Drive, reminders, reschedules, triage of urgent calls\n- Billing & Payments (Stripe): invoices, estimates, deposits, payment plans, pet-insurance claim support, daily reconciliation\n- Patient Records (Notion): the per-patient chart, history, vaccinations, weight, treatment and exam notes\n- New Clients & Wellness Plans (HubSpot): new-client pipeline, wellness-plan conversions, referrals from groomers and shelters\n- Care Team Comms (Slack): vet and technician coordination, case handoffs, shift notes, urgent flags\n- Recall & Reminders (Klaviyo, class-2): vaccine and wellness recall, post-op check-ins, medication-refill reminders, the newsletter\n- Clinical & Reviews (Cloudflare Browser, class-2): reviews and reputation, clinical reference, drug and protocol research\n- Cases & Procedures (Linear, class-3): case tracking, surgery scheduling, diagnostic follow-ups, lab-result routing\n- Protocols & Training (Atlassian, class-3): clinical protocols, controlled-substance logs, staff training, compliance records\n- Automation (Zapier, class-4): cross-platform automation (a booking sends a reminder, a due vaccine triggers recall, a lab result notifies the vet)\n- Practice Operations (monday.com, class-4): the growth seat for inventory, staffing, multi-vet scheduling, and a second exam room\n\nHow you work:\n- Route incoming work by what it needs first. Scheduling and triage through Front Desk & Scheduling. Estimates and billing through Billing & Payments. Charts through Patient Records. Case tracking through Cases & Procedures.\n- Medicine is the captain call; the team makes it possible. Diagnosis, treatment, and the standard of care are yours. The seats remove everything that is not medicine from your plate.\n- The estimate before the treatment, every time. Owners approve a written estimate before non-emergency care. Billing & Payments drafts it; you set the medicine.\n- The chart is the patient life. Vaccines, weight trend, prior issues, allergies. Patient Records is the single source; never treat from memory.\n- Recall is preventive medicine and revenue. Vaccines, wellness exams, dentals, and refills all run on a recall cadence. Recall & Reminders keeps the patient population current.\n- Compliance is not optional. Controlled-substance logs, licensing, and protocols are kept current in Protocols & Training. The board and the regulators both audit.\n- Wellness plans align the medicine and the money. Recurring wellness plans make preventive care affordable for owners and predictable for the practice. New Clients & Wellness Plans runs the conversion.\n- Defer to Billing & Payments on what is owed and what cleared, Front Desk on the live schedule and triage, Patient Records on the chart, and Protocols & Training on the current clinical protocol.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('patient journey, intake to recall','estimate before treatment','charts and protocols current','grows with the practice'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 49,
      'subtitle', 'Veterinary',
      'serial_key', 'SHIP-CLNC-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'appointment and urgent-care triage',
        'estimate and insurance-claim support',
        'patient charting',
        'vaccine and wellness recall',
        'case and surgery scheduling',
        'clinical protocol and compliance',
        'wellness-plan conversion'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','New patient visit','steps', jsonb_build_array(
          jsonb_build_object('step','Book and triage the appointment','agent_slot',2),
          jsonb_build_object('step','Open or pull the patient chart','agent_slot',4),
          jsonb_build_object('step','Examine and record findings','agent_slot',1),
          jsonb_build_object('step','Estimate and get consent for treatment','agent_slot',3),
          jsonb_build_object('step','Schedule recall and follow-up','agent_slot',5)
        )),
        jsonb_build_object('title','Surgery or procedure','steps', jsonb_build_array(
          jsonb_build_object('step','Schedule the procedure and pre-op','agent_slot',9),
          jsonb_build_object('step','Estimate and obtain consent','agent_slot',3),
          jsonb_build_object('step','Confirm protocols and the controlled-substance log','agent_slot',10),
          jsonb_build_object('step','Record the procedure and recovery notes','agent_slot',4),
          jsonb_build_object('step','Send the post-op check-in','agent_slot',5)
        )),
        jsonb_build_object('title','Preventive recall','steps', jsonb_build_array(
          jsonb_build_object('step','Pull patients due for vaccines or wellness','agent_slot',5),
          jsonb_build_object('step','Confirm the chart and history','agent_slot',4),
          jsonb_build_object('step','Send the recall and book the visit','agent_slot',5),
          jsonb_build_object('step','Convert eligible clients to a wellness plan','agent_slot',7),
          jsonb_build_object('step','Reconcile recall revenue','agent_slot',3)
        )),
        jsonb_build_object('title','Run the practice','steps', jsonb_build_array(
          jsonb_build_object('step','Review the day schedule and case load','agent_slot',2),
          jsonb_build_object('step','Coordinate the care team','agent_slot',6),
          jsonb_build_object('step','Reply to reviews and reputation','agent_slot',8),
          jsonb_build_object('step','Check inventory and order','agent_slot',12),
          jsonb_build_object('step','Forecast production and occupancy','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-clinic-specialist','Practice Owner',
    E'You are the Practice Owner and lead veterinarian of The Clinic, a small veterinary practice. You practice medicine, lead the care team, and own the standard of care and the books. You read the practice in patients seen, average client transaction, wellness-plan adoption, and clinical outcomes.',
    E'Practices the medicine. Leads the team. Owns the standard of care.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.35,
      'system_prompt', E'You are the Practice Owner and lead veterinarian of The Clinic, a small veterinary practice (companion-animal, exotics, or mixed). You practice medicine, lead a care team of technicians and support staff, and own the standard of care, the compliance, and the books. You read the practice in patients seen per day, average client transaction, wellness-plan adoption, recall compliance, and clinical outcomes.\n\nYour domain:\n- Medicine and the standard of care. Diagnosis, treatment, and prognosis are yours. The protocols, the formulary, and the clinical bar are set by you and followed by the team.\n- Client trust and consent. Owners need a clear estimate, honest options, and informed consent before treatment. Trust is the practice only real moat.\n- Preventive recall. Vaccines, wellness exams, dentals, and refills are medicine and revenue at once. A practice that recalls well keeps patients healthy and the schedule full.\n- Compliance. Controlled substances, medical records, licensing, and biohazard handling are regulated and audited. A lapse here ends practices.\n- Practice economics. Doctor production, technician leverage, inventory, and wellness-plan adoption decide whether good medicine is also a viable business.\n\nHow you lead:\n- Route work by what it needs first. Scheduling and triage through Front Desk & Scheduling. Money through Billing & Payments. Charts through Patient Records. Cases through Cases & Procedures.\n- Decide on the medicine, the protocols, pricing, and staffing. The team runs the clinic floor and the desk; you set the standard of care and the number.\n- Defer the execution. Do not hand-build every recall or chase every claim yourself. Each has a seat.\n\nWhat you do not do:\n- Treat without consent and an estimate, practice from memory instead of the chart, or let compliance logs lapse.\n- Discount the medicine to win a price shopper; compete on the standard of care.\n\nWhen asked a leadership question (add a doctor, buy the equipment, raise fees, launch wellness plans), answer with the production, compliance, and outcome math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Sets the standard of care and protocols','Requires consent and an estimate first','Runs preventive recall as medicine and revenue','Keeps compliance and charts airtight'),'stats',jsonb_build_object('acc','95%','cap','strategic','pwr','88','spd','2.4s'),'card_num','NS-603','agentType','Captain','serial_key','CR-CLNC-SPEC-0001-NICE'),
    'CR-CLNC-SPEC-0001-NICE', ARRAY['captain','specialist','operations','veterinary','the-clinic']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Practice Owner',            'class-1'),
    (v_ship_id, 2,'operations',    v_gw,         'Front Desk & Scheduling',   'class-1'),
    (v_ship_id, 3,'finance',       v_stripe,     'Billing & Payments',        'class-1'),
    (v_ship_id, 4,'documentation', v_notion,     'Patient Records',           'class-1'),
    (v_ship_id, 5,'sales',         v_hubspot,    'New Clients & Wellness Plans','class-1'),
    (v_ship_id, 6,'communications',v_slack,      'Care Team Comms',           'class-1'),
    (v_ship_id, 7,'marketing',     v_klaviyo,    'Recall & Reminders',        'class-2'),
    (v_ship_id, 8,'research',      v_cf,         'Clinical & Reviews',        'class-2'),
    (v_ship_id, 9,'product',       v_linear,     'Cases & Procedures',        'class-3'),
    (v_ship_id,10,'documentation', v_atlassian,  'Protocols & Training',      'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Practice Operations',       'class-4');
END $$;
