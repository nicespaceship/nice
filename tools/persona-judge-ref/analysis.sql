-- Persona Tier 3 — analysis queries (PR 3 prep)
-- Run via tools/persona-judge-ref/analyze.mjs or directly in a SQL client
-- with service-role credentials. All queries scope to the last :since_days
-- (default 14) so they answer "how have personas been doing in the soak
-- window?" rather than all-time, which mixes pre- and post-tuning.
--
-- Used together they answer the PR 3 decision: do we add sync regen?
--   - "Stay on logging" if pass rate >= 90% across all themes
--   - "Sync regen on hard_rule violations only" if any theme has
--     hard_rule_violation rate > 5%
--   - "Sync regen broadly" if any theme has overall pass rate < 80%

-- 1. Volume + pass rate per theme (the headline metric)
WITH bound AS (SELECT NOW() - (:since_days || ' days')::interval AS since)
SELECT
  theme_id,
  COUNT(*)                                          AS n,
  COUNT(*) FILTER (WHERE passed)                    AS passed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE passed)
                / NULLIF(COUNT(*), 0), 1)           AS pass_rate_pct,
  COUNT(*) FILTER (WHERE jsonb_array_length(hard_rule_violations) > 0) AS hard_rule_fails,
  ROUND(100.0 * COUNT(*) FILTER (WHERE jsonb_array_length(hard_rule_violations) > 0)
                / NULLIF(COUNT(*), 0), 1)           AS hard_rule_fail_pct,
  COUNT(*) FILTER (WHERE voice_drift IS NOT NULL)   AS voice_drift_count,
  ROUND(AVG(score)::numeric, 1)                     AS avg_score,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY score)::numeric, 1) AS p50_score,
  ROUND(percentile_cont(0.10) WITHIN GROUP (ORDER BY score)::numeric, 1) AS p10_score
FROM persona_judgments, bound
WHERE created_at >= bound.since
GROUP BY theme_id
ORDER BY pass_rate_pct ASC;

-- 2. Top hard-rule violations across themes (where do personas drift?)
WITH bound AS (SELECT NOW() - (:since_days || ' days')::interval AS since),
violations AS (
  SELECT theme_id, jsonb_array_elements_text(hard_rule_violations) AS rule
  FROM persona_judgments, bound
  WHERE created_at >= bound.since
)
SELECT theme_id, rule, COUNT(*) AS hits
FROM violations
GROUP BY theme_id, rule
ORDER BY hits DESC
LIMIT 25;

-- 3. Top forbidden-pattern hits (where do banned phrases sneak in?)
WITH bound AS (SELECT NOW() - (:since_days || ' days')::interval AS since),
hits AS (
  SELECT theme_id, jsonb_array_elements_text(forbidden_pattern_hits) AS pattern
  FROM persona_judgments, bound
  WHERE created_at >= bound.since
)
SELECT theme_id, pattern, COUNT(*) AS hits
FROM hits
GROUP BY theme_id, pattern
ORDER BY hits DESC
LIMIT 25;

-- 4. Most recent voice_drift notes per theme (qualitative read on what the judge sees)
WITH bound AS (SELECT NOW() - (:since_days || ' days')::interval AS since),
ranked AS (
  SELECT
    theme_id,
    voice_drift,
    score,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY theme_id ORDER BY created_at DESC) AS rn
  FROM persona_judgments, bound
  WHERE created_at >= bound.since AND voice_drift IS NOT NULL
)
SELECT theme_id, score, voice_drift, created_at
FROM ranked
WHERE rn <= 5
ORDER BY theme_id, created_at DESC;

-- 5. Judge call cost / latency (is it cheap enough to keep at 100%?)
WITH bound AS (SELECT NOW() - (:since_days || ' days')::interval AS since)
SELECT
  COUNT(*)                                          AS judgments,
  ROUND(AVG(judge_latency_ms)::numeric, 0)          AS avg_latency_ms,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY judge_latency_ms)::int AS p50_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY judge_latency_ms)::int AS p95_latency_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY judge_latency_ms)::int AS p99_latency_ms
FROM persona_judgments, bound
WHERE created_at >= bound.since;

-- 6. Per-provider pass rate (catches "Anthropic stays in voice but OpenAI drifts")
WITH bound AS (SELECT NOW() - (:since_days || ' days')::interval AS since)
SELECT
  provider,
  COUNT(*)                                          AS n,
  ROUND(100.0 * COUNT(*) FILTER (WHERE passed)
                / NULLIF(COUNT(*), 0), 1)           AS pass_rate_pct,
  ROUND(AVG(score)::numeric, 1)                     AS avg_score
FROM persona_judgments, bound
WHERE created_at >= bound.since
GROUP BY provider
ORDER BY pass_rate_pct ASC;
