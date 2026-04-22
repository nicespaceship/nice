-- Persona Engine Tier 1 — server-side store for theme chat personas.
--
-- Until now, every theme's persona shipped in the browser bundle inside
-- `THEMES[id].copy.persona` and was assembled into the system prompt
-- client-side by prompt-panel.js `_renderPersonaPrompt`. That made personas
-- trivially exfiltratable (devtools → read Theme.THEMES → copy), left no
-- audit trail for edits, and put the callsign / user-input injection
-- surfaces directly next to the persona content.
--
-- Tier 1 moves persona CONTENT to this table, read exclusively by the
-- `nice-ai` edge function via service_role. The edge function builds the
-- final system prompt server-side from (theme_id, sanitized callsign, app
-- context). The client sends `theme_id` + turn messages — persona text
-- never touches the browser again.
--
-- Schema notes:
-- - `theme_id` is the SSOT key matching `Theme.THEMES[].id` in nice.js
--   (e.g. 'nice', 'hal-9000', 'grid', 'jarvis', ...). Not a FK because
--   themes live in JS, not in the DB.
-- - `data` is the full persona JSONB blob — intentionally unstructured in
--   Tier 1. Tier 2 introduces typed columns (voice, hard_rules, lexicon,
--   forbidden) alongside `data` and migrates field-by-field. Keeping the
--   blob shape in Tier 1 means the edge function can read the persona as a
--   single row without joins and the seed stays lossless against the
--   existing JS shape.
-- - `version` lets us ship persona edits behind a flag. A future migration
--   can insert v2 rows with is_active=false, then flip the active flag
--   when A/B results come in.
-- - Only ONE active row per theme (partial unique index).
--
-- RLS posture:
-- Enabled with NO policies. Service role bypasses RLS automatically and
-- reads on behalf of the edge function. anon + authenticated therefore get
-- zero access — exactly the intended posture for persona content.

BEGIN;

CREATE TABLE IF NOT EXISTS public.personas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id    TEXT NOT NULL,
  version     INT  NOT NULL DEFAULT 1,
  data        JSONB NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active persona per theme. Old versions can live on with is_active=false
-- so we can roll back a persona change without re-running a seed.
CREATE UNIQUE INDEX IF NOT EXISTS personas_theme_active_uidx
  ON public.personas (theme_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS personas_theme_idx ON public.personas (theme_id);

-- Shape sanity — every persona blob must at minimum carry the fields the
-- edge function's `_renderPersonaPrompt` equivalent will expect. If a
-- future migration wants to relax these (e.g. drop `neverBreak`), drop the
-- constraint explicitly rather than letting malformed rows in silently.
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_data_shape;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_data_shape CHECK (
    jsonb_typeof(data) = 'object'
    AND data ? 'identity'
    AND data ? 'name'
    AND data ? 'defaultCallsign'
    AND data ? 'personality'
    AND data ? 'neverBreak'
    AND jsonb_typeof(data->'personality') = 'array'
    AND (NOT data ? 'examples' OR jsonb_typeof(data->'examples') = 'array')
  );

-- updated_at trigger. Scoped function name so it won't collide with a
-- global `set_updated_at` if one shows up later.
CREATE OR REPLACE FUNCTION public.personas_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personas_set_updated_at ON public.personas;
CREATE TRIGGER personas_set_updated_at
  BEFORE UPDATE ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.personas_set_updated_at();

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

-- No policies intentionally. service_role bypasses RLS; anon + authenticated
-- therefore get zero access. The edge function is the only legitimate
-- reader.

COMMIT;
