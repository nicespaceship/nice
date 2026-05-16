-- Phase D.6 — drop marketplace_listings.blueprint_id → blueprints(id) FK.
--
-- community-submit (rewritten this PR) inserts into `agent_blueprints` or
-- `spaceship_blueprints` and then writes a `marketplace_listings` row
-- whose `blueprint_id` is the new row's uuid. The legacy FK against
-- `blueprints(id)` would reject the insert. The listing's `category`
-- column ('agent'|'spaceship') already discriminates which new table the
-- blueprint_id points at, so dropping the FK is safe — community-review
-- branches on `category` to fetch the submission row.
--
-- community_reports.blueprint_id keeps its FK to `blueprints(id)` for
-- now; the report flow isn't on the D.4–D.6 critical path, and the
-- D.7 `DROP TABLE blueprints CASCADE` will sweep it.

ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_blueprint_id_fkey;
