-- Blueprint LLM reassignment pass (catalog scope only).
--
-- Reassigns 12 zero-tool catalog agent seats for performance-per-cost against
-- the 12-model lineup, and normalizes the legacy llm_engine alias ids to the
-- canonical MODEL_CATALOG form. Reviewed seat by seat against three ground
-- rules: the three open-provider models stay off tool-bearing agents until
-- the tool-call smoke flips their noTools flags; Mythic and Legendary crews
-- keep their identity assignments; umbrella MCP operators and the vertical
-- business leaders stay on free Gemini Flash.
--
-- The moves, all seats with zero config tools and no capability binding:
--   Epic company-ship captains (thematic provider matching):
--     Jensen Huang -> nemotron-3-super  (NVIDIA CEO on NVIDIA's model)
--     Satya Nadella -> gpt-5-mini       (Microsoft's OpenAI partnership)
--     Sundar Pichai -> gemini-2-5-pro   (Google CEO on Gemini)
--     Andy Jassy, Tim Cook -> nemotron-3-super (no in-lineup house model;
--       cheap-reasoning advisory seats)
--   Epic-rarity strategist seats on Legendary ships (cheap reasoning, no
--   tool dependency; the Legendary-rarity strategists stay on Sonnet):
--     McCoy, Wesley, Monolith, Baltar, C-3PO, Claudia, Sanada
--       -> nemotron-3-super
--   Deferred: Musk -> Grok and Zuckerberg -> Llama wait on replacements;
--   xAI retires grok-4-1-fast on 2026-08-15 and Groq deprecated
--   llama-4-scout on 2026-06-17. Dario Amodei stays on Claude (identity).
--
-- The normalization: legacy alias ids (claude-sonnet-4-6, claude-opus-4-7)
-- resolve today only through LLMConfig.MODEL_ALIASES; seeds should emit the
-- canonical ids the MODEL_CATALOG SSOT uses.

BEGIN;

-- Reassignments first, then normalization sweeps the remainder.
UPDATE public.agent_blueprints
   SET config = jsonb_set(config, '{llm_engine}', to_jsonb('nemotron-3-super'::text))
 WHERE scope = 'catalog'
   AND slug IN (
     'nvidia-jensen-huang', 'amazon-andy-jassy', 'apple-tim-cook',
     'enterprise-a-mccoy', 'enterprise-wesley', 'discovery-monolith',
     'galactica-baltar', 'falcon-c3po', 'macross-claudia', 'yamato-sanada'
   );

UPDATE public.agent_blueprints
   SET config = jsonb_set(config, '{llm_engine}', to_jsonb('gpt-5-mini'::text))
 WHERE scope = 'catalog' AND slug = 'microsoft-satya-nadella';

UPDATE public.agent_blueprints
   SET config = jsonb_set(config, '{llm_engine}', to_jsonb('gemini-2-5-pro'::text))
 WHERE scope = 'catalog' AND slug = 'google-sundar-pichai';

UPDATE public.agent_blueprints
   SET config = jsonb_set(config, '{llm_engine}', to_jsonb('claude-4-6-sonnet'::text))
 WHERE scope = 'catalog' AND config->>'llm_engine' = 'claude-sonnet-4-6';

UPDATE public.agent_blueprints
   SET config = jsonb_set(config, '{llm_engine}', to_jsonb('claude-4-7-opus'::text))
 WHERE scope = 'catalog' AND config->>'llm_engine' = 'claude-opus-4-7';

-- ── Smoke test (rolls back the whole migration on failure) ───────────
DO $smoke$
DECLARE
  v_count int;
BEGIN
  -- The 10 nemotron seats (Nadella and Pichai asserted individually below).
  SELECT count(*) INTO v_count FROM public.agent_blueprints
   WHERE scope = 'catalog' AND config->>'llm_engine' = 'nemotron-3-super'
     AND slug IN (
       'nvidia-jensen-huang', 'amazon-andy-jassy', 'apple-tim-cook',
       'enterprise-a-mccoy', 'enterprise-wesley', 'discovery-monolith',
       'galactica-baltar', 'falcon-c3po', 'macross-claudia', 'yamato-sanada'
     );
  ASSERT v_count = 10, format('expected 10 nemotron seats, got %s', v_count);

  ASSERT (SELECT config->>'llm_engine' FROM public.agent_blueprints
           WHERE scope = 'catalog' AND slug = 'microsoft-satya-nadella') = 'gpt-5-mini',
    'Satya Nadella should run gpt-5-mini';
  ASSERT (SELECT config->>'llm_engine' FROM public.agent_blueprints
           WHERE scope = 'catalog' AND slug = 'google-sundar-pichai') = 'gemini-2-5-pro',
    'Sundar Pichai should run gemini-2-5-pro';

  -- Identity keeps: Dario on Sonnet, the five Mythic strategists on Opus.
  ASSERT (SELECT config->>'llm_engine' FROM public.agent_blueprints
           WHERE scope = 'catalog' AND slug = 'anthropic-dario-amodei') = 'claude-4-6-sonnet',
    'Dario Amodei stays on Claude Sonnet';
  SELECT count(*) INTO v_count FROM public.agent_blueprints
   WHERE scope = 'catalog' AND config->>'llm_engine' = 'claude-4-7-opus';
  ASSERT v_count = 5, format('expected 5 Opus seats, got %s', v_count);

  -- Legacy alias ids fully swept from catalog seeds.
  SELECT count(*) INTO v_count FROM public.agent_blueprints
   WHERE scope = 'catalog'
     AND config->>'llm_engine' IN ('claude-sonnet-4-6', 'claude-opus-4-7');
  ASSERT v_count = 0, format('expected 0 legacy alias ids, got %s', v_count);

  -- Full catalog distribution: 99 Sonnet, 50 Flash, 10 Nemotron, 5 Opus,
  -- 1 gpt-5-mini, 1 Gemini Pro = 166.
  SELECT count(*) INTO v_count FROM public.agent_blueprints
   WHERE scope = 'catalog' AND config->>'llm_engine' = 'claude-4-6-sonnet';
  ASSERT v_count = 99, format('expected 99 Sonnet seats, got %s', v_count);
  SELECT count(*) INTO v_count FROM public.agent_blueprints
   WHERE scope = 'catalog' AND config->>'llm_engine' = 'gemini-2-5-flash';
  ASSERT v_count = 50, format('expected 50 Flash seats, got %s', v_count);
  SELECT count(*) INTO v_count FROM public.agent_blueprints
   WHERE scope = 'catalog';
  ASSERT v_count = 166, format('expected 166 catalog agents, got %s', v_count);
END
$smoke$;

COMMIT;
