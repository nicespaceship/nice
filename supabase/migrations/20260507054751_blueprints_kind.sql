-- Three-layer architecture, week 4 (continued): kind discriminator column.
--
-- Adds a structured discriminator alongside `type`. While `type` is
-- agent vs spaceship at the data-shape level, `kind` reflects the
-- three-layer ontology agreed in the architecture ADR:
--
--   capability — function blueprint, has tools, has capability_tags,
--                no narrative persona (e.g. bp-agent-hubspot)
--   character  — persona overlay, often wraps a capability via
--                config.capability_id (e.g. bp-agent-255 / Geordi),
--                may have inherited tools or none
--   spaceship  — workflow + crew composition (every type='spaceship')
--
-- The `type` column stays — most callers still discriminate on
-- agent vs spaceship and don't need the finer ontology distinction.
-- `kind` is purely additive for code that DOES need it (currently the
-- dispatch matcher's preference for capabilities over characters).
--
-- Backfill rules:
--   type='spaceship'                       → kind='spaceship'
--   id IN (20 wired umbrella ids)          → kind='capability'
--   everything else (type='agent')         → kind='character'
--
-- Community-scope agents default to 'character'. If a community-published
-- blueprint is later promoted as an umbrella capability, its kind can be
-- updated via a follow-up migration; the discriminator is not immutable.

BEGIN;

ALTER TABLE public.blueprints
  ADD COLUMN IF NOT EXISTS kind text;

UPDATE public.blueprints
SET kind = 'spaceship'
WHERE type = 'spaceship';

UPDATE public.blueprints
SET kind = 'capability'
WHERE type = 'agent' AND id IN (
  'bp-agent-airtable',
  'bp-agent-atlassian',
  'bp-agent-cf-browser',
  'bp-agent-cf-builds',
  'bp-agent-cf-observability',
  'bp-agent-cloudflare',
  'bp-agent-github',
  'bp-agent-google-workspace',
  'bp-agent-hubspot',
  'bp-agent-klaviyo',
  'bp-agent-linear',
  'bp-agent-microsoft-365',
  'bp-agent-miro',
  'bp-agent-monday',
  'bp-agent-notion',
  'bp-agent-replicate',
  'bp-agent-sentry',
  'bp-agent-slack',
  'bp-agent-stripe',
  'bp-agent-zapier'
);

UPDATE public.blueprints
SET kind = 'character'
WHERE type = 'agent' AND kind IS NULL;

ALTER TABLE public.blueprints
  ALTER COLUMN kind SET NOT NULL;

ALTER TABLE public.blueprints
  ADD CONSTRAINT blueprints_kind_check
  CHECK (kind IN ('capability', 'character', 'spaceship'));

CREATE INDEX IF NOT EXISTS blueprints_kind_idx
  ON public.blueprints (kind);

COMMENT ON COLUMN public.blueprints.kind IS
  'Three-layer ontology discriminator: capability (function), character (persona overlay), or spaceship (workflow). Set at insert time; updateable. See architecture ADR for definitions.';

COMMIT;
