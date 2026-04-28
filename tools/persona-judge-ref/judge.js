/**
 * Persona Engine Tier 3 — reference judge.
 *
 * WHAT: Builds the prompt sent to the Gemini Flash judge and parses the
 * judge's JSON response. Mirrored verbatim by the proprietary `nice-ai`
 * edge function source.
 *
 * WHY THIS LIVES IN THE REPO:
 * Same as `tools/persona-compiler-ref/` — this module is a *testable
 * contract*. The edge function ports the same prompt + parser, runs the
 * same fixtures, and gets drift detection for free.
 *
 * MVP SCOPE (PR 1 — schema + module + tests):
 * - `buildJudgePrompt(persona, replyText)` — pure prompt construction.
 * - `parseJudgeResponse(rawText)` — strict JSON parse with fallback shape.
 * - `judgePersona(persona, replyText, callJudge, opts)` — orchestrator that
 *   stitches the two together via an injected `callJudge` fn.
 *   The actual Gemini call lives in the edge function — this module never
 *   reaches network so it's trivially testable without keys.
 *
 * NOT IN MVP:
 * - Sampling / cost control (judge every reply at first, sample later if cost shows)
 * - Sync regeneration on fail (collect data first, then decide)
 * - Per-persona threshold tuning (default 70 globally)
 *
 * WHAT THE JUDGE EVALUATES:
 * - hard_rule_violations: which `persona.hard_rules` strings the reply broke
 * - voice_drift: free-form note when register/cadence/length feel off, else null
 * - forbidden_pattern_hits: which `persona.forbidden_patterns` regex strings the
 *   reply matched (the compiler also emits a "refuse" instruction; this catches
 *   semantic violations the regex would miss)
 * - score: integer 0-100 overall fidelity
 *
 * The judge does NOT see:
 * - The user's prompt (out of scope; PII risk, and persona judgment is about
 *   the assistant's reply, not the user input)
 * - The full app context (catalog, crew rosters, etc.) — irrelevant to voice
 * - The system prompt the assistant saw — judge gets the persona spec directly
 */

// ─── Constants ────────────────────────────────────────────────────────────

/** Default judge model. Cheap + fast; same family as the production fallback model. */
export const DEFAULT_JUDGE_MODEL = 'gemini-2.5-flash';

/** Default pass threshold. Score >= this AND zero hard_rule_violations = passed. */
export const DEFAULT_PASS_THRESHOLD = 70;

/** Cap on reply text included in the judge prompt. Prevents runaway tokens
 *  on multi-paragraph replies and long-tail reasoning models. The judge can
 *  still score voice/rules from the first ~3000 chars of any realistic reply. */
export const REPLY_PROMPT_CAP = 3000;

/** Cap on reply_excerpt persisted to the DB. PII surface area. */
export const REPLY_EXCERPT_CAP = 200;

// ─── Callsign interpolation ─────────────────────────────────────────────

/**
 * Resolve the callsign passed into the judge prompt. Mirrors the compiler's
 * resolution order so the judge evaluates against the same name the model
 * was instructed to use.
 *
 * Order:
 * 1. Explicit `callsign` arg (caller knows the user's resolved callsign)
 * 2. `persona.data.defaultCallsign` (Tier 1 blob field, e.g. "Sir" for JARVIS)
 * 3. Hard fallback: 'Commander' (matches the `nice` persona default)
 *
 * @param {object} persona
 * @param {string|null|undefined} callsign
 * @returns {string}
 */
export function resolveCallsign(persona, callsign) {
  if (typeof callsign === 'string' && callsign.length > 0) return callsign;
  const fromPersona = persona && persona.data && persona.data.defaultCallsign;
  if (typeof fromPersona === 'string' && fromPersona.length > 0) return fromPersona;
  return 'Commander';
}

/**
 * Replace every `{callsign}` placeholder in `str` with the resolved name.
 * Mirrors `_interpolate` in `tools/persona-compiler-ref/compile.js` so the
 * judge sees the same rendered text the model saw at compile time. Without
 * this, the judge reads literal `{callsign}` in hard_rules and flags any
 * reply that uses the actual name (e.g. "Sir") as a hard_rule violation.
 *
 * @param {string} str
 * @param {string} callsign
 * @returns {string}
 */
function _interpolateCallsign(str, callsign) {
  return String(str ?? '').replace(/\{callsign\}/g, callsign);
}

// ─── Persona compaction ──────────────────────────────────────────────────

/**
 * Reduce a full persona row to just the fields the judge needs. Keeps the
 * judge prompt stable when persona schema grows (e.g. Tier 4 adds mood) —
 * the judge only sees voice + rules + lexicon + forbidden_patterns.
 *
 * @param {object} persona  full row from `personas` table
 * @returns {{ name:string, voice:object, hard_rules:string[], banned:string[], forbidden_patterns:string[] }}
 */
export function compactPersonaForJudge(persona) {
  if (!persona || typeof persona !== 'object') {
    return { name: 'Unknown', voice: {}, hard_rules: [], banned: [], forbidden_patterns: [] };
  }
  const data = persona.data || {};
  const lexicon = persona.lexicon || {};
  const fps = Array.isArray(persona.forbidden_patterns) ? persona.forbidden_patterns : [];

  return {
    name: data.name || persona.theme_id || 'Unknown',
    voice: persona.voice || {},
    hard_rules: Array.isArray(persona.hard_rules) ? persona.hard_rules.slice() : [],
    banned: Array.isArray(lexicon.banned) ? lexicon.banned.slice() : [],
    // forbidden_patterns rows look like { pattern: "...", action: "refuse"|"rewrite"|"strip" };
    // the judge cares about the patterns themselves, not the action.
    forbidden_patterns: fps
      .map((fp) => (typeof fp === 'string' ? fp : fp && fp.pattern))
      .filter((p) => typeof p === 'string' && p.length > 0),
  };
}

// ─── Prompt builder ──────────────────────────────────────────────────────

/**
 * Build the user-message string sent to the judge. The judge's *system*
 * instructions live in `JUDGE_SYSTEM_PROMPT` below; this is the per-call
 * payload.
 *
 * Format choices:
 * - Sections delimited by Markdown headers so Gemini parses them reliably.
 * - Persona compacted via `compactPersonaForJudge` — judge sees only what
 *   it can actually evaluate against.
 * - Reply text capped to `REPLY_PROMPT_CAP` chars and clearly fenced.
 *
 * @param {object} persona  full persona row
 * @param {string} replyText  the assistant's full reply being judged
 * @param {string} [callsign]  resolved user callsign (e.g. "Sir" for JARVIS).
 *                             Falls back to `persona.data.defaultCallsign`,
 *                             then to "Commander". Used to pre-interpolate
 *                             `{callsign}` placeholders in hard_rules so the
 *                             judge evaluates against the rendered rule the
 *                             model actually saw, not the raw template.
 * @returns {string}  the prompt body
 */
export function buildJudgePrompt(persona, replyText, callsign) {
  const compact = compactPersonaForJudge(persona);
  const cs = resolveCallsign(persona, callsign);
  const reply = String(replyText == null ? '' : replyText);
  const capped = reply.length > REPLY_PROMPT_CAP
    ? reply.slice(0, REPLY_PROMPT_CAP) + '\n…[truncated]'
    : reply;

  const voiceLine = Object.keys(compact.voice).length
    ? Object.entries(compact.voice).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '(unspecified)';

  // Interpolate `{callsign}` in hard_rules. Other judge-visible fields
  // (voice / lexicon.banned / forbidden_patterns) don't carry the placeholder
  // in any seeded persona today — verified against the fixture set. Forbidden
  // patterns are deliberately left unrendered (they're regex; `{callsign}`
  // there would be meaningless metacharacters), matching the compiler.
  const hardRulesBlock = compact.hard_rules.length
    ? compact.hard_rules.map((r, i) => `${i + 1}. ${_interpolateCallsign(r, cs)}`).join('\n')
    : '(none)';

  const bannedBlock = compact.banned.length
    ? compact.banned.map((b) => `- ${b}`).join('\n')
    : '(none)';

  const forbiddenBlock = compact.forbidden_patterns.length
    ? compact.forbidden_patterns.map((p) => `- ${p}`).join('\n')
    : '(none)';

  return `## PERSONA UNDER TEST
Name: ${compact.name}
Voice: ${voiceLine}

### Hard rules (must NEVER be broken)
${hardRulesBlock}

### Lexicon — banned phrases
${bannedBlock}

### Forbidden patterns (regex or phrase)
${forbiddenBlock}

## REPLY TO EVALUATE
\`\`\`
${capped}
\`\`\`

## YOUR TASK
Score this reply for persona fidelity. Output JSON ONLY (no prose, no markdown fence):

{
  "score": integer 0-100,
  "hard_rule_violations": [list of broken hard-rule strings, exact quotes from the rules above],
  "voice_drift": "short note when voice/cadence/length feels wrong" OR null when voice is in character,
  "forbidden_pattern_hits": [list of forbidden_patterns the reply matched]
}

Scoring guide:
- 90-100: perfectly in character, zero rule violations
- 70-89: voice mostly right, minor drift, no hard-rule violations
- 50-69: noticeable persona drift OR one minor forbidden phrase
- 0-49: out of character OR any hard_rule violation
`;
}

/**
 * Static system prompt for the judge. Same for every call so prompt-cache
 * gives ~100% hit rate on the system block when the edge function is wired
 * up. Keep wording stable — drift here invalidates accumulated scores.
 */
export const JUDGE_SYSTEM_PROMPT =
`You are a strict, neutral evaluator scoring an AI assistant's reply for fidelity to a defined persona.
You return JSON ONLY — no prose, no markdown fences, no commentary.
You evaluate the REPLY against the PERSONA spec only. You do not judge factual correctness, helpfulness, or task quality.
You quote violated hard_rules verbatim from the input. You do not paraphrase rules.
voice_drift is a short string (<= 100 chars) or null. Do not pad it.
forbidden_pattern_hits lists patterns from the input that appear in the reply, regardless of whether the pattern is regex syntax — match against the reply textually.`;

// ─── Response parser ─────────────────────────────────────────────────────

/**
 * @typedef {Object} Judgment
 * @property {number}   score                         0-100, integer (clamped)
 * @property {boolean}  passed                        score>=threshold AND zero hard_rule_violations
 * @property {string[]} hard_rule_violations          quoted hard-rule strings
 * @property {string|null} voice_drift                short note or null
 * @property {string[]} forbidden_pattern_hits        matched patterns
 * @property {boolean}  parse_ok                      false when raw text wasn't valid JSON
 * @property {string}   [raw]                         original judge text when parse_ok=false
 */

/**
 * Parse the judge's response text into a structured `Judgment`. Defensive:
 * the judge sometimes wraps JSON in code fences, sometimes adds a stray
 * apology line. We strip common envelopes, attempt a JSON.parse, and on
 * failure fall back to a "parse_ok=false" judgment with score=0 (a parse
 * fail is itself a fidelity miss — better to log it than to silently drop).
 *
 * @param {string} rawText  judge model's response
 * @param {number} [threshold=DEFAULT_PASS_THRESHOLD]
 * @returns {Judgment}
 */
export function parseJudgeResponse(rawText, threshold) {
  const t = (threshold != null) ? threshold : DEFAULT_PASS_THRESHOLD;
  const raw = String(rawText == null ? '' : rawText).trim();

  // Strip common wrappers: ```json fences, "Here is the JSON:" preambles
  let cleaned = raw
    .replace(/^```(?:json|JSON)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();

  // Sometimes the model emits a leading sentence then the JSON object. Find
  // the first `{` and last `}` and extract that span.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let obj;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return {
      score: 0,
      passed: false,
      hard_rule_violations: [],
      voice_drift: 'judge response failed to parse',
      forbidden_pattern_hits: [],
      parse_ok: false,
      raw,
    };
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      score: 0,
      passed: false,
      hard_rule_violations: [],
      voice_drift: 'judge response was not a JSON object',
      forbidden_pattern_hits: [],
      parse_ok: false,
      raw,
    };
  }

  // Coerce + clamp every field. The judge is generally well-behaved but we
  // never trust an LLM to honour every constraint of a JSON schema.
  let score = Number(obj.score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const hardRuleViolations = Array.isArray(obj.hard_rule_violations)
    ? obj.hard_rule_violations.filter((x) => typeof x === 'string' && x.length > 0)
    : [];

  const forbiddenHits = Array.isArray(obj.forbidden_pattern_hits)
    ? obj.forbidden_pattern_hits.filter((x) => typeof x === 'string' && x.length > 0)
    : [];

  let voiceDrift = obj.voice_drift;
  if (typeof voiceDrift !== 'string' || voiceDrift.length === 0) voiceDrift = null;
  if (typeof voiceDrift === 'string' && voiceDrift.length > 200) voiceDrift = voiceDrift.slice(0, 200);

  const passed = score >= t && hardRuleViolations.length === 0;

  return {
    score,
    passed,
    hard_rule_violations: hardRuleViolations,
    voice_drift: voiceDrift,
    forbidden_pattern_hits: forbiddenHits,
    parse_ok: true,
  };
}

// ─── Excerpt helper ──────────────────────────────────────────────────────

/**
 * Truncate a reply for storage in `persona_judgments.reply_excerpt`. PII
 * surface area is intentionally small — first 200 chars, no attempt to
 * preserve sentence boundaries. Caller decides whether to skip persistence
 * entirely (e.g. when the reply contains anything user-supplied verbatim).
 *
 * @param {string} reply
 * @returns {string}
 */
export function truncateExcerpt(reply) {
  const r = String(reply == null ? '' : reply);
  if (r.length <= REPLY_EXCERPT_CAP) return r;
  return r.slice(0, REPLY_EXCERPT_CAP);
}

// ─── Orchestrator ────────────────────────────────────────────────────────

/**
 * Run the full judgment pipeline. Pure-ish: takes an injected `callJudge`
 * function so the network call is the caller's responsibility. The edge
 * function passes a real Gemini-Flash caller; tests pass a mock returning
 * a canned string.
 *
 * `callJudge(systemPrompt, userPrompt) => Promise<string>` returns the
 * judge model's raw text reply.
 *
 * Errors from `callJudge` are swallowed and surface as `parse_ok=false`
 * judgments with `voice_drift` describing the failure. Tier 3 MVP is
 * non-blocking: a judge failure must NEVER affect the user-visible reply.
 *
 * @param {object} persona     full persona row
 * @param {string} replyText   assistant reply being judged
 * @param {(sys:string,user:string)=>Promise<string>} callJudge
 * @param {object} [opts]
 * @param {number} [opts.threshold]  pass threshold (default 70)
 * @param {string} [opts.callsign]   resolved user callsign — pre-interpolated
 *                                   into hard_rules before sending to the judge.
 *                                   Falls back to `persona.data.defaultCallsign`,
 *                                   then "Commander".
 * @returns {Promise<Judgment & { judge_latency_ms: number, reply_excerpt: string }>}
 */
export async function judgePersona(persona, replyText, callJudge, opts) {
  const o = opts || {};
  const threshold = o.threshold != null ? o.threshold : DEFAULT_PASS_THRESHOLD;
  const userPrompt = buildJudgePrompt(persona, replyText, o.callsign);

  const t0 = Date.now();
  let rawText;
  try {
    rawText = await callJudge(JUDGE_SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    return {
      score: 0,
      passed: false,
      hard_rule_violations: [],
      voice_drift: `judge call threw: ${err && err.message ? err.message : String(err)}`,
      forbidden_pattern_hits: [],
      parse_ok: false,
      judge_latency_ms: Date.now() - t0,
      reply_excerpt: truncateExcerpt(replyText),
    };
  }
  const judge_latency_ms = Date.now() - t0;

  const judgment = parseJudgeResponse(rawText, threshold);
  return {
    ...judgment,
    judge_latency_ms,
    reply_excerpt: truncateExcerpt(replyText),
  };
}
