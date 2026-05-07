-- Three-layer architecture, week 4: capability_tags column.
--
-- Adds a structured capability vocabulary to blueprints so the dispatch
-- router can resolve a role ("communications", "engineering", "sales")
-- to a wired agent by tag intersection instead of substring-matching
-- tool names. Replaces the substring-matching fallback in
-- mission-runner.js _ROLE_TOOL_HINTS for any agent whose blueprint is
-- in this list. _ROLE_TOOL_HINTS stays as a fallback for activated
-- agents whose catalog ID can't be resolved (custom builds, missing
-- blueprint_id) until a follow-up soak removes it.
--
-- Tags are functional, not narrative. "email" / "calendar" / "code"
-- describe what the agent CAN do, not which character or theme it
-- belongs to. The existing `tags text[]` column stays as-is for search
-- and theming keywords ("starfleet", "tng", "github") — capability_tags
-- is a parallel structured column, not a replacement.
--
-- Vocabulary (v1, 21 tags):
--   Functional:    email, calendar, files, messaging, docs, code,
--                  issues, pm, crm, marketing, analytics, payments,
--                  design, media-gen, observability, infrastructure,
--                  automation, database, web, research, ops
--   Domain (also used as role hints by the dispatch matcher):
--                  communications, sales, engineering, product, finance
--
-- Coverage: tags 20 wired umbrella capability blueprints + 14
-- reskinned crew that inherit umbrella tools. Other catalog rows
-- (the ~660 stub characters, themed ships) stay with empty tags
-- until they're either reskinned over a real capability or replaced
-- under the slot-character primitive in a later migration.
--
-- Reversible: ALTER ... DROP COLUMN capability_tags removes the
-- column. UPDATE rows revert by setting capability_tags to '{}'.
-- The ROLE_REQUIRED_CAPS map in mission-runner.js falls back to the
-- legacy _ROLE_TOOL_HINTS substring matcher if capability_tags is
-- empty, so dropping the column does not break dispatch.

BEGIN;

ALTER TABLE public.blueprints
  ADD COLUMN IF NOT EXISTS capability_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS blueprints_capability_tags_gin_idx
  ON public.blueprints USING GIN (capability_tags);

COMMENT ON COLUMN public.blueprints.capability_tags IS
  'Structured capability vocabulary for dispatch routing. Functional tags (email, calendar, code, issues, crm, ...) describe what the agent can do. Distinct from `tags`, which is search/theming keywords.';

-- Email + calendar + files (Google Workspace and Microsoft 365 family).
-- Includes the umbrellas plus reskinned crew slotted over them.
UPDATE public.blueprints
SET capability_tags = ARRAY['email','calendar','files','communications']::text[]
WHERE id IN (
  'bp-agent-google-workspace',
  'bp-agent-microsoft-365',
  'bp-agent-281',  -- Helo (BSG)
  'bp-agent-352',  -- C-3PO (Falcon)
  'bp-agent-384',  -- Thane (Normandy)
  'bp-agent-545'   -- Uhura (Enterprise NCC-1701-A)
);

-- Code + issues (GitHub family).
UPDATE public.blueprints
SET capability_tags = ARRAY['code','issues','engineering']::text[]
WHERE id IN (
  'bp-agent-github',
  'bp-agent-255',  -- Geordi La Forge (Enterprise NCC-1701-D)
  'bp-agent-353',  -- R2-D2 (Falcon)
  'bp-agent-373',  -- Apoc (Matrix)
  'bp-agent-378'   -- Tali'Zorah (Normandy)
);

-- CRM + sales (HubSpot family).
UPDATE public.blueprints
SET capability_tags = ARRAY['crm','sales','marketing']::text[]
WHERE id = 'bp-agent-hubspot';

UPDATE public.blueprints
SET capability_tags = ARRAY['crm','sales']::text[]
WHERE id = 'bp-agent-349'; -- Lando Calrissian (Falcon)

-- Project management + product (Linear family).
UPDATE public.blueprints
SET capability_tags = ARRAY['pm','issues','product']::text[]
WHERE id IN (
  'bp-agent-linear',
  'bp-agent-276',  -- Apollo (Battlestar)
  'bp-agent-386'   -- Miranda Lawson (Normandy)
);

-- Messaging + communications (Slack family).
UPDATE public.blueprints
SET capability_tags = ARRAY['messaging','communications']::text[]
WHERE id = 'bp-agent-slack';

UPDATE public.blueprints
SET capability_tags = ARRAY['messaging','communications','marketing']::text[]
WHERE id IN (
  'bp-agent-282',  -- Athena (BSG)
  'bp-agent-385'   -- Jack (Normandy)
);

-- Docs (Notion family).
UPDATE public.blueprints
SET capability_tags = ARRAY['docs']::text[]
WHERE id = 'bp-agent-notion';

UPDATE public.blueprints
SET capability_tags = ARRAY['docs','research']::text[]
WHERE id = 'bp-agent-379'; -- Liara T'Soni (Normandy)

-- Single-row umbrellas with distinct capability profiles.
UPDATE public.blueprints
SET capability_tags = ARRAY['payments','finance']::text[]
WHERE id = 'bp-agent-stripe';

UPDATE public.blueprints
SET capability_tags = ARRAY['issues','docs','code','engineering','product']::text[]
WHERE id = 'bp-agent-atlassian';

UPDATE public.blueprints
SET capability_tags = ARRAY['observability','engineering']::text[]
WHERE id = 'bp-agent-sentry';

UPDATE public.blueprints
SET capability_tags = ARRAY['observability','infrastructure']::text[]
WHERE id = 'bp-agent-cf-observability';

UPDATE public.blueprints
SET capability_tags = ARRAY['code','infrastructure','engineering']::text[]
WHERE id = 'bp-agent-cf-builds';

UPDATE public.blueprints
SET capability_tags = ARRAY['web','research']::text[]
WHERE id = 'bp-agent-cf-browser';

UPDATE public.blueprints
SET capability_tags = ARRAY['infrastructure','engineering']::text[]
WHERE id = 'bp-agent-cloudflare';

UPDATE public.blueprints
SET capability_tags = ARRAY['marketing','email']::text[]
WHERE id = 'bp-agent-klaviyo';

UPDATE public.blueprints
SET capability_tags = ARRAY['media-gen','marketing','design']::text[]
WHERE id = 'bp-agent-replicate';

UPDATE public.blueprints
SET capability_tags = ARRAY['automation','ops']::text[]
WHERE id = 'bp-agent-zapier';

UPDATE public.blueprints
SET capability_tags = ARRAY['database','ops']::text[]
WHERE id = 'bp-agent-airtable';

UPDATE public.blueprints
SET capability_tags = ARRAY['pm','product','ops']::text[]
WHERE id = 'bp-agent-monday';

UPDATE public.blueprints
SET capability_tags = ARRAY['design']::text[]
WHERE id = 'bp-agent-miro';

COMMIT;
