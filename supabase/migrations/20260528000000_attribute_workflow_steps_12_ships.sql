-- Backfill per-step agent attribution on the twelve user-facing ships
-- that didn't get the treatment in #564. Same shape as the Lobby's:
-- each step in card.workflows becomes { step, agent_slot } where
-- agent_slot is 1-indexed into bp.crew (sorted by slot_position).
--
-- The renderer resolves the slot label at render time via bp.crew, so
-- future slot renames (like the slot-11 sweep in #562) propagate
-- without touching this data again. The renderer also accepts bare-
-- string steps, so this migration is the only mechanical change.
--
-- Step-to-slot assignments are made by hand to reflect who actually
-- owns each piece of work in the named industry. Pattern lifted from
-- the Lobby: cluster specialist work on one role (reputation chains,
-- finance clusters), reserve the captain for sign-off and orchestration
-- moments, send cross-team handoffs to the role that owns the surface.
--
-- Idempotent: each ship's UPDATE rewrites card.workflows in full;
-- re-running sets the same JSON. Skips silently when a slug is missing.

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- ─────────────────────────────────────────────────────────────
  -- The Madison — marketing agency. Crew array (1-indexed):
  --  1 Agency Director  2 Account Director  3 Creative Director
  --  4 Campaign Manager 5 Project Manager   6 Copywriter
  --  7 Comms Lead       8 Media Producer    9 Performance Lead
  -- 10 Studio Manager  11 Strategy Lead    12 Finance Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-madison';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New-client onboarding', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Run brand audit',          'agent_slot', 11),
        jsonb_build_object('step', 'Lock scope + budget',      'agent_slot',  2),
        jsonb_build_object('step', 'Set comms cadence',        'agent_slot',  7),
        jsonb_build_object('step', 'Kick off team',            'agent_slot',  5),
        jsonb_build_object('step', 'Confirm success metrics',  'agent_slot',  9)
      )),
      jsonb_build_object('title', 'Campaign launch', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Approve brief',            'agent_slot',  2),
        jsonb_build_object('step', 'Sign off concept',         'agent_slot',  3),
        jsonb_build_object('step', 'Produce assets',           'agent_slot',  8),
        jsonb_build_object('step', 'QA + traffic',             'agent_slot',  4),
        jsonb_build_object('step', 'Go live',                  'agent_slot',  4)
      )),
      jsonb_build_object('title', 'Monthly performance review', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Pull channel metrics',         'agent_slot',  9),
        jsonb_build_object('step', 'Reconcile attribution',        'agent_slot',  9),
        jsonb_build_object('step', 'Check retainer utilization',   'agent_slot', 12),
        jsonb_build_object('step', 'Draft client recap',           'agent_slot',  2),
        jsonb_build_object('step', 'Plan next month',              'agent_slot',  5)
      )),
      jsonb_build_object('title', 'New-business pitch', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Discover the problem',     'agent_slot',  2),
        jsonb_build_object('step', 'Surface the insight',      'agent_slot', 11),
        jsonb_build_object('step', 'Land the idea',            'agent_slot',  3),
        jsonb_build_object('step', 'Stage the plan',           'agent_slot',  5),
        jsonb_build_object('step', 'Price the work',           'agent_slot', 12)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Loft — software startup. Crew (1-indexed):
  --  1 Founder           2 Engineering Lead  3 Designer
  --  4 Product Manager   5 Operations        6 Customer Success
  --  7 Sales Lead        8 Marketing Lead    9 Data Lead
  -- 10 Security Lead    11 Finance Lead     12 People Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-loft';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'Sprint kickoff', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Groom the backlog',        'agent_slot',  4),
        jsonb_build_object('step', 'Set sprint goal',          'agent_slot',  4),
        jsonb_build_object('step', 'Check team capacity',      'agent_slot',  2),
        jsonb_build_object('step', 'Schedule the demo',        'agent_slot',  5)
      )),
      jsonb_build_object('title', 'Incident response', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Triage the alert',         'agent_slot',  2),
        jsonb_build_object('step', 'Assess blast radius',      'agent_slot',  2),
        jsonb_build_object('step', 'Mitigate user impact',     'agent_slot',  6),
        jsonb_build_object('step', 'Communicate status',       'agent_slot',  6),
        jsonb_build_object('step', 'Write the postmortem',     'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Hiring loop', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Draft role spec',          'agent_slot', 12),
        jsonb_build_object('step', 'Source candidates',        'agent_slot', 12),
        jsonb_build_object('step', 'Run screens',              'agent_slot', 12),
        jsonb_build_object('step', 'Schedule onsite',          'agent_slot',  5),
        jsonb_build_object('step', 'Debrief + decide',         'agent_slot',  1)
      )),
      jsonb_build_object('title', 'Product launch', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Confirm readiness',        'agent_slot',  4),
        jsonb_build_object('step', 'Brief internal',           'agent_slot',  4),
        jsonb_build_object('step', 'Stage public comms',       'agent_slot',  8),
        jsonb_build_object('step', 'Ship the release',         'agent_slot',  2),
        jsonb_build_object('step', 'Monitor metrics',          'agent_slot',  9)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Chambers — law firm. Crew (1-indexed):
  --  1 Managing Partner  2 Intake Coordinator 3 Paralegal
  --  4 Case Manager      5 Billing Lead       6 Client Liaison
  --  7 Legal Researcher  8 Marketing Lead     9 Discovery Lead
  -- 10 Knowledge Manager 11 Office Manager   12 Senior Counsel
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-chambers';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New matter intake', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Run conflict check',          'agent_slot',  2),
        jsonb_build_object('step', 'Scope the engagement',        'agent_slot',  1),
        jsonb_build_object('step', 'Send engagement letter',      'agent_slot',  5),
        jsonb_build_object('step', 'Collect retainer',            'agent_slot',  5),
        jsonb_build_object('step', 'Open the file',               'agent_slot',  3)
      )),
      jsonb_build_object('title', 'Discovery workflow', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Issue preservation hold',     'agent_slot',  9),
        jsonb_build_object('step', 'Collect documents',           'agent_slot',  9),
        jsonb_build_object('step', 'Review for privilege',        'agent_slot',  9),
        jsonb_build_object('step', 'Produce responsive set',      'agent_slot',  9),
        jsonb_build_object('step', 'Log objections',              'agent_slot',  3)
      )),
      jsonb_build_object('title', 'Deposition prep', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Outline topics',              'agent_slot', 12),
        jsonb_build_object('step', 'Pull exhibits',               'agent_slot',  3),
        jsonb_build_object('step', 'Prep the witness',            'agent_slot', 12),
        jsonb_build_object('step', 'Confirm logistics',           'agent_slot',  4)
      )),
      jsonb_build_object('title', 'Trial readiness', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'File pretrial motions',       'agent_slot', 12),
        jsonb_build_object('step', 'Finalize witness list',       'agent_slot', 12),
        jsonb_build_object('step', 'Finalize exhibit list',       'agent_slot',  3),
        jsonb_build_object('step', 'Run jury research',           'agent_slot',  7),
        jsonb_build_object('step', 'Confirm courtroom logistics', 'agent_slot',  4)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Galley — restaurant. Crew (1-indexed):
  --  1 Head Chef             2 Reservations Manager 3 Bookkeeper
  --  4 Menu Manager          5 FOH Lead             6 Marketing Lead
  --  7 Vendor Relations      8 Reputation Manager   9 Events Coordinator
  -- 10 Training Manager     11 General Manager     12 Sous Chef
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-galley';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'Opening shift', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Check receiving + invoices',  'agent_slot',  7),
        jsonb_build_object('step', 'Walk the prep list',          'agent_slot', 12),
        jsonb_build_object('step', 'Set up the line',             'agent_slot', 12),
        jsonb_build_object('step', 'Brief the team',              'agent_slot',  1),
        jsonb_build_object('step', 'Open the doors',              'agent_slot',  5)
      )),
      jsonb_build_object('title', 'Allergen ticket', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Server confirms with table',  'agent_slot',  5),
        jsonb_build_object('step', 'Mark the ticket',             'agent_slot',  5),
        jsonb_build_object('step', 'Line confirms on the pass',   'agent_slot', 12),
        jsonb_build_object('step', 'Use dedicated tools',         'agent_slot', 12),
        jsonb_build_object('step', 'Runner verifies the plate',   'agent_slot',  5)
      )),
      jsonb_build_object('title', 'End-of-day close', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Count inventory',             'agent_slot', 11),
        jsonb_build_object('step', 'Reconcile voids + comps',     'agent_slot',  3),
        jsonb_build_object('step', 'Run the deposit',             'agent_slot',  3),
        jsonb_build_object('step', 'Sanitize stations',           'agent_slot', 12),
        jsonb_build_object('step', 'Log temps + waste',           'agent_slot', 12)
      )),
      jsonb_build_object('title', 'Menu change', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Cost each new dish',          'agent_slot',  4),
        jsonb_build_object('step', 'Train the line',              'agent_slot', 10),
        jsonb_build_object('step', 'Train servers',               'agent_slot', 10),
        jsonb_build_object('step', 'Update POS + printers',       'agent_slot',  4),
        jsonb_build_object('step', 'Soft launch',                 'agent_slot',  1)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Storefront — e-commerce. Crew (1-indexed):
  --  1 Founder           2 Bookkeeper        3 Support Lead
  --  4 Email Marketer    5 Catalog Manager   6 CRM Manager
  --  7 Reviews Manager   8 Inventory Manager 9 Wholesale Lead
  -- 10 Knowledge Manager 11 Operations Director 12 Head of Growth
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-storefront';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'Product launch', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Write listing copy',          'agent_slot',  5),
        jsonb_build_object('step', 'Stage photography',           'agent_slot',  5),
        jsonb_build_object('step', 'Publish to channels',         'agent_slot',  5),
        jsonb_build_object('step', 'Build email flow',            'agent_slot',  4),
        jsonb_build_object('step', 'Brief paid creative',         'agent_slot', 12)
      )),
      jsonb_build_object('title', 'Abandoned-cart recovery', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Segment by stage',            'agent_slot',  6),
        jsonb_build_object('step', 'Send reminder',               'agent_slot',  4),
        jsonb_build_object('step', 'Offer the nudge',             'agent_slot',  4),
        jsonb_build_object('step', 'Retarget on paid',            'agent_slot', 12),
        jsonb_build_object('step', 'Roll into win-back',          'agent_slot',  6)
      )),
      jsonb_build_object('title', 'Returns review', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Inspect the item',            'agent_slot',  8),
        jsonb_build_object('step', 'Restock or destroy',          'agent_slot',  8),
        jsonb_build_object('step', 'Refund the customer',         'agent_slot',  3),
        jsonb_build_object('step', 'Tag the root cause',          'agent_slot',  7),
        jsonb_build_object('step', 'Report SKU trend',            'agent_slot',  8)
      )),
      jsonb_build_object('title', 'Holiday surge prep', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Forecast inventory',          'agent_slot',  8),
        jsonb_build_object('step', 'Scale fulfillment',           'agent_slot', 11),
        jsonb_build_object('step', 'Staff up support',            'agent_slot',  3),
        jsonb_build_object('step', 'Lock paid budget',            'agent_slot', 12),
        jsonb_build_object('step', 'Set the war-room',            'agent_slot',  1)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Brokerage — real estate. Crew (1-indexed):
  --  1 Broker-Owner          2 Lead Manager           3 Showings Coordinator
  --  4 Listings Manager      5 Transaction Coordinator 6 Marketing Lead
  --  7 Market Analyst        8 Closing Liaison        9 Closing Coordinator
  -- 10 Forms Manager        11 Director of Operations 12 Recruiting Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-brokerage';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New listing', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Pull a CMA',                  'agent_slot',  7),
        jsonb_build_object('step', 'Set pricing strategy',        'agent_slot',  1),
        jsonb_build_object('step', 'Stage + photograph',          'agent_slot',  4),
        jsonb_build_object('step', 'Enter the MLS',               'agent_slot',  4),
        jsonb_build_object('step', 'Launch marketing',            'agent_slot',  6)
      )),
      jsonb_build_object('title', 'Buyer offer', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Verify comps',                'agent_slot',  7),
        jsonb_build_object('step', 'Set escalation strategy',     'agent_slot',  1),
        jsonb_build_object('step', 'Draft contingencies',         'agent_slot', 10),
        jsonb_build_object('step', 'Submit the offer',            'agent_slot',  5),
        jsonb_build_object('step', 'Negotiate to ratification',   'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Closing workflow', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Order title',                 'agent_slot',  5),
        jsonb_build_object('step', 'Coordinate inspections',      'agent_slot',  3),
        jsonb_build_object('step', 'Run final walkthrough',       'agent_slot',  3),
        jsonb_build_object('step', 'Review settlement statement', 'agent_slot',  5),
        jsonb_build_object('step', 'Fund + hand over keys',       'agent_slot',  9)
      )),
      jsonb_build_object('title', 'Annual portfolio review', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Refresh the comps',           'agent_slot',  7),
        jsonb_build_object('step', 'Score agent performance',     'agent_slot',  1),
        jsonb_build_object('step', 'Audit the pipeline',          'agent_slot',  2),
        jsonb_build_object('step', 'Adjust to market shift',      'agent_slot', 11)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Studio — consultancy. Crew (1-indexed):
  --  1 Founder                  2 Business Development Lead 3 Engagement Manager
  --  4 Bookkeeper                5 Deliverables Lead         6 Client Liaison
  --  7 Calendar Manager          8 Marketing Lead            9 Research Lead
  -- 10 Methods Manager          11 Director of Operations   12 Partnership Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-studio';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New engagement', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Run discovery interviews',    'agent_slot',  2),
        jsonb_build_object('step', 'Draft scope',                 'agent_slot',  3),
        jsonb_build_object('step', 'Send SOW',                    'agent_slot',  3),
        jsonb_build_object('step', 'Kick off the team',           'agent_slot',  3)
      )),
      jsonb_build_object('title', 'Mid-engagement review', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Status each deliverable',      'agent_slot',  5),
        jsonb_build_object('step', 'Reconcile scope creep',        'agent_slot',  3),
        jsonb_build_object('step', 'Verify billing',               'agent_slot',  4),
        jsonb_build_object('step', 'Open expansion conversation',  'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Engagement closeout', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Deliver final asset',         'agent_slot',  5),
        jsonb_build_object('step', 'Run retrospective',           'agent_slot',  3),
        jsonb_build_object('step', 'Draft case study',            'agent_slot',  8),
        jsonb_build_object('step', 'Close out AR',                'agent_slot',  4)
      )),
      jsonb_build_object('title', 'Pipeline review', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Audit discovery pull-through', 'agent_slot',  2),
        jsonb_build_object('step', 'Update proposal status',       'agent_slot',  2),
        jsonb_build_object('step', 'Track win rate by source',     'agent_slot',  9),
        jsonb_build_object('step', 'Forecast the quarter',         'agent_slot',  1)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Dealership — auto. Crew (1-indexed):
  --  1 General Manager          2 Internet Sales Manager 3 Service Advisor
  --  4 Inventory Manager        5 F&I Manager            6 Marketing Lead
  --  7 Market Analyst           8 BDC Lead               9 Parts Manager
  -- 10 Forms Manager           11 Variable Ops Director 12 Fixed Ops Director
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-dealership';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New deal', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Take credit app',             'agent_slot',  5),
        jsonb_build_object('step', 'Appraise the trade',          'agent_slot',  4),
        jsonb_build_object('step', 'Desk the deal',               'agent_slot', 11),
        jsonb_build_object('step', 'Present F&I menu',            'agent_slot',  5),
        jsonb_build_object('step', 'Sign + deliver',              'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Aged inventory', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Review days in stock',           'agent_slot',  4),
        jsonb_build_object('step', 'Reprice or recondition',         'agent_slot',  4),
        jsonb_build_object('step', 'Run promo',                      'agent_slot',  6),
        jsonb_build_object('step', 'Wholesale or auction the floor', 'agent_slot', 11)
      )),
      jsonb_build_object('title', 'CSI follow-up', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Pull survey gap',             'agent_slot',  7),
        jsonb_build_object('step', 'Diagnose root cause',         'agent_slot',  8),
        jsonb_build_object('step', 'Reach the customer',          'agent_slot',  8),
        jsonb_build_object('step', 'Report to OEM',               'agent_slot',  1)
      )),
      jsonb_build_object('title', 'Month-end close', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Recap sales',                 'agent_slot', 11),
        jsonb_build_object('step', 'Recap fixed ops',             'agent_slot', 12),
        jsonb_build_object('step', 'Recap F&I',                   'agent_slot',  5),
        jsonb_build_object('step', 'Reconcile expenses',          'agent_slot', 10),
        jsonb_build_object('step', 'Submit OEM reporting',        'agent_slot',  1)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Practice — healthcare. Crew (1-indexed):
  --  1 Practice Owner            2 Front Desk Coordinator    3 Medical Assistant
  --  4 Billing Coordinator       5 Patient Intake Coordinator 6 Recall Coordinator
  --  7 Eligibility Verifier      8 Care Team Coordinator     9 Quality & Compliance Lead
  -- 10 Forms & Consents Manager 11 Practice Administrator   12 Insurance & Reimbursement Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-practice';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New-patient onboarding', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Verify eligibility',          'agent_slot',  7),
        jsonb_build_object('step', 'Send intake forms',           'agent_slot',  5),
        jsonb_build_object('step', 'Prep the chart',              'agent_slot',  3),
        jsonb_build_object('step', 'Confirm first visit',         'agent_slot',  2),
        jsonb_build_object('step', 'Capture insurance card',      'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Denial appeal', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Review denial reason',          'agent_slot', 12),
        jsonb_build_object('step', 'Pull supporting docs',          'agent_slot', 10),
        jsonb_build_object('step', 'Draft appeal letter',           'agent_slot', 12),
        jsonb_build_object('step', 'Submit within filing window',   'agent_slot',  4),
        jsonb_build_object('step', 'Track to resolution',           'agent_slot',  4)
      )),
      jsonb_build_object('title', 'Annual recall', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Pull recall list',            'agent_slot',  6),
        jsonb_build_object('step', 'Segment by visit type',       'agent_slot',  6),
        jsonb_build_object('step', 'Send the campaign',           'agent_slot',  6),
        jsonb_build_object('step', 'Follow up no-responses',      'agent_slot',  2),
        jsonb_build_object('step', 'Book the appointments',       'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Same-day add-on', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Confirm open slot',           'agent_slot',  2),
        jsonb_build_object('step', 'Re-verify eligibility',       'agent_slot',  7),
        jsonb_build_object('step', 'Prep the chart',              'agent_slot',  3),
        jsonb_build_object('step', 'Ready the room',              'agent_slot',  3),
        jsonb_build_object('step', 'Notify the provider',         'agent_slot',  8)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Jobsite — construction. Crew (1-indexed):
  --  1 General Contractor       2 Project Manager         3 Estimator
  --  4 Bookkeeper                5 Sales Lead              6 Marketing Lead
  --  7 Permit & Code Researcher 8 Field Coordinator       9 Site Safety & Quality Lead
  -- 10 Contracts & Compliance Manager 11 Operations Director 12 Procurement & Materials Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-jobsite';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New project setup', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Sign the contract',          'agent_slot', 10),
        jsonb_build_object('step', 'Pull the permit',            'agent_slot',  7),
        jsonb_build_object('step', 'Mobilize subs',              'agent_slot',  2),
        jsonb_build_object('step', 'Kick off on site',           'agent_slot',  1),
        jsonb_build_object('step', 'Open the daily log',         'agent_slot',  8)
      )),
      jsonb_build_object('title', 'Change order', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Draft the scope',            'agent_slot',  3),
        jsonb_build_object('step', 'Price the change',           'agent_slot',  3),
        jsonb_build_object('step', 'Note schedule impact',       'agent_slot',  2),
        jsonb_build_object('step', 'Get customer signature',     'agent_slot', 10),
        jsonb_build_object('step', 'Brief the crew',             'agent_slot',  8)
      )),
      jsonb_build_object('title', 'Draw request', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Verify work complete',       'agent_slot',  9),
        jsonb_build_object('step', 'Collect lien waivers',       'agent_slot', 10),
        jsonb_build_object('step', 'Pull progress photos',       'agent_slot',  8),
        jsonb_build_object('step', 'Submit the invoice',         'agent_slot',  4),
        jsonb_build_object('step', 'Confirm release',            'agent_slot',  4)
      )),
      jsonb_build_object('title', 'Punch-list close', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Walk the job',               'agent_slot',  9),
        jsonb_build_object('step', 'Build the punch list',       'agent_slot',  2),
        jsonb_build_object('step', 'Complete the items',         'agent_slot',  8),
        jsonb_build_object('step', 'Re-walk to verify',          'agent_slot',  9),
        jsonb_build_object('step', 'Release retainage',          'agent_slot',  4)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Portfolio — property management. Crew (1-indexed):
  --  1 Property Manager          2 Leasing Agent             3 Tenant Coordinator
  --  4 Maintenance Coordinator   5 Trust Accountant          6 Marketing Lead
  --  7 Market Researcher         8 Resident Communications Hub 9 Compliance Manager
  -- 10 Legal & Contracts Manager 11 Director of Operations  12 Owner & Investor Liaison
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-portfolio';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New tenant move-in', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Screen the application',     'agent_slot',  2),
        jsonb_build_object('step', 'Sign the lease',             'agent_slot', 10),
        jsonb_build_object('step', 'Hold the deposit in trust',  'agent_slot',  5),
        jsonb_build_object('step', 'Walk the unit',              'agent_slot',  3),
        jsonb_build_object('step', 'Hand over keys',             'agent_slot',  3)
      )),
      jsonb_build_object('title', 'Maintenance dispatch', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Open the work order',        'agent_slot',  4),
        jsonb_build_object('step', 'Select the vendor',          'agent_slot',  4),
        jsonb_build_object('step', 'Send notice to enter',       'agent_slot',  8),
        jsonb_build_object('step', 'Complete the work',          'agent_slot',  4),
        jsonb_build_object('step', 'Bill to owner',              'agent_slot', 12)
      )),
      jsonb_build_object('title', 'Lease renewal', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Check market comps',         'agent_slot',  7),
        jsonb_build_object('step', 'Send offer letter',          'agent_slot',  2),
        jsonb_build_object('step', 'Negotiate the response',     'agent_slot',  2),
        jsonb_build_object('step', 'Sign new lease',             'agent_slot', 10),
        jsonb_build_object('step', 'Roll the deposit',           'agent_slot',  5)
      )),
      jsonb_build_object('title', 'Move-out + deposit', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Receive notice',                 'agent_slot',  3),
        jsonb_build_object('step', 'Schedule walkthrough',           'agent_slot',  3),
        jsonb_build_object('step', 'Inspect the unit',               'agent_slot',  4),
        jsonb_build_object('step', 'Itemize deductions',             'agent_slot',  5),
        jsonb_build_object('step', 'Return within state window',     'agent_slot',  9)
      ))
    )) WHERE id = v_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- The Salon — beauty / hair / day spa. Crew (1-indexed):
  --  1 Salon Owner               2 Front Desk Coordinator   3 Stylist Notes Lead
  --  4 Bookkeeper                 5 New Client Coordinator   6 Recall Lead
  --  7 Floor Manager              8 Reviews & Reputation Manager 9 Social Producer
  -- 10 Retail Inventory Manager  11 Salon Director         12 Membership & Loyalty Lead
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-salon';
  IF v_id IS NOT NULL THEN
    UPDATE public.spaceship_blueprints
    SET card = jsonb_set(card, '{workflows}', jsonb_build_array(
      jsonb_build_object('title', 'New client consultation', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Capture intake form',              'agent_slot',  5),
        jsonb_build_object('step', 'Run patch test if first color',    'agent_slot',  3),
        jsonb_build_object('step', 'Review hair history and goals',    'agent_slot',  3),
        jsonb_build_object('step', 'Quote service plan',               'agent_slot',  5),
        jsonb_build_object('step', 'Book first appointment',           'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Color service end-to-end', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Pull last visit formula',          'agent_slot',  3),
        jsonb_build_object('step', 'Confirm formula at the bowl',      'agent_slot',  3),
        jsonb_build_object('step', 'Log new formula in record',        'agent_slot',  3),
        jsonb_build_object('step', 'Capture before and after photo',   'agent_slot',  9),
        jsonb_build_object('step', 'Pre-book the refresh',             'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Recall window send', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Segment by last service date',     'agent_slot',  6),
        jsonb_build_object('step', 'Match service to recall window',   'agent_slot',  6),
        jsonb_build_object('step', 'Draft email and SMS variant',      'agent_slot',  6),
        jsonb_build_object('step', 'Send through Klaviyo',             'agent_slot',  6),
        jsonb_build_object('step', 'Route replies to Front Desk',      'agent_slot',  2)
      )),
      jsonb_build_object('title', 'Daily close', 'steps', jsonb_build_array(
        jsonb_build_object('step', 'Reconcile POS to deposit',           'agent_slot',  4),
        jsonb_build_object('step', 'Disburse tips per pool rules',       'agent_slot',  4),
        jsonb_build_object('step', 'Publish stylist retail attach',      'agent_slot', 11),
        jsonb_build_object('step', 'Flag low retail SKUs',               'agent_slot', 10),
        jsonb_build_object('step', 'Confirm tomorrow''s pre-book rate',  'agent_slot',  7)
      ))
    )) WHERE id = v_id;
  END IF;
END $$;
