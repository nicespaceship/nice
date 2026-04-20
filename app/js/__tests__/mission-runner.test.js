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

// Load ShipLog first (dependency), then MissionRunner
loadModule('lib/ship-log.js');
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
    // Create a mission in the mock DB
    const mission = await SB.db('tasks').create({
      id: 'm1', user_id: userId, title: 'Test mission',
      agent_id: null, status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m1');

    // Should go to review (Draft & Approve flow)
    const updated = _db.tasks?.m1;
    expect(updated.status).toBe('review');
    expect(updated.progress).toBe(100);
    expect(updated.result).toBeTruthy();
    expect(result).not.toBeNull();
    expect(result.content).toBeTruthy();
  });

  it('should not award XP until approval (Draft & Approve flow)', async () => {
    await SB.db('tasks').create({
      id: 'm2', user_id: userId, title: 'XP test',
      agent_id: null, status: 'queued', progress: 0,
    });

    await MissionRunner.run('m2');

    // XP is awarded on user approval, not on generation
    expect(Gamification.addXP).not.toHaveBeenCalled();
  });

  it('should create a notification on completion', async () => {
    await SB.db('tasks').create({
      id: 'm3', user_id: userId, title: 'Notify test',
      agent_id: null, status: 'queued', progress: 0,
    });

    await MissionRunner.run('m3');

    // Check notification was created
    const notifications = Object.values(_db.notifications || {});
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].type).toBe('mission');
  });

  it('should look up assigned agent from State', async () => {
    const agent = { id: 'a1', name: 'TestBot', role: 'Research', config: { role: 'Research' } };
    State.set('agents', [agent]);

    await SB.db('tasks').create({
      id: 'm4', user_id: userId, title: 'Agent mission',
      agent_id: 'a1', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m4');
    expect(result).not.toBeNull();
    expect(_db.tasks.m4.status).toBe('review');
  });

  it('should update local State missions during execution', async () => {
    State.set('missions', [{ id: 'm5', status: 'queued', progress: 0 }]);

    await SB.db('tasks').create({
      id: 'm5', user_id: userId, title: 'State test',
      agent_id: null, status: 'queued', progress: 0,
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

    State.set('missions', [{ id: 'm-fail', status: 'queued', progress: 0 }]);
    await SB.db('tasks').create({
      id: 'm-fail', user_id: userId, title: 'Failing mission',
      agent_id: null, status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-fail');

    const updated = _db.tasks?.['m-fail'];
    expect(updated.status).toBe('failed');
    expect(updated.result).toContain('Error');

    globalThis.ShipLog.execute = origExecute;
  });

  it('should create error notification on failure', async () => {
    const origExecute = ShipLog.execute;
    globalThis.ShipLog.execute = async () => null;

    await SB.db('tasks').create({
      id: 'm-err-notify', user_id: userId, title: 'Error notify test',
      agent_id: null, status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-err-notify');

    const notifications = Object.values(_db.notifications || {});
    const errNotif = notifications.find(n => n.type === 'error');
    expect(errNotif).toBeTruthy();
    expect(errNotif.title).toBe('Mission Failed');

    globalThis.ShipLog.execute = origExecute;
  });

  it('should use temporary spaceship ID when no ships exist', async () => {
    await SB.db('tasks').create({
      id: 'm-no-ship', user_id: userId, title: 'No ship mission',
      agent_id: null, status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m-no-ship');
    expect(result).not.toBeNull();
    // The mission should still go to review with a fallback spaceship ID
    expect(_db.tasks['m-no-ship'].status).toBe('review');
  });

  it('should fall back to DB lookup when agent not in State', async () => {
    State.set('agents', []); // Empty local state
    // Put agent in mock DB
    await SB.db('user_agents').create({
      id: 'a-db', name: 'DBBot', role: 'Research', config: { role: 'Research' },
    });

    await SB.db('tasks').create({
      id: 'm-db-agent', user_id: userId, title: 'DB agent mission',
      agent_id: 'a-db', status: 'queued', progress: 0,
    });

    const result = await MissionRunner.run('m-db-agent');
    expect(result).not.toBeNull();
    expect(_db.tasks['m-db-agent'].status).toBe('review');
  });

  it('should include completed_at in metadata on success', async () => {
    await SB.db('tasks').create({
      id: 'm-meta', user_id: userId, title: 'Metadata test',
      agent_id: null, status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-meta');

    const updated = _db.tasks?.['m-meta'];
    expect(updated.metadata.completed_at).toBeTruthy();
    expect(new Date(updated.metadata.completed_at).getTime()).toBeGreaterThan(0);
  });

  it('should set result content on completed mission in DB', async () => {
    await SB.db('tasks').create({
      id: 'm-result', user_id: userId, title: 'Result test',
      agent_id: null, status: 'queued', progress: 0,
    });

    await MissionRunner.run('m-result');

    const updated = _db.tasks?.['m-result'];
    expect(updated.result).toBeTruthy();
    expect(typeof updated.result).toBe('string');
  });
});
