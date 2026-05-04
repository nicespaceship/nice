-- Purge Rare and Epic spaceship blueprints (clean-slate continuation).
--
-- Context (2026-05-04, same session as #377): after the Common purge
-- the catalog had 5 Rare + 13 Epic + 16 Legendary + 8 Mythic ships.
-- Decision: drop Rare + Epic and rebuild quality content as
-- themed/canonical Legendary or Mythic. The remaining 24 themed
-- ships (Picard's Enterprise, Voyager, Defiant, Yamato, Heart of
-- Gold, TARDIS, etc.) cover every meaningful narrative and crew slot
-- need. The Rare/Epic tier was filler — second-tier sci-fi ships
-- (Bebop, Nostromo, Serenity, Endurance, Event Horizon, etc.) that
-- were never load-bearing for any user.
--
-- Agents NOT deleted by this migration. The 10 character agents that
-- were ONLY wired to deleted ships (Firefly crew on Serenity, Matrix
-- Nebuchadnezzar trio: Neo, Trinity, Morpheus) are kept — they're
-- iconic high-quality content that should be reassigned to Mythic
-- ships (Neo/Trinity/Morpheus → The Matrix) or kept available for the
-- pickBestUnused auto-populate pool that fills 290 of the 336 themed
-- crew slots across the 24 kept ships.
--
-- Blast radius (verified pre-execution):
--   * 0 active user_spaceships instances on Rare or Epic catalog ships
--
-- Idempotent: re-running the DELETE is a no-op once the rows are gone.

BEGIN;

DELETE FROM public.blueprints
WHERE scope = 'catalog'
  AND type = 'spaceship'
  AND rarity IN ('Rare','Epic');

COMMIT;
