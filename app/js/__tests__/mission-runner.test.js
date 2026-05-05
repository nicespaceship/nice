import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Mock dependencies
const _db = {};
globalThis.SB = {
  isReady: () => true,
  db: (table) => ({
    get: async (id) => (_db[table] || {})[id] || null,
    list: async ({ userId }) => Object.values(_db[table] || {}).filter(r => r.user_id === userId),
    create: async (row) => {
      const id = row.id || crypto.randomUUID();
      const entry = { ...row, id };
      _db[table] = _db[table] || {};
      _db[table][id] = entry;
      return entry;
    },
    update: async (id, data) => {
      if (_db[table] && _db[table][id]) Object.assign(_db[table][id], data);
      return _db[table]?.[id] || null;
    },
  }),
  realtime: { subscribe: () => null, unsubscribe: () => {} },
  functions: { invoke: async () => ({ data: { content: 'Mock LLM response for testing.', model: 'mock-test', usage: { input_tokens: 10, output_tokens: 20 } }, error: null }) },
};

globalThis.State = (() => {
  const _data = {};
  const _listeners = {};
  return {
    get: (k) => _data[k],
    set: (k, v) => { _data[k] = v; (_listeners[k] || []).forEach(fn => fn(v)); },
    on: (k, fn) => { _listeners[k] = _listeners[k] || []; _listeners[k].push(fn); },
    off: () => {},
    _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); Object.keys(_listeners).forEach(k => delete _listeners[k]); },
  };
})();

globalThis.Notify = { send: () => {}, show: () => {} };
globalThis.Gamification = { addXP: vi.fn(), checkAchievements: () => {}, recordAgentMission: vi.fn() };
globalThis.Blueprints = { isReady: () => false, getAgent: () => null };
globalThis.LLMConfig = { forBlueprint: () => ({ model: 'mock', temperature: 0.7 }) };

// Load ShipLog first (dependency), then WorkflowEngine (DAG path),
// then MissionRunner which consults both at runtime.
loadModule('lib/ship-log.js');
loadModule('lib/workflow-engine.js');
loadModule('lib/mission-runner.js');

describe('MissionRunner', () => {
  const userId = 'user-1';

  beforeEach(() => {
    Object.keys(_db).forEach(k => delete _db[k]);
    State._reset();
    State.set('user', { id: userId });
    Gamification.addXP.mockClear();
  });

  it('should return null if no missionId', async () => {
    expect(await MissionRunner.run(null)).toBeNull();
  });

  it('should return null if no user', async () => {
    State.set('user', null);
    expect(await MissionRunner.run('some-id')).toBeNull();
  });

  it('should return null if mission not found', async () => {
    expect(await MissionRunner.run('nonexistent')).toBeNull();
  });

  it('should transition mission from queued to review via LLM', async () => {
    // Every Run must have a resolvable agent — the ephemeral fallback
    // (build from name keywords) was removed; provide a real agent.
    State.set('agents', [{ id: 'a-default', name: 'TestBot', config: {} }]);
    const mission = await SB.db('mission_runs').create({
      id: 'm1', user_id: userId, title: 'Test mission',
      agent_id: 'a-default', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m1');

    const updated = _db.mission_runs?.m1;
    expect(updated.status).toBe('review');
    expect(updated.progress).toBe(100);
    expect(updated.result).toBeTruthy();
    expect(result).not.toBeNull();
    expect(result.content).toBeTruthy();
  });

  it('should not award XP until approval (Draft & Approve flow)', async () => {
    State.set('agents', [{ id: 'a2', name: 'XPBot', config: {} }]);
    await SB.db('mission_runs').create({
      id: 'm2', user_id: userId, title: 'XP test',
      agent_id: 'a2', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m2');

    // XP is awarded on user approval, not on generation
    expect(Gamification.addXP).not.toHaveBeenCalled();
  });

  it('should create a notification on completion', async () => {
    State.set('agents', [{ id: 'a3', name: 'NotifyBot', config: {} }]);
    await SB.db('mission_runs').create({
      id: 'm3', user_id: userId, title: 'Notify test',
      agent_id: 'a3', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m3');

    // Check notification was created
    const notifications = Object.values(_db.notifications || {});
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].type).toBe('mission');
  });

  it('should refuse to run a mission that was cancelled pre-start', async () => {
    // Scheduler fires + user hits Cancel before execution begins.
    // Status='cancelled' short-circuits before agent resolution runs,
    // so no agent setup is needed.
    await SB.db('mission_runs').create({
      id: 'm-cancel-queued', user_id: userId, title: 'Cancelled before start',
      agent_id: null, status: 'cancelled', progress: 0,
    });
    const result = await MissionRunner.run('m-cancel-queued');
    expect(result).toBeNull();
    // Status stays cancelled — runner didn't transition it to running.
    expect(_db.mission_runs['m-cancel-queued'].status).toBe('cancelled');
  });

  it('should look up assigned agent from State', async () => {
    const agent = { id: 'a1', name: 'TestBot', role: 'Research', config: { role: 'Research' } };
    State.set('agents', [agent]);

    await SB.db('mission_runs').create({
      id: 'm4', user_id: userId, title: 'Agent mission',
      agent_id: 'a1', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m4');
    expect(result).not.toBeNull();
    expect(_db.mission_runs.m4.status).toBe('review');
  });

  it('should update local State missions during execution', async () => {
    State.set('agents', [{ id: 'a5', name: 'StateBot', config: {} }]);
    State.set('missions', [{ id: 'm5', status: 'queued', progress: 0 }]);

    await SB.db('mission_runs').create({
      id: 'm5', user_id: userId, title: 'State test',
      agent_id: 'a5', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m5');

    const missions = State.get('missions');
    const m = missions.find(t => t.id === 'm5');
    expect(m.status).toBe('review');
    expect(m.progress).toBe(100);
  });

  it('should transition to failed when ShipLog.execute returns empty result', async () => {
    // Override ShipLog.execute to return null to simulate failure
    const origExecute = ShipLog.execute;
    globalThis.ShipLog.execute = async () => null;

    State.set('agents', [{ id: 'a-fail', name: 'FailBot', config: {} }]);
    State.set('missions', [{ id: 'm-fail', status: 'queued', progress: 0 }]);
    await SB.db('mission_runs').create({
      id: 'm-fail', user_id: userId, title: 'Failing mission',
      agent_id: 'a-fail', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-fail');

    const updated = _db.mission_runs?.['m-fail'];
    expect(updated.status).toBe('failed');
    expect(updated.result).toContain('Error');

    globalThis.ShipLog.execute = origExecute;
  });

  it('should create error notification on failure', async () => {
    const origExecute = ShipLog.execute;
    globalThis.ShipLog.execute = async () => null;

    State.set('agents', [{ id: 'a-en', name: 'ErrNotifyBot', config: {} }]);
    await SB.db('mission_runs').create({
      id: 'm-err-notify', user_id: userId, title: 'Error notify test',
      agent_id: 'a-en', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-err-notify');

    const notifications = Object.values(_db.notifications || {});
    const errNotif = notifications.find(n => n.type === 'error');
    expect(errNotif).toBeTruthy();
    expect(errNotif.title).toBe('Mission Failed');

    globalThis.ShipLog.execute = origExecute;
  });

  it('should use temporary spaceship ID when no ships exist', async () => {
    State.set('agents', [{ id: 'a-ns', name: 'NoShipBot', config: {} }]);
    await SB.db('mission_runs').create({
      id: 'm-no-ship', user_id: userId, title: 'No ship mission',
      agent_id: 'a-ns', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m-no-ship');
    expect(result).not.toBeNull();
    // The mission should still go to review with a fallback spaceship ID
    expect(_db.mission_runs['m-no-ship'].status).toBe('review');
  });

  it('should fall back to DB lookup when agent not in State', async () => {
    State.set('agents', []); // Empty local state
    // Put agent in mock DB
    await SB.db('user_agents').create({
      id: 'a-db', name: 'DBBot', role: 'Research', config: { role: 'Research' },
    });

    await SB.db('mission_runs').create({
      id: 'm-db-agent', user_id: userId, title: 'DB agent mission',
      agent_id: 'a-db', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m-db-agent');
    expect(result).not.toBeNull();
    expect(_db.mission_runs['m-db-agent'].status).toBe('review');
  });

  it('should include completed_at in metadata on success', async () => {
    State.set('agents', [{ id: 'a-meta', name: 'MetaBot', config: {} }]);
    await SB.db('mission_runs').create({
      id: 'm-meta', user_id: userId, title: 'Metadata test',
      agent_id: 'a-meta', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-meta');

    const updated = _db.mission_runs?.['m-meta'];
    expect(updated.metadata.completed_at).toBeTruthy();
    expect(new Date(updated.metadata.completed_at).getTime()).toBeGreaterThan(0);
  });

  it('should set result content on completed mission in DB', async () => {
    State.set('agents', [{ id: 'a-r', name: 'ResultBot', config: {} }]);
    await SB.db('mission_runs').create({
      id: 'm-result', user_id: userId, title: 'Result test',
      agent_id: 'a-r', status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-result');

    const updated = _db.mission_runs?.['m-result'];
    expect(updated.result).toBeTruthy();
    expect(typeof updated.result).toBe('string');
  });

  // PR D: the ephemeral fallback (build agent from name keywords) was
  // removed. Missions referencing an agent that can't be resolved must
  // fail fast with a clear error instead of silently running a synthetic
  // agent that doesn't match what the user expected.
  it('fails fast with a clear error when no agent can be resolved', async () => {
    State.set('agents', []);
    await SB.db('mission_runs').create({
      id: 'm-no-agent', user_id: userId, title: 'Orphan mission',
      agent_id: 'ghost-id', status: 'queued', progress: 0,
    });
    const result = await MissionRunner.run('m-no-agent');
    expect(result).toBeNull();
    const updated = _db.mission_runs?.['m-no-agent'];
    expect(updated.status).toBe('failed');
    expect(updated.result).toMatch(/Could not resolve an agent/);
    expect(updated.result).toMatch(/agent_id=ghost-id/);
    const notifications = Object.values(_db.notifications || {});
    expect(notifications.find(n => n.type === 'error')).toBeTruthy();
  });

  it('fail-fast also catches missions with neither agent_id nor agent_name', async () => {
    State.set('agents', []);
    await SB.db('mission_runs').create({
      id: 'm-naked', user_id: userId, title: 'Nameless mission',
      agent_id: null, status: 'queued', progress: 0,
    });
    const result = await MissionRunner.run('m-naked');
    expect(result).toBeNull();
    expect(_db.mission_runs['m-naked'].status).toBe('failed');
    expect(_db.mission_runs['m-naked'].result).toMatch(/agent_id=none/);
    expect(_db.mission_runs['m-naked'].result).toMatch(/agent_name=none/);
  });
});

describe('MissionRunner — DAG dispatch (Sprint 3)', () => {
  const userId = 'user-dag';

  beforeEach(() => {
    Object.keys(_db).forEach(k => delete _db[k]);
    State._reset();
    State.set('user', { id: userId });
  });

  it('_isDagMission detects shape=dag', () => {
    expect(MissionRunner._isDagMission({ plan_snapshot: { shape: 'dag', nodes: [{}, {}] } })).toBe(true);
    expect(MissionRunner._isDagMission({ plan_snapshot: { shape: 'simple', nodes: [{}] } })).toBe(false);
    expect(MissionRunner._isDagMission({ plan_snapshot: null })).toBe(false);
    expect(MissionRunner._isDagMission({})).toBe(false);
  });

  it('_isDagMission detects by node type (approval_gate) even without shape', () => {
    const snap = { nodes: [{ type: 'agent' }, { type: 'approval_gate' }] };
    expect(MissionRunner._isDagMission({ plan_snapshot: snap })).toBe(true);
  });

  it('routes Inbox-Captain-shaped mission to review status via gate pause', async () => {
    const planSnapshot = {
      shape: 'dag',
      nodes: [
        { id: 'triage',  type: 'agent',            config: { prompt: 'triage threads' } },
        { id: 'drafter', type: 'persona_dispatch', config: { prompt: 'draft replies' } },
        { id: 'review',  type: 'approval_gate',    config: { reason: 'Drafts queued for captain review.' } },
      ],
      edges: [
        { from: 'triage',  to: 'drafter' },
        { from: 'drafter', to: 'review' },
      ],
    };
    await SB.db('mission_runs').create({
      id: 'm-dag-inbox', user_id: userId, title: 'Inbox Captain',
      status: 'queued', progress: 0,
      plan_snapshot: planSnapshot,
    });

    const res = await MissionRunner.run('m-dag-inbox');
    expect(res).not.toBeNull();
    expect(res.status).toBe('paused');

    const row = _db.mission_runs['m-dag-inbox'];
    expect(row.status).toBe('review');
    expect(row.approval_status).toBe('draft');
    expect(row.progress).toBe(100);
    expect(row.node_results).toBeTruthy();
    expect(Object.keys(row.node_results)).toContain('review');
  });

  it('DAG with no gate still lands in review (awaits captain sign-off)', async () => {
    const planSnapshot = {
      shape: 'dag',
      nodes: [
        { id: 'a', type: 'agent', config: { prompt: 'one' } },
        { id: 'b', type: 'agent', config: { prompt: 'two' } },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    await SB.db('mission_runs').create({
      id: 'm-dag-nogate', user_id: userId, title: 'Two-step',
      status: 'queued', progress: 0,
      plan_snapshot: planSnapshot,
    });

    const res = await MissionRunner.run('m-dag-nogate');
    expect(res.status).toBe('completed');
    expect(_db.mission_runs['m-dag-nogate'].status).toBe('review');
    expect(_db.mission_runs['m-dag-nogate'].approval_status).toBe('draft');
  });

  it('DAG with missing plan_snapshot.nodes fails gracefully', async () => {
    await SB.db('mission_runs').create({
      id: 'm-dag-empty', user_id: userId, title: 'Empty',
      status: 'queued', progress: 0,
      plan_snapshot: { shape: 'dag', nodes: [{ type: 'approval_gate' }] },
      // Intentionally only one node with type approval_gate — triggers DAG
      // detection — but empty actual nodes after filter. We feed it just
      // the approval_gate so the gate fires.
    });

    // With only an approval_gate node, the run should pause immediately.
    const res = await MissionRunner.run('m-dag-empty');
    expect(res.status).toBe('paused');
  });

  // PR B: prompt_panel-sourced runs are ephemeral chat. The user already
  // saw the answer in the chat monitor, so we land in 'completed' instead
  // of 'review' and skip both the approval_status flag and the
  // Ready-for-Review notification. Templated missions still go to review.
  it('chat-sourced run (metadata.source=prompt_panel) auto-completes instead of going to review', async () => {
    const planSnapshot = {
      shape: 'dag',
      nodes: [
        { id: 'root', type: 'agent', config: { prompt: 'reply' } },
      ],
      edges: [],
    };
    await SB.db('mission_runs').create({
      id: 'm-chat-1', user_id: userId, title: 'hello',
      status: 'queued', progress: 0,
      plan_snapshot: planSnapshot,
      metadata: { source: 'prompt_panel', input: 'hello' },
    });

    const notifies = [];
    const origSend = globalThis.Notify.send;
    globalThis.Notify.send = (n) => { notifies.push(n); };

    const res = await MissionRunner.run('m-chat-1');
    globalThis.Notify.send = origSend;

    expect(res.status).toBe('completed');
    const row = _db.mission_runs['m-chat-1'];
    expect(row.status).toBe('completed');
    expect(row.progress).toBe(100);
    expect(row.completed_at).toBeTruthy();
    expect(row.approval_status).toBeUndefined();
    // No "Ready for Review" notification for chat runs
    expect(notifies.find(n => /review/i.test(n.title || ''))).toBeUndefined();
  });

  /* ── Dispatch protocol ── */

  describe('_extractDispatches', () => {
    it('returns empty array when no dispatch tokens present', () => {
      expect(MissionRunner._extractDispatches('Just a plain answer.')).toEqual([]);
    });

    it('parses a single dispatch token', () => {
      const text = '[DISPATCH: sales] What deals are stalling this quarter?';
      expect(MissionRunner._extractDispatches(text)).toEqual([
        { slot: 'sales', subPrompt: 'What deals are stalling this quarter?' },
      ]);
    });

    it('parses multiple dispatch tokens', () => {
      const text =
        '[DISPATCH: sales] What deals are stalling?\n' +
        '[DISPATCH: communications] Any unread emails about those deals?';
      const result = MissionRunner._extractDispatches(text);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ slot: 'sales', subPrompt: 'What deals are stalling?' });
      expect(result[1]).toEqual({ slot: 'communications', subPrompt: 'Any unread emails about those deals?' });
    });

    it('is case-insensitive for the DISPATCH keyword and lowercases slot names', () => {
      const text = '[dispatch: SALES] Check pipeline.';
      const result = MissionRunner._extractDispatches(text);
      expect(result).toHaveLength(1);
      expect(result[0].slot).toBe('sales');
    });

    it('ignores dispatch tokens with empty sub-prompts', () => {
      const result = MissionRunner._extractDispatches('[DISPATCH: sales]   ');
      expect(result).toEqual([]);
    });
  });

  describe('_isCaptainAgent', () => {
    it('returns false for null', () => {
      expect(MissionRunner._isCaptainAgent(null)).toBe(false);
    });

    it('detects captain via role_type', () => {
      expect(MissionRunner._isCaptainAgent({ config: { role_type: 'captain' } })).toBe(true);
    });

    it('detects captain via role (case-insensitive)', () => {
      expect(MissionRunner._isCaptainAgent({ config: { role: 'Captain' } })).toBe(true);
    });

    it('detects captain via is_captain flag', () => {
      expect(MissionRunner._isCaptainAgent({ config: { is_captain: true } })).toBe(true);
    });

    it('returns false for non-captain roles', () => {
      expect(MissionRunner._isCaptainAgent({ config: { role: 'Sales' } })).toBe(false);
    });
  });

  describe('_resolveSlotAgent', () => {
    const agents = [
      { id: 'a-sales', name: 'Apollo', config: { role_type: 'sales' } },
      { id: 'a-comms', name: 'Athena', config: { role_type: 'communications' } },
    ];
    const ship = { slot_assignments: { 'slot-0': 'a-sales', 'slot-1': 'a-comms' } };

    it('resolves by role_type', () => {
      const result = MissionRunner._resolveSlotAgent(ship, 'sales', agents);
      expect(result.id).toBe('a-sales');
    });

    it('resolves by name substring', () => {
      const result = MissionRunner._resolveSlotAgent(ship, 'athena', agents);
      expect(result.id).toBe('a-comms');
    });

    it('returns null when slot not found', () => {
      expect(MissionRunner._resolveSlotAgent(ship, 'finance', agents)).toBeNull();
    });

    it('returns null when ship is null', () => {
      expect(MissionRunner._resolveSlotAgent(null, 'sales', agents)).toBeNull();
    });
  });

  describe('_buildCrewManifest', () => {
    it('returns empty string for empty crew', () => {
      expect(MissionRunner._buildCrewManifest(null, [])).toBe('');
    });

    it('includes role and agent name', () => {
      const crew = [{ name: 'Apollo', config: { role_type: 'sales' }, description: 'HubSpot CRM' }];
      const manifest = MissionRunner._buildCrewManifest(null, crew);
      expect(manifest).toContain('[sales]');
      expect(manifest).toContain('Apollo');
    });
  });

  describe('runWithDispatch', () => {
    const captainBp = {
      id: 'cap-1', name: 'Adama',
      config: { role_type: 'captain', is_captain: true, tools: [] },
    };
    const salesAgent = { id: 'a-sales', name: 'Apollo', config: { role_type: 'sales', tools: ['crm-search'] } };
    const ship = {
      id: 'ship-bsg', name: 'Battlestar Galactica',
      slot_assignments: { 'slot-0': 'cap-1', 'slot-1': 'a-sales' },
    };

    beforeEach(() => {
      State.set('agents', [
        { id: 'cap-1', name: 'Adama', config: { role_type: 'captain', is_captain: true, tools: [] } },
        { id: 'a-sales', name: 'Apollo', config: { role_type: 'sales', tools: ['crm-search'] } },
      ]);
    });

    it('returns captain answer directly when no dispatch tokens', async () => {
      let callCount = 0;
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          callCount++;
          return { finalAnswer: 'Here is the summary.', steps: [], metadata: {} };
        },
      };

      const result = await MissionRunner.runWithDispatch(captainBp, 'Summarize our pipeline.', ship, {});
      expect(result.finalAnswer).toBe('Here is the summary.');
      expect(callCount).toBe(1); // captain only, no crew calls
      delete globalThis.AgentExecutor;
    });

    it('dispatches to crew agent and synthesizes', async () => {
      const calls = [];
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          calls.push({ bpId: bp.id || bp.name, prompt });
          if (calls.length === 1) {
            // Captain's first turn — emit a dispatch
            return { finalAnswer: '[DISPATCH: sales] What deals are stalling?', steps: [], metadata: {} };
          }
          if (calls.length === 2) {
            // Sales agent (crew)
            return { finalAnswer: 'Deals Alpha and Beta are stalling.', steps: [], metadata: {} };
          }
          // Captain synthesis
          return { finalAnswer: 'Alpha and Beta are stalling — recommend follow-up.', steps: [], metadata: {} };
        },
      };

      const result = await MissionRunner.runWithDispatch(captainBp, 'What deals need attention?', ship, {});
      expect(result.finalAnswer).toBe('Alpha and Beta are stalling — recommend follow-up.');
      // 1 captain first turn + 1 crew call + 1 captain synthesis = 3
      expect(calls).toHaveLength(3);
      // Crew call had the sub-prompt, not the user's original prompt
      expect(calls[1].prompt).toBe('What deals are stalling?');
      // Synthesis prompt contains the crew report
      expect(calls[2].prompt).toContain('[CREW REPORT: sales]');
      expect(calls[2].prompt).toContain('Deals Alpha and Beta are stalling.');
      delete globalThis.AgentExecutor;
    });

    it('caps dispatch rounds at MAX_DISPATCH_ROUNDS', async () => {
      let callCount = 0;
      globalThis.AgentExecutor = {
        execute: async () => {
          callCount++;
          // Always return a dispatch token — should stop after MAX_DISPATCH_ROUNDS
          return { finalAnswer: '[DISPATCH: sales] keep dispatching', steps: [], metadata: {} };
        },
      };

      await MissionRunner.runWithDispatch(captainBp, 'Loop forever?', ship, {});
      // Round 1: captain + crew. Round 2: captain + crew. Round 3: captain + crew. = 6 calls max
      expect(callCount).toBeLessThanOrEqual(6);
      delete globalThis.AgentExecutor;
    });

    it('handles missing slot gracefully', async () => {
      let crewCalled = false;
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          if (!crewCalled && prompt.includes('?')) {
            // Captain's first turn
            return { finalAnswer: '[DISPATCH: finance] Budget?', steps: [], metadata: {} };
          }
          crewCalled = true;
          // Synthesis after crew report (crew was missing)
          return { finalAnswer: 'No finance agent available.', steps: [], metadata: {} };
        },
      };

      const result = await MissionRunner.runWithDispatch(captainBp, 'Check budget?', ship, {});
      // Should not throw; synthesis should contain the missing-slot message
      expect(result).toBeTruthy();
      delete globalThis.AgentExecutor;
    });
  });

  it('templated run (no source flag) still lands in review (regression guard)', async () => {
    const planSnapshot = {
      shape: 'dag',
      nodes: [{ id: 'a', type: 'agent', config: { prompt: 'do' } }, { id: 'b', type: 'agent', config: { prompt: 'do' } }],
      edges: [{ from: 'a', to: 'b' }],
    };
    await SB.db('mission_runs').create({
      id: 'm-tpl-1', user_id: userId, title: 'templated',
      status: 'queued', progress: 0,
      plan_snapshot: planSnapshot,
      metadata: {},
    });
    await MissionRunner.run('m-tpl-1');
    const row = _db.mission_runs['m-tpl-1'];
    expect(row.status).toBe('review');
    expect(row.approval_status).toBe('draft');
  });
});
