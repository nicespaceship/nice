-- Switch every catalog agent_blueprint's default llm_engine to the free-tier
-- model (gemini-2-5-flash). Catalog rows previously defaulted to
-- claude-4-6-sonnet, which gated every wizard-driven activation behind an
-- active NICE Pro / Claude subscription — free-tier users (and any user
-- whose Pro lapsed) hit "Your subscription is inactive" on every captain
-- or specialist call. The free tier is meant to be the default working
-- state; premium users can opt up per-agent via the agent edit UI.
--
-- This pairs with the code-side sweep that flips all hardcoded
-- 'claude-4-6-sonnet' wizard / blueprint / view fallbacks to
-- 'gemini-2-5-flash'. Together they ensure new activations land on the
-- free tier by default.
--
-- Existing user_agents rows (per-user activations) inherit the value from
-- the catalog at activation time and are NOT touched here — owners can
-- opt up or re-activate to pick up the new default. There are no live
-- users on this catalog yet beyond the founder; broader user_agents
-- backfill would be a separate migration scoped to that decision.

UPDATE public.agent_blueprints
SET config = jsonb_set(config, '{llm_engine}', '"gemini-2-5-flash"'::jsonb),
    updated_at = NOW()
WHERE scope = 'catalog'
  AND config->>'llm_engine' = 'claude-4-6-sonnet';
