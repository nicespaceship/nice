/**
 * CostUtils.attributeLogsToMissions — shared cost-attribution SSOT.
 * Both the Cost Tracker (cost.js) and Operations analytics (analytics.js)
 * call this. It replaces the old ±24h window that triple-counted spend on a
 * multi-mission day, so the test locks the one-mission-per-log invariant for
 * both views at once.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('lib/cost-utils.js');
loadModule('lib/token-config.js'); // computeRunway reads TokenConfig weights/pools at call time

describe('CostUtils.attributeLogsToMissions', () => {
  it('bills each log to exactly one mission, so a multi-mission day is not multiplied', () => {
    // One agent, three completed missions the same day.
    const missions = [
      { id: 'm1', agent_id: 'a1', created_at: '2026-06-01T10:00:00Z' },
      { id: 'm2', agent_id: 'a1', created_at: '2026-06-01T11:00:00Z' },
      { id: 'm3', agent_id: 'a1', created_at: '2026-06-01T12:00:00Z' },
    ];
    // Two logs totalling $5 — both fall within ±24h of all three missions.
    const logs = [
      { agent_id: 'a1', tokens_used: 30, amount: 3, created_at: '2026-06-01T10:05:00Z' },
      { agent_id: 'a1', tokens_used: 20, amount: 2, created_at: '2026-06-01T11:05:00Z' },
    ];

    const acc = CostUtils.attributeLogsToMissions(missions, logs);

    // Total across all missions equals real spend ($5), not 3× ($15).
    const total = Object.values(acc).reduce((s, v) => s + v.cost, 0);
    expect(total).toBe(5);
    // Each log lands on its nearest mission; the third gets nothing.
    expect(acc.m1.cost).toBe(3);
    expect(acc.m2.cost).toBe(2);
    expect(acc.m3.cost).toBe(0);
    expect(acc.m1.tokens).toBe(30);
    expect(acc.m2.tokens).toBe(20);
  });

  it('attributes a log to the nearest mission in time, not just the first', () => {
    const missions = [
      { id: 'early', agent_id: 'a1', created_at: '2026-06-01T08:00:00Z' },
      { id: 'late', agent_id: 'a1', created_at: '2026-06-01T20:00:00Z' },
    ];
    const logs = [{ agent_id: 'a1', tokens_used: 10, amount: 1, created_at: '2026-06-01T19:30:00Z' }];

    const acc = CostUtils.attributeLogsToMissions(missions, logs);
    expect(acc.late.cost).toBe(1);
    expect(acc.early.cost).toBe(0);
  });

  it('drops a log whose agent has no mission in the set (nothing to bill it to)', () => {
    const missions = [{ id: 'm1', agent_id: 'a1', created_at: '2026-06-01T10:00:00Z' }];
    const logs = [{ agent_id: 'ghost', tokens_used: 99, amount: 9, created_at: '2026-06-01T10:00:00Z' }];

    const acc = CostUtils.attributeLogsToMissions(missions, logs);
    expect(acc.m1.cost).toBe(0);
    expect(acc.m1.tokens).toBe(0);
  });

  it('returns a zeroed entry for every mission and tolerates empty/missing inputs', () => {
    const missions = [{ id: 'm1', agent_id: 'a1', created_at: '2026-06-01T10:00:00Z' }];
    expect(CostUtils.attributeLogsToMissions(missions, [])).toEqual({ m1: { tokens: 0, cost: 0 } });
    expect(CostUtils.attributeLogsToMissions([], [])).toEqual({});
    expect(CostUtils.attributeLogsToMissions(undefined, undefined)).toEqual({});
  });
});

describe('CostUtils.formatTokens', () => {
  it('uses M/k suffixes above the thresholds and a zero floor below', () => {
    expect(CostUtils.formatTokens(0)).toBe('0');
    expect(CostUtils.formatTokens(undefined)).toBe('0');
    expect(CostUtils.formatTokens(850)).toBe('850');
    expect(CostUtils.formatTokens(3400)).toBe('3.4k');
    expect(CostUtils.formatTokens(1200000)).toBe('1.2M');
  });
});

describe('CostUtils.getBudget', () => {
  // Uses the shared Utils + localStorage mocks from setup.js (cleared each beforeEach).
  it('returns the saved budget when present', () => {
    localStorage.setItem(Utils.KEYS.budget, JSON.stringify({ limit: 120, alert: 90 }));
    expect(CostUtils.getBudget()).toEqual({ limit: 120, alert: 90 });
  });

  it('falls back to the default ceiling on missing or corrupt data', () => {
    expect(CostUtils.getBudget()).toEqual({ limit: 50, alert: 80 });
    localStorage.setItem(Utils.KEYS.budget, '{not json');
    expect(CostUtils.getBudget()).toEqual({ limit: 50, alert: 80 });
  });
});

describe('CostUtils.computeSpendSummary', () => {
  // `now` is injected so the month math is deterministic. June 2026 has 30 days.
  const june15 = new Date(2026, 5, 15);

  it('totals only the current calendar month and derives budget + projection', () => {
    const logs = [
      { amount: 20, created_at: '2026-06-10T10:00:00Z' },
      { amount: 10, created_at: '2026-06-12T10:00:00Z' },
      { amount: 99, created_at: '2026-05-30T10:00:00Z' }, // prior month — excluded
    ];
    const s = CostUtils.computeSpendSummary(logs, june15);
    expect(s.totalSpend).toBe(30);
    expect(s.budget).toEqual({ limit: 50, alert: 80 }); // default
    expect(s.remaining).toBe(20);
    expect(s.pct).toBe(60);
    expect(s.daysInMonth).toBe(30);
    expect(s.dayOfMonth).toBe(15);
    expect(s.avgDaily).toBe(2);          // 30 spent / 15 days elapsed
    expect(s.projectedMonth).toBe(60);   // 2/day × 30 days
  });

  it('honors the saved budget and caps pct at 100 when over the limit', () => {
    localStorage.setItem(Utils.KEYS.budget, JSON.stringify({ limit: 10, alert: 80 }));
    const s = CostUtils.computeSpendSummary([{ amount: 25, created_at: '2026-06-05T10:00:00Z' }], june15);
    expect(s.totalSpend).toBe(25);
    expect(s.remaining).toBe(0);  // clamped, never negative
    expect(s.pct).toBe(100);      // clamped, never > 100
  });

  it('yields a zeroed summary on empty or missing logs', () => {
    const empty = CostUtils.computeSpendSummary([], june15);
    expect(empty.totalSpend).toBe(0);
    expect(empty.remaining).toBe(50);
    expect(empty.pct).toBe(0);
    expect(empty.avgDaily).toBe(0);
    expect(empty.projectedMonth).toBe(0);
    expect(CostUtils.computeSpendSummary(undefined, june15).totalSpend).toBe(0);
  });

  it('scales the month-end projection by elapsed days, not flat spend', () => {
    // Same $30 spend as the first case, but read on day 10 instead of day 15:
    // fewer elapsed days ⇒ a higher daily average ⇒ a more aggressive forecast.
    const logs = [{ amount: 30, created_at: '2026-06-05T12:00:00Z' }];
    const s = CostUtils.computeSpendSummary(logs, new Date(2026, 5, 10));
    expect(s.dayOfMonth).toBe(10);
    expect(s.avgDaily).toBe(3);          // 30 / 10 days
    expect(s.projectedMonth).toBe(90);   // 3/day × 30, vs 60 projected from day 15
  });
});

describe('CostUtils.loadCostData', () => {
  // Uses the shared State mock from setup.js (reset each beforeEach); only SB
  // is swapped per-test, then restored.
  const realSB = globalThis.SB;
  afterEach(() => { globalThis.SB = realSB; });

  it('normalizes fuel_usage rows into cost logs and writes agents/missions to State', async () => {
    const agents = [{ id: 'a1', name: 'Agent One' }];
    const missions = [{ id: 'm1', agent_id: 'a1' }];
    const fuel = [
      { id: 'f1', agent_id: 'a1', model: 'claude-4-6-sonnet', input_tokens: 100, output_tokens: 50, fuel_cost: '0.42', created_at: '2026-06-01T10:00:00Z' },
      { id: 'f2', agent_id: 'a1', input_tokens: 10, output_tokens: 0, fuel_cost: null, created_at: '2026-06-01T11:00:00Z' },
    ];
    const tables = { user_agents: agents, mission_runs: missions, fuel_usage: fuel };
    globalThis.SB = { db: (t) => ({ list: async () => tables[t] }) };

    const out = await CostUtils.loadCostData({ id: 'u1' });

    expect(out.agents).toEqual(agents);
    expect(out.tasks).toEqual(missions);
    expect(out.costLogs).toEqual([
      { id: 'f1', agent_id: 'a1', model: 'claude-4-6-sonnet', tokens_used: 150, amount: 0.42, created_at: '2026-06-01T10:00:00Z' },
      { id: 'f2', agent_id: 'a1', model: 'unknown', tokens_used: 10, amount: 0, created_at: '2026-06-01T11:00:00Z' },
    ]);
    expect(State.get('agents')).toEqual(agents);
    expect(State.get('missions')).toEqual(missions);
  });

  it('prefers cached agents/missions from State over a fetch', async () => {
    State.set('agents', [{ id: 'cached-a' }]);
    State.set('missions', [{ id: 'cached-m' }]);
    let entityFetches = 0;
    globalThis.SB = { db: (t) => ({ list: async () => { if (t !== 'fuel_usage') entityFetches++; return []; } }) };

    const out = await CostUtils.loadCostData({ id: 'u1' });

    expect(entityFetches).toBe(0);
    expect(out.agents).toEqual([{ id: 'cached-a' }]);
    expect(out.tasks).toEqual([{ id: 'cached-m' }]);
  });

  it('yields an honest empty state (no throw) when the user is null or a fetch fails', async () => {
    globalThis.SB = { db: () => ({ list: async () => { throw new Error('network'); } }) };
    await expect(CostUtils.loadCostData(null)).resolves.toEqual({ agents: [], tasks: [], costLogs: [] });
  });
});

describe('CostUtils.computeRunway', () => {
  const NOW = new Date('2026-06-15T12:00:00Z').getTime();
  const ago = (days) => new Date(NOW - days * 86400000).toISOString();
  // allowance 140, none used, no top-up -> balance 140 standard-pool tokens
  const standardPool = { standard: { allowance: 140, used: 0, purchased: 0 } };

  it('derives daily burn from real per-message weights, not a flat per-mission guess', () => {
    // 7 grok messages (weight 2 each) across the 7-day window = 14 burned -> 2/day
    const logs = Array.from({ length: 7 }, (_, i) => ({ model: 'grok-4-1-fast', created_at: ago(i) }));
    const r = CostUtils.computeRunway(logs, standardPool, { now: NOW });
    expect(r.balance).toBe(140);
    expect(r.dailyBurn).toBe(2);
    expect(r.daysLeft).toBe(70); // 140 / 2
  });

  it('counts only models that debit this pool — free + other-pool usage is ignored', () => {
    const logs = [
      { model: 'grok-4-1-fast',    created_at: ago(1) }, // standard, weight 2
      { model: 'claude-4-7-opus',  created_at: ago(1) }, // claude pool — must not count
      { model: 'gemini-2-5-flash', created_at: ago(1) }, // free — must not count
    ];
    const r = CostUtils.computeRunway(logs, standardPool, { now: NOW });
    expect(r.dailyBurn).toBeCloseTo(2 / 7, 10); // only the grok message burns standard tokens
  });

  it('ignores usage older than the trailing window', () => {
    const logs = [
      { model: 'grok-4-1-fast', created_at: ago(2) },  // inside the 7-day window
      { model: 'grok-4-1-fast', created_at: ago(20) }, // outside — dropped
    ];
    const r = CostUtils.computeRunway(logs, standardPool, { now: NOW });
    expect(r.dailyBurn).toBeCloseTo(2 / 7, 10);
  });

  it('treats a funded pool with no recent burn as unknown (null), not infinite', () => {
    const r = CostUtils.computeRunway([], standardPool, { now: NOW });
    expect(r.hasPool).toBe(true);
    expect(r.daysLeft).toBeNull();
  });

  it('reports infinite runway for a free-tier user with no funded pool', () => {
    const logs = [{ model: 'grok-4-1-fast', created_at: ago(1) }];
    const r = CostUtils.computeRunway(logs, {}, { now: NOW });
    expect(r.hasPool).toBe(false);
    expect(r.daysLeft).toBe(Infinity);
  });

  it('flags a warning when the runway falls below the warn threshold', () => {
    const lowPool = { standard: { allowance: 10, used: 0, purchased: 0 } }; // balance 10
    const logs = Array.from({ length: 7 }, (_, i) => ({ model: 'grok-4-1-fast', created_at: ago(i) })); // 2/day
    const r = CostUtils.computeRunway(logs, lowPool, { now: NOW });
    expect(r.daysLeft).toBe(5); // 10 / 2
    expect(r.warning).toBe(true);
  });
});
