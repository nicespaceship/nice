-- Wire the 13 ship_slots rows that shipped with default_agent_id = NULL.
-- Each slot maps to the umbrella agent best matching its role_type and label,
-- preferring umbrellas not already used elsewhere on the same ship.
--
-- Idempotent: each row only writes when its target slot is still unwired.
-- Safe to re-run.
--
-- Mapping rationale (slot label → umbrella agent):
--   the-brokerage    12 sales       Recruiting Lead                  → monday          (recruiting pipelines)
--   the-chambers     12 legal       Senior Counsel                   → microsoft-365   (Word + Outlook, legal-industry default)
--   the-dealership   12 operations  Fixed Ops Director               → airtable        (parts + service workflows)
--   the-galley       12 product     Sous Chef                        → monday          (menu launch boards)
--   the-jobsite      12 operations  Procurement & Materials Lead     → monday          (procurement boards)
--   the-loft          9 analytics   Data Lead                        → cf-observability (analytics + observability)
--   the-loft         12 people      People Lead                      → airtable        (HR tables)
--   the-madison       9 analytics   Performance Lead                 → cf-observability (campaign performance)
--   the-madison      11 research    Strategy Lead                    → cf-browser      (web research for strategy)
--   the-portfolio    12 finance     Owner & Investor Liaison         → microsoft-365   (investor reports in Excel + Outlook)
--   the-practice     12 finance     Insurance & Reimbursement Lead   → airtable        (claim tracking tables)
--   the-storefront   12 marketing   Head of Growth                   → replicate       (creative production for growth)
--   the-studio       12 sales       Partnership Lead                 → monday          (partnership pipelines)

UPDATE public.ship_slots ss
SET default_agent_id = ab.id
FROM (VALUES
  ('the-brokerage',    12, 'monday'),
  ('the-chambers',     12, 'microsoft-365'),
  ('the-dealership',   12, 'airtable'),
  ('the-galley',       12, 'monday'),
  ('the-jobsite',      12, 'monday'),
  ('the-loft',          9, 'cf-observability'),
  ('the-loft',         12, 'airtable'),
  ('the-madison',       9, 'cf-observability'),
  ('the-madison',      11, 'cf-browser'),
  ('the-portfolio',    12, 'microsoft-365'),
  ('the-practice',     12, 'airtable'),
  ('the-storefront',   12, 'replicate'),
  ('the-studio',       12, 'monday')
) AS wire(ship_slug, slot_position, agent_slug),
  public.spaceship_blueprints sb,
  public.agent_blueprints ab
WHERE sb.slug = wire.ship_slug
  AND ab.slug = wire.agent_slug
  AND ss.spaceship_id = sb.id
  AND ss.slot_position = wire.slot_position
  AND ss.default_agent_id IS NULL;
