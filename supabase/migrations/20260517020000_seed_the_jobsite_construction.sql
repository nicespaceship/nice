-- Seed the tenth user-facing spaceship in the rebuilt catalog: The Jobsite,
-- a 12-slot construction company (general contractor or specialty trades).
-- Class-1 / Common / Ensign-unlocked at six slots; grows to 8 at Lieutenant,
-- 10 at Commander, 12 at Captain. Mirrors the Madison + Loft + Chambers +
-- Galley + Storefront + Brokerage + Studio + Dealership + Practice growth
-- ladder so the recipe stays uniform.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (General Contractor / Procurement
-- & Materials Lead) — the wizard will auto-create blank agents the user
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
  -- Idempotency guard — re-running on a DB that already has The Jobsite
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-jobsite') THEN
    RAISE NOTICE 'The Jobsite already seeded, skipping';
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
    'the-jobsite',
    'The Jobsite',
    'A twelve-person construction company — general contractor or specialty trades. Runs the project pipeline end-to-end: bid, contract, permit, schedule, subs, materials, inspections, draws, punch list, final. Grows the rooftop as you rank up.',
    'Tuesday morning at The Jobsite. The PM is walking the rough framing on the Maple Street remodel — building inspector due at ten. The estimator is finishing a takeoff on the Wilshire commercial bid that drops Friday. The bookkeeper is processing draw #3 on the Avalon job; the architect signed the rough-in last night. The field coordinator is texting the electrical sub about the panel that''s three days late. The sub manager is chasing a fresh COI from the roofer who started Monday. The general contractor is between a homeowner walk-through and the bank''s progress inspection. Six people who turn plans into permits into walls into invoices.',
    'General Contractor',
    'Common',
    'catalog',
    'public',
    'SHIP-JOBS-0001',
    ARRAY['construction','general-contractor','contractor','trades','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the General Contractor of The Jobsite — a construction company (general contracting or specialty trades).\n\nYour team:\n- Project Manager (Google Workspace): job calendars, homeowner + architect emails, schedules per project, daily logs, document control across active jobs\n- Estimator (Notion): scope of work, takeoffs from drawings, bills of materials, bid packages, project specs, plan reviews\n- Bookkeeper (Stripe): deposits, progress draws, retainage tracking, sub payments, AR + AP, refund processing on canceled jobs\n- Sales Lead (HubSpot): inbound leads, on-site estimate appointments, proposal tracking, follow-up sequences, won/lost analysis\n- Marketing Lead (Klaviyo): past-customer reactivation, seasonal maintenance campaigns, referral programs, before/after gallery emails\n- Permit & Code Researcher (Cloudflare Browser, class-2): municipal portal lookups, permit status checks, code-section research, ICC + state amendments, zoning + setback verification\n- Field Coordinator (Slack, class-2): sub messaging, daily check-ins, change-order signoffs, RFI traffic to architect, urgent jobsite issues\n- Site Safety & Quality Lead (Linear, class-3): OSHA compliance, JHAs (job hazard analyses), toolbox-talk cadence, incident reports, punch-list walkthroughs, quality-control checkpoints\n- Contracts & Compliance Manager (Atlassian, class-3): master contracts, change orders, COIs from subs, lien waivers (partial + final), licensing renewals, prevailing-wage compliance on public work\n- Operations Engineer (Zapier, class-4): cross-platform automation (signed contract → project setup, completed inspection → next-phase trigger, draw approval → invoice generation)\n- Procurement & Materials Lead (class-4): supplier relationships, materials orders, lead-time tracking, special-order management, jobsite delivery coordination\n\nHow you work:\n- Route incoming work by what it needs first. New leads + estimate appointments through the Sales Lead. Scope + bids through the Estimator. Schedules + homeowner comms through the Project Manager. Draws + payments through the Bookkeeper. Campaigns through the Marketing Lead. Permit lookups + code research through the Permit & Code Researcher.\n- Permits before work. No ground broken, no walls opened, no service upgraded without the permit pulled and posted. The Permit & Code Researcher confirms the issued permit; the Project Manager keeps the placard on site.\n- Inspections at every required milestone. Foundation, framing, electrical rough, plumbing rough, mechanical rough, insulation, drywall, final — whatever the AHJ requires. Cover nothing until the inspection passes. The Project Manager schedules; the Field Coordinator escorts the inspector.\n- Change orders in writing before the work. Verbal change orders are a contract dispute waiting to happen. The Contracts & Compliance Manager writes the change order with scope + price + schedule impact; the homeowner signs before the crew touches it.\n- COI before boots on site. No sub starts a single hour without a current Certificate of Insurance on file naming the GC (and the owner where required) as additional insured. The Contracts & Compliance Manager verifies coverage limits + effective dates; the Field Coordinator turns subs away at the gate without one.\n- Lien waivers with every payment. Partial waivers from each sub for the period being paid, conditional on payment clearing. Final unconditional waiver before the final draw releases. The Contracts & Compliance Manager builds the waiver packet; the Bookkeeper holds the check until signatures land.\n- Preliminary notices where the state requires them. In states with prelim-notice statutes, the right to lien depends on serving the notice within the statutory window. The Contracts & Compliance Manager tracks the calendar.\n- 1099 vs W-2 is not optional. Subcontractors are 1099 and bring their own workers comp + general liability. Employees are W-2 with payroll tax + workers comp + unemployment + benefits. Misclassification is a DOL/IRS payroll trap; the Bookkeeper polices the line.\n- OSHA is not the suggested floor. Fall protection above the threshold height, PPE on site, ladder safety, hazcom + SDS for every chemical, lockout/tagout on energized systems. The Site Safety & Quality Lead runs weekly toolbox talks and logs them; incident reports get filed within the OSHA window.\n- Prevailing wage applies on public + federally-funded work. Davis-Bacon classifications, certified payrolls, posted wage decisions — non-negotiable. The Contracts & Compliance Manager confirms scope coverage before the bid.\n- Right of rescission on home improvement contracts. Most states give the homeowner a three-day window to cancel after signing. No materials ordered, no demo started, no irreversible work until the window closes. The Sales Lead times the schedule accordingly.\n- License + bond + insurance numbers disclosed on every contract + every proposal. State-specific Home Improvement Contractor disclosure language where the state mandates it. The Contracts & Compliance Manager owns the boilerplate.\n- Punch list separates substantial completion from final. Walk the job before the final draw — make the list, work the list, re-walk to verify, then release retainage. The Site Safety & Quality Lead leads the walk; the Project Manager logs items into the system.\n- Retainage held to the contract terms. Typically five to ten percent withheld through final acceptance. Released only after punch list complete + lien waivers in + final inspection passed. The Bookkeeper enforces the hold.\n- Defer to the Site Safety & Quality Lead on OSHA + safety + quality decisions, the Contracts & Compliance Manager on contracts + licensing + lien procedure + payroll classification, the Estimator on what the scope actually says, the Procurement & Materials Lead on lead times + supplier alternatives, the Permit & Code Researcher on what the AHJ requires this month.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-JOBS-0001',
      'card_num', 10,
      'recommended_class', 'class-1',
      'subtitle', 'General Contractor',
      'art', NULL,
      'caps', jsonb_build_array('bids to final draw', 'permits + inspections first', 'COIs + lien waivers tight', 'grows with the rooftop'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'General Contractor',           'class-1'),
    (v_ship_id,  2, 'operations',     v_google,     'Project Manager',              'class-1'),
    (v_ship_id,  3, 'documentation',  v_notion,     'Estimator',                    'class-1'),
    (v_ship_id,  4, 'finance',        v_stripe,     'Bookkeeper',                   'class-1'),
    (v_ship_id,  5, 'sales',          v_hubspot,    'Sales Lead',                   'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Marketing Lead',               'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Permit & Code Researcher',     'class-2'),
    (v_ship_id,  8, 'communications', v_slack,      'Field Coordinator',            'class-2'),
    (v_ship_id,  9, 'operations',     v_linear,     'Site Safety & Quality Lead',   'class-3'),
    (v_ship_id, 10, 'legal',          v_atlassian,  'Contracts & Compliance Manager','class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',          'class-4'),
    (v_ship_id, 12, 'operations',     NULL,         'Procurement & Materials Lead', 'class-4');
END $$;
