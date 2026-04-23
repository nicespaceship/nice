/**
 * MissionDetailView DAG inspector (Sprint 4) — pure-function tests for
 * the helpers exposed on MissionDetailView. Integration-level rendering
 * of the full detail view is out of scope here; the render path needs
 * SB + realtime mocks that aren't worth threading just to test HTML
 * assembly that's already tested by the helpers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// Minimal globals — missions.js references Utils, Terminology, State, SB,
// Router, Notify, etc. Only Utils.esc + Terminology.label are reached on
// the helper code paths we test.
globalThis.Utils = {
  esc: (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'),
  timeAgo: () => 'just now',
  KEYS: {},
};
globalThis.Terminology = { label: (k, opts) => (opts?.plural ? 'Missions' : (opts?.lowercase ? 'mission' : 'Mission')) };
globalThis.State = {
  get: () => null, set: () => {}, on: () => {}, off: () => {},
  _reset: () => {},
};
globalThis.SB = {
  client: null, isReady: () => false,
  db: () => ({ get: async () => null, list: async () => [], update: async () => ({}) }),
  realtime: { subscribe: () => null, unsubscribe: () => {} },
};
globalThis.Router = { navigate: vi.fn(), on: () => {}, path: () => '/' };
globalThis.Notify = { send: vi.fn() };
globalThis.AuditLog = { log: () => {} };
globalThis.Gamification = { addXP: vi.fn() };
globalThis.MissionRunner = { run: vi.fn() };

function loadViewGlobal(rel) {
  let code = readFileSync(resolve(__dirname_local, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadViewGlobal('views/missions.js');

describe('MissionDetailView._isDagPlan', () => {
  it('returns true for shape=dag', () => {
    expect(MissionDetailView._isDagPlan({ shape: 'dag', nodes: [{}] })).toBe(true);
  });
  it('returns true for a multi-node plan even without shape', () => {
    expect(MissionDetailView._isDagPlan({ nodes: [{ type: 'agent' }, { type: 'agent' }] })).toBe(true);
  });
  it('returns true when an approval_gate node is present (single node)', () => {
    expect(MissionDetailView._isDagPlan({ nodes: [{ type: 'approval_gate' }] })).toBe(true);
  });
  it('returns true when a persona_dispatch node is present (single node)', () => {
    expect(MissionDetailView._isDagPlan({ nodes: [{ type: 'persona_dispatch' }] })).toBe(true);
  });
  it('returns false for a single simple agent node', () => {
    expect(MissionDetailView._isDagPlan({ nodes: [{ type: 'agent' }] })).toBe(false);
  });
  it('returns false for empty / null plans', () => {
    expect(MissionDetailView._isDagPlan(null)).toBe(false);
    expect(MissionDetailView._isDagPlan({})).toBe(false);
    expect(MissionDetailView._isDagPlan({ nodes: [] })).toBe(false);
  });
});

describe('MissionDetailView._nodeStatus', () => {
  const node = { id: 'n', type: 'agent' };
  it('returns pending when nodeResults has no entry', () => {
    expect(MissionDetailView._nodeStatus(node, {}, 'running')).toBe('pending');
    expect(MissionDetailView._nodeStatus(node, null, 'running')).toBe('pending');
  });
  it('returns failed when the result string starts with Error:', () => {
    expect(MissionDetailView._nodeStatus(node, { n: 'Error: boom' }, 'failed')).toBe('failed');
  });
  it('returns completed when the result is a non-error string', () => {
    expect(MissionDetailView._nodeStatus(node, { n: 'ok' }, 'completed')).toBe('completed');
  });
  it('returns gated for approval_gate nodes when mission is in review', () => {
    const gate = { id: 'g', type: 'approval_gate' };
    expect(MissionDetailView._nodeStatus(gate, { g: 'Awaiting approval.' }, 'review')).toBe('gated');
  });
  it('returns completed for approval_gate once mission has been approved (status=completed)', () => {
    const gate = { id: 'g', type: 'approval_gate' };
    expect(MissionDetailView._nodeStatus(gate, { g: 'Awaiting approval.' }, 'completed')).toBe('completed');
  });
  it('handles object-shaped values (JSON-serializes before Error: check)', () => {
    expect(MissionDetailView._nodeStatus(node, { n: { result: 'all fine' } }, 'completed')).toBe('completed');
  });
});

describe('MissionDetailView._renderDagPanel', () => {
  it('renders nothing when the mission is not DAG-shaped', () => {
    const out = MissionDetailView._renderDagPanel(
      { plan_snapshot: { nodes: [{ type: 'agent' }] } },
      'mission-1'
    );
    expect(out).toBe('');
  });

  it('renders one card per node for a DAG mission', () => {
    const mission = {
      plan_snapshot: {
        shape: 'dag',
        nodes: [
          { id: 'triage',  type: 'agent',            label: 'Triage',  config: { prompt: 'triage' } },
          { id: 'drafter', type: 'persona_dispatch', label: 'Drafter', config: { prompt: 'draft'  } },
          { id: 'review',  type: 'approval_gate',    label: 'Review',  config: { reason: 'Review drafts' } },
        ],
      },
      node_results: {
        triage: '{"threads":[]}',
        drafter: '{"drafted":[]}',
        review:  'Awaiting captain approval.',
      },
      status: 'review',
      approval_status: 'draft',
    };
    const html = MissionDetailView._renderDagPanel(mission, 'm-1');
    // One card per node.
    const cardMatches = html.match(/class="dag-node"/g) || [];
    expect(cardMatches.length).toBe(3);
    // Type badges.
    expect(html).toMatch(/data-node-type="persona_dispatch"/);
    expect(html).toMatch(/data-node-type="approval_gate"/);
    // Gate status pill.
    expect(html).toMatch(/dag-status-gated/);
    // Prior nodes completed.
    expect(html).toMatch(/dag-status-completed/);
    // Inline gate actions rendered (mission is in review, draft approval).
    expect(html).toMatch(/dag-gate-approve/);
    expect(html).toMatch(/dag-gate-reject/);
    // Gate reason surfaced.
    expect(html).toMatch(/Review drafts/);
  });

  it('hides inline gate actions once approved/rejected', () => {
    const mission = {
      plan_snapshot: {
        shape: 'dag',
        nodes: [
          { id: 'review', type: 'approval_gate', label: 'Review', config: {} },
        ],
      },
      node_results: { review: 'ok' },
      status: 'completed',
      approval_status: 'approved',
    };
    const html = MissionDetailView._renderDagPanel(mission, 'm-2');
    expect(html).not.toMatch(/dag-gate-approve/);
    expect(html).not.toMatch(/dag-gate-reject/);
  });

  it('shows "Show full output" when node output exceeds 280 chars', () => {
    const big = 'x'.repeat(400);
    const mission = {
      plan_snapshot: { shape: 'dag', nodes: [{ id: 'a', type: 'agent' }, { id: 'b', type: 'agent' }] },
      node_results: { a: big, b: 'short' },
      status: 'review',
    };
    const html = MissionDetailView._renderDagPanel(mission, 'm-3');
    expect(html).toMatch(/Show full output/);
    // Short node doesn't get the toggle.
    const toggleCount = (html.match(/dag-node-output-toggle/g) || []).length;
    expect(toggleCount).toBe(1);
  });

  it('escapes user content in labels and outputs', () => {
    const mission = {
      plan_snapshot: { shape: 'dag', nodes: [
        { id: 'x', type: 'agent', label: '<script>alert(1)</script>' },
        { id: 'y', type: 'agent' },
      ] },
      node_results: { x: '<img src=x onerror=alert(1)>' },
      status: 'review',
    };
    const html = MissionDetailView._renderDagPanel(mission, 'm-4');
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toMatch(/&lt;script&gt;/);
    expect(html).toMatch(/&lt;img/);
  });

  it('marks failed node status when result starts with Error:', () => {
    const mission = {
      plan_snapshot: { shape: 'dag', nodes: [
        { id: 'a', type: 'agent' },
        { id: 'b', type: 'agent' },
      ] },
      node_results: { a: 'ok', b: 'Error: agent blew up' },
      status: 'failed',
    };
    const html = MissionDetailView._renderDagPanel(mission, 'm-5');
    expect(html).toMatch(/dag-status-failed/);
  });
});
