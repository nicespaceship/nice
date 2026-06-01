-- Drop "The" from Common + Rare business-ship display names, and upgrade two thin
-- names (Care -> Kennel, Lesson -> Academy). Marquee tiers (Epic/Legendary/Mythic)
-- keep their IP names and are untouched.
--
-- Internal identifiers are deliberately left alone: slugs (the-clinic), captain
-- slugs (the-clinic-specialist), serial keys, and tags all stay, so no FK or tag
-- reference breaks. Only the user-facing display name and prose self-references
-- change.
--
-- Prose normalization, via two nested case-sensitive replaces per field:
--   1. ". The Name"  -> ". NewName"   (sentence-start, e.g. tagline subject: "Trade runs the office")
--   2. "The Name"    -> "the NewName" (mid-sentence article: "owner of the Clinic")
-- Case sensitivity is load-bearing: "The Clinic" (the name) is rewritten while
-- "the clinic" (the common noun) and roles like "The PM" are left untouched.
-- Validated against live data in a rolled-back transaction before commit.

DO $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('the-care','Care','Kennel'),
    ('the-cart','Cart','Cart'),
    ('the-chair','Chair','Chair'),
    ('the-coach','Coach','Coach'),
    ('the-counter','Counter','Counter'),
    ('the-desk','Desk','Desk'),
    ('the-galley','Galley','Galley'),
    ('the-lens','Lens','Lens'),
    ('the-lesson','Lesson','Academy'),
    ('the-route','Route','Route'),
    ('the-salon','Salon','Salon'),
    ('the-studio','Studio','Studio'),
    ('the-trade','Trade','Trade'),
    ('the-agency','Agency','Agency'),
    ('the-bakery','Bakery','Bakery'),
    ('the-brokerage','Brokerage','Brokerage'),
    ('the-chambers','Chambers','Chambers'),
    ('the-clinic','Clinic','Clinic'),
    ('the-dealership','Dealership','Dealership'),
    ('the-garage','Garage','Garage'),
    ('the-jobsite','Jobsite','Jobsite'),
    ('the-lobby','Lobby','Lobby'),
    ('the-loft','Loft','Loft'),
    ('the-madison','Madison','Madison'),
    ('the-portfolio','Portfolio','Portfolio'),
    ('the-practice','Practice','Practice'),
    ('the-storefront','Storefront','Storefront')
  ) AS t(slug, oldn, newn)
  LOOP
    UPDATE public.spaceship_blueprints SET
      name = m.newn,
      flavor = replace(replace(flavor, '. The '||m.oldn, '. '||m.newn), 'The '||m.oldn, 'the '||m.newn),
      description = replace(replace(description, '. The '||m.oldn, '. '||m.newn), 'The '||m.oldn, 'the '||m.newn),
      config = jsonb_set(config, '{ship_system_prompt}',
        to_jsonb(replace(replace(config->>'ship_system_prompt', '. The '||m.oldn, '. '||m.newn), 'The '||m.oldn, 'the '||m.newn)::text))
    WHERE slug = m.slug;

    UPDATE public.agent_blueprints SET
      description = replace(replace(description, '. The '||m.oldn, '. '||m.newn), 'The '||m.oldn, 'the '||m.newn),
      flavor = replace(replace(flavor, '. The '||m.oldn, '. '||m.newn), 'The '||m.oldn, 'the '||m.newn),
      config = jsonb_set(config, '{system_prompt}',
        to_jsonb(replace(replace(config->>'system_prompt', '. The '||m.oldn, '. '||m.newn), 'The '||m.oldn, 'the '||m.newn)::text))
    WHERE slug = m.slug || '-specialist';
  END LOOP;
END $$;
