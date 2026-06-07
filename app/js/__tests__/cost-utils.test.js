/**
 * CostUtils.attributeLogsToMissions — shared cost-attribution SSOT.
 * Both the Cost Tracker (cost.js) and Operations analytics (analytics.js)
 * call this. It replaces the old ±24h window that triple-counted spend on a
 * multi-mission day, so the test locks the one-mission-per-log invariant for
 * both views at once.
 */

import { describe, it, expect } from 'vitest';
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
