-- Spell NICE and NICE SPACESHIP the way the brand does in the persona prompts.
--
-- The persona text restored by 20261028010000 kept its spring spellings:
-- "NICE Spaceship" in ten theme personas and "Nice Spaceship" in CORE. NICE is
-- the product and NICE SPACESHIP is the company. Where a persona names the
-- platform it serves (CORE and JARVIS: "an Agentic Intelligence platform"), it
-- now says NICE; CORE's sentence follows the wording Ada used. Where a persona
-- names the place its character works ("aboard", "inside", "the voice of"), it
-- now says NICE SPACESHIP, the name the app's home screen uses. Every affected
-- row held exactly one instance (checked 2026-10-28). CORE v1 is fixed too so
-- a rollback to it stays on-brand.

BEGIN;

UPDATE personas
SET data = replace(data::text,
      'assistant for Nice Spaceship — an Agentic Intelligence platform that',
      'assistant for NICE, an Agentic Intelligence platform from NICE SPACESHIP that')::jsonb
WHERE theme_id = 'nice' AND data->>'name' = 'CORE';

UPDATE personas
SET data = replace(data::text,
      'the AI assistant for NICE Spaceship, an Agentic Intelligence platform',
      'the AI assistant for NICE, an Agentic Intelligence platform')::jsonb
WHERE theme_id = 'jarvis';

UPDATE personas
SET data = replace(data::text, 'NICE Spaceship', 'NICE SPACESHIP')::jsonb,
    voice = replace(voice::text, 'NICE Spaceship', 'NICE SPACESHIP')::jsonb,
    hard_rules = replace(hard_rules::text, 'NICE Spaceship', 'NICE SPACESHIP')::jsonb,
    soft_rules = replace(soft_rules::text, 'NICE Spaceship', 'NICE SPACESHIP')::jsonb,
    lexicon = replace(lexicon::text, 'NICE Spaceship', 'NICE SPACESHIP')::jsonb,
    forbidden_patterns = replace(forbidden_patterns::text, 'NICE Spaceship', 'NICE SPACESHIP')::jsonb
WHERE to_jsonb(personas)::text LIKE '%NICE Spaceship%';

DO $$
DECLARE
  off_brand int;
  core_ok int;
  jarvis_ok int;
BEGIN
  SELECT count(*) INTO off_brand FROM personas p
  WHERE replace(to_jsonb(p)::text, 'NICE SPACESHIP', '') ~* 'nice spaceship';
  IF off_brand > 0 THEN
    RAISE EXCEPTION 'persona_brand_name_casing: % rows still misspell NICE SPACESHIP', off_brand;
  END IF;

  SELECT count(*) INTO core_ok FROM personas
  WHERE theme_id = 'nice' AND data->>'name' = 'CORE'
    AND data->>'identity' LIKE 'You are CORE, the AI mission control assistant for NICE, an Agentic Intelligence platform from NICE SPACESHIP that %';
  IF core_ok <> 2 THEN
    RAISE EXCEPTION 'persona_brand_name_casing: % of 2 CORE rows rewritten', core_ok;
  END IF;

  SELECT count(*) INTO jarvis_ok FROM personas
  WHERE theme_id = 'jarvis' AND is_active
    AND data->>'identity' LIKE '%the AI assistant for NICE, an Agentic Intelligence platform.%';
  IF jarvis_ok <> 1 THEN
    RAISE EXCEPTION 'persona_brand_name_casing: active JARVIS persona not rewritten';
  END IF;
END $$;

COMMIT;
