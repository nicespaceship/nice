-- D.7: drop the legacy public.blueprints table.
--
-- The three-layer rebuild (catalog_rebuild project, docs/three-layer-schema.md)
-- migrated all readers + writers off public.blueprints onto agent_blueprints
-- and spaceship_blueprints during phases D.1-D.6 (deployed 2026-05-15).
-- The pre-D.7 migration (20260526) rewrote the SQL RPCs the admin queue
-- depends on. Soak floor (2026-05-22) has passed.
--
-- Audit at the time of writing (verified against live DB):
--   - Edge functions (34/34): clean. blueprint-search, community-review,
--     and community-submit reference 'blueprints' only in source comments
--     documenting the cut-over. persona-compiler.js mentions the word in
--     user-facing prose only.
--   - Client JS: clean. The legacy direct-query path in blueprints.js
--     was replaced by _searchCatalogLocal in Phase B2; a single comment
--     at line ~2443 documents that. (The stale dev artifacts
--     app/js/nice.bundle.js + .min.js still contain the old text but
--     are not referenced by app/index.html.)
--   - SQL functions / RPCs (public): clean post-20260526.
--   - Views / materialized views: 0.
--   - Triggers ON public.blueprints: 1 (blueprints_set_updated_at) -
--     dropped with the table.
--   - FK pointing AT public.blueprints: 1
--     (community_reports_blueprint_id_fkey, ON DELETE CASCADE) -
--     dropped with the table via CASCADE.
--   - RLS policies on OTHER tables referencing public.blueprints: 4 -
--     rewritten below before the table drops, so the policies remain
--     valid against the new tables.
--   - Data: 26 rows (20 scope='catalog' MCP umbrellas + 6 scope='system'
--     moderator rows). All long-since backfilled into agent_blueprints
--     and spaceship_blueprints by Phase D.1+D.2 (20260515064211).
--     community_reports has 0 rows.

-- ── RLS rewrites ────────────────────────────────────────────────────
-- Each policy that referenced `blueprints` is replaced in-place. The
-- new tables use uuid ids while marketplace_listings.blueprint_id and
-- community_reports.blueprint_id are text, so joins cast id::text - the
-- same shape as the pre_d7 RPC rewrites.

-- community_reports: a user can submit a report iff (a) they are the
-- reporter AND (b) they don't own the reported blueprint. The blueprint
-- could live in either new table; community_reports has no category
-- discriminator, so check both.
DROP POLICY IF EXISTS community_reports_reporter_insert ON public.community_reports;
CREATE POLICY community_reports_reporter_insert
ON public.community_reports
FOR INSERT
WITH CHECK (
  auth.uid() = reporter_id
  AND NOT (
    EXISTS (
      SELECT 1 FROM public.agent_blueprints ab
      WHERE ab.id::text = community_reports.blueprint_id
        AND ab.creator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.spaceship_blueprints sb
      WHERE sb.id::text = community_reports.blueprint_id
        AND sb.creator_id = auth.uid()
    )
  )
);

-- marketplace_listings: a user can list a blueprint iff they own it.
-- The listing's `category` column ('agent' | 'spaceship') discriminates
-- which new table holds the row.
DROP POLICY IF EXISTS marketplace_listings_author_insert ON public.marketplace_listings;
CREATE POLICY marketplace_listings_author_insert
ON public.marketplace_listings
FOR INSERT
WITH CHECK (
  auth.uid() = author_id
  AND (
    (category = 'agent' AND EXISTS (
      SELECT 1 FROM public.agent_blueprints ab
      WHERE ab.id::text = marketplace_listings.blueprint_id
        AND ab.creator_id = auth.uid()
    ))
    OR (category = 'spaceship' AND EXISTS (
      SELECT 1 FROM public.spaceship_blueprints sb
      WHERE sb.id::text = marketplace_listings.blueprint_id
        AND sb.creator_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS marketplace_listings_author_update ON public.marketplace_listings;
CREATE POLICY marketplace_listings_author_update
ON public.marketplace_listings
FOR UPDATE
USING (auth.uid() = author_id)
WITH CHECK (
  auth.uid() = author_id
  AND (
    (category = 'agent' AND EXISTS (
      SELECT 1 FROM public.agent_blueprints ab
      WHERE ab.id::text = marketplace_listings.blueprint_id
        AND ab.creator_id = auth.uid()
    ))
    OR (category = 'spaceship' AND EXISTS (
      SELECT 1 FROM public.spaceship_blueprints sb
      WHERE sb.id::text = marketplace_listings.blueprint_id
        AND sb.creator_id = auth.uid()
    ))
  )
);

-- marketplace_reviews: a user cannot review their own listed blueprint.
-- Branch on the parent listing's category, same as the insert/update
-- policies above.
DROP POLICY IF EXISTS marketplace_reviews_user_insert ON public.marketplace_reviews;
CREATE POLICY marketplace_reviews_user_insert
ON public.marketplace_reviews
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.marketplace_listings ml
    WHERE ml.id = marketplace_reviews.listing_id
      AND (
        (ml.category = 'agent' AND EXISTS (
          SELECT 1 FROM public.agent_blueprints ab
          WHERE ab.id::text = ml.blueprint_id
            AND ab.creator_id = auth.uid()
        ))
        OR (ml.category = 'spaceship' AND EXISTS (
          SELECT 1 FROM public.spaceship_blueprints sb
          WHERE sb.id::text = ml.blueprint_id
            AND sb.creator_id = auth.uid()
        ))
      )
  )
);

-- ── The drop ────────────────────────────────────────────────────────
-- CASCADE blast radius (audited):
--   * trigger blueprints_set_updated_at (lives ON blueprints)
--   * FK community_reports_blueprint_id_fkey (removes the FK; the text
--     column survives)
--   * 14 indexes (all live ON blueprints)
-- No views, no matviews, no functions, no policies on OTHER tables
-- after the rewrites above.
DROP TABLE public.blueprints CASCADE;
