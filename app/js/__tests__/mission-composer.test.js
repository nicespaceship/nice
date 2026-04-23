import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// Load MissionComposerView into globalThis the same way setup.js loads lib
// modules. We do this in-file (not in setup.js) because the composer view
// depends on a couple of run-time globals (SB, State, Router) that the
// setup mocks — importing it from setup would force every view into the
// default test surface.
function loadViewGlobal(relativePath) {
  const absPath = resolve(__dirname_local, '..', relativePath);
  let code = readFileSync(absPath, 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadViewGlobal('views/mission-composer.js');

describe('MissionComposerView — parsePlanResponse', () => {
  it('parses a plain JSON body', () => {
    const p = MissionComposerView.parsePlanResponse('{"title":"X","plan":{"nodes":[],"edges":[]}}');
    expect(p.title).toBe('X');
  });

  it('strips ```json fences before parsing', () => {
    const wrapped = '```json\n{"title":"X","plan":{"nodes":[]}}\n```';
    const p = MissionComposerView.parsePlanResponse(wrapped);
    expect(p.title).toBe('X');
  });

  it('extracts JSON from mixed prose', () => {
    const mixed = 'Sure! Here you go:\n{"title":"X","plan":{"nodes":[{"type":"agent","prompt":"do it"}]}}\nLet me know.';
    const p = MissionComposerView.parsePlanResponse(mixed);
    expect(p.plan.nodes[0].type).toBe('agent');
  });

  it('throws on empty input', () => {
    expect(() => MissionComposerView.parsePlanResponse('')).toThrow(/empty/i);
  });

  it('throws on unparseable garbage', () => {
    expect(() => MissionComposerView.parsePlanResponse('not json at all')).toThrow(/unparseable/i);
  });
});

describe('MissionComposerView — normalizePlan', () => {
  const validParsed = {
    title: 'Draft customer replies',
    description: 'Draft replies in my voice.',
    shape: 'simple',
    plan: { nodes: [{ id: 'root', type: 'agent', prompt: 'Draft replies to unread customer threads.' }], edges: [] },
  };

  it('returns the expected fields for a valid plan', () => {
    const p = MissionComposerView.normalizePlan(validParsed, 'intent text');
    expect(p.title).toBe('Draft customer replies');
    expect(p.shape).toBe('simple');
    expect(p.plan.nodes[0].prompt).toMatch(/draft replies/i);
    expect(p.plan.nodes[0].id).toBe('root');
    expect(p.plan.edges).toEqual([]);
    expect(p.captain_id).toBeNull();
    expect(p.tools_required).toEqual([]);
  });

  it('forces shape to simple even if LLM picks something else', () => {
    const p = MissionComposerView.normalizePlan({ ...validParsed, shape: 'dag' }, 'x');
    expect(p.shape).toBe('simple');
  });

  it('falls back to the intent when title is missing', () => {
    const p = MissionComposerView.normalizePlan(
      { plan: { nodes: [{ type: 'agent', prompt: 'do it' }] } },
      'handle my customer emails'
    );
    expect(p.title).toBe('handle my customer emails');
  });

  it('truncates long titles', () => {
    const long = 'a'.repeat(200);
    const p = MissionComposerView.normalizePlan({ ...validParsed, title: long }, 'x');
    expect(p.title.length).toBeLessThanOrEqual(120);
  });

  it('throws if no agent node is present', () => {
    expect(() => MissionComposerView.normalizePlan(
      { title: 'X', plan: { nodes: [] } }, 'x'
    )).toThrow(/usable agent step/i);
  });

  it('throws if agent node has no prompt', () => {
    expect(() => MissionComposerView.normalizePlan(
      { title: 'X', plan: { nodes: [{ type: 'agent' }] } }, 'x'
    )).toThrow(/usable agent step/i);
  });

  it('throws on non-object input', () => {
    expect(() => MissionComposerView.normalizePlan(null, 'x')).toThrow(/non-object/i);
    expect(() => MissionComposerView.normalizePlan('string', 'x')).toThrow(/non-object/i);
  });

  it('picks the first agent node and ignores non-agent nodes', () => {
    const p = MissionComposerView.normalizePlan({
      title: 'Hybrid',
      plan: {
        nodes: [
          { id: 'delay1', type: 'delay', ms: 500 },
          { id: 'main', type: 'agent', prompt: 'go' },
          { id: 'extra', type: 'agent', prompt: 'ignored' },
        ],
      },
    }, 'x');
    // MVP collapses to a single node at id 'root'; downstream node types
    // come in S5.
    expect(p.plan.nodes).toHaveLength(1);
    expect(p.plan.nodes[0].prompt).toBe('go');
    expect(p.plan.nodes[0].id).toBe('root');
  });

  it('trims whitespace on description', () => {
    const p = MissionComposerView.normalizePlan(
      { ...validParsed, description: '  hello world  \n' }, 'x'
    );
    expect(p.description).toBe('hello world');
  });
});

describe('MissionComposerView — system prompt', () => {
  it('mentions the required JSON shape and simple-only constraint', () => {
    const sp = MissionComposerView._systemPrompt();
    expect(sp).toMatch(/JSON/);
    expect(sp).toMatch(/simple/);
    expect(sp).toMatch(/agent/);
  });
});

describe('MissionComposerView — Inbox Captain template', () => {
  it('detectInboxCaptainIntent matches canonical email/inbox phrasing', () => {
    const matches = [
      'Draft a reply for every unread email from a customer.',
      'Go through my Gmail inbox and respond to anything internal.',
      'Reply to threads from vendors.',
      'Draft responses for unread messages.',
    ];
    matches.forEach(s => expect(MissionComposerView.detectInboxCaptainIntent(s)).toBe(true));
  });

  it('detectInboxCaptainIntent ignores unrelated intents', () => {
    const misses = [
      'Summarize our Q4 sales data.',
      'Write a blog post about agent orchestration.',
      'Research competitors in the logistics space.',
      '',
      null,
      42,
    ];
    misses.forEach(s => expect(MissionComposerView.detectInboxCaptainIntent(s)).toBe(false));
  });

  it('buildInboxCaptainPlan returns a single persona_dispatch node pointing at the agent', () => {
    // Post-refactor (2026-04-23): Inbox Captain is a single agent,
    // not a spaceship with a DAG. Composer emits a 1-node plan with
    // a persona_dispatch wrapper so WorkflowEngine injects the
    // user's voice reference at runtime.
    const fakeBlueprint = {
      id: 'bp-agent-inbox-captain',
      name: 'Inbox Captain',
      metadata: { tools_required: ['google-gmail'] },
      config: { role: 'Ops' },
    };

    const plan = MissionComposerView.buildInboxCaptainPlan(fakeBlueprint, 'Draft inbox replies');
    expect(plan.shape).toBe('dag');
    expect(plan.captain_id).toBeNull();
    expect(plan.plan.nodes).toHaveLength(1);
    expect(plan.plan.nodes[0].type).toBe('persona_dispatch');
    expect(plan.plan.nodes[0].config.blueprintId).toBe('bp-agent-inbox-captain');
    expect(plan.plan.nodes[0].config.personaHint).toBe('user_voice');
    expect(plan.plan.edges).toHaveLength(0);
    expect(plan.tools_required).toContain('google-gmail');
    expect(plan.template_id).toBe('bp-agent-inbox-captain');
    expect(plan.title).toMatch(/Inbox Captain/);
  });

  it('buildInboxCaptainPlan returns null when the blueprint is missing id', () => {
    expect(MissionComposerView.buildInboxCaptainPlan(null, 'x')).toBeNull();
    expect(MissionComposerView.buildInboxCaptainPlan({}, 'x')).toBeNull();
  });

  it('buildInboxCaptainPlan falls back to a default description when intent is empty', () => {
    const bp = { id: 'bp-agent-inbox-captain', metadata: { tools_required: ['google-gmail'] } };
    const plan = MissionComposerView.buildInboxCaptainPlan(bp, '');
    expect(plan.description).toMatch(/Triage recent Gmail/);
  });

  it('INBOX_CAPTAIN_ID points at the seeded agent blueprint', () => {
    expect(MissionComposerView.INBOX_CAPTAIN_ID).toBe('bp-agent-inbox-captain');
  });
});

describe('MissionComposerView — voice signal line on the chip', () => {
  beforeEach(() => {
    try { localStorage.removeItem('nice-voice-sample'); } catch {}
    // The test runner also loads Utils via setup.js; if it hasn't, stub
    // the KEYS entry the composer reads.
    if (typeof globalThis.Utils === 'undefined') {
      globalThis.Utils = { esc: String, KEYS: { voiceSample: 'nice-voice-sample' } };
    } else if (!globalThis.Utils.KEYS) {
      globalThis.Utils.KEYS = { voiceSample: 'nice-voice-sample' };
    } else if (!globalThis.Utils.KEYS.voiceSample) {
      globalThis.Utils.KEYS.voiceSample = 'nice-voice-sample';
    }
  });

  it('_readVoiceSampleLength returns 0 when the key is empty', () => {
    expect(MissionComposerView._readVoiceSampleLength()).toBe(0);
  });

  it('_readVoiceSampleLength returns the trimmed length', () => {
    localStorage.setItem('nice-voice-sample', '   hello world   ');
    expect(MissionComposerView._readVoiceSampleLength()).toBe(11);
  });

  it('_voiceSignalLine renders the off-state when length is 0', () => {
    const html = MissionComposerView._voiceSignalLine(0);
    expect(html).toMatch(/mc-template-chip-voice-off/);
    expect(html).toMatch(/No voice sample/);
    expect(html).toMatch(/href="#\/profile"/);
  });

  it('_voiceSignalLine renders the on-state with char count when length > 0', () => {
    const html = MissionComposerView._voiceSignalLine(342);
    expect(html).toMatch(/mc-template-chip-voice-on/);
    expect(html).toMatch(/Voice sample ready \(342 chars\)/);
    expect(html).toMatch(/Drafter writes in your voice/);
  });

  it('_voiceSignalLine pluralizes the char label at length 1', () => {
    const html = MissionComposerView._voiceSignalLine(1);
    expect(html).toMatch(/\(1 char\)/);
    expect(html).not.toMatch(/\(1 chars\)/);
  });
});
