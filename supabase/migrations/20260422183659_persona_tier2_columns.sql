-- Persona Engine Tier 2 — additive typed columns.
--
-- Tier 1 (migrations 20260422173551 + 20260422173841) put the full persona
-- blob in `data JSONB`. That's fine for a faithful port but gives the edge
-- function no lever to tune the prompt per provider, enforce hard rules
-- verbatim, or run Tier 3's validator on typed fields.
--
-- Tier 2 adds typed columns alongside `data`. `data` stays canonical through
-- the whole rollout — the edge function only reads the typed columns when a
-- per-row `use_structured` flag is true. Cutover is one theme at a time,
-- flipped via a single UPDATE. Legacy Tier 1 compile path keeps working
-- until every row is structured.
--
-- No breaking changes:
-- - Every new column either nullable or has a safe empty default.
-- - `use_structured` defaults false — edge function's current behavior is
--   unchanged until we flip a row.
-- - Rollback is `ALTER TABLE ... DROP COLUMN` — safe because no code reads
--   these columns until the edge function ships Tier 2 compile.
--
-- Shape enforcement:
-- CHECK constraints enforce the shapes the compiler depends on. Each CHECK
-- permits NULL / empty-default so the migration applies cleanly against
-- existing Tier 1 rows before anything is populated. Once Phase 2 backfills
-- the typed fields the constraints start doing real work.
--
-- See issue #222 for the full Tier 2 design and the per-provider compiler
-- sketch.

BEGIN;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS voice              JSONB,
  ADD COLUMN IF NOT EXISTS hard_rules         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS soft_rules         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lexicon            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS forbidden_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS use_structured     BOOLEAN NOT NULL DEFAULT false;

-- voice: nullable until backfilled. When present it must be an object with
-- the three enum fields. Enums are locked here because the compiler
-- branches on them — free-text drift would break provider-specific output.
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_voice_shape;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_voice_shape CHECK (
    voice IS NULL OR (
      jsonb_typeof(voice) = 'object'
      AND voice ? 'register'
      AND voice ? 'cadence'
      AND voice ? 'sentence_length'
      AND voice->>'register'        IN ('formal', 'casual', 'terse', 'theatrical', 'clinical')
      AND voice->>'cadence'         IN ('measured', 'rapid', 'staccato', 'flowing')
      AND voice->>'sentence_length' IN ('short', 'medium', 'long', 'mixed')
    )
  );

-- hard_rules: array of strings. Enforced verbatim into the system prompt's
-- "RULES (do not break)" section, so every element must be a string.
-- Element-level checks use jsonpath (Postgres forbids subqueries in CHECK).
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_hard_rules_shape;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_hard_rules_shape CHECK (
    jsonb_typeof(hard_rules) = 'array'
    AND NOT jsonb_path_exists(hard_rules, '$[*] ? (@.type() != "string")')
  );

-- soft_rules: array of {rule: string, priority: number}. Priority orders
-- the rules and lets the compiler truncate low-priority rules under tight
-- token budgets.
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_soft_rules_shape;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_soft_rules_shape CHECK (
    jsonb_typeof(soft_rules) = 'array'
    AND NOT jsonb_path_exists(
      soft_rules,
      '$[*] ? (@.type() != "object" || !exists(@.rule) || !exists(@.priority) || @.rule.type() != "string" || @.priority.type() != "number")'
    )
  );

-- lexicon: object. Optional keys — preferred (object), catchphrases
-- (object), banned (array of strings). All three are optional so this
-- column stays useful even for personas that don't need a lexicon at all.
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_lexicon_shape;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_lexicon_shape CHECK (
    jsonb_typeof(lexicon) = 'object'
    AND (NOT lexicon ? 'preferred'    OR jsonb_typeof(lexicon->'preferred')    = 'object')
    AND (NOT lexicon ? 'catchphrases' OR jsonb_typeof(lexicon->'catchphrases') = 'object')
    AND (
      NOT lexicon ? 'banned'
      OR (
        jsonb_typeof(lexicon->'banned') = 'array'
        AND NOT jsonb_path_exists(lexicon->'banned', '$[*] ? (@.type() != "string")')
      )
    )
  );

-- forbidden_patterns: array of {pattern: string, action: refuse|rewrite|strip}.
-- Tier 2 only wires the 'refuse' action into the system prompt; 'rewrite' +
-- 'strip' are reserved for Tier 3's validator loop and are accepted here as
-- forward-compatible no-ops.
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_forbidden_patterns_shape;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_forbidden_patterns_shape CHECK (
    jsonb_typeof(forbidden_patterns) = 'array'
    AND NOT jsonb_path_exists(
      forbidden_patterns,
      '$[*] ? (@.type() != "object" || !exists(@.pattern) || !exists(@.action) || @.pattern.type() != "string" || (@.action != "refuse" && @.action != "rewrite" && @.action != "strip"))'
    )
  );

-- Index on the cutover flag — the edge function will filter by
-- (theme_id, is_active, use_structured). Cheap partial index for the
-- already-cutover rows keeps canary lookups snappy.
CREATE INDEX IF NOT EXISTS personas_use_structured_idx
  ON public.personas (theme_id)
  WHERE use_structured = true AND is_active = true;

COMMIT;
