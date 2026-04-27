#!/usr/bin/env node
/**
 * Persona Tier 3 — analysis runner (PR 3 prep).
 *
 * Reads the `persona_judgments` table via Supabase REST API + service-role
 * key, runs the queries documented in `analysis.sql`, and emits a Markdown
 * report. Use this after the Tier 3 PR 2 deploy has been live for ~2 weeks
 * to make the PR 3 decision: do we add sync regen, or stay on logging?
 *
 * USAGE:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/persona-judge-ref/analyze.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/persona-judge-ref/analyze.mjs --since-days 7
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/persona-judge-ref/analyze.mjs --json
 *
 * DECISION CRITERIA (the report flags these automatically):
 *
 *   STAY ON LOGGING — pass_rate_pct >= 90 across all themes AND
 *                     hard_rule_fail_pct <= 2 across all themes
 *     → Personas are good. Don't add latency / complexity for marginal gain.
 *
 *   SYNC REGEN ON HARD-RULE VIOLATIONS — any theme has hard_rule_fail_pct > 5
 *     → The hard rules are the contract. When HAL drops "I'm sorry Dave"
 *       voice and admits being an AI, that's a violation worth catching
 *       before the user sees it. Cost: +1 Flash call + +500ms-1s on the
 *       <5% of replies that fail the first time.
 *
 *   SYNC REGEN BROADLY — any theme has pass_rate_pct < 80
 *     → The persona is drifting often enough that voice matters more than
 *       latency. Run sync judge on every reply, regenerate on fail.
 *       Most expensive option.
 *
 *   HYBRID — between thresholds
 *     → Sync only on hard_rule violations; async-log voice drift.
 *
 * The criteria are applied per theme, not globally — HAL might need stricter
 * enforcement than NICE.
 */

import { writeFile } from 'node:fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zacllshbgmnwsmliteqx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const SINCE_DAYS = (() => {
  const i = args.indexOf('--since-days');
  return i >= 0 ? Number(args[i + 1]) : 14;
})();
const AS_JSON = args.includes('--json');
const OUT_PATH = (() => {
  const i = args.indexOf('--out');
  return i >= 0 ? args[i + 1] : null;
})();

// Decision thresholds — change these to tune the recommendation. Numbers
// chosen as starting heuristics; revise after seeing real data.
const THRESHOLDS = {
  STAY_PASS_RATE_MIN: 90,        // pass_rate >= this AND hard_rule <= STAY_HARD_RULE_MAX → stay on logging
  STAY_HARD_RULE_MAX: 2,
  HYBRID_HARD_RULE_MAX: 5,       // hard_rule <= this → hybrid; above → sync on hard_rule
  BROADLY_PASS_RATE_MAX: 80,     // pass_rate < this anywhere → sync regen broadly
};

if (!SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var required (the persona_judgments table is service-role only).');
  process.exit(1);
}

// ─── Supabase REST helpers ──────────────────────────────────────────────

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

/** Run a PostgREST RPC if you've defined one, or fall back to SELECT via the REST API. */
async function selectAll(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// PostgREST doesn't expose ad-hoc SQL. We pull rows from the table and aggregate
// in JS. Acceptable scale: 14 days × 10k judgments/day × ~500 bytes ≈ 70 MB.
// If the table grows beyond that, switch to a server-side view or RPC.
async function fetchJudgments(sinceDays) {
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const path = `persona_judgments?select=theme_id,provider,model,score,passed,hard_rule_violations,voice_drift,forbidden_pattern_hits,judge_latency_ms,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=200000`;
  return selectAll(path);
}

// ─── Aggregations ───────────────────────────────────────────────────────

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return null;
  return Math.round((100 * numerator / denominator) * 10 ** digits) / 10 ** digits;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function aggregateByTheme(rows) {
  const themes = new Map();
  for (const r of rows) {
    let bucket = themes.get(r.theme_id);
    if (!bucket) {
      bucket = {
        theme_id: r.theme_id,
        n: 0, passed: 0, hard_rule_fails: 0, voice_drift_count: 0,
        scores: [],
      };
      themes.set(r.theme_id, bucket);
    }
    bucket.n++;
    if (r.passed) bucket.passed++;
    if (Array.isArray(r.hard_rule_violations) && r.hard_rule_violations.length > 0) bucket.hard_rule_fails++;
    if (r.voice_drift != null && r.voice_drift !== '') bucket.voice_drift_count++;
    bucket.scores.push(r.score);
  }
  const out = [];
  for (const b of themes.values()) {
    b.scores.sort((a, c) => a - c);
    out.push({
      theme_id: b.theme_id,
      n: b.n,
      passed: b.passed,
      pass_rate_pct: pct(b.passed, b.n),
      hard_rule_fails: b.hard_rule_fails,
      hard_rule_fail_pct: pct(b.hard_rule_fails, b.n),
      voice_drift_count: b.voice_drift_count,
      avg_score: b.scores.length ? Math.round((b.scores.reduce((a, c) => a + c, 0) / b.scores.length) * 10) / 10 : null,
      p50_score: Math.round(quantile(b.scores, 0.50) || 0),
      p10_score: Math.round(quantile(b.scores, 0.10) || 0),
    });
  }
  return out.sort((a, b) => (a.pass_rate_pct ?? 0) - (b.pass_rate_pct ?? 0));
}

function aggregateByProvider(rows) {
  const providers = new Map();
  for (const r of rows) {
    let b = providers.get(r.provider);
    if (!b) { b = { provider: r.provider, n: 0, passed: 0, scoreSum: 0 }; providers.set(r.provider, b); }
    b.n++;
    if (r.passed) b.passed++;
    b.scoreSum += r.score;
  }
  return [...providers.values()]
    .map((b) => ({
      provider: b.provider,
      n: b.n,
      pass_rate_pct: pct(b.passed, b.n),
      avg_score: Math.round(b.scoreSum / b.n * 10) / 10,
    }))
    .sort((a, b) => (a.pass_rate_pct ?? 0) - (b.pass_rate_pct ?? 0));
}

function topViolations(rows, field, limit = 25) {
  const counts = new Map();
  for (const r of rows) {
    const arr = Array.isArray(r[field]) ? r[field] : [];
    for (const v of arr) {
      const k = `${r.theme_id}\t${v}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([k, hits]) => {
      const [theme_id, item] = k.split('\t');
      return { theme_id, item, hits };
    })
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);
}

function recentVoiceDrift(rows, perTheme = 5) {
  const byTheme = new Map();
  for (const r of rows) {
    if (!r.voice_drift) continue;
    if (!byTheme.has(r.theme_id)) byTheme.set(r.theme_id, []);
    byTheme.get(r.theme_id).push(r);
  }
  const out = [];
  for (const [theme_id, list] of byTheme) {
    for (const r of list.slice(0, perTheme)) {
      out.push({ theme_id, score: r.score, voice_drift: r.voice_drift, created_at: r.created_at });
    }
  }
  return out;
}

function judgeLatencyStats(rows) {
  const lat = rows.map((r) => r.judge_latency_ms).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!lat.length) return { n: 0 };
  return {
    n: lat.length,
    avg_ms: Math.round(lat.reduce((a, c) => a + c, 0) / lat.length),
    p50_ms: Math.round(quantile(lat, 0.50)),
    p95_ms: Math.round(quantile(lat, 0.95)),
    p99_ms: Math.round(quantile(lat, 0.99)),
  };
}

// ─── Decision logic ─────────────────────────────────────────────────────

function recommend(themesAgg) {
  const reasons = [];
  let recommendation = 'STAY_ON_LOGGING';

  for (const t of themesAgg) {
    if (t.n < 30) {
      reasons.push(`${t.theme_id}: only ${t.n} judgments — sample too small to act on yet`);
      continue;
    }
    if (t.pass_rate_pct != null && t.pass_rate_pct < THRESHOLDS.BROADLY_PASS_RATE_MAX) {
      recommendation = 'SYNC_REGEN_BROADLY';
      reasons.push(`${t.theme_id}: pass_rate ${t.pass_rate_pct}% < ${THRESHOLDS.BROADLY_PASS_RATE_MAX}% → sync regen broadly`);
      continue;
    }
    if (t.hard_rule_fail_pct != null && t.hard_rule_fail_pct > THRESHOLDS.HYBRID_HARD_RULE_MAX) {
      if (recommendation === 'STAY_ON_LOGGING') recommendation = 'SYNC_REGEN_HARD_RULES';
      reasons.push(`${t.theme_id}: hard_rule_fail ${t.hard_rule_fail_pct}% > ${THRESHOLDS.HYBRID_HARD_RULE_MAX}% → sync regen on hard-rule fails`);
      continue;
    }
    if (t.pass_rate_pct != null && t.pass_rate_pct < THRESHOLDS.STAY_PASS_RATE_MIN) {
      if (recommendation === 'STAY_ON_LOGGING') recommendation = 'HYBRID';
      reasons.push(`${t.theme_id}: pass_rate ${t.pass_rate_pct}% in [${THRESHOLDS.BROADLY_PASS_RATE_MAX}, ${THRESHOLDS.STAY_PASS_RATE_MIN}) → hybrid`);
    }
  }

  return { recommendation, reasons };
}

// ─── Markdown report ────────────────────────────────────────────────────

function renderMarkdown(sinceDays, total, byTheme, byProvider, topHardRules, topForbidden, drifts, latency, decision) {
  const lines = [];
  lines.push(`# Persona judgment report — last ${sinceDays} days`);
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} from \`persona_judgments\`. ${total} judgments total.`);
  lines.push('');

  lines.push('## Recommendation');
  lines.push('');
  lines.push(`**${decision.recommendation}**`);
  lines.push('');
  if (decision.reasons.length) {
    for (const r of decision.reasons) lines.push(`- ${r}`);
  } else {
    lines.push('- All themes within healthy bands.');
  }
  lines.push('');

  lines.push('## Per-theme pass rates');
  lines.push('');
  lines.push('| theme | n | pass% | hard-rule-fail% | drift count | avg | p50 | p10 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const t of byTheme) {
    lines.push(`| ${t.theme_id} | ${t.n} | ${t.pass_rate_pct ?? '—'} | ${t.hard_rule_fail_pct ?? '—'} | ${t.voice_drift_count} | ${t.avg_score ?? '—'} | ${t.p50_score} | ${t.p10_score} |`);
  }
  lines.push('');

  lines.push('## Per-provider pass rates');
  lines.push('');
  lines.push('| provider | n | pass% | avg score |');
  lines.push('|---|---:|---:|---:|');
  for (const p of byProvider) {
    lines.push(`| ${p.provider} | ${p.n} | ${p.pass_rate_pct ?? '—'} | ${p.avg_score ?? '—'} |`);
  }
  lines.push('');

  lines.push('## Top hard-rule violations');
  lines.push('');
  if (topHardRules.length === 0) {
    lines.push('_None in this window._');
  } else {
    lines.push('| theme | rule (truncated) | hits |');
    lines.push('|---|---|---:|');
    for (const v of topHardRules) {
      const r = v.item.length > 80 ? v.item.slice(0, 77) + '…' : v.item;
      lines.push(`| ${v.theme_id} | ${r.replace(/\|/g, '\\|')} | ${v.hits} |`);
    }
  }
  lines.push('');

  lines.push('## Top forbidden-pattern hits');
  lines.push('');
  if (topForbidden.length === 0) {
    lines.push('_None in this window._');
  } else {
    lines.push('| theme | pattern | hits |');
    lines.push('|---|---|---:|');
    for (const v of topForbidden) {
      lines.push(`| ${v.theme_id} | \`${v.item.replace(/\|/g, '\\|')}\` | ${v.hits} |`);
    }
  }
  lines.push('');

  lines.push('## Recent voice-drift notes (5 per theme)');
  lines.push('');
  if (drifts.length === 0) {
    lines.push('_None in this window._');
  } else {
    lines.push('| theme | score | drift note | when |');
    lines.push('|---|---:|---|---|');
    for (const d of drifts) {
      const note = d.voice_drift.replace(/\|/g, '\\|');
      lines.push(`| ${d.theme_id} | ${d.score} | ${note} | ${d.created_at} |`);
    }
  }
  lines.push('');

  lines.push('## Judge call latency');
  lines.push('');
  lines.push(`n=${latency.n} | avg=${latency.avg_ms ?? '—'}ms | p50=${latency.p50_ms ?? '—'}ms | p95=${latency.p95_ms ?? '—'}ms | p99=${latency.p99_ms ?? '—'}ms`);
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(`Decision thresholds: stay if pass_rate>=${THRESHOLDS.STAY_PASS_RATE_MIN}% AND hard_rule_fail<=${THRESHOLDS.STAY_HARD_RULE_MAX}%; hybrid if hard_rule_fail<=${THRESHOLDS.HYBRID_HARD_RULE_MAX}% AND pass_rate>=${THRESHOLDS.BROADLY_PASS_RATE_MAX}%; sync-regen otherwise.`);
  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.error(`→ Fetching judgments from last ${SINCE_DAYS} days...`);
  const rows = await fetchJudgments(SINCE_DAYS);
  console.error(`  ${rows.length} judgments fetched in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  const byTheme = aggregateByTheme(rows);
  const byProvider = aggregateByProvider(rows);
  const topHardRules = topViolations(rows, 'hard_rule_violations', 25);
  const topForbidden = topViolations(rows, 'forbidden_pattern_hits', 25);
  const drifts = recentVoiceDrift(rows, 5);
  const latency = judgeLatencyStats(rows);
  const decision = recommend(byTheme);

  if (AS_JSON) {
    const out = { since_days: SINCE_DAYS, total: rows.length, byTheme, byProvider, topHardRules, topForbidden, drifts, latency, decision, thresholds: THRESHOLDS };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const md = renderMarkdown(SINCE_DAYS, rows.length, byTheme, byProvider, topHardRules, topForbidden, drifts, latency, decision);
  if (OUT_PATH) {
    await writeFile(OUT_PATH, md, 'utf8');
    console.error(`✓ Wrote ${OUT_PATH}`);
  } else {
    process.stdout.write(md + '\n');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
