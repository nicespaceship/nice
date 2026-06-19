/**
 * ShipBehaviors tests — the per-spaceship behavior config + daily token-budget
 * gate (a cost-control safety mechanism). All state lives in localStorage, so
 * clearing it per-test is a full reset. Pure logic + Date; the time-based
 * budget reset is driven with fake timers.
 *
 * Loads the IIFE as a global the same way the other lib tests do (setup.js
 * already provides Utils + a working localStorage).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/ship-behaviors.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

const KEY = 'nice-ship-behaviors';
const raw = () => JSON.parse(localStorage.getItem(KEY) || '{}');

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('ShipBehaviors.getBehaviors', () => {
  it('returns the defaults for a ship with no stored config', () => {
    const b = ShipBehaviors.getBehaviors('ship-1');
    expect(b.approvalMode).toBe('review');
    expect(b.maxConcurrent).toBe(3);
    expect(b.dailyBudget).toBe(0);
    expect(b.notifyOnComplete).toBe(true);
  });

  it('merges stored overrides over the defaults, keeping untouched keys', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'ship-1': { approvalMode: 'autonomous' } }));
    const b = ShipBehaviors.getBehaviors('ship-1');
    expect(b.approvalMode).toBe('autonomous'); // overridden
    expect(b.maxConcurrent).toBe(3);           // still default
  });

  it('keeps ships independent', () => {
    ShipBehaviors.setBehavior('ship-1', 'approvalMode', 'draft');
    expect(ShipBehaviors.getBehaviors('ship-2').approvalMode).toBe('review');
  });

  it('falls back to defaults on corrupt localStorage JSON', () => {
    localStorage.setItem(KEY, '{not valid json');
    expect(ShipBehaviors.getBehaviors('ship-1').approvalMode).toBe('review');
  });

  it('returns a fresh object (mutating it does not poison the defaults)', () => {
    ShipBehaviors.getBehaviors('ship-1').approvalMode = 'mutated';
    expect(ShipBehaviors.getBehaviors('ship-1').approvalMode).toBe('review');
  });
});

describe('ShipBehaviors.setBehavior', () => {
  it('persists a single key, reflected by getBehaviors', () => {
    ShipBehaviors.setBehavior('ship-1', 'autoRun', true);
    expect(ShipBehaviors.getBehaviors('ship-1').autoRun).toBe(true);
  });

  it('creates the ship entry when absent without clobbering other ships', () => {
    ShipBehaviors.setBehavior('ship-1', 'maxConcurrent', 5);
    ShipBehaviors.setBehavior('ship-2', 'maxConcurrent', 9);
    expect(ShipBehaviors.getBehaviors('ship-1').maxConcurrent).toBe(5);
    expect(ShipBehaviors.getBehaviors('ship-2').maxConcurrent).toBe(9);
  });

  it('does not clobber other keys on the same ship', () => {
    ShipBehaviors.setBehavior('ship-1', 'approvalMode', 'autonomous');
    ShipBehaviors.setBehavior('ship-1', 'dailyBudget', 500);
    const b = ShipBehaviors.getBehaviors('ship-1');
    expect(b.approvalMode).toBe('autonomous');
    expect(b.dailyBudget).toBe(500);
  });
});

describe('ShipBehaviors.checkBudget', () => {
  it('allows everything when no budget is set (0 = unlimited)', () => {
    expect(ShipBehaviors.checkBudget('ship-1', 1_000_000)).toBe(true);
  });

  it('allows usage within the daily budget', () => {
    ShipBehaviors.setBehavior('ship-1', 'dailyBudget', 1000);
    ShipBehaviors.setBehavior('ship-1', 'budgetUsedToday', 200);
    expect(ShipBehaviors.checkBudget('ship-1', 300)).toBe(true);
  });

  it('allows hitting the budget exactly (boundary is inclusive)', () => {
    ShipBehaviors.setBehavior('ship-1', 'dailyBudget', 1000);
    ShipBehaviors.setBehavior('ship-1', 'budgetUsedToday', 700);
    expect(ShipBehaviors.checkBudget('ship-1', 300)).toBe(true);
  });

  it('blocks usage that would exceed the budget', () => {
    ShipBehaviors.setBehavior('ship-1', 'dailyBudget', 1000);
    ShipBehaviors.setBehavior('ship-1', 'budgetUsedToday', 800);
    expect(ShipBehaviors.checkBudget('ship-1', 300)).toBe(false);
  });

  it('treats a missing estimate as zero', () => {
    ShipBehaviors.setBehavior('ship-1', 'dailyBudget', 1000);
    ShipBehaviors.setBehavior('ship-1', 'budgetUsedToday', 1000);
    expect(ShipBehaviors.checkBudget('ship-1')).toBe(true); // 1000 + 0 <= 1000
  });
});

describe('ShipBehaviors.deductBudget', () => {
  it('accumulates usage against the daily budget', () => {
    ShipBehaviors.deductBudget('ship-1', 300);
    ShipBehaviors.deductBudget('ship-1', 200);
    expect(ShipBehaviors.getBehaviors('ship-1').budgetUsedToday).toBe(500);
  });

  it('ignores non-positive token counts', () => {
    ShipBehaviors.deductBudget('ship-1', 0);
    ShipBehaviors.deductBudget('ship-1', -50);
    expect(raw()['ship-1']).toBeUndefined();
  });

  it('stamps a budgetResetAt on first deduction', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00'));
    ShipBehaviors.deductBudget('ship-1', 100);
    const resetAt = new Date(ShipBehaviors.getBehaviors('ship-1').budgetResetAt);
    expect(resetAt.getTime()).toBeGreaterThan(Date.now()); // future midnight
  });
});

describe('ShipBehaviors daily reset', () => {
  it('zeroes usage once the reset timestamp has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00'));
    ShipBehaviors.setBehavior('ship-1', 'dailyBudget', 1000);
    ShipBehaviors.deductBudget('ship-1', 900);
    expect(ShipBehaviors.checkBudget('ship-1', 300)).toBe(false); // 900+300 > 1000

    // Jump two days past the stamped reset → next check resets usage first.
    vi.setSystemTime(new Date('2026-06-21T12:00:00'));
    expect(ShipBehaviors.checkBudget('ship-1', 300)).toBe(true);
    expect(ShipBehaviors.getBehaviors('ship-1').budgetUsedToday).toBe(0);
  });

  it('resetDailyBudgets zeroes every ship and re-stamps the reset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00'));
    ShipBehaviors.deductBudget('ship-1', 400);
    ShipBehaviors.deductBudget('ship-2', 700);
    ShipBehaviors.resetDailyBudgets();
    expect(ShipBehaviors.getBehaviors('ship-1').budgetUsedToday).toBe(0);
    expect(ShipBehaviors.getBehaviors('ship-2').budgetUsedToday).toBe(0);
    expect(new Date(ShipBehaviors.getBehaviors('ship-1').budgetResetAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('ShipBehaviors.DEFAULTS', () => {
  it('exposes a frozen copy of the defaults', () => {
    expect(Object.isFrozen(ShipBehaviors.DEFAULTS)).toBe(true);
    expect(ShipBehaviors.DEFAULTS.approvalMode).toBe('review');
  });
});
