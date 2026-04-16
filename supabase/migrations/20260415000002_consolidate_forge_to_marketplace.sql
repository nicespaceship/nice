-- Consolidate Forge into Marketplace (Forge retirement)
--
-- Forge was a parallel community-blueprint system living in
-- `blueprint_submissions` + `blueprint_ratings`, divorced from the
-- canonical `blueprints` catalog. Marketplace is the correct surface:
-- each listing in `marketplace_listings` is a pointer at a real
-- `blueprints` row, so community blueprints live alongside the seeded
-- catalog under one SSOT.
--
-- This migration:
--   1. Creates a new `blueprints` row for each approved Forge submission
--      (creator_id preserved from submission, is_public=true).
--   2. Creates a corresponding `marketplace_listings` row pointing at the
--      new blueprint.
--   3. Drops `blueprint_ratings` and `blueprint_submissions`.
--
-- Ratings are zeroed out because `blueprint_ratings` is empty — the
-- `avg_rating` values in `blueprint_submissions` were fabricated seed
-- data with no backing rating rows, and the correct move is to start
-- the Marketplace from truth rather than propagate fiction. `downloads`
-- is likewise zeroed for the same reason.
--
-- All 8 current rows have `user_id = NULL` (seeded demo content), so no
-- real user submissions are affected. The migration is still written to
-- preserve user_id properly in case any legitimate rows are added
-- between now and when this runs.

BEGIN;

-- 1. Insert a blueprint row for each approved submission.
--
-- The synthetic id is `bp-mp-<first 8 hex chars of submission uuid>`,
-- giving stable, unique IDs without collision risk. The serial key is
-- synthesized from the same source in the standard CR-style 4-group
-- format, under the MP-* namespace so marketplace-origin blueprints are
-- identifiable at a glance.
INSERT INTO blueprints (
  id, serial_key, type, name, description, flavor, category, rarity,
  tags, config, stats, metadata, is_public, creator_id, rating_avg,
  activation_count, created_at
)
SELECT
  'bp-mp-' || substring(replace(bs.id::text, '-', '') for 8) AS id,
  'MP-' || upper(substring(replace(bs.id::text, '-', '') for 4)) || '-' ||
           upper(substring(replace(bs.id::text, '-', '') from 5 for 4)) || '-' ||
           upper(substring(replace(bs.id::text, '-', '') from 9 for 4)) || '-' ||
           upper(substring(replace(bs.id::text, '-', '') from 13 for 4)) AS serial_key,
  'agent' AS type,
  COALESCE(NULLIF(bs.agent_data->>'name', ''), 'Community Agent') AS name,
  COALESCE(bs.agent_data->>'description', '') AS description,
  COALESCE(bs.agent_data->>'flavor', '') AS flavor,
  COALESCE(NULLIF(bs.agent_data->>'category', ''), 'Custom') AS category,
  COALESCE(NULLIF(bs.agent_data->>'rarity', ''), 'Common') AS rarity,
  COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(bs.agent_data->'tags')),
    '{}'::text[]
  ) AS tags,
  COALESCE(bs.agent_data->'config', '{}'::jsonb) AS config,
  '{}'::jsonb AS stats,
  jsonb_build_object(
    'art',      COALESCE(bs.agent_data->>'art', 'intelligence'),
    'caps',     COALESCE(bs.agent_data->'caps', '[]'::jsonb),
    'flavor',   COALESCE(bs.agent_data->>'flavor', ''),
    'card_num', 'MP-' || upper(substring(replace(bs.id::text, '-', '') for 3)),
    'agentType', COALESCE(bs.agent_data->'config'->>'type', 'Agent'),
    'migrated_from_forge', true
  ) AS metadata,
  true  AS is_public,
  bs.user_id,
  0::numeric AS rating_avg,
  0          AS activation_count,
  bs.created_at
FROM blueprint_submissions bs
WHERE bs.status = 'approved'
-- Guard against collisions on re-run
ON CONFLICT (id) DO NOTHING;

-- 2. Insert a marketplace listing pointing at each new blueprint.
INSERT INTO marketplace_listings (
  blueprint_id, author_id, title, description, category, tags,
  version, downloads, rating, rating_count, status, created_at
)
SELECT
  'bp-mp-' || substring(replace(bs.id::text, '-', '') for 8) AS blueprint_id,
  bs.user_id AS author_id,
  COALESCE(NULLIF(bs.agent_data->>'name', ''), 'Community Agent') AS title,
  COALESCE(bs.agent_data->>'description', '') AS description,
  'agent' AS category,
  COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(bs.agent_data->'tags')),
    '{}'::text[]
  ) AS tags,
  '1.0.0' AS version,
  0  AS downloads,
  0  AS rating,
  0  AS rating_count,
  'published' AS status,
  bs.created_at
FROM blueprint_submissions bs
WHERE bs.status = 'approved'
  -- Don't insert a duplicate listing if this migration is re-run.
  AND NOT EXISTS (
    SELECT 1 FROM marketplace_listings ml
    WHERE ml.blueprint_id = 'bp-mp-' || substring(replace(bs.id::text, '-', '') for 8)
  );

-- 3. Drop the Forge tables. CASCADE removes any dependent policies.
DROP TABLE IF EXISTS public.blueprint_ratings CASCADE;
DROP TABLE IF EXISTS public.blueprint_submissions CASCADE;

COMMIT;
