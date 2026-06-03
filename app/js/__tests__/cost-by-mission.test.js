/**
 * CostView._renderCostByMission — per-mission cost attribution.
 * Locks the fix for the ±24h-window double-count: each fuel_usage log is
 * attributed to exactly one mission, so a multi-mission day no longer
 * multiplies real spend.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

globalThis.Utils = { esc: (s) => String(s == null ? '' : s), timeAgo: () => '' };

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('views/cost.js');

describe('CostView._renderCostByMission', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="cost-by-mission"></div>';
  });

  it('attributes each fuel log to one mission, so a multi-mission day is not multiplied', () => {
    const agents = [{ id: 'a1', name: 'Solo' }];
    // One agent, three completed missions the same day.
    const tasks = [
      { id: 'm1', title: 'First',  agent_id: 'a1', status: 'completed', created_at: '2026-06-01T10:00:00Z' },
      { id: 'm2', title: 'Second', agent_id: 'a1', status: 'completed', created_at: '2026-06-01T11:00:00Z' },
      { id: 'm3', title: 'Third',  agent_id: 'a1', status: 'completed', created_at: '2026-06-01T12:00:00Z' },
    ];
    // Two cost logs totalling $5 — both fall within ±24h of all three missions.
    const logs = [
      { agent_id: 'a1', tokens_used: 30, amount: 3, created_at: '2026-06-01T10:05:00Z' },
      { agent_id: 'a1', tokens_used: 20, amount: 2, created_at: '2026-06-01T11:05:00Z' },
    ];

    CostView._renderCostByMission(agents, tasks, logs);
    const html = document.getElementById('cost-by-mission').innerHTML;

    // Per-agent total equals real spend ($5), not 3× ($15) as the old window did.
    expect(html).toContain('Solo: $5.00');
    expect(html).not.toContain('$15.00');
    // Each log lands on its nearest mission ($3 + $2), nothing on the third.
    expect(html).toContain('$3.0000');
    expect(html).toContain('$2.0000');
  });

  it('renders an empty state when there are no missions', () => {
    CostView._renderCostByMission([], [], []);
    expect(document.getElementById('cost-by-mission').innerHTML).toMatch(/No missions yet/);
  });
});
