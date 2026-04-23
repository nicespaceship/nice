-- Add `scope` column to blueprints
--
-- With Forge consolidated into Marketplace, the `blueprints` table now
-- holds two distinct kinds of rows:
--
--   * catalog blueprints — the 924 curated/seeded blueprints shipped
--     as the platform's built-in library (creator_id is null, not
--     listed on the marketplace).
--   * community blueprints — rows created by users or migrated from
--     Forge that exist because someone published them to the
--     marketplace.
--
-- Without a scope discriminator, the main "Agents" catalog browse
-- would mix the two and the same blueprint could appear in both the
-- Agents and Marketplace sub-tabs. A `scope` column makes the
-- distinction explicit at the schema level and lets both surfaces
-- filter cheaply via an index instead of relying on metadata flags
-- or NOT-EXISTS joins.
--
-- Rows with `metadata.migrated_from_forge = true` are backfilled to
-- 'community' (the 8 seeded Forge demos). All other rows — including
-- the 924 seeded catalog — default to 'catalog'.

BEGIN;

ALTER TABLE public.blueprints
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'catalog'
  CHECK (scope IN ('catalog', 'community'));

-- Backfill: anything migrated from Forge is community-scoped
UPDATE public.blueprints
SET scope = 'community'
WHERE metadata->>'migrated_from_forge' = 'true';

-- Index for filter-by-scope queries (always combined with type)
CREATE INDEX IF NOT EXISTS blueprints_scope_type_idx
  ON public.blueprints (scope, type);

COMMIT;
