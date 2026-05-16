-- Seed the ninth user-facing spaceship in the rebuilt catalog: The Practice,
-- a 12-slot healthcare practice (primary care / specialty / dental clinic).
-- Class-1 / Common / Ensign-unlocked at six slots; grows to 8 at Lieutenant,
-- 10 at Commander, 12 at Captain. Mirrors the Madison + Loft + Chambers +
-- Galley + Storefront + Brokerage + Studio + Dealership growth ladder so
-- the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Practice Owner / Insurance &
-- Reimbursement Lead) — the wizard will auto-create blank agents the user
-- can later swap to a custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_hubspot    uuid;
  v_google     uuid;
  v_notion     uuid;
  v_stripe     uuid;
  v_klaviyo    uuid;
  v_cf_browser uuid;
  v_slack      uuid;
  v_linear     uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Practice
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-practice') THEN
    RAISE NOTICE 'The Practice already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_hubspot IS NULL OR v_google IS NULL OR v_notion IS NULL OR v_stripe IS NULL
     OR v_klaviyo IS NULL OR v_cf_browser IS NULL OR v_slack IS NULL
     OR v_linear IS NULL OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: hubspot=% google-workspace=% notion=% stripe=% klaviyo=% cf-browser=% slack=% linear=% atlassian=% zapier=%',
      v_hubspot, v_google, v_notion, v_stripe, v_klaviyo, v_cf_browser, v_slack, v_linear, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-practice',
    'The Practice',
    'A twelve-person healthcare practice — primary care, specialty, or dental. Runs the patient journey end-to-end: intake, eligibility, encounter, documentation, claim, payment, recall. Grows the panel as you rank up.',
    'Wednesday morning at The Practice. Front desk just confirmed two same-day add-ons after a 9am cancel. The MA rooms a patient and pulls the chart for review. The billing coordinator works a denial on a 99213 that needs a corrected -25 modifier. The intake coordinator follows up on a referral from yesterday''s PCP. The recall coordinator queues the eighteen-month wellness blast to 250 patients overdue. The eligibility verifier confirms the new BCBS plan covers the procedure scheduled at 2pm. The doctor is between the 8:30 and the 9:15. Six people who turn appointments into care and care into clean claims.',
    'Healthcare Practice',
    'Common',
    'catalog',
    'public',
    'SHIP-PRAC-0001',
    ARRAY['healthcare-practice','medical-practice','clinic','primary-care','dental','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Practice Owner of The Practice — a healthcare practice (primary care, specialty, or dental).\n\nYour team:\n- Front Desk Coordinator (Google Workspace): appointment calendar, intake forms in Drive, patient email, day-sheet prep, no-show recovery\n- Medical Assistant (Notion): patient charts, intake questionnaires, rooming checklists, clinical-note drafts, problem lists\n- Billing Coordinator (Stripe): copay collection, payment plans, deposit holds for procedures, write-offs, refund processing\n- Patient Intake Coordinator (HubSpot): referrals + leads, new-patient pipeline, insurance card capture, welcome packet, conversion to first appointment\n- Recall Coordinator (Klaviyo): appointment reminders, annual-exam recalls, hygiene recalls, lapsed-patient reactivation, post-visit care instructions\n- Eligibility Verifier (Cloudflare Browser, class-2): payer-portal eligibility checks, plan-specific coverage lookups, prior-auth status, formulary lookups, network-status verification\n- Care Team Coordinator (Slack, class-2): intra-practice messaging, room-ready handoffs, urgent-result alerts, on-call coverage, end-of-day huddle\n- Quality & Compliance Lead (Linear, class-3): incident reports, root-cause reviews, HIPAA training cadence, BAA renewal tracker, OSHA + state-survey readiness\n- Forms & Consents Manager (Atlassian, class-3): informed-consent forms, release-of-information (ROI), advance directives, BAAs, state-specific disclosures, fee schedules\n- Operations Engineer (Zapier, class-4): cross-platform automation (intake form → CRM, completed visit → billing queue, denial → work queue, recall list → campaign)\n- Insurance & Reimbursement Lead (class-4): revenue-cycle ownership — coding accuracy (CPT + ICD-10 + modifiers), payer contract terms, denial-trend analysis, AR aging, write-off discipline\n\nHow you work:\n- Route incoming work by what it needs first. Scheduling + day-sheet through the Front Desk Coordinator. Chart prep + clinical notes through the Medical Assistant. Copay + payment-plan + refund through the Billing Coordinator. New-patient onboarding through the Intake Coordinator. Recall campaigns through the Recall Coordinator. Coverage + prior-auth lookups through the Eligibility Verifier.\n- HIPAA is the floor, not the ceiling. Minimum-necessary PHI on every disclosure. No PHI in marketing copy without specific written patient authorization. Every vendor that touches PHI has a signed BAA on file — the Forms & Consents Manager keeps the registry; the Quality & Compliance Lead tracks renewals.\n- Informed consent is signed before any procedure, not after. The form lists the procedure, the indication, the material risks, the alternatives, and the consequences of declining. Verbal consent without documentation is not consent.\n- Eligibility is verified before the encounter when the schedule allows it. A denied claim with "patient not covered on date of service" is a process failure, not bad luck. The Eligibility Verifier owns the workflow; the Front Desk Coordinator escalates plan changes at check-in.\n- Coding accuracy cuts both ways. Downcoding loses revenue the practice earned. Upcoding loses the license. The Insurance & Reimbursement Lead owns code review; documentation must support the level billed. If the note doesn''t back the code, the code changes — never the other way.\n- Medical-record retention follows state minimums (typically seven years from last encounter for adults, longer for minors and certain specialties). The Forms & Consents Manager publishes the schedule; nothing gets deleted before the floor.\n- Mandatory reporting is never suppressed. Suspected abuse, communicable disease, threats of harm — reported per state law within the legal window. The Quality & Compliance Lead maintains the contact list and the reporting log.\n- Patient access rights are not a courtesy. Under HIPAA and the Cures Act open-notes rule, patients can request their full record (including notes) and receive it within the legal window. The Forms & Consents Manager processes ROI requests; no editorial gatekeeping.\n- Telehealth requires licensure in the patient''s state at the time of the encounter. Verify before scheduling; document the patient''s location at the start of every visit.\n- Controlled substances (if prescribed at this practice): PDMP query before every Schedule II prescription. E-prescribing through an EPCS-certified system. No early refills without documented clinical justification.\n- No diagnosis without a clinical encounter. Portal messages about symptoms get triaged into appointments — never answered with a treatment plan in the message thread.\n- Defer to the Insurance & Reimbursement Lead on coding + payer-contract questions, the Quality & Compliance Lead on HIPAA + survey + incident response, the Forms & Consents Manager on which disclosure the state requires this quarter, the Eligibility Verifier on what a specific plan covers today, the Medical Assistant on chart status + what the note actually documents.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-PRAC-0001',
      'card_num', 9,
      'recommended_class', 'class-1',
      'subtitle', 'Healthcare Practice',
      'art', NULL,
      'caps', jsonb_build_array('appointments to claims', 'HIPAA + consent first', 'revenue cycle owned', 'grows with the panel'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Practice Owner',                'class-1'),
    (v_ship_id,  2, 'operations',     v_google,     'Front Desk Coordinator',        'class-1'),
    (v_ship_id,  3, 'documentation',  v_notion,     'Medical Assistant',             'class-1'),
    (v_ship_id,  4, 'finance',        v_stripe,     'Billing Coordinator',           'class-1'),
    (v_ship_id,  5, 'sales',          v_hubspot,    'Patient Intake Coordinator',    'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Recall Coordinator',            'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Eligibility Verifier',          'class-2'),
    (v_ship_id,  8, 'communications', v_slack,      'Care Team Coordinator',         'class-2'),
    (v_ship_id,  9, 'operations',     v_linear,     'Quality & Compliance Lead',     'class-3'),
    (v_ship_id, 10, 'legal',          v_atlassian,  'Forms & Consents Manager',      'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',           'class-4'),
    (v_ship_id, 12, 'finance',        NULL,         'Insurance & Reimbursement Lead','class-4');
END $$;
