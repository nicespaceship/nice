import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load an IIFE lib module into globalThis, mirroring the crew-generator harness.
function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Minimal module-specific globals. State/Utils/document come from setup.js +
// jsdom — don't clobber them or the shared beforeEach (State._reset) breaks.
beforeEach(() => {
  globalThis.SB = { isReady: () => true };
  globalThis.Notify = { send() {} };
  globalThis.Gamification = { getMaxSlots: () => 12 };
});

// Regression for the marquee "describe your business → AI designs your crew"
// flow. nice-ai returns `content` as an array of {type,text} parts when the
// call routes to a Claude model (which crew-designer + setup-wizard hardcode).
// The old code did `data.content.trim()`, threw "trim is not a function", and
// silently fell back to a canned keyword-matched crew — so every real-estate,
// clinic, or law-firm brief produced the same generic template. Same root
// cause as the WorkflowEngine crew-routing fix (#880).
const CLAUDE_PARTS = [{ type: 'text', text: '{"agents":[{"name":"X"}]}' }];

describe('CrewDesigner._contentToString', () => {
  beforeEach(() => loadModule('lib/crew-designer.js'));

  it('joins a Claude parts-array into the raw JSON string', () => {
    const out = CrewDesigner._contentToString(CLAUDE_PARTS);
    expect(out).toBe('{"agents":[{"name":"X"}]}');
    // The old bug: this string is now .trim()-able and JSON-parseable.
    expect(() => JSON.parse(out.trim())).not.toThrow();
  });

  it('passes a plain string through (Gemini shape)', () => {
    expect(CrewDesigner._contentToString('{"agents":[]}')).toBe('{"agents":[]}');
  });

  it('concatenates multi-part content in order', () => {
    const parts = [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }];
    expect(CrewDesigner._contentToString(parts)).toBe('{"a":1}');
  });

  it('treats null/undefined as empty (so _callAI throws "Empty response", not a TypeError)', () => {
    expect(CrewDesigner._contentToString(null)).toBe('');
    expect(CrewDesigner._contentToString(undefined)).toBe('');
  });

  it('tolerates malformed parts without throwing', () => {
    expect(CrewDesigner._contentToString([{ type: 'text' }, null, { text: 'ok' }])).toBe('ok');
  });
});

describe('CrewDesigner._parseCrewJSON', () => {
  beforeEach(() => loadModule('lib/crew-designer.js'));

  const CREW = '{"spaceship":{"name":"Vegas Realty AI"},"agents":[{"name":"Prospector","role":"Ops"}]}';

  it('parses a bare JSON object', () => {
    expect(CrewDesigner._parseCrewJSON(CREW).agents[0].name).toBe('Prospector');
  });

  it('parses JSON wrapped in ```json fences', () => {
    expect(CrewDesigner._parseCrewJSON('```json\n' + CREW + '\n```').spaceship.name).toBe('Vegas Realty AI');
  });

  it('extracts JSON when the model adds a prose preamble', () => {
    // The real live failure: claude-haiku answered "Here's an AI crew ... {json}".
    const withPreamble = "Here's an AI crew designed for Vegas Realty:\n\n" + CREW;
    expect(CrewDesigner._parseCrewJSON(withPreamble).agents.length).toBe(1);
  });

  it('returns null for unparseable prose (caller falls back to template)', () => {
    expect(CrewDesigner._parseCrewJSON('Okay, let me think about this...')).toBeNull();
    expect(CrewDesigner._parseCrewJSON('')).toBeNull();
    expect(CrewDesigner._parseCrewJSON(null)).toBeNull();
  });
});

describe('SetupWizard._contentToString', () => {
  beforeEach(() => {
    globalThis.NEEDS = [];
    loadModule('lib/setup-wizard.js');
  });

  it('joins a Claude parts-array into the raw JSON string', () => {
    expect(SetupWizard._contentToString(CLAUDE_PARTS)).toBe('{"agents":[{"name":"X"}]}');
  });

  it('passes a plain string through and treats null as empty', () => {
    expect(SetupWizard._contentToString('hi')).toBe('hi');
    expect(SetupWizard._contentToString(null)).toBe('');
  });
});
