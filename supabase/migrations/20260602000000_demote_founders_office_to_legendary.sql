-- Demote The Founder's Office from Mythic to Legendary.
--
-- The Mythic tier is reserved for ships unlocked only via XP grind to
-- Admiral rank (1.5M XP) — the apex of the rank ladder. The Founder's
-- Office is Class-1 recommended and uses generic umbrella reskins for
-- 11 of its 12 seats, which doesn't fit that aspiration. Legendary
-- (Captain rank, 200K XP) is the right tier: still premium, still
-- gates on real progression, but reachable without the Mythic milestone.
--
-- The Matrix remains Mythic — bespoke crew, no Commons, theme-locked,
-- ship-exclusive characters. That's the new Mythic standard.

UPDATE public.spaceship_blueprints
   SET rarity = 'Legendary',
       tags = ARRAY[
         'founders-office',
         'executive-office',
         'ceo',
         'operator',
         'multi-line',
         'holding-company',
         'legendary',
         'captain',
         'launch'
       ]
 WHERE slug = 'the-founders-office'
   AND scope = 'catalog';
