-- Distribute the 13 user-facing catalog ships across Common→Legendary
-- so the XP-rank gating gradient exists in the catalog. Was uniform
-- Common, which meant every user could activate every ship from day one
-- and rarity carried no progression signal.
--
-- Complexity-graded: lifestyle / single-operator businesses stay Common,
-- multi-role professional services climb the scale.
--   Common    (3): The Galley, The Salon, The Studio
--   Rare      (4): The Lobby, The Loft, The Practice, The Storefront
--   Epic      (4): The Brokerage, The Dealership, The Madison, The Portfolio
--   Legendary (2): The Chambers, The Jobsite

UPDATE public.spaceship_blueprints SET rarity = 'Rare'      WHERE scope = 'catalog' AND slug = 'the-loft';
UPDATE public.spaceship_blueprints SET rarity = 'Rare'      WHERE scope = 'catalog' AND slug = 'the-storefront';
UPDATE public.spaceship_blueprints SET rarity = 'Rare'      WHERE scope = 'catalog' AND slug = 'the-practice';
UPDATE public.spaceship_blueprints SET rarity = 'Rare'      WHERE scope = 'catalog' AND slug = 'the-lobby';
UPDATE public.spaceship_blueprints SET rarity = 'Epic'      WHERE scope = 'catalog' AND slug = 'the-brokerage';
UPDATE public.spaceship_blueprints SET rarity = 'Epic'      WHERE scope = 'catalog' AND slug = 'the-portfolio';
UPDATE public.spaceship_blueprints SET rarity = 'Epic'      WHERE scope = 'catalog' AND slug = 'the-dealership';
UPDATE public.spaceship_blueprints SET rarity = 'Epic'      WHERE scope = 'catalog' AND slug = 'the-madison';
UPDATE public.spaceship_blueprints SET rarity = 'Legendary' WHERE scope = 'catalog' AND slug = 'the-chambers';
UPDATE public.spaceship_blueprints SET rarity = 'Legendary' WHERE scope = 'catalog' AND slug = 'the-jobsite';
