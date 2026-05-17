-- Add a dedicated `marquee` column to spaceship_blueprints and populate it
-- for all 11 currently-shipped user-facing ships.
--
-- The marquee is the short, looping band of copy on the front of every ship
-- card. Until now the renderer fell back to `description`, which is long-form
-- prose meant for the drawer and search snippets — too much to read as it
-- scrolls. The new field gives each ship its own punchy 3-5-verb operational
-- summary in active voice, no em-dashes, per the Blueprint Copy Standards
-- section of CLAUDE.md.
--
-- Idempotent: ALTER guarded by IF NOT EXISTS, UPDATEs match by unique slug.

ALTER TABLE public.spaceship_blueprints
  ADD COLUMN IF NOT EXISTS marquee text;

UPDATE public.spaceship_blueprints SET marquee = 'Brief, concept, ship, measure.'                    WHERE slug = 'the-madison';
UPDATE public.spaceship_blueprints SET marquee = 'Concept, craft, deliver.'                          WHERE slug = 'the-loft';
UPDATE public.spaceship_blueprints SET marquee = 'Conflict-check, draft, file, recover.'             WHERE slug = 'the-chambers';
UPDATE public.spaceship_blueprints SET marquee = 'Open the line. Run the floor. Hit the food cost.'  WHERE slug = 'the-galley';
UPDATE public.spaceship_blueprints SET marquee = 'List, fulfill, support, retain.'                   WHERE slug = 'the-storefront';
UPDATE public.spaceship_blueprints SET marquee = 'List, show, write, close.'                         WHERE slug = 'the-brokerage';
UPDATE public.spaceship_blueprints SET marquee = 'Build, deploy, support, iterate.'                  WHERE slug = 'the-studio';
UPDATE public.spaceship_blueprints SET marquee = 'Sales, finance, service, parts.'                   WHERE slug = 'the-dealership';
UPDATE public.spaceship_blueprints SET marquee = 'Schedule, encounter, document, bill.'              WHERE slug = 'the-practice';
UPDATE public.spaceship_blueprints SET marquee = 'Bid, schedule, build, collect retainage.'          WHERE slug = 'the-jobsite';
UPDATE public.spaceship_blueprints SET marquee = 'Lease, collect, repair, renew.'                    WHERE slug = 'the-portfolio';
