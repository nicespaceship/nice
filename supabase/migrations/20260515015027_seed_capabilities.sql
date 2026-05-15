-- Three-layer schema — Phase A2: seed the 20 capability blueprints.
--
-- Transforms the surviving kind='capability' rows from the legacy
-- `blueprints` table into the new `capabilities` table. The Phase 1 wipe
-- spared these 20 (only kind IN ('character','spaceship') was deleted), so
-- the source data is live in `blueprints` — this is a pure in-database
-- transform, no external seed file needed.
--
-- Shape mapping (legacy blueprints -> new capabilities):
--   id 'bp-agent-<x>'           -> slug '<x>'
--   config.tools (jsonb array)  -> tools (text[])
--   metadata.tools_required[0]  -> mcp_provider
--   config.system_prompt +      -> config { system_prompt, llm_defaults }
--     llm_engine/temperature/maxSteps/memory
--   serial_key + metadata.art / caps / card_num + stats -> card
--
-- config.role_type is intentionally dropped — role belongs on
-- agent_blueprints, not on the (role-agnostic) capability.

BEGIN;

INSERT INTO public.capabilities
  (slug, name, description, flavor, category, rarity, scope, visibility,
   capability_tags, tools, mcp_provider, config, card)
SELECT
  regexp_replace(b.id, '^bp-agent-', '')                              AS slug,
  b.name,
  b.description,
  b.flavor,
  b.category,
  b.rarity,
  'catalog',
  'public',
  b.capability_tags,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(b.config->'tools')), '{}'::text[]) AS tools,
  b.metadata->'tools_required'->>0                                    AS mcp_provider,
  jsonb_build_object(
    'system_prompt', b.config->>'system_prompt',
    'llm_defaults', jsonb_build_object(
      'engine',      b.config->>'llm_engine',
      'temperature', b.config->'temperature',
      'max_steps',   b.config->'maxSteps',
      'memory',      b.config->'memory'
    )
  )                                                                   AS config,
  jsonb_build_object(
    'serial_key', b.serial_key,
    'art',        b.metadata->>'art',
    'stats',      b.stats,
    'caps',       b.metadata->'caps',
    'card_num',   b.metadata->>'card_num'
  )                                                                   AS card
FROM public.blueprints b
WHERE b.scope = 'catalog' AND b.kind = 'capability'
ON CONFLICT (slug) DO NOTHING;

COMMIT;
