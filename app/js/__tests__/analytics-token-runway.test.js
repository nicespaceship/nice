/**
 * AnalyticsView._renderCostOverview — token balance + runway.
 * Locks the fix for the dead State.get('tokens') read: the real balance
 * lives in State.token_balance.pools (TokenConfig SSOT), and free-tier
 * users (no pool) have an unlimited runway.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

const _ls = {};
globalThis.localStorage = {
  getItem: (k) => _ls[k] ?? null,
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
};

globalThis.Utils = { esc: (s) => String(s == null ? '' : s), timeAgo: () => '', KEYS: { budget: 'nice-budget' } };

globalThis.State = (() => {
  const _data = {};
  return { get: (k) => _data[k], set: (k, v) => { _data[k] = v; }, _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); } };
})();

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('lib/token-config.js'); // real TokenConfig — SSOT for pool math
loadModule('views/analytics.js');

describe('AnalyticsView token runway', () => {
  beforeEach(() => {
    localStorage.clear();
    State._reset();
    document.body.innerHTML = '<div id="ana-cost-overview"></div>';
  });

  it('shows the real Standard-pool remaining, not the dead State.tokens key', () => {
    State.set('token_balance', { pools: { standard: { allowance: 1000, used: 200, purchased: 0 } } });
    State.set('missions', []);
    AnalyticsView._renderCostOverview([]);
    const html = document.getElementById('ana-cost-overview').innerHTML;
    expect(html).toContain('>800<'); // 1000 allowance − 200 used
  });

  it('shows an unlimited runway on the free tier (no Standard pool)', () => {
    State.set('token_balance', { pools: {} });
    // Recent activity would have produced a "0d" warning under the old 0-balance read.
    State.set('missions', [{ created_at: new Date().toISOString(), status: 'completed' }]);
    AnalyticsView._renderCostOverview([]);
    const html = document.getElementById('ana-cost-overview').innerHTML;
    expect(html).toContain('∞');          // ∞ runway
    expect(html).not.toContain('token-warning'); // no false "running out" warning
  });

  it('shows an unknown runway (—) for a funded pool with no recent burn', () => {
    // Pro user with a real Standard balance but no missions in the last 7 days:
    // burn rate is 0. The old code rendered ∞ here, mislabeling a depletable
    // balance as unlimited.
    State.set('token_balance', { pools: { standard: { allowance: 1000, used: 0, purchased: 0 } } });
    State.set('missions', []);
    AnalyticsView._renderCostOverview([]);
    const html = document.getElementById('ana-cost-overview').innerHTML;
    expect(html).toContain('—');                 // unknown, em dash
    expect(html).not.toContain('∞');             // not infinite
    expect(html).not.toContain('token-warning'); // and not a false low-runway warning
  });
});
