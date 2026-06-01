-- Crew rarity rules for the upper-tier catalog ships.
--
-- Rule 1 (floor): Legendary and Epic ships carry no Common crew. Rare is the
--   lowest crew rarity on both tiers.
-- Rule 2 (marquee): every Legendary ship has at least 3 Legendary crew, the
--   captain plus two marquee mains. The former Common crew are promoted into
--   the Rare/Epic band.
--
-- Mechanism: a new per-slot `ship_slots.rarity` override. Most Common crew are
-- backed by shared umbrella agents (Linear, Stripe, Slack, ...) reused across
-- the Common/Rare business ships, so their rarity cannot be raised on the agent
-- without wrongly promoting those ships too. The override sets a crew member's
-- rarity for one ship only; the client reads `slot.rarity ?? agent.rarity`.
-- Bespoke (ship-exclusive) crew carry rarity on their own agent row, so the
-- marquee promotions edit the agent directly and also show on the agent's card.

-- 1. Per-slot rarity override column (nullable; null falls through to the agent).
ALTER TABLE public.ship_slots
  ADD COLUMN IF NOT EXISTS rarity text
  CHECK (rarity IS NULL OR rarity IN ('Common','Rare','Epic','Legendary','Mythic'));

-- 2. Rule 1 floor: every currently-Common crew slot on a Legendary or Epic ship
--    is overridden to Rare. The underlying umbrella agents stay Common globally.
UPDATE public.ship_slots ss
   SET rarity = 'Rare'
  FROM public.agent_blueprints ab,
       public.spaceship_blueprints sb
 WHERE ss.default_agent_id = ab.id
   AND ss.spaceship_id = sb.id
   AND sb.scope = 'catalog'
   AND sb.rarity IN ('Legendary','Epic')
   AND ab.rarity = 'Common';

-- 3. Rule 2: promote two marquee mains per Legendary ship to Legendary. The
--    captain is already Legendary, so this brings each ship to three. These are
--    bespoke ship-exclusive agents, so editing the agent rarity is safe.
UPDATE public.agent_blueprints SET rarity = 'Legendary'
 WHERE slug IN (
   'galactica-starbuck','galactica-roslin',       -- Battlestar Galactica (+ Adama)
   'discovery-dave-bowman','discovery-frank-poole',-- Discovery One (+ HAL 9000)
   'falcon-leia','falcon-chewbacca',              -- Millennium Falcon (+ Han Solo)
   'normandy-garrus','normandy-tali',             -- Normandy SR-2 (+ Shepard)
   'macross-hikaru','macross-roy',                -- SDF-1 Macross (+ Bruno Global)
   'serenity-zoe','serenity-river',               -- Serenity (+ Malcolm Reynolds)
   'yamato-kodai','yamato-yuki',                  -- Space Battleship Yamato (+ Okita)
   'enterprise-a-spock','enterprise-a-scotty',    -- USS Enterprise-A (+ Kirk)
   'enterprise-riker','enterprise-data'           -- USS Enterprise-D (+ Picard)
 )
   AND scope = 'catalog';

-- 4. The Founder's Office is the only Epic ship whose lead was Rare, which would
--    leave it with no Epic crew after the floor pass. Lift the Founder & CEO to
--    Epic so it matches the other Epic ships: one Epic lead, the rest Rare.
UPDATE public.agent_blueprints SET rarity = 'Epic'
 WHERE id = (
   SELECT ss.default_agent_id
     FROM public.ship_slots ss
     JOIN public.spaceship_blueprints sb ON sb.id = ss.spaceship_id
    WHERE sb.slug = 'the-founders-office' AND ss.slot_position = 1
 );

-- 5. Richer per-ship spread: lift selected supporting cast above the Rare floor
--    to Epic. Runs after the floor pass (step 2) so it overrides those slots'
--    Rare. Targets umbrella-backed slots by (ship, slot position), so the shared
--    agent stays Common globally.
--    - Legendary ships: two iconic supporting characters each.
--    - Epic companies: the CEO's senior operating circle (COO / CFO / CSO).
--    - The Founder's Office: the equivalent inner circle (Chief of Staff,
--      Finance Lead, Operations Lead).
UPDATE public.ship_slots ss SET rarity = 'Epic'
  FROM (VALUES
    ('the-galactica', 7), ('the-galactica', 10),                -- Saul Tigh, Number Six
    ('the-discovery-one', 6), ('the-discovery-one', 3),         -- Heywood Floyd, Dr. Chandra
    ('the-millennium-falcon', 11), ('the-millennium-falcon', 10),-- R2-D2, Finn
    ('the-normandy', 5), ('the-normandy', 8),                   -- Urdnot Wrex, Mordin Solus
    ('the-sdf-1-macross', 8), ('the-sdf-1-macross', 9),         -- Max Jenius, Milia
    ('the-serenity', 3), ('the-serenity', 8),                   -- Kaylee Frye, Inara Serra
    ('the-yamato', 7), ('the-yamato', 9),                       -- Daisuke Shima, Dr. Sado
    ('the-enterprise-a', 5), ('the-enterprise-a', 2),           -- Hikaru Sulu, Pavel Chekov
    ('the-enterprise', 3), ('the-enterprise', 6),               -- Geordi La Forge, Deanna Troi
    ('the-amazon', 7), ('the-amazon', 11), ('the-amazon', 12),
    ('the-anthropic', 7), ('the-anthropic', 11), ('the-anthropic', 12),
    ('the-apple', 7), ('the-apple', 11), ('the-apple', 12),
    ('the-google', 7), ('the-google', 11), ('the-google', 12),
    ('the-meta', 7), ('the-meta', 11), ('the-meta', 12),
    ('the-microsoft', 7), ('the-microsoft', 11), ('the-microsoft', 12),
    ('the-nvidia', 7), ('the-nvidia', 11), ('the-nvidia', 12),
    ('the-spacex', 7), ('the-spacex', 11), ('the-spacex', 12),
    ('the-founders-office', 2), ('the-founders-office', 3), ('the-founders-office', 4)
  ) AS v(ship_slug, pos)
  JOIN public.spaceship_blueprints sb ON sb.slug = v.ship_slug
 WHERE ss.spaceship_id = sb.id AND ss.slot_position = v.pos;
