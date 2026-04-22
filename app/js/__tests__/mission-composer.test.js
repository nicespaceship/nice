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
