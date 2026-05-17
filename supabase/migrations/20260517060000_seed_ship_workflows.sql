-- Populate card.workflows for the 11 user-facing ships. Named
-- multi-step procedures the ship runs end-to-end. Stored as a jsonb
-- array of {title, steps[]} objects under card.workflows so no
-- schema change is required; the card renderer reads via
-- bp.card.workflows.
--
-- Editorial guard: active voice, short verbs, no em-dashes
-- (CLAUDE.md "Blueprint Copy Standards"). Idempotent — re-running
-- merges the same key back onto card without disturbing siblings.

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New-client onboarding',
    'steps', jsonb_build_array('Run brand audit', 'Lock scope + budget', 'Set comms cadence', 'Kick off team', 'Confirm success metrics')),
  jsonb_build_object('title', 'Campaign launch',
    'steps', jsonb_build_array('Approve brief', 'Sign off concept', 'Produce assets', 'QA + traffic', 'Go live')),
  jsonb_build_object('title', 'Monthly performance review',
    'steps', jsonb_build_array('Pull channel metrics', 'Reconcile attribution', 'Check retainer utilization', 'Draft client recap', 'Plan next month')),
  jsonb_build_object('title', 'New-business pitch',
    'steps', jsonb_build_array('Discover the problem', 'Surface the insight', 'Land the idea', 'Stage the plan', 'Price the work'))
))
WHERE slug = 'the-madison';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'Sprint kickoff',
    'steps', jsonb_build_array('Groom the backlog', 'Set sprint goal', 'Check team capacity', 'Schedule the demo')),
  jsonb_build_object('title', 'Incident response',
    'steps', jsonb_build_array('Triage the alert', 'Assess blast radius', 'Mitigate user impact', 'Communicate status', 'Write the postmortem')),
  jsonb_build_object('title', 'Hiring loop',
    'steps', jsonb_build_array('Draft role spec', 'Source candidates', 'Run screens', 'Schedule onsite', 'Debrief + decide')),
  jsonb_build_object('title', 'Product launch',
    'steps', jsonb_build_array('Confirm readiness', 'Brief internal', 'Stage public comms', 'Ship the release', 'Monitor metrics'))
))
WHERE slug = 'the-loft';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New matter intake',
    'steps', jsonb_build_array('Run conflict check', 'Scope the engagement', 'Send engagement letter', 'Collect retainer', 'Open the file')),
  jsonb_build_object('title', 'Discovery workflow',
    'steps', jsonb_build_array('Issue preservation hold', 'Collect documents', 'Review for privilege', 'Produce responsive set', 'Log objections')),
  jsonb_build_object('title', 'Deposition prep',
    'steps', jsonb_build_array('Outline topics', 'Pull exhibits', 'Prep the witness', 'Confirm logistics')),
  jsonb_build_object('title', 'Trial readiness',
    'steps', jsonb_build_array('File pretrial motions', 'Finalize witness list', 'Finalize exhibit list', 'Run jury research', 'Confirm courtroom logistics'))
))
WHERE slug = 'the-chambers';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'Opening shift',
    'steps', jsonb_build_array('Check receiving + invoices', 'Walk the prep list', 'Set up the line', 'Brief the team', 'Open the doors')),
  jsonb_build_object('title', 'Allergen ticket',
    'steps', jsonb_build_array('Server confirms with table', 'Mark the ticket', 'Line confirms on the pass', 'Use dedicated tools', 'Runner verifies the plate')),
  jsonb_build_object('title', 'End-of-day close',
    'steps', jsonb_build_array('Count inventory', 'Reconcile voids + comps', 'Run the deposit', 'Sanitize stations', 'Log temps + waste')),
  jsonb_build_object('title', 'Menu change',
    'steps', jsonb_build_array('Cost each new dish', 'Train the line', 'Train servers', 'Update POS + printers', 'Soft launch'))
))
WHERE slug = 'the-galley';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'Product launch',
    'steps', jsonb_build_array('Write listing copy', 'Stage photography', 'Publish to channels', 'Build email flow', 'Brief paid creative')),
  jsonb_build_object('title', 'Abandoned-cart recovery',
    'steps', jsonb_build_array('Segment by stage', 'Send reminder', 'Offer the nudge', 'Retarget on paid', 'Roll into win-back')),
  jsonb_build_object('title', 'Returns review',
    'steps', jsonb_build_array('Inspect the item', 'Restock or destroy', 'Refund the customer', 'Tag the root cause', 'Report SKU trend')),
  jsonb_build_object('title', 'Holiday surge prep',
    'steps', jsonb_build_array('Forecast inventory', 'Scale fulfillment', 'Staff up support', 'Lock paid budget', 'Set the war-room'))
))
WHERE slug = 'the-storefront';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New listing',
    'steps', jsonb_build_array('Pull a CMA', 'Set pricing strategy', 'Stage + photograph', 'Enter the MLS', 'Launch marketing')),
  jsonb_build_object('title', 'Buyer offer',
    'steps', jsonb_build_array('Verify comps', 'Set escalation strategy', 'Draft contingencies', 'Submit the offer', 'Negotiate to ratification')),
  jsonb_build_object('title', 'Closing workflow',
    'steps', jsonb_build_array('Order title', 'Coordinate inspections', 'Run final walkthrough', 'Review settlement statement', 'Fund + hand over keys')),
  jsonb_build_object('title', 'Annual portfolio review',
    'steps', jsonb_build_array('Refresh the comps', 'Score agent performance', 'Audit the pipeline', 'Adjust to market shift'))
))
WHERE slug = 'the-brokerage';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New engagement',
    'steps', jsonb_build_array('Run discovery interviews', 'Draft scope', 'Send SOW', 'Kick off the team')),
  jsonb_build_object('title', 'Mid-engagement review',
    'steps', jsonb_build_array('Status each deliverable', 'Reconcile scope creep', 'Verify billing', 'Open expansion conversation')),
  jsonb_build_object('title', 'Engagement closeout',
    'steps', jsonb_build_array('Deliver final asset', 'Run retrospective', 'Draft case study', 'Close out AR')),
  jsonb_build_object('title', 'Pipeline review',
    'steps', jsonb_build_array('Audit discovery pull-through', 'Update proposal status', 'Track win rate by source', 'Forecast the quarter'))
))
WHERE slug = 'the-studio';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New deal',
    'steps', jsonb_build_array('Take credit app', 'Appraise the trade', 'Desk the deal', 'Present F&I menu', 'Sign + deliver')),
  jsonb_build_object('title', 'Aged inventory',
    'steps', jsonb_build_array('Review days in stock', 'Reprice or recondition', 'Run promo', 'Wholesale or auction the floor')),
  jsonb_build_object('title', 'CSI follow-up',
    'steps', jsonb_build_array('Pull survey gap', 'Diagnose root cause', 'Reach the customer', 'Report to OEM')),
  jsonb_build_object('title', 'Month-end close',
    'steps', jsonb_build_array('Recap sales', 'Recap fixed ops', 'Recap F&I', 'Reconcile expenses', 'Submit OEM reporting'))
))
WHERE slug = 'the-dealership';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New-patient onboarding',
    'steps', jsonb_build_array('Verify eligibility', 'Send intake forms', 'Prep the chart', 'Confirm first visit', 'Capture insurance card')),
  jsonb_build_object('title', 'Denial appeal',
    'steps', jsonb_build_array('Review denial reason', 'Pull supporting docs', 'Draft appeal letter', 'Submit within filing window', 'Track to resolution')),
  jsonb_build_object('title', 'Annual recall',
    'steps', jsonb_build_array('Pull recall list', 'Segment by visit type', 'Send the campaign', 'Follow up no-responses', 'Book the appointments')),
  jsonb_build_object('title', 'Same-day add-on',
    'steps', jsonb_build_array('Confirm open slot', 'Re-verify eligibility', 'Prep the chart', 'Ready the room', 'Notify the provider'))
))
WHERE slug = 'the-practice';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New project setup',
    'steps', jsonb_build_array('Sign the contract', 'Pull the permit', 'Mobilize subs', 'Kick off on site', 'Open the daily log')),
  jsonb_build_object('title', 'Change order',
    'steps', jsonb_build_array('Draft the scope', 'Price the change', 'Note schedule impact', 'Get customer signature', 'Brief the crew')),
  jsonb_build_object('title', 'Draw request',
    'steps', jsonb_build_array('Verify work complete', 'Collect lien waivers', 'Pull progress photos', 'Submit the invoice', 'Confirm release')),
  jsonb_build_object('title', 'Punch-list close',
    'steps', jsonb_build_array('Walk the job', 'Build the punch list', 'Complete the items', 'Re-walk to verify', 'Release retainage'))
))
WHERE slug = 'the-jobsite';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('workflows', jsonb_build_array(
  jsonb_build_object('title', 'New tenant move-in',
    'steps', jsonb_build_array('Screen the application', 'Sign the lease', 'Hold the deposit in trust', 'Walk the unit', 'Hand over keys')),
  jsonb_build_object('title', 'Maintenance dispatch',
    'steps', jsonb_build_array('Open the work order', 'Select the vendor', 'Send notice to enter', 'Complete the work', 'Bill to owner')),
  jsonb_build_object('title', 'Lease renewal',
    'steps', jsonb_build_array('Check market comps', 'Send offer letter', 'Negotiate the response', 'Sign new lease', 'Roll the deposit')),
  jsonb_build_object('title', 'Move-out + deposit',
    'steps', jsonb_build_array('Receive notice', 'Schedule walkthrough', 'Inspect the unit', 'Itemize deductions', 'Return within state window'))
))
WHERE slug = 'the-portfolio';
