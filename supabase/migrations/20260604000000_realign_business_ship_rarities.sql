-- Realign business-vertical ship rarities for the new tier model.
--
-- Tier model (locked 2026-05-26):
--   Common + Rare: real business starters (Galley, Salon, Loft, Practice, ...).
--                  Reachable from day one so users can run actual businesses.
--   Epic         : real-world company examples (NVIDIA, SpaceX, etc.) and the
--                  Founder's Office archetype.
--   Legendary    : sci-fi IP for marketing/aspiration (Enterprise, Serenity, ...).
--   Mythic       : apex sci-fi IP with ship-exclusive bespoke crew (Matrix,
--                  Heart of Gold).
--
-- Before this migration, six business ships sat in tiers that gated them
-- behind XP grind even though users want to start running these businesses
-- immediately. Demoted to Rare. The Founder's Office stays at Epic because
-- the multi-line CEO archetype belongs alongside the new company-example
-- ships rather than at the small-business starter tier.

UPDATE public.spaceship_blueprints SET rarity = 'Rare' WHERE scope = 'catalog' AND slug = 'the-madison';
UPDATE public.spaceship_blueprints SET rarity = 'Rare' WHERE scope = 'catalog' AND slug = 'the-brokerage';
UPDATE public.spaceship_blueprints SET rarity = 'Rare' WHERE scope = 'catalog' AND slug = 'the-dealership';
UPDATE public.spaceship_blueprints SET rarity = 'Rare' WHERE scope = 'catalog' AND slug = 'the-portfolio';
UPDATE public.spaceship_blueprints SET rarity = 'Rare' WHERE scope = 'catalog' AND slug = 'the-chambers';
UPDATE public.spaceship_blueprints SET rarity = 'Rare' WHERE scope = 'catalog' AND slug = 'the-jobsite';
UPDATE public.spaceship_blueprints SET rarity = 'Epic' WHERE scope = 'catalog' AND slug = 'the-founders-office';

-- Refresh the Founder's Office tags so they reflect the new tier.
UPDATE public.spaceship_blueprints
   SET tags = ARRAY[
         'founders-office',
         'executive-office',
         'ceo',
         'operator',
         'multi-line',
         'holding-company',
         'epic',
         'commander',
         'launch'
       ]
 WHERE slug = 'the-founders-office'
   AND scope = 'catalog';
