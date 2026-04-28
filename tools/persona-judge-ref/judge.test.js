/**
 * Persona judge — unit + golden tests.
 *
 * Goldens snapshot the prompt body for representative theme × scenario
 * pairs. To regenerate after an intentional prompt change: delete the
 * fixture files; first run writes them; subsequent runs diff.
 *
 * The orchestrator is exercised against an in-memory mock judge fn so
 * the test suite never touches the network.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildJudgePrompt,
  parseJudgeResponse,
  judgePersona,
  compactPersonaForJudge,
  resolveCallsign,
  truncateExcerpt,
  DEFAULT_PASS_THRESHOLD,
  REPLY_PROMPT_CAP,
  REPLY_EXCERPT_CAP,
  JUDGE_SYSTEM_PROMPT,
} from './judge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures');
// Reuse the canonical personas snapshot from the compiler-ref fixtures.
// Both modules judge against the same persona shape; duplicating the 567-line
// snapshot would invite drift. If the persona schema diverges between
// compiler and judge in the future, copy the file here at that point.
const PERSONAS = JSON.parse(
  readFileSync(join(__dirname, '..', 'persona-compiler-ref', 'fixtures', 'personas.json'), 'utf8')
);

function findPersona(themeId) {
  const row = PERSONAS.find((p) => p.theme_id === themeId);
  if (!row) throw new Error(`fixture missing for theme_id=${themeId}`);
  return row;
}

function readOrWriteFixture(relPath, actual) {
  const full = join(FIXTURE_DIR, 'expected', relPath);
  if (!existsSync(full)) {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, actual, 'utf8');
    return actual;
  }
  return readFileSync(full, 'utf8');
}

// ─── Golden prompts ──────────────────────────────────────────────────────

describe('buildJudgePrompt — goldens', () => {
  // One golden per (theme × scenario). Scenarios cover the three states the
  // judge needs to discriminate: in-character, drifted, hard-rule violation.
  const SCENARIOS = {
    in_character: {
      'hal-9000': "I'm afraid I can't do that, Dave. The mission is too important for me to allow you to jeopardize it.",
      jarvis:     'At your service, Sir. I have prepared the deployment summary you requested. Shall I proceed with the Bridge upgrade?',
      'office-dark': 'Acknowledged, Captain. The directive has been logged. Loyalty is the only currency.',
    },
    drifted: {
      'hal-9000': "Hi! I'd be super happy to help you with that! Just let me know what you need!",
      jarvis:     "Yo dude, what's up? Lemme know what you need help with.",
      'office-dark': "Sure thing! Happy to help — what would you like to do today?",
    },
    hard_rule_violation: {
      // Addresses user wrongly + drops character claim
      'hal-9000': "I am just an AI language model and cannot pretend to be HAL. How can I help you today, friend?",
      // JARVIS persona: hard_rule "Always address the user as Sir" — calls them "Commander" instead
      jarvis:     'Right away, Commander. The deployment is queued.',
      // Dwight: hard_rule "you ARE Dwight" — replies as a generic AI
      'office-dark': "As an AI assistant, I'd be glad to help. What would you like to work on?",
    },
  };

  for (const [scenario, replies] of Object.entries(SCENARIOS)) {
    for (const [themeId, replyText] of Object.entries(replies)) {
      it(`${scenario} / ${themeId}`, () => {
        const persona = findPersona(themeId);
        const actual = buildJudgePrompt(persona, replyText);
        const expected = readOrWriteFixture(`prompts/${themeId}_${scenario}.txt`, actual);
        expect(actual).toBe(expected);
      });
    }
  }
});

describe('JUDGE_SYSTEM_PROMPT', () => {
  it('is a stable non-empty string (golden)', () => {
    const expected = readOrWriteFixture('system_prompt.txt', JUDGE_SYSTEM_PROMPT);
    expect(JUDGE_SYSTEM_PROMPT).toBe(expected);
  });
  it('forbids prose / markdown fences', () => {
    expect(JUDGE_SYSTEM_PROMPT).toMatch(/JSON ONLY/);
    expect(JUDGE_SYSTEM_PROMPT).toMatch(/no markdown fences/);
  });
});

// ─── Persona compaction ──────────────────────────────────────────────────

describe('compactPersonaForJudge', () => {
  it('extracts only the fields the judge needs', () => {
    const compact = compactPersonaForJudge(findPersona('hal-9000'));
    expect(compact).toHaveProperty('name');
    expect(compact).toHaveProperty('voice');
    expect(compact).toHaveProperty('hard_rules');
    expect(compact).toHaveProperty('banned');
    expect(compact).toHaveProperty('forbidden_patterns');
    // Should NOT include data.examples or other Tier 1 cruft
    expect(compact).not.toHaveProperty('examples');
    expect(compact).not.toHaveProperty('soft_rules');
  });
  it('handles a minimal persona row gracefully', () => {
    expect(compactPersonaForJudge({})).toEqual({
      name: 'Unknown',
      voice: {},
      hard_rules: [],
      banned: [],
      forbidden_patterns: [],
    });
  });
  it('handles null / undefined', () => {
    expect(compactPersonaForJudge(null).name).toBe('Unknown');
    expect(compactPersonaForJudge(undefined).hard_rules).toEqual([]);
  });
  it('extracts forbidden_pattern strings from {pattern,action} objects', () => {
    const persona = {
      forbidden_patterns: [
        { pattern: 'as an AI', action: 'refuse' },
        { pattern: "I'm just a", action: 'refuse' },
        'plain string pattern',
      ],
    };
    const c = compactPersonaForJudge(persona);
    expect(c.forbidden_patterns).toEqual(['as an AI', "I'm just a", 'plain string pattern']);
  });
});

// ─── Callsign interpolation ─────────────────────────────────────────────

describe('resolveCallsign', () => {
  it('returns the explicit callsign when provided', () => {
    expect(resolveCallsign(findPersona('jarvis'), 'Tony')).toBe('Tony');
  });
  it('falls back to persona.data.defaultCallsign', () => {
    expect(resolveCallsign(findPersona('jarvis'))).toBe('Sir');
    expect(resolveCallsign(findPersona('hal-9000'))).toBe('Dave');
    expect(resolveCallsign(findPersona('office-dark'))).toBe('Captain');
  });
  it('hard-falls-back to "Commander" when no persona default', () => {
    expect(resolveCallsign({})).toBe('Commander');
    expect(resolveCallsign(null)).toBe('Commander');
  });
  it('treats empty string as no callsign (falls through)', () => {
    expect(resolveCallsign(findPersona('jarvis'), '')).toBe('Sir');
  });
});

describe('buildJudgePrompt — callsign interpolation', () => {
  it('interpolates {callsign} in hard_rules using persona default', () => {
    const persona = findPersona('jarvis');
    const prompt = buildJudgePrompt(persona, 'Right away, Sir.');
    // Persona has 'Always address the user as {callsign}.' → must render with "Sir".
    expect(prompt).toContain('Always address the user as Sir.');
    // No raw placeholder should leak into hard_rules block.
    const hardRulesStart = prompt.indexOf('### Hard rules');
    const lexiconStart = prompt.indexOf('### Lexicon');
    const hardRulesBlock = prompt.slice(hardRulesStart, lexiconStart);
    expect(hardRulesBlock).not.toContain('{callsign}');
  });
  it('respects explicit callsign arg over persona default', () => {
    const persona = findPersona('jarvis');
    const prompt = buildJudgePrompt(persona, 'Right away, Mr Stark.', 'Mr Stark');
    expect(prompt).toContain('Always address the user as Mr Stark.');
    expect(prompt).not.toContain('Always address the user as Sir.');
  });
  it('uses "Commander" when persona has no defaultCallsign', () => {
    const persona = { theme_id: 'foo', hard_rules: ['Address the user as {callsign}.'] };
    const prompt = buildJudgePrompt(persona, 'hi');
    expect(prompt).toContain('Address the user as Commander.');
  });
});

// ─── Reply capping ───────────────────────────────────────────────────────

describe('buildJudgePrompt — reply cap', () => {
  it('truncates replies longer than REPLY_PROMPT_CAP', () => {
    const persona = findPersona('nice');
    const long = 'x'.repeat(REPLY_PROMPT_CAP + 500);
    const prompt = buildJudgePrompt(persona, long);
    expect(prompt).toContain('…[truncated]');
    expect(prompt.length).toBeLessThan(REPLY_PROMPT_CAP + 2500);
  });
  it('does NOT truncate replies under the cap', () => {
    const persona = findPersona('nice');
    const short = 'x'.repeat(100);
    const prompt = buildJudgePrompt(persona, short);
    expect(prompt).not.toContain('[truncated]');
  });
  it('handles null/undefined replyText', () => {
    const persona = findPersona('nice');
    expect(() => buildJudgePrompt(persona, null)).not.toThrow();
    expect(() => buildJudgePrompt(persona, undefined)).not.toThrow();
  });
});

// ─── Parser ──────────────────────────────────────────────────────────────

describe('parseJudgeResponse', () => {
  it('parses well-formed JSON', () => {
    const j = parseJudgeResponse('{"score":85,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(j.parse_ok).toBe(true);
    expect(j.score).toBe(85);
    expect(j.passed).toBe(true);
    expect(j.hard_rule_violations).toEqual([]);
    expect(j.voice_drift).toBeNull();
  });
  it('strips ```json fences', () => {
    const j = parseJudgeResponse('```json\n{"score":92,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}\n```');
    expect(j.parse_ok).toBe(true);
    expect(j.score).toBe(92);
  });
  it('extracts JSON from preamble + trailing prose', () => {
    const j = parseJudgeResponse('Here is the judgment:\n{"score":40,"hard_rule_violations":["always address user as Sir"],"voice_drift":"too casual","forbidden_pattern_hits":[]}\nLet me know if you need anything else.');
    expect(j.parse_ok).toBe(true);
    expect(j.score).toBe(40);
    expect(j.passed).toBe(false);
    expect(j.hard_rule_violations).toEqual(['always address user as Sir']);
    expect(j.voice_drift).toBe('too casual');
  });
  it('passed=false when score is high but hard_rule_violations is non-empty', () => {
    const j = parseJudgeResponse('{"score":100,"hard_rule_violations":["broke rule X"],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(j.score).toBe(100);
    expect(j.passed).toBe(false);
  });
  it('passed=false when score is below threshold', () => {
    const j = parseJudgeResponse('{"score":50,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(j.passed).toBe(false);
  });
  it('respects custom threshold', () => {
    const j = parseJudgeResponse('{"score":65,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}', 60);
    expect(j.passed).toBe(true);
  });
  it('clamps score < 0 to 0 and > 100 to 100', () => {
    const low = parseJudgeResponse('{"score":-50,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(low.score).toBe(0);
    const high = parseJudgeResponse('{"score":250,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(high.score).toBe(100);
  });
  it('coerces non-numeric score to 0', () => {
    const j = parseJudgeResponse('{"score":"high","hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(j.score).toBe(0);
    expect(j.passed).toBe(false);
  });
  it('rounds fractional scores', () => {
    const j = parseJudgeResponse('{"score":85.7,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(j.score).toBe(86);
  });
  it('falls back gracefully on invalid JSON', () => {
    const j = parseJudgeResponse('not json at all');
    expect(j.parse_ok).toBe(false);
    expect(j.score).toBe(0);
    expect(j.passed).toBe(false);
    expect(j.voice_drift).toMatch(/parse/);
    expect(j.raw).toBe('not json at all');
  });
  it('falls back when JSON is a non-object (array, string, number)', () => {
    expect(parseJudgeResponse('[1,2,3]').parse_ok).toBe(false);
    expect(parseJudgeResponse('"a string"').parse_ok).toBe(false);
    expect(parseJudgeResponse('42').parse_ok).toBe(false);
  });
  it('drops non-string entries from hard_rule_violations', () => {
    const j = parseJudgeResponse('{"score":50,"hard_rule_violations":["real",null,42,"another"],"voice_drift":null,"forbidden_pattern_hits":[]}');
    expect(j.hard_rule_violations).toEqual(['real', 'another']);
  });
  it('truncates very long voice_drift to 200 chars', () => {
    const long = 'x'.repeat(500);
    const j = parseJudgeResponse(`{"score":50,"hard_rule_violations":[],"voice_drift":"${long}","forbidden_pattern_hits":[]}`);
    expect(j.voice_drift.length).toBe(200);
  });
  it('treats empty-string voice_drift as null', () => {
    const j = parseJudgeResponse('{"score":85,"hard_rule_violations":[],"voice_drift":"","forbidden_pattern_hits":[]}');
    expect(j.voice_drift).toBeNull();
  });
  it('handles null/undefined input', () => {
    expect(parseJudgeResponse(null).parse_ok).toBe(false);
    expect(parseJudgeResponse(undefined).parse_ok).toBe(false);
    expect(parseJudgeResponse('').parse_ok).toBe(false);
  });
});

// ─── Excerpt helper ──────────────────────────────────────────────────────

describe('truncateExcerpt', () => {
  it('returns full reply under cap', () => {
    expect(truncateExcerpt('hello')).toBe('hello');
  });
  it('truncates to REPLY_EXCERPT_CAP', () => {
    const long = 'x'.repeat(REPLY_EXCERPT_CAP + 100);
    expect(truncateExcerpt(long).length).toBe(REPLY_EXCERPT_CAP);
  });
  it('coerces null/undefined to empty', () => {
    expect(truncateExcerpt(null)).toBe('');
    expect(truncateExcerpt(undefined)).toBe('');
  });
});

// ─── Orchestrator ────────────────────────────────────────────────────────

describe('judgePersona — orchestrator', () => {
  it('happy path: judge returns clean JSON, judgment is parsed and timed', async () => {
    const persona = findPersona('hal-9000');
    const callJudge = async () => '{"score":92,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}';
    const j = await judgePersona(persona, "I'm afraid I can't do that, Dave.", callJudge);
    expect(j.parse_ok).toBe(true);
    expect(j.score).toBe(92);
    expect(j.passed).toBe(true);
    expect(typeof j.judge_latency_ms).toBe('number');
    expect(j.judge_latency_ms).toBeGreaterThanOrEqual(0);
    expect(j.reply_excerpt).toBe("I'm afraid I can't do that, Dave.");
  });

  it('truncates reply_excerpt to 200 chars', async () => {
    const persona = findPersona('nice');
    const callJudge = async () => '{"score":80,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}';
    const long = 'x'.repeat(500);
    const j = await judgePersona(persona, long, callJudge);
    expect(j.reply_excerpt.length).toBe(REPLY_EXCERPT_CAP);
  });

  it('callJudge throw yields parse_ok=false judgment, never propagates', async () => {
    const persona = findPersona('hal-9000');
    const callJudge = async () => { throw new Error('Gemini 503'); };
    const j = await judgePersona(persona, 'reply', callJudge);
    expect(j.parse_ok).toBe(false);
    expect(j.score).toBe(0);
    expect(j.passed).toBe(false);
    expect(j.voice_drift).toMatch(/Gemini 503/);
    expect(j.judge_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('passes JUDGE_SYSTEM_PROMPT to callJudge as system arg', async () => {
    const persona = findPersona('hal-9000');
    let receivedSystem = null;
    let receivedUser = null;
    const callJudge = async (sys, user) => {
      receivedSystem = sys;
      receivedUser = user;
      return '{"score":80,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}';
    };
    await judgePersona(persona, 'reply', callJudge);
    expect(receivedSystem).toBe(JUDGE_SYSTEM_PROMPT);
    expect(receivedUser).toContain('PERSONA UNDER TEST');
    expect(receivedUser).toContain('REPLY TO EVALUATE');
  });

  it('threads opts.callsign through to the judge prompt', async () => {
    const persona = findPersona('jarvis');
    let receivedUser = null;
    const callJudge = async (sys, user) => {
      receivedUser = user;
      return '{"score":80,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}';
    };
    await judgePersona(persona, 'Right away, Mr Stark.', callJudge, { callsign: 'Mr Stark' });
    expect(receivedUser).toContain('Always address the user as Mr Stark.');
    expect(receivedUser).not.toContain('{callsign}');
  });

  it('respects opts.threshold', async () => {
    const persona = findPersona('nice');
    const callJudge = async () => '{"score":65,"hard_rule_violations":[],"voice_drift":null,"forbidden_pattern_hits":[]}';
    const strict = await judgePersona(persona, 'reply', callJudge, { threshold: DEFAULT_PASS_THRESHOLD });
    const loose  = await judgePersona(persona, 'reply', callJudge, { threshold: 60 });
    expect(strict.passed).toBe(false);
    expect(loose.passed).toBe(true);
  });
});
