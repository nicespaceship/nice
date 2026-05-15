-- Phase D.1 + D.2 + D.3 — schema additions for retiring legacy `blueprints` table.
--
-- Three concurrent things, all additive (legacy `blueprints` keeps working):
--   D.1  Backfill 20 wired-MCP umbrella agents into `agent_blueprints`.
--        Each links to its matching `capabilities` row by slug
--        (capabilities.slug = REPLACE(blueprints.id, 'bp-agent-', '')).
--   D.2  Rehome 6 `scope='system'` rows (5 agent + 1 spaceship moderator
--        crew) into the new tables. Adds 'system' to the `scope` CHECK
--        constraint on both `agent_blueprints` and `spaceship_blueprints`.
--        Adds a `moderation` role for the 5 system agents to satisfy the
--        agent_blueprints.role_type FK.
--   D.3  Adds `serial_key`, `activation_count`, `tags[]` to both new
--        tables — the three columns blueprint-search filters/orders by
--        that don't exist in the new schema yet. Backfills these from
--        the legacy table during the rehome.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING on every INSERT, IF EXISTS
-- on every constraint drop. Re-running this migration is a no-op.

-- ── Ordering dependency ───────────────────────────────────────────
-- Steps run sequentially:
--   1. moderation role (so step 5 can FK to it)
--   2. relax scope CHECK (so steps 4-6 can insert scope='system')
--   3. add serial_key/activation_count/tags columns (so steps 4-6 can populate them)
--   4. backfill 20 umbrellas
--   5. backfill 5 system agents
--   6. backfill 1 system spaceship


-- 1. Add 'moderation' role for the system moderator agents
INSERT INTO public.roles (slug, label, tier, authority, required_capability_tags, responsibilities, sort_order)
VALUES (
  'moderation',
  'Moderation',
  'functional',
  'advises',
  '{}',
  'Internal moderation + safety review. Used by the community-review edge function''s 5-agent crew. Never user-facing.',
  100
)
ON CONFLICT (slug) DO NOTHING;


-- 2. Relax scope CHECK to add 'system'
ALTER TABLE public.agent_blueprints DROP CONSTRAINT IF EXISTS agent_blueprints_scope_check;
ALTER TABLE public.agent_blueprints ADD CONSTRAINT agent_blueprints_scope_check
  CHECK (scope IN ('catalog','community','system'));

ALTER TABLE public.spaceship_blueprints DROP CONSTRAINT IF EXISTS spaceship_blueprints_scope_check;
ALTER TABLE public.spaceship_blueprints ADD CONSTRAINT spaceship_blueprints_scope_check
  CHECK (scope IN ('catalog','community','system'));


-- 3. Add columns blueprint-search needs.
-- serial_key: UNIQUE only when present (community-submit stamps COMM-<8>;
--             umbrellas use CR-XXXX-AGNT-0001-NICE; system uses SYS-XXXX-01).
-- activation_count: ORDER BY column for search results.
-- tags: GIN-indexed for `.contains(tags, [...])` filter.
ALTER TABLE public.agent_blueprints
  ADD COLUMN IF NOT EXISTS serial_key       text,
  ADD COLUMN IF NOT EXISTS activation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags             text[]  NOT NULL DEFAULT '{}';

ALTER TABLE public.spaceship_blueprints
  ADD COLUMN IF NOT EXISTS serial_key       text,
  ADD COLUMN IF NOT EXISTS activation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags             text[]  NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_blueprints_serial_key
  ON public.agent_blueprints (serial_key) WHERE serial_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_spaceship_blueprints_serial_key
  ON public.spaceship_blueprints (serial_key) WHERE serial_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_blueprints_activation_count
  ON public.agent_blueprints (activation_count DESC);
CREATE INDEX IF NOT EXISTS idx_agent_blueprints_tags
  ON public.agent_blueprints USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_spaceship_blueprints_activation_count
  ON public.spaceship_blueprints (activation_count DESC);
CREATE INDEX IF NOT EXISTS idx_spaceship_blueprints_tags
  ON public.spaceship_blueprints USING gin (tags);


-- 4. Backfill 20 wired-MCP umbrella agents (scope='catalog').
-- Slug strips the 'bp-agent-' prefix to match capabilities.slug.
-- role_type lowercases the legacy config.role string.
-- card defaults to {} since legacy umbrellas never had config.card populated
-- (verified: jsonb_typeof(config->'card') is null for all 20).
INSERT INTO public.agent_blueprints (
  slug, name, description, flavor, category, rarity, scope, creator_id, visibility,
  role_type, capability_id, config, card,
  serial_key, activation_count, tags,
  created_at, updated_at
)
SELECT
  REPLACE(b.id, 'bp-agent-', '')                               AS slug,
  b.name,
  b.description,
  b.flavor,
  b.category,
  b.rarity,
  b.scope,
  b.creator_id,
  CASE WHEN b.is_public IS DISTINCT FROM false THEN 'public' ELSE 'private' END AS visibility,
  LOWER(b.config->>'role')                                     AS role_type,
  c.id                                                         AS capability_id,
  b.config,
  COALESCE(b.config->'card', '{}'::jsonb)                      AS card,
  b.serial_key,
  COALESCE(b.activation_count, 0),
  COALESCE(b.tags, '{}'::text[]),
  b.created_at,
  b.updated_at
FROM public.blueprints b
JOIN public.capabilities c
  ON c.slug = REPLACE(b.id, 'bp-agent-', '')
WHERE b.scope = 'catalog' AND b.type = 'agent'
ON CONFLICT (slug) DO NOTHING;


-- 5. Rehome 5 system agents (moderator crew).
-- Slug = legacy text id (preserves the constants the community-review
-- edge function uses; PR-D-edge-rewrite swaps `.in('id', ids)` →
-- `.in('slug', slugs)` with these exact values).
INSERT INTO public.agent_blueprints (
  slug, name, description, flavor, category, rarity, scope, creator_id, visibility,
  role_type, capability_id, config, card,
  serial_key, activation_count, tags,
  created_at, updated_at
)
SELECT
  b.id                                                          AS slug,
  b.name,
  b.description,
  b.flavor,
  b.category,
  b.rarity,
  b.scope,
  b.creator_id,
  'private'                                                     AS visibility,
  'moderation'                                                  AS role_type,
  NULL                                                          AS capability_id,
  b.config,
  COALESCE(b.config->'card', '{}'::jsonb)                       AS card,
  b.serial_key,
  COALESCE(b.activation_count, 0),
  COALESCE(b.tags, '{}'::text[]),
  b.created_at,
  b.updated_at
FROM public.blueprints b
WHERE b.scope = 'system' AND b.type = 'agent'
ON CONFLICT (slug) DO NOTHING;


-- 6. Rehome 1 system spaceship (community-moderator orchestrator).
INSERT INTO public.spaceship_blueprints (
  slug, name, description, flavor, category, rarity, scope, creator_id, visibility,
  config, card,
  serial_key, activation_count, tags,
  created_at, updated_at
)
SELECT
  b.id                                                          AS slug,
  b.name,
  b.description,
  b.flavor,
  b.category,
  b.rarity,
  b.scope,
  b.creator_id,
  'private'                                                     AS visibility,
  b.config,
  COALESCE(b.config->'card', '{}'::jsonb)                       AS card,
  b.serial_key,
  COALESCE(b.activation_count, 0),
  COALESCE(b.tags, '{}'::text[]),
  b.created_at,
  b.updated_at
FROM public.blueprints b
WHERE b.scope = 'system' AND b.type = 'spaceship'
ON CONFLICT (slug) DO NOTHING;
