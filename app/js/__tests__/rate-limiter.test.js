/**
 * RateLimiter tests — the client-side sliding-window guard for LLM calls, DB
 * writes, and auth. State is an in-memory Map plus a mutable default-limits
 * object, so the module is a memoizing singleton: re-eval the source per test
 * (the Roles pattern) for a pristine instance. The clock is frozen with fake
 * timers so window math is deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../lib/rate-limiter.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');

const BASE = 1_000_000; // frozen "now" for the count-limit tests

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  eval(SRC); // fresh globalThis.RateLimiter: empty windows, default limits
});
afterEach(() => { vi.useRealTimers(); });

describe('RateLimiter.check — default limits', () => {
  it('allows the first call for a fresh key', () => {
    expect(RateLimiter.check('llm')).toBe(true);
  });

  it('allows exactly the llm default (60) then blocks the next', () => {
    for (let i = 0; i < 60; i++) expect(RateLimiter.check('llm')).toBe(true);
    expect(RateLimiter.check('llm')).toBe(false);
  });

  it('uses 120/min for db-write', () => {
    for (let i = 0; i < 120; i++) expect(RateLimiter.check('db-write')).toBe(true);
    expect(RateLimiter.check('db-write')).toBe(false);
  });

  it('uses 10/min for auth', () => {
    for (let i = 0; i < 10; i++) expect(RateLimiter.check('auth')).toBe(true);
    expect(RateLimiter.check('auth')).toBe(false);
  });

  it('defaults an unknown key to 60/min', () => {
    for (let i = 0; i < 60; i++) expect(RateLimiter.check('mystery')).toBe(true);
    expect(RateLimiter.check('mystery')).toBe(false);
  });
});

describe('RateLimiter.check — per-call override', () => {
  it('caps at an override below the default', () => {
    expect(RateLimiter.check('llm', 2)).toBe(true);
    expect(RateLimiter.check('llm', 2)).toBe(true);
    expect(RateLimiter.check('llm', 2)).toBe(false);
  });

  it('applies the limit per call, not stickily, over a shared key window', () => {
    expect(RateLimiter.check('api', 2)).toBe(true);
    expect(RateLimiter.check('api', 2)).toBe(true);
    expect(RateLimiter.check('api', 2)).toBe(false); // capped at 2
    expect(RateLimiter.check('api')).toBe(true);      // same window, default 60 → room
  });

  it('does not consume a window slot on a blocked call', () => {
    expect(RateLimiter.check('x', 1)).toBe(true);  // window: [t]
    expect(RateLimiter.check('x', 1)).toBe(false); // blocked, nothing pushed
    expect(RateLimiter.check('x', 2)).toBe(true);  // still [t], 1 < 2 → allowed
  });

  it('treats an override of 0 as falsy and falls back to the key default (footgun)', () => {
    // `0 || _limits['auth'](=10) || 60` resolves to 10, NOT a hard block.
    for (let i = 0; i < 10; i++) expect(RateLimiter.check('auth', 0)).toBe(true);
    expect(RateLimiter.check('auth', 0)).toBe(false);
  });
});

describe('RateLimiter.check — sliding window', () => {
  it('allows calls again once the window fully passes', () => {
    for (let i = 0; i < 60; i++) RateLimiter.check('llm');
    expect(RateLimiter.check('llm')).toBe(false);
    vi.setSystemTime(BASE + 60_001); // 60.001s later → every timestamp pruned
    expect(RateLimiter.check('llm')).toBe(true);
  });

  it('keeps a timestamp exactly WINDOW_MS old in the window (prune is strict <)', () => {
    expect(RateLimiter.check('llm', 1)).toBe(true);  // t = BASE
    vi.setSystemTime(BASE + 60_000);                 // exactly 60s later
    expect(RateLimiter.check('llm', 1)).toBe(false); // old ts not yet expired
    vi.setSystemTime(BASE + 60_001);                 // one more ms
    expect(RateLimiter.check('llm', 1)).toBe(true);  // now pruned
  });

  it('prunes only the expired prefix, keeping in-window timestamps', () => {
    RateLimiter.check('llm', 3);     // ts A @ BASE
    vi.setSystemTime(BASE + 30_000);
    RateLimiter.check('llm', 3);     // ts B @ +30s
    vi.setSystemTime(BASE + 60_001); // A expires, B (at +30s) survives
    expect(RateLimiter.check('llm', 3)).toBe(true);  // window [B] → push
    expect(RateLimiter.check('llm', 3)).toBe(true);  // window [B, now] → push
    expect(RateLimiter.check('llm', 3)).toBe(false); // window full at 3
  });
});

describe('RateLimiter.reset', () => {
  it('clears a key window so calls are allowed again immediately', () => {
    for (let i = 0; i < 60; i++) RateLimiter.check('llm');
    expect(RateLimiter.check('llm')).toBe(false);
    RateLimiter.reset('llm');
    expect(RateLimiter.check('llm')).toBe(true);
  });

  it('only resets the named key', () => {
    RateLimiter.check('llm', 1);
    RateLimiter.check('auth', 1);
    expect(RateLimiter.check('llm', 1)).toBe(false);
    expect(RateLimiter.check('auth', 1)).toBe(false);
    RateLimiter.reset('llm');
    expect(RateLimiter.check('llm', 1)).toBe(true);   // reset
    expect(RateLimiter.check('auth', 1)).toBe(false); // untouched
  });

  it('is a no-op for an unknown key', () => {
    expect(() => RateLimiter.reset('never-seen')).not.toThrow();
    expect(RateLimiter.check('never-seen')).toBe(true);
  });
});

describe('RateLimiter.configure', () => {
  it('overrides the default limit for a key on later checks', () => {
    RateLimiter.configure('llm', 2);
    expect(RateLimiter.check('llm')).toBe(true);
    expect(RateLimiter.check('llm')).toBe(true);
    expect(RateLimiter.check('llm')).toBe(false);
  });

  it('registers a brand-new key category', () => {
    RateLimiter.configure('exports', 1);
    expect(RateLimiter.check('exports')).toBe(true);
    expect(RateLimiter.check('exports')).toBe(false);
  });

  it('still lets a per-call override beat the configured default', () => {
    RateLimiter.configure('llm', 2);
    expect(RateLimiter.check('llm', 5)).toBe(true); // uses 5, not 2
    expect(RateLimiter.check('llm', 5)).toBe(true);
    expect(RateLimiter.check('llm', 5)).toBe(true); // 3rd allowed under the override
  });
});

describe('RateLimiter — key independence', () => {
  it('keeps separate windows per key', () => {
    for (let i = 0; i < 10; i++) RateLimiter.check('auth');
    expect(RateLimiter.check('auth')).toBe(false);    // auth exhausted at 10
    expect(RateLimiter.check('llm')).toBe(true);       // llm untouched
    expect(RateLimiter.check('db-write')).toBe(true);  // db-write untouched
  });
});
