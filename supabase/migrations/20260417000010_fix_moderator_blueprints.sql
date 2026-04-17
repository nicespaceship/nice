-- Fix moderator crew blueprints after production smoke test (2026-04-17).
--
-- Surfaced while arming the reviewer in prod:
--
--   1. trademark_sleuth's llm_engine was 'gpt-5-2' (dashes) in the original
--      seed. The canonical repo id is 'gpt-5.2' (dot), which is what
--      MODEL_CATALOG, humanizeModel, and the `nice-ai` provider router
--      expect. OpenAI 404'd on the wrong id; fixed here.
--
--   2. content_screen emits 6-axis JSON with per-axis rationales and
--      arbiter emits a full decision envelope with reasoning + triggers.
--      Both exceeded the hardcoded 512-token default in community-review
--      during the smoke, getting cut off mid-output. Bumped their
--      max_output_tokens to 1024 so the review envelope fits. policy
--      tuning stays DB-driven per the C3.1 design; other specialists
--      can be bumped the same way if their output grows later.
--
-- Deployed alongside `nice-ai` v25 which branches on provider for the
-- OpenAI max_completion_tokens / temperature differences (GPT-5+ models
-- reject the legacy `max_tokens` param). See docs/edge-functions-ledger.md.

UPDATE blueprints
SET config    = jsonb_set(config, '{llm_engine}', '"gpt-5.2"'::jsonb),
    updated_at = now()
WHERE id = 'community-moderator-trademark-sleuth';

UPDATE blueprints
SET config    = jsonb_set(config, '{max_output_tokens}', '1024'::jsonb),
    updated_at = now()
WHERE id IN ('community-moderator-content-screen',
             'community-moderator-arbiter');
