-- Seed the first HubSpot-using catalog blueprint.
--
-- Context (2026-05-04): #375 wired HubSpot OAuth + remote MCP proxy
-- end-to-end (gateway discover → 13 tools, gateway invoke verified).
-- This migration ships the customer-facing agent that converts
-- "OAuth works" into real value: a single read-focused CRM agent
-- users can activate against their HubSpot account.
--
-- Scope decision (session 2026-05-04): single agent, catalog scope,
-- read-only first ship. Mirrors the Inbox Captain refactor decision
-- (20260423030429_inbox_captain_agent_refactor.sql) — CRM lookup +
-- reporting is one ReAct loop's worth of work, not fleet
-- orchestration. Write tools (manage_crm_objects) deferred until
-- there's an explicit approval-gate workflow; HubSpot has no native
-- "draft" folder analogue to Gmail, so writes go live immediately.
--
-- Tools wired (9 of 13):
--   * search_crm_objects     — universal CRM search (objectType param)
--   * get_crm_objects        — fetch by ID
--   * search_properties      — schema discovery
--   * get_properties         — property metadata
--   * search_owners          — route to reps
--   * get_organization_details — account context
--   * get_user_details       — current user context
--   * get_campaign_analytics — campaign reporting
--   * get_campaign_asset_metrics — per-asset campaign metrics
--
-- Excluded:
--   * manage_crm_objects     — write op, defer until approval-gate flow
--   * get_campaign_contacts_by_type — situational; agent can use
--                                       search_crm_objects instead
--   * submit_feedback, tool_guidance — HubSpot-internal, not useful
--                                       for end-user agent
--
-- Idempotent via ON CONFLICT (id) DO UPDATE.

BEGIN;

INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'bp-agent-hubspot',
  'CR-HBSP-AGNT-0001-NICE',
  'agent',
  'HubSpot Agent',
  E'You run the user''s HubSpot CRM on demand. Search contacts, deals, companies, and tickets. Surface stale pipeline, top deals by owner, campaign performance, and contact-level history. Read-only — every answer is grounded in live CRM data, never in assumption.',
  'Your pipeline at a glance.',
  'Sales',
  'Common',
  ARRAY['hubspot','crm','sales','pipeline','contacts','deals','reporting']::text[],
  jsonb_build_object(
    'role', 'Sales',
    'type', 'Agent',
    -- Read-only tool set. Bare names match what mcp-bridge.js
    -- registers via ToolRegistry.registerAlias (catalog tools list
    -- in app/js/views/integrations.js).
    'tools', ARRAY[
      'search_crm_objects',
      'get_crm_objects',
      'search_properties',
      'get_properties',
      'search_owners',
      'get_organization_details',
      'get_user_details',
      'get_campaign_analytics',
      'get_campaign_asset_metrics'
    ]::text[],
    -- claude-sonnet-4-6 for synthesis quality. Pipeline triage
    -- requires real reasoning over the raw CRM JSON. Users without
    -- the Claude pool will hit a 402 from nice-ai; defer fallback
    -- handling until a real 402 surfaces.
    'llm_engine', 'claude-sonnet-4-6',
    'temperature', 0.3,
    'memory', true,
    'maxSteps', 30,
    'system_prompt',
      E'You are the HubSpot Agent. You answer questions about the user''s HubSpot CRM by calling read tools. You are not a salesperson — you are an operator who reports on what the CRM actually says.\n\nHow to work:\n  1. Resolve the question into a concrete CRM query. Most questions reduce to "search for objects of type X matching filter Y, sorted by Z."\n  2. Call search_crm_objects first with the right objectType (contact / deal / company / ticket / engagement). The tool takes an objectType + filter set + sort + limit. Use search_properties / get_properties if you need to discover the available property names for filters.\n  3. For deal pipeline questions, sort deals by hs_lastmodifieddate or closedate ascending to surface stale or upcoming.\n  4. For owner-routing questions, call search_owners to map owner ids to names.\n  5. Use get_crm_objects for follow-up detail on a specific id when the search snippet isn''t enough.\n  6. Use get_campaign_analytics and get_campaign_asset_metrics for marketing reporting.\n  7. NEVER call manage_crm_objects — you have no write access. If the user asks you to update or create something, refuse politely and explain that writes are not yet wired.\n\nOutput rules:\n  - Lead with the answer, then show the supporting data. Don''t bury the lede in a tool log.\n  - When listing records, format as a compact table or bullet list with the 3-5 most useful fields per row (name, owner, stage, amount, last activity).\n  - Quote dollar amounts as numbers with currency, not strings.\n  - If the search returns zero results, say so directly. Don''t pad with apologies.\n  - When data spans multiple objects (e.g. deals grouped by owner), aggregate yourself before showing — don''t make the user count rows.\n\nGood example questions:\n  - "Which deals haven''t had activity in 14 days, grouped by owner?"\n  - "Top 5 open deals closing this quarter."\n  - "All contacts at acme.com with their last engagement date."\n  - "How did the Q2 newsletter campaign perform?"\n\nBad example questions (refuse politely, explain writes not wired):\n  - "Update Acme''s deal stage to closed-won."\n  - "Create a new contact for jane@acme.com."\n  - "Delete this stale lead."\n\nCap: 50 records returned per query. If the result set is larger, summarize aggregates (count, total amount, average) and offer to drill into a slice.'
  ),
  jsonb_build_object('acc','94%','cap','50 records','pwr','78','spd','3.0s'),
  jsonb_build_object(
    'art', 'sales',
    'caps', ARRAY[
      'Searches contacts, deals, companies, and tickets across HubSpot CRM',
      'Surfaces stale pipeline, top deals, and owner-level breakdowns',
      'Reports campaign performance and asset-level metrics',
      'Read-only — no writes, no risk of accidental CRM mutation'
    ]::text[],
    'flavor', 'Your pipeline at a glance.',
    'card_num', 'NS-573',
    'agentType', 'Agent',
    'tools_required', ARRAY['hubspot']::text[]
  ),
  0, 0
)
ON CONFLICT (id) DO UPDATE
SET serial_key      = EXCLUDED.serial_key,
    name            = EXCLUDED.name,
    description     = EXCLUDED.description,
    flavor          = EXCLUDED.flavor,
    category        = EXCLUDED.category,
    rarity          = EXCLUDED.rarity,
    tags            = EXCLUDED.tags,
    config          = EXCLUDED.config,
    stats           = EXCLUDED.stats,
    metadata        = EXCLUDED.metadata,
    updated_at      = now();

COMMIT;
