/**
 * AgentMemory tests — per-agent persistent memory (facts, success/failure
 * patterns, business context) stored in localStorage and injected into agent
 * system prompts via buildPromptContext(). All state lives in localStorage, so
 * clearing it per-test is a full reset.
 *
 * Focus on the real bug surface:
 *   - the FIFO trims (facts 50, success/failure 20) and exact-match dedup,
 *   - getMemory returning a deep clone (callers can't poison the store),
 *   - buildPromptContext's section ordering, char budget, and facts recency,
 *   - learn()'s approved/rejected branching + the key:value fact extraction.
 *
 * Loads the IIFE as a global the same way the other lib tests do.
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/agent-memory.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

const KEY = 'nice-agent-memories';
const seed = (obj) => localStorage.setItem(KEY, JSON.stringify(obj));

beforeEach(() => { localStorage.clear(); });

describe('AgentMemory.getMemory', () => {
  it('returns null for a falsy agent id', () => {
    expect(AgentMemory.getMemory('')).toBeNull();
    expect(AgentMemory.getMemory(undefined)).toBeNull();
  });

  it('creates and returns the default shape for a new agent', () => {
    const m = AgentMemory.getMemory('a1');
    expect(m).toEqual({ facts: [], preferences: {}, successPatterns: [], failurePatterns: [], context: {} });
  });

  it('returns a deep clone — mutating it does not poison the store', () => {
    const m = AgentMemory.getMemory('a1');
    m.facts.push('injected');
    m.context.x = 'y';
    expect(AgentMemory.getMemory('a1').facts).not.toContain('injected');
    expect(AgentMemory.getMemory('a1').context).toEqual({});
  });
});

describe('AgentMemory.addFact', () => {
  it('adds a fact, reflected by getMemory', () => {
    AgentMemory.addFact('a1', 'sky is blue');
    expect(AgentMemory.getMemory('a1').facts).toEqual(['sky is blue']);
  });

  it('deduplicates exact matches', () => {
    AgentMemory.addFact('a1', 'dup');
    AgentMemory.addFact('a1', 'dup');
    expect(AgentMemory.getMemory('a1').facts).toEqual(['dup']);
  });

  it('FIFO-trims to the most recent 50 facts', () => {
    for (let i = 0; i < 55; i++) AgentMemory.addFact('a1', 'fact-' + i);
    const facts = AgentMemory.getMemory('a1').facts;
    expect(facts.length).toBe(50);
    expect(facts[0]).toBe('fact-5');   // first 5 dropped
    expect(facts[49]).toBe('fact-54');
  });

  it('is a no-op for a falsy agent id or fact', () => {
    AgentMemory.addFact('', 'x');
    AgentMemory.addFact('a1', '');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('AgentMemory.addSuccess / addFailure', () => {
  it('records a success with defaulted fields', () => {
    AgentMemory.addSuccess('a1', { task: 'ship it' });
    const s = AgentMemory.getMemory('a1').successPatterns[0];
    expect(s.task).toBe('ship it');
    expect(s.approach).toBe('');
    expect(s.result).toBe('');
    expect(typeof s.timestamp).toBe('string');
  });

  it('FIFO-trims success patterns to 20', () => {
    for (let i = 0; i < 22; i++) AgentMemory.addSuccess('a1', { task: 't' + i });
    const s = AgentMemory.getMemory('a1').successPatterns;
    expect(s.length).toBe(20);
    expect(s[0].task).toBe('t2');
  });

  it('records a failure with a reason and trims to 20', () => {
    for (let i = 0; i < 21; i++) AgentMemory.addFailure('a1', { task: 'f' + i, reason: 'nope' });
    const f = AgentMemory.getMemory('a1').failurePatterns;
    expect(f.length).toBe(20);
    expect(f[19].reason).toBe('nope');
  });
});

describe('AgentMemory.setContext / clear', () => {
  it('sets a context key-value pair', () => {
    AgentMemory.setContext('a1', 'company', 'Acme');
    expect(AgentMemory.getMemory('a1').context.company).toBe('Acme');
  });

  it('is a no-op without a key', () => {
    AgentMemory.setContext('a1', '', 'v');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clears one agent without touching others', () => {
    AgentMemory.addFact('a1', 'x');
    AgentMemory.addFact('a2', 'y');
    AgentMemory.clear('a1');
    expect(AgentMemory.getMemory('a1').facts).toEqual([]);
    expect(AgentMemory.getMemory('a2').facts).toEqual(['y']);
  });
});

describe('AgentMemory.buildPromptContext', () => {
  it('returns an empty string for a falsy id or an agent with no memories', () => {
    expect(AgentMemory.buildPromptContext('')).toBe('');
    expect(AgentMemory.buildPromptContext('a1')).toBe('');
  });

  it('renders every section in priority order with content', () => {
    seed({ a1: {
      facts: ['fact one'],
      preferences: { tone: 'formal' },
      successPatterns: [{ task: 'T', approach: 'A', result: 'R', timestamp: '' }],
      failurePatterns: [{ task: 'T2', approach: 'A2', reason: 'bad', timestamp: '' }],
      context: { company: 'Acme' },
    } });
    const out = AgentMemory.buildPromptContext('a1');
    expect(out).toContain('# Agent Memory');
    const order = ['## Business Context', '## User Preferences', '## Learned Facts', '## What Worked', '## What to Avoid']
      .map((h) => out.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b)); // strictly increasing
    expect(out).toContain('- company: Acme');
    expect(out).toContain('- tone: formal');
    expect(out).toContain('OK: "T" via A');
    expect(out).toContain('AVOID: "T2" — bad');
  });

  it('shows the most recent facts first and caps at 10', () => {
    for (let i = 0; i < 12; i++) AgentMemory.addFact('a1', 'fact-' + i);
    const out = AgentMemory.buildPromptContext('a1');
    expect(out.indexOf('fact-11')).toBeLessThan(out.indexOf('fact-2')); // newest first
    expect(out).not.toContain('- fact-0'); // only the last 10 (fact-2..fact-11)
    expect(out).not.toContain('- fact-1\n');
  });

  it('skips a section whose block would blow the ~2000-char budget', () => {
    AgentMemory.setContext('a1', 'huge', 'x'.repeat(2100));
    expect(AgentMemory.buildPromptContext('a1')).toBe(''); // oversized block dropped, nothing else
  });
});

describe('AgentMemory.learn', () => {
  it('is a no-op without an agent id or result', () => {
    AgentMemory.learn('', { content: 'x' }, 'approved');
    AgentMemory.learn('a1', null, 'approved');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('records a success and extracts key:value facts on approval', () => {
    AgentMemory.learn('a1', { task: 'Research Acme', content: 'Company: Acme Corporation\nIndustry: Software' }, 'approved');
    const mem = AgentMemory.getMemory('a1');
    expect(mem.successPatterns).toHaveLength(1);
    expect(mem.successPatterns[0].result).toBe('Approved by user');
    expect(mem.facts).toContain('Company: Acme Corporation');
    expect(mem.facts).toContain('Industry: Software');
  });

  it('records a failure and extracts nothing on rejection', () => {
    AgentMemory.learn('a1', { task: 'T', content: 'Company: Acme Corporation' }, 'rejected');
    const mem = AgentMemory.getMemory('a1');
    expect(mem.failurePatterns).toHaveLength(1);
    expect(mem.failurePatterns[0].reason).toBe('Rejected by user');
    expect(mem.facts).toEqual([]);
  });

  it('derives the task from metadata when missing and truncates a long approach', () => {
    AgentMemory.learn('a1', { content: 'z'.repeat(200), metadata: { task: 'from meta' } }, 'approved');
    const s = AgentMemory.getMemory('a1').successPatterns[0];
    expect(s.task).toBe('from meta');
    expect(s.approach).toHaveLength(123); // 120 chars + '...'
    expect(s.approach.endsWith('...')).toBe(true);
  });
});
