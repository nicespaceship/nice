-- Audit pass on ship_slots labels after the Sous Chef catch.
-- Goal: every slot label reads as a real, industry-specific, senior
-- role (no cross-industry borrowing, no bare functions, no generic
-- descriptors).
--
-- Findings:
--   1. "Operations Engineer" was pasted into 8 non-tech ships at
--      slot 11 (c4) — a tech title in restaurants, law offices,
--      dealerships, etc. Replaced with industry-appropriate senior
--      operations titles.
--   2. Three labels were function names, not role titles
--      (Vendor Relations, Operations, Customer Success).
--   3. Two labels were generic or not real titles (Designer alone,
--      Resident Communications Hub).
--   4. One label duplicated a sibling slot (Closing Coordinator at
--      slot 9 vs Closing Liaison at slot 8 on the same ship).
--
-- All updates are idempotent: each WHERE clause includes the current
-- label string so re-running the migration is a no-op once applied.

-- 1. Operations Engineer leak (8 ships, all slot 11, class-4, operations)
UPDATE public.ship_slots SET label = 'Director of Operations'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-brokerage')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'Variable Operations Director'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-dealership')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'General Manager'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-galley')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'Project Executive'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-jobsite')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'Director of Operations'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-portfolio')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'Practice Administrator'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-practice')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'Director of Operations'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-storefront')
    AND slot_position = 11 AND label = 'Operations Engineer';

UPDATE public.ship_slots SET label = 'Director of Operations'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-studio')
    AND slot_position = 11 AND label = 'Operations Engineer';

-- 2. Function-not-title
UPDATE public.ship_slots SET label = 'Purchasing Manager'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-galley')
    AND slot_position = 7 AND label = 'Vendor Relations';

UPDATE public.ship_slots SET label = 'Operations Lead'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-loft')
    AND slot_position = 5 AND label = 'Operations';

UPDATE public.ship_slots SET label = 'Customer Success Lead'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-loft')
    AND slot_position = 6 AND label = 'Customer Success';

-- 3. Generic / not-a-real-title
UPDATE public.ship_slots SET label = 'Design Lead'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-loft')
    AND slot_position = 3 AND label = 'Designer';

UPDATE public.ship_slots SET label = 'Resident Communications Lead'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-portfolio')
    AND slot_position = 8 AND label = 'Resident Communications Hub';

-- 4. Duplicate within ship (slot 8 = Closing Liaison; slot 9 should differentiate)
UPDATE public.ship_slots SET label = 'Transaction Manager'
  WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-brokerage')
    AND slot_position = 9 AND label = 'Closing Coordinator';
