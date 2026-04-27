-- Persona Engine Tier 3 — async-logging schema.
-- Records a Gemini Flash judge's score for each chat reply against the
-- persona spec. MVP is logging-only (no regen, no blocking). Two weeks of
-- data tells us whether the cost of synchronous validation is justified.
-- See project_persona_engine.md "Tier 3" for the design tradeoffs.

CREATE TABLE IF NOT EXISTS public.persona_judgments (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id                 text        NOT NULL,
  provider                 text        NOT NULL,                                 -- anthropic / openai / google / xai / groq
  model                    text        NOT NULL,                                 -- e.g. claude-sonnet-4-6, gpt-5-mini
  judge_model              text        NOT NULL,                                 -- e.g. gemini-2.5-flash
  score                    smallint    NOT NULL,                                 -- 0-100 fidelity score
  passed                   boolean     NOT NULL,                                 -- score>=70 AND zero hard_rule_violations
  hard_rule_violations     jsonb       NOT NULL DEFAULT '[]'::jsonb,             -- array of broken hard_rule strings
  voice_drift              text,                                                 -- short note from judge, nullable
  forbidden_pattern_hits   jsonb       NOT NULL DEFAULT '[]'::jsonb,             -- array of matched forbidden_patterns
  reply_excerpt            text,                                                 -- first 200 chars of reply, optional
  judge_latency_ms         integer,                                              -- judge call duration
  created_at               timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT persona_judgments_score_range  CHECK (score >= 0 AND score <= 100),
  CONSTRAINT persona_judgments_excerpt_len  CHECK (reply_excerpt IS NULL OR char_length(reply_excerpt) <= 500)
);

-- Recent judgments per theme — primary readout for "how is HAL doing this week?"
CREATE INDEX IF NOT EXISTS persona_judgments_theme_created_idx
  ON public.persona_judgments (theme_id, created_at DESC);

-- Fail bucket — partial index keeps the hot path tiny since most replies pass.
CREATE INDEX IF NOT EXISTS persona_judgments_failures_idx
  ON public.persona_judgments (theme_id, created_at DESC)
  WHERE passed = false;

-- RLS: enabled with zero policies = service-role only (mirrors `personas` table).
-- Edge function inserts via service-role client; nobody else reads or writes.
ALTER TABLE public.persona_judgments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.persona_judgments IS
  'Persona Engine Tier 3 — async judge scores per chat reply. Service-role only.';
COMMENT ON COLUMN public.persona_judgments.passed IS
  'Derived: score >= 70 AND empty hard_rule_violations. Stored for index speed.';
COMMENT ON COLUMN public.persona_judgments.reply_excerpt IS
  'First 200 chars of the model reply for debugging weak scores. May be NULL if PII concerns. Cap 500.';
