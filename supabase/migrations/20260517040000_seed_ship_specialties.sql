-- Populate card.specialties for the 11 user-facing ships. Curated
-- noun-phrase tags describing what each ship is notably expert at.
-- Stored as a jsonb array under card.specialties so no schema change
-- is required; the card renderer reads via bp.card.specialties.
--
-- Editorial guard: active voice, no em-dashes (CLAUDE.md "Blueprint
-- Copy Standards"). Idempotent — re-running merges the same key
-- back onto card without disturbing siblings.

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'campaign launches',
  'pitch decks',
  'brand voice systems',
  'content calendars',
  'performance reporting',
  'paid-media scaling',
  'SEO content authority'
))
WHERE slug = 'the-madison';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'sprint planning',
  'code review discipline',
  'customer interviews',
  'product-market fit signals',
  'runway math',
  'hiring loops',
  'incident response'
))
WHERE slug = 'the-loft';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'contract review',
  'conflict checks',
  'discovery management',
  'citation research',
  'deposition prep',
  'billable-hour discipline',
  'engagement letters'
))
WHERE slug = 'the-chambers';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'menu engineering',
  'food cost control',
  'FOH and BOH coordination',
  'reservation pacing',
  'supplier negotiation',
  'allergen protocols',
  'health-code readiness'
))
WHERE slug = 'the-galley';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'product listings',
  'abandoned-cart recovery',
  'inventory forecasting',
  'shipping logistics',
  'return processing',
  'conversion optimization',
  'email automation'
))
WHERE slug = 'the-storefront';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'listing presentations',
  'buyer matching',
  'comparative market analysis',
  'offer negotiations',
  'trust accounting',
  'fair-housing compliance',
  'transaction coordination'
))
WHERE slug = 'the-brokerage';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'discovery interviews',
  'deliverable scoping',
  'statement-of-work drafting',
  'billable utilization',
  'pipeline management',
  'methodology documentation',
  'client onboarding'
))
WHERE slug = 'the-studio';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'inventory turn',
  'F&I product menus',
  'credit decisions',
  'trade-in valuation',
  'internet-lead response',
  'service-bay scheduling',
  'fixed-ops profitability'
))
WHERE slug = 'the-dealership';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'revenue cycle management',
  'denial workflow',
  'eligibility verification',
  'recall campaigns',
  'HIPAA documentation',
  'payer-mix optimization',
  'coding accuracy'
))
WHERE slug = 'the-practice';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'change orders',
  'permit tracking',
  'subcontractor scheduling',
  'lien-waiver collection',
  'COI verification',
  'punch-list management',
  'OSHA compliance'
))
WHERE slug = 'the-jobsite';

UPDATE public.spaceship_blueprints
SET card = card || jsonb_build_object('specialties', jsonb_build_array(
  'tenant screening',
  'rent collection',
  'maintenance dispatch',
  'lease renewals',
  'vacancy turnover',
  'trust accounting',
  'fair-housing compliance',
  'owner reporting'
))
WHERE slug = 'the-portfolio';
