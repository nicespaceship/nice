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
// then Roles (role → required_capability_tags SSOT), then
// MissionRunner which consults all three at runtime.
loadModule('lib/ship-log.js');
loadModule('lib/workflow-engine.js');
loadModule('lib/roles.js');
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

  it('returns the video result object on direct-video success (not undefined)', async () => {
    // Regression: the direct-video branch used a bare `return`, so the chat
    // surface saw `undefined` and told the user "no output was returned"
    // even though the video link was generated and saved.
    globalThis.MediaTools = { generate: async () => ({ url: 'https://x/v.mp4', model: 'veo-2', duration: 5, size: '9:16' }) };
    State.set('agents', [{ id: 'a-vid', name: 'VideoBot', config: { tools: ['generate-video'] } }]);
    await SB.db('mission_runs').create({
      id: 'm-vid', user_id: userId, title: 'Make a launch video reel',
      agent_id: 'a-vid', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m-vid');

    expect(result).not.toBeNull();
    expect(result.content).toContain('Watch Video');
    expect(result.metadata.url).toBe('https://x/v.mp4');
    // XP is approval-only — the video path must NOT award complete_mission on
    // generation, or it double-counts when the review is later approved.
    expect(Gamification.addXP).not.toHaveBeenCalledWith('complete_mission');
    delete globalThis.MediaTools;
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

    it('detects captain via agentRole Commander (wizard-created format)', () => {
      expect(MissionRunner._isCaptainAgent({ config: { agentRole: 'Commander' } })).toBe(true);
    });

    it('detects captain via agentRole Admiral (wizard-created format)', () => {
      expect(MissionRunner._isCaptainAgent({ config: { agentRole: 'Admiral' } })).toBe(true);
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

    it('resolves from ship.config.slot_assignments (DB format)', () => {
      const dbShip = { config: { slot_assignments: { 'slot-0': 'a-sales', 'slot-1': 'a-comms' } } };
      const result = MissionRunner._resolveSlotAgent(dbShip, 'sales', agents);
      expect(result.id).toBe('a-sales');
    });

    it('resolves by agentRole (wizard-created agent format)', () => {
      const wizardAgents = [
        { id: 'w-comms', name: 'Starbuck', config: { agentRole: 'communications' } },
      ];
      const s = { slot_assignments: { 'slot-0': 'w-comms' } };
      const result = MissionRunner._resolveSlotAgent(s, 'communications', wizardAgents);
      expect(result.id).toBe('w-comms');
    });
  });

  describe('_resolveByCapability', () => {
    it('matches an agent by capability_tags before falling back to substring', () => {
      const taggedHubspot = {
        id: 'bp-agent-hubspot',
        name: 'HubSpot Agent',
        capability_tags: ['crm', 'sales'],
        config: { role_type: 'specialist', tools: ['search_crm_objects', 'get_crm_objects'] },
      };
      const result = MissionRunner._resolveByCapability('sales', [taggedHubspot]);
      expect(result.id).toBe('bp-agent-hubspot');
    });

    it('reads capability_tags from config when top-level is absent', () => {
      const agent = {
        id: 'a-cfg', name: 'Cfg Agent',
        config: { role_type: 'specialist', tools: ['search_crm_objects'], capability_tags: ['crm'] },
      };
      expect(MissionRunner._resolveByCapability('sales', [agent])?.id).toBe('a-cfg');
    });

    it('skips captains so dispatch never routes to self', () => {
      const cap = {
        id: 'cap-1', name: 'Adama',
        capability_tags: ['crm'],
        config: { role_type: 'captain', is_captain: true, tools: ['search_crm_objects'] },
      };
      expect(MissionRunner._resolveByCapability('sales', [cap])).toBeNull();
    });

    it('skips tool-less stubs even when tags would match', () => {
      const stub = {
        id: 'stub-1', name: 'Stub',
        capability_tags: ['crm'],
        config: { role_type: 'sales', tools: [] },
      };
      expect(MissionRunner._resolveByCapability('sales', [stub])).toBeNull();
    });

    it('falls back to substring matching for agents without capability_tags', () => {
      const untagged = {
        id: 'a-untagged', name: 'Custom Agent',
        config: { role_type: 'specialist', tools: ['gmail_search', 'calendar_list_events'] },
      };
      expect(MissionRunner._resolveByCapability('communications', [untagged])?.id).toBe('a-untagged');
    });

    it('prefers tagged agents over substring-only matches', () => {
      const substringOnly = {
        id: 'a-substring',
        config: { role_type: 'specialist', tools: ['gmail_search'] },
      };
      const tagged = {
        id: 'a-tagged',
        capability_tags: ['email', 'communications'],
        config: { role_type: 'specialist', tools: ['some_other_tool'] },
      };
      const result = MissionRunner._resolveByCapability('communications', [substringOnly, tagged]);
      expect(result.id).toBe('a-tagged');
    });

    it('returns null for unknown roles', () => {
      const agent = {
        id: 'a', capability_tags: ['crm'],
        config: { role_type: 'specialist', tools: ['x'] },
      };
      expect(MissionRunner._resolveByCapability('mythical-role', [agent])).toBeNull();
    });

    it('exposes the canonical role vocabulary via Roles', () => {
      expect(Roles.getRequiredTags('communications')).toContain('email');
      expect(Roles.getRequiredTags('engineering')).toContain('code');
      expect(Roles.getRequiredTags('sales')).toContain('crm');
      expect(Roles.getRequiredTags('captain')).toEqual([]);
    });

    it('prefers kind=capability over kind=character when both match', () => {
      const character = {
        id: 'bp-agent-349', name: 'Lando',
        kind: 'character',
        capability_tags: ['crm', 'sales'],
        config: { role_type: 'sales', tools: ['search_crm_objects'] },
      };
      const capability = {
        id: 'bp-agent-hubspot', name: 'HubSpot Agent',
        kind: 'capability',
        capability_tags: ['crm', 'sales'],
        config: { role_type: 'specialist', tools: ['search_crm_objects'] },
      };
      // Order shouldn't matter — capability should win in either order
      expect(MissionRunner._resolveByCapability('sales', [character, capability]).id).toBe('bp-agent-hubspot');
      expect(MissionRunner._resolveByCapability('sales', [capability, character]).id).toBe('bp-agent-hubspot');
    });

    it('falls through to character when no capability is present', () => {
      const character = {
        id: 'bp-agent-349', name: 'Lando',
        kind: 'character',
        capability_tags: ['crm', 'sales'],
        config: { role_type: 'sales', tools: ['search_crm_objects'] },
      };
      expect(MissionRunner._resolveByCapability('sales', [character]).id).toBe('bp-agent-349');
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

    it('reads agentRole when role_type / role are absent', () => {
      // Slot characters created by the ship-setup-wizard persistence path
      // (#442) write only config.agentRole — mirroring user_spaceships.slots
      // .crew[].config. Pre-fix the manifest defaulted everyone to
      // 'specialist', and the captain emitted dispatch with role
      // 'specialist' which no slotted agent matches → INTERNAL_ERROR.
      const crew = [{ name: 'President Roslin', config: { agentRole: 'Governance' } }];
      const manifest = MissionRunner._buildCrewManifest(null, crew);
      expect(manifest).toContain('[governance]');
      expect(manifest).not.toContain('[specialist]');
    });

    it('does not echo the literal word Specialist in the cap fallback', () => {
      // Live failure (BSG, 2026-05-07): every crew line ended in
      // "— Specialist" because crew with no description/system_prompt fell
      // back to that string. With "specialist" appearing 12+ times in the
      // prompt, the captain treated it as the canonical dispatch role and
      // emitted [DISPATCH: specialist] regardless of the bracket prefix.
      // The cap should mirror the agent's actual role to keep the bracket
      // role as the dominant signal.
      const crew = [{ name: 'President Roslin', config: { agentRole: 'Governance' } }];
      const manifest = MissionRunner._buildCrewManifest(null, crew);
      expect(manifest).not.toContain('Specialist');
      expect(manifest).toContain('Governance');
    });
  });

  describe('_categorizeDispatchError', () => {
    const cat = MissionRunner._categorizeDispatchError;

    it('flags 503 / 429 / capacity messages as PROVIDER_OVERLOADED', () => {
      // Live-failure case from 2026-05-07: ShipLog throws "AI call failed:
      // 503 - Service Unavailable" when Gemini Flash is overloaded. Han
      // synthesized this as "R2 was silent" pre-fix — the categorizer
      // is what lets the captain prompt name the actual condition.
      expect(cat(new Error('AI call failed: 503 - Service Unavailable')).category)
        .toBe('PROVIDER_OVERLOADED');
      expect(cat(new Error('429 Too Many Requests')).category)
        .toBe('PROVIDER_OVERLOADED');
      expect(cat({ message: 'Gemini overloaded — try again' }).category)
        .toBe('PROVIDER_OVERLOADED');
      expect(cat('Provider at capacity').category).toBe('PROVIDER_OVERLOADED');
    });

    it('flags 401 / 402 / 403 / billing messages as PROVIDER_AUTH_FAILED', () => {
      expect(cat(new Error('401 Unauthorized')).category).toBe('PROVIDER_AUTH_FAILED');
      expect(cat(new Error('Invalid API key')).category).toBe('PROVIDER_AUTH_FAILED');
      expect(cat(new Error('Payment required (402)')).category).toBe('PROVIDER_AUTH_FAILED');
      expect(cat(new Error('insufficient credit in pool')).category).toBe('PROVIDER_AUTH_FAILED');
    });

    it('flags 400 / schema rejection messages as PROVIDER_BAD_REQUEST', () => {
      // Klaviyo's deeply-nested enum rejection (the case PR #440 fixed)
      // and Gemini's TYPE_STRING enum-coercion errors land here.
      expect(cat(new Error('400 Invalid request')).category).toBe('PROVIDER_BAD_REQUEST');
      expect(cat(new Error('only allowed for STRING type')).category).toBe('PROVIDER_BAD_REQUEST');
      expect(cat(new Error('Invalid value at function_declarations[131]')).category)
        .toBe('PROVIDER_BAD_REQUEST');
    });

    it('falls through to INTERNAL_ERROR for unrecognized messages', () => {
      expect(cat(new Error('TypeError: Cannot read property foo of undefined')).category)
        .toBe('INTERNAL_ERROR');
      expect(cat(null).category).toBe('INTERNAL_ERROR');
      expect(cat(undefined).category).toBe('INTERNAL_ERROR');
      expect(cat('').category).toBe('INTERNAL_ERROR');
    });

    it('returns a non-empty hint for every category except INTERNAL_ERROR-with-no-detail', () => {
      // The hint is what gets surfaced to the captain alongside the
      // category — empty hints would defeat the point of categorizing.
      // INTERNAL_ERROR is allowed to carry a hint too (surface verbatim).
      expect(cat(new Error('503')).hint).toMatch(/capacity|retry|provider/i);
      expect(cat(new Error('401')).hint).toMatch(/credentials|billing|wallet/i);
      expect(cat(new Error('400')).hint).toMatch(/schema|prompt|verbatim/i);
      expect(cat(new Error('boom')).hint).toMatch(/verbatim|wrong/i);
    });
  });

  describe('_injectCaptainContext — error-handling guidance', () => {
    // Forward-fix for the 2026-05-07 silent-R2 synthesis bug: the captain's
    // prompt now teaches it to surface ERROR_CATEGORY-tagged crew reports
    // accurately instead of inventing a "crew member was silent" story.
    it('teaches the captain to recognize ERROR_CATEGORY blocks', () => {
      const ship = { slot_assignments: { 'slot-0': 'cap-1' } };
      const crew = [{ id: 'a-eng', name: 'R2-D2', config: { role_type: 'engineering' } }];
      const captainBp = { id: 'cap-1', name: 'Han', config: { role_type: 'captain', system_prompt: 'You are Han.' } };
      const result = MissionRunner._injectCaptainContext(captainBp, ship, crew);
      const sp = result.config.system_prompt;
      expect(sp).toContain('CREW ERROR REPORTS');
      expect(sp).toContain('[ERROR_CATEGORY:');
      expect(sp).toContain('PROVIDER_OVERLOADED');
      expect(sp).toContain('PROVIDER_AUTH_FAILED');
      expect(sp).toContain('PROVIDER_BAD_REQUEST');
      expect(sp).toContain('INTERNAL_ERROR');
      // Specific guard against the live failure mode — the prompt must
      // explicitly forbid the "silent" synthesis path.
      expect(sp).toMatch(/silent|did(n['’]t|n[o']t) respond|no data/i);
      // The original captain system_prompt is preserved underneath.
      expect(sp).toContain('You are Han.');
    });

    it('tells the captain to answer directly and dispatch only for tool-backed work', () => {
      // Forward-fix for the over-delegation seen on Galley + Enterprise during
      // the 5-class test: the captain dispatched simple drafting/advice tasks to
      // tool-bound crew, who refused. The protocol now defaults to answering
      // directly and reserves dispatch for tools / live data.
      const ship = { slot_assignments: { 'slot-0': 'cap-1' } };
      const crew = [{ id: 'a-eng', name: 'R2-D2', config: { role_type: 'engineering' } }];
      const captainBp = { id: 'cap-1', name: 'Han', config: { role_type: 'captain', system_prompt: 'You are Han.' } };
      const sp = MissionRunner._injectCaptainContext(captainBp, ship, crew).config.system_prompt;
      expect(sp).toMatch(/answer the user directly/i);
      expect(sp).toMatch(/dispatch.*only when/i);
      // Names a concrete tool-backed trigger so "dispatch" reads as tool work.
      expect(sp).toMatch(/searching email|reading the repo|querying the crm/i);
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

    it('resolves crew agent to catalog blueprint via name fallback when blueprint_id is synthetic', async () => {
      // Slot characters created by ship-setup-wizard carry synthetic blueprint_ids
      // ('n1'..'n12') taken from the catalog ship's crew[].id. Those are slot
      // indices, not real catalog ids, so Blueprints.getAgent() returns null.
      // Without name-based fallback the resolver falls back to the State stub
      // (no llm_engine → defaults to gemini-2.5-flash → all sub-agent calls
      // 503 when Gemini is overloaded). Mirror the outer-agent ladder.
      const catalogR2 = {
        id: 'bp-agent-353',
        name: 'R2-D2',
        config: {
          role_type: 'engineering',
          tools: ['list_pull_requests', 'get_pull_request'],
          llm_engine: 'claude-sonnet-4-6',
        },
      };
      const slotR2 = {
        id: 'agent-1778179922740-6',
        name: 'R2-D2',
        blueprint_id: 'n7', // synthetic — does not resolve via getAgent
        config: { agentRole: 'Engineering' }, // no llm_engine, no tools
      };
      State.set('agents', [
        { id: 'cap-1', name: 'Adama', config: { role_type: 'captain', is_captain: true, tools: [] } },
        slotR2,
      ]);
      const shipWithSynthetic = {
        id: 'ship-falcon-test', name: 'Falcon',
        slot_assignments: { 'slot-0': 'cap-1', 'slot-1': slotR2.id },
      };

      const _origBp = globalThis.Blueprints;
      globalThis.Blueprints = {
        isReady: () => true,
        getAgent: (id) => (id === 'bp-agent-353' ? catalogR2 : null), // 'n7' returns null
        listAgents: () => [catalogR2],
      };

      const calls = [];
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          calls.push({ bpId: bp.id, model: bp.config?.llm_engine, tools: bp.config?.tools });
          if (calls.length === 1) return { finalAnswer: '[DISPATCH: engineering] List today’s PRs.', steps: [], metadata: {} };
          if (calls.length === 2) return { finalAnswer: 'PR #1, PR #2.', steps: [], metadata: {} };
          return { finalAnswer: 'Two PRs landed today.', steps: [], metadata: {} };
        },
      };

      await MissionRunner.runWithDispatch(captainBp, 'What PRs?', shipWithSynthetic, {});

      // Crew call (the second AgentExecutor.execute call) must use the catalog
      // blueprint, not the synthetic stub. That means llm_engine is set and
      // the GitHub tools are present.
      expect(calls).toHaveLength(3);
      expect(calls[1].bpId).toBe('bp-agent-353');
      expect(calls[1].model).toBe('claude-sonnet-4-6');
      expect(calls[1].tools).toEqual(['list_pull_requests', 'get_pull_request']);

      delete globalThis.AgentExecutor;
      globalThis.Blueprints = _origBp;
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
      expect(calls[1].prompt).toContain('What deals are stalling?');
      // ...plus the in-role guidance that stops tool-bound reskins from refusing
      expect(calls[1].prompt).toMatch(/Complete this request directly when you can/i);
      // Synthesis prompt contains the crew report
      expect(calls[2].prompt).toContain('[CREW REPORT: sales]');
      expect(calls[2].prompt).toContain('Deals Alpha and Beta are stalling.');
      delete globalThis.AgentExecutor;
    });

    it('formats a thrown crew error as an [ERROR_CATEGORY] block in the synthesis prompt', async () => {
      // Forward-fix for the 2026-05-07 silent-R2 synthesis. When a crew
      // agent's LLM call throws (Gemini 503 / Klaviyo schema reject), the
      // [CREW REPORT] now carries an [ERROR_CATEGORY: ...] tag plus a
      // hint, so the captain's prompt-side guidance can name the actual
      // condition instead of inventing a "crew member was silent" story.
      const calls = [];
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          calls.push({ prompt });
          if (calls.length === 1) {
            return { finalAnswer: '[DISPATCH: sales] What deals are stalling?', steps: [], metadata: {} };
          }
          if (calls.length === 2) {
            // Crew agent's LLM call fails with the same shape ShipLog
            // throws when Gemini Flash is overloaded.
            throw new Error('AI call failed: 503 - Service Unavailable');
          }
          return { finalAnswer: 'Provider is overloaded right now — please retry shortly.', steps: [], metadata: {} };
        },
      };

      await MissionRunner.runWithDispatch(captainBp, 'What deals need attention?', ship, {});
      expect(calls).toHaveLength(3);
      const synthesisPrompt = calls[2].prompt;
      expect(synthesisPrompt).toContain('[CREW REPORT: sales]');
      expect(synthesisPrompt).toContain('[ERROR_CATEGORY: PROVIDER_OVERLOADED]');
      expect(synthesisPrompt).toMatch(/capacity|retry/i);
      // The raw underlying message must travel through so the captain can
      // surface it verbatim if the category guidance asks (PROVIDER_BAD_REQUEST
      // and INTERNAL_ERROR both expect verbatim surfacing).
      expect(synthesisPrompt).toContain('AI call failed: 503');
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

    it('dispatches to catalog agents found only in activated-agents state', async () => {
      // Catalog agents (e.g. bp-agent-google-workspace) live in State.activated-agents,
      // NOT State.agents. Crew lookup must merge both lists.
      const catalogAgent = { id: 'bp-agent-workspace', name: 'Workspace Agent', config: { role_type: 'communications', tools: ['calendar_list'] } };
      State.set('agents', []); // empty user_agents
      State.set('activated-agents', [catalogAgent]);

      const shipWithCatalogCrew = {
        id: 'ship-ent', name: 'Enterprise',
        slot_assignments: { 'slot-0': 'cap-1', 'slot-1': 'bp-agent-workspace' },
      };

      const calls = [];
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          calls.push({ bpId: bp.id || bp.name, prompt });
          if (calls.length === 1) {
            return { finalAnswer: '[DISPATCH: communications] What is on my calendar?', steps: [], metadata: {} };
          }
          if (calls.length === 2) {
            return { finalAnswer: 'You have a standup at 10am.', steps: [], metadata: {} };
          }
          return { finalAnswer: 'Your standup is at 10am.', steps: [], metadata: {} };
        },
      };

      const result = await MissionRunner.runWithDispatch(captainBp, 'What is on my calendar?', shipWithCatalogCrew, {});
      expect(result.finalAnswer).toBe('Your standup is at 10am.');
      // Crew (catalog agent) must have been called — 3 calls total
      expect(calls).toHaveLength(3);
      delete globalThis.AgentExecutor;

      // Restore
      State.set('agents', [
        { id: 'cap-1', name: 'Adama', config: { role_type: 'captain', is_captain: true, tools: [] } },
        { id: 'a-sales', name: 'Apollo', config: { role_type: 'sales', tools: ['crm-search'] } },
      ]);
      State.set('activated-agents', []);
    });

    it('includes unslotted wired agents in the captain manifest so captain knows to dispatch', async () => {
      // Ship has only a stub crew in slot_assignments. An activated wired agent is NOT slotted
      // but should appear in the captain's system_prompt manifest so the captain has the signal
      // to issue [DISPATCH: communications].
      const stub = { id: 'stub-nav', name: 'Starbuck', config: { role_type: 'pilot', tools: [] } };
      const wired = { id: 'bp-agent-ws2', name: 'Workspace Agent', config: { role_type: 'specialist', tools: ['gmail_search'] } };
      State.set('agents', [stub]);
      State.set('activated-agents', [wired]);

      const shipStubsOnly = {
        id: 'ship-ghost', name: 'Ghost',
        slot_assignments: { 'slot-0': 'cap-1', 'slot-1': 'stub-nav' },
      };

      let capturedSystemPrompt = '';
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          if (!capturedSystemPrompt) capturedSystemPrompt = bp.config?.system_prompt || '';
          return { finalAnswer: 'No dispatch needed.', steps: [], metadata: {} };
        },
      };

      await MissionRunner.runWithDispatch(captainBp, 'Check my inbox.', shipStubsOnly, {});
      // Manifest must mention the wired agent and its role so the captain knows it can dispatch
      expect(capturedSystemPrompt).toContain('Workspace Agent');
      delete globalThis.AgentExecutor;

      // Restore
      State.set('agents', [
        { id: 'cap-1', name: 'Adama', config: { role_type: 'captain', is_captain: true, tools: [] } },
        { id: 'a-sales', name: 'Apollo', config: { role_type: 'sales', tools: ['crm-search'] } },
      ]);
      State.set('activated-agents', []);
    });

    it('falls back to capability-matched agent when dispatch slot has no matching slotted agent', async () => {
      // Ship has only stub crew in slot_assignments (no wired agents slotted).
      // An activated umbrella agent with matching tools should be found via capability fallback.
      const stubCrew = { id: 'stub-1', name: 'Apollo', config: { role_type: 'pilot', tools: [] } };
      const workspaceAgent = { id: 'bp-agent-ws', name: 'Workspace Agent', config: { role_type: 'specialist', tools: ['calendar_list_events', 'gmail_search'] } };
      State.set('agents', [stubCrew]);
      State.set('activated-agents', [workspaceAgent]);

      const shipAllStubs = {
        id: 'ship-bsg2', name: 'Galactica',
        // Workspace agent is NOT in slot_assignments — only the stub crew is
        slot_assignments: { 'slot-0': 'cap-1', 'slot-1': 'stub-1' },
      };

      const calls = [];
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          calls.push({ bpId: bp.id || bp.name, prompt });
          if (calls.length === 1) {
            return { finalAnswer: '[DISPATCH: communications] What emails did I get today?', steps: [], metadata: {} };
          }
          if (calls.length === 2) {
            // Should be Workspace Agent, not the stub
            return { finalAnswer: '3 emails from HQ.', steps: [], metadata: {} };
          }
          return { finalAnswer: 'You received 3 emails from HQ today.', steps: [], metadata: {} };
        },
      };

      const result = await MissionRunner.runWithDispatch(captainBp, 'Any emails today?', shipAllStubs, {});
      expect(result.finalAnswer).toBe('You received 3 emails from HQ today.');
      // Crew call must have gone to Workspace Agent (id 'bp-agent-ws'), not the stub ('stub-1')
      expect(calls[1].bpId).toBe('bp-agent-ws');
      delete globalThis.AgentExecutor;

      // Restore
      State.set('agents', [
        { id: 'cap-1', name: 'Adama', config: { role_type: 'captain', is_captain: true, tools: [] } },
        { id: 'a-sales', name: 'Apollo', config: { role_type: 'sales', tools: ['crm-search'] } },
      ]);
      State.set('activated-agents', []);
    });

    // 2026-05-08: Falcon M365 dispatch surfaced literal '[object Object]' in
    // the captain's [CREW REPORT] block. AgentExecutor's contract is
    // string-typed finalAnswer, but if anything upstream regresses, the
    // implicit string coercion of an object produces visible garbage.
    it('JSON-stringifies a non-string crewResult.finalAnswer instead of producing literal [object Object]', async () => {
      const calls = [];
      globalThis.AgentExecutor = {
        execute: async (bp, prompt) => {
          calls.push({ bpId: bp.id || bp.name, prompt });
          if (calls.length === 1) {
            return { finalAnswer: '[DISPATCH: sales] What deals are stalling?', steps: [], metadata: {} };
          }
          if (calls.length === 2) {
            // Pathological: crew returns an object as finalAnswer rather than a string
            return { finalAnswer: { events: [{ subject: 'Standup' }] }, steps: [], metadata: {} };
          }
          // Captain synthesis sees the crew report — pin its content here
          return { finalAnswer: prompt, steps: [], metadata: {} };
        },
      };

      const result = await MissionRunner.runWithDispatch(captainBp, 'What deals?', ship, {});
      // The synthesis prompt (prompt of call 3) should contain the crew report
      // and that report MUST NOT be the literal string '[object Object]'.
      const synthesisPrompt = calls[2].prompt;
      expect(synthesisPrompt).toContain('[CREW REPORT: sales]');
      expect(synthesisPrompt).not.toContain('[object Object]');
      expect(synthesisPrompt).toContain('Standup');
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
