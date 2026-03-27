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

// Mock sessionStorage
const _sessionStore = {};
globalThis.sessionStorage = {
  getItem: (k) => _sessionStore[k] ?? null,
  setItem: (k, v) => { _sessionStore[k] = String(v); },
  removeItem: (k) => { delete _sessionStore[k]; },
  clear: () => { Object.keys(_sessionStore).forEach(k => delete _sessionStore[k]); },
};

// Mock crypto
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => 'test-uuid-' + Math.random().toString(36).slice(2, 10);
}

// Mock DB
const _db = {};
globalThis.SB = {
  isReady: () => false,
  db: (table) => ({
    get: async (id) => (_db[table] || {})[id] || null,
    list: async () => Object.values(_db[table] || {}),
    create: async (row) => {
      const id = row.id || crypto.randomUUID();
      const entry = { ...row, id, created_at: new Date().toISOString() };
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
  functions: { invoke: async () => ({ data: null, error: 'not available' }) },
};

globalThis.State = (() => {
  const _data = {};
  return {
    get: (k) => _data[k],
    set: (k, v) => { _data[k] = v; },
    on: () => {},
    off: () => {},
    _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); },
  };
})();

globalThis.LLMConfig = { forBlueprint: () => ({ model: 'mock', temperature: 0.7, max_tokens: 1024 }) };

loadModule('lib/ship-log.js');

describe('ShipLog', () => {
  beforeEach(() => {
    Object.keys(_db).forEach(k => delete _db[k]);
    sessionStorage.clear();
    State._reset();
    // Ensure LLM connection check passes
    State.set('enabled_models', { 'gemini-2.5-flash': true, 'claude-sonnet-4-20250514': true });
  });

  describe('append', () => {
    it('should return null if no spaceshipId', async () => {
      expect(await ShipLog.append(null, { content: 'test' })).toBeNull();
    });

    it('should return null if no content', async () => {
      expect(await ShipLog.append('ship-1', { content: '' })).toBeNull();
    });

    it('should store entry in sessionStorage when SB is not ready', async () => {
      const entry = await ShipLog.append('ship-1', {
        agentId: 'a1',
        role: 'agent',
        content: 'Hello from agent',
        metadata: { source: 'test' },
      });

      expect(entry).not.toBeNull();
      expect(entry.content).toBe('Hello from agent');
      expect(entry.role).toBe('agent');
      expect(entry.spaceship_id).toBe('ship-1');
      expect(entry.id).toBeTruthy();
      expect(entry.created_at).toBeTruthy();

      // Verify sessionStorage
      const stored = JSON.parse(sessionStorage.getItem('nice-ship-log-ship-1'));
      expect(stored.length).toBe(1);
      expect(stored[0].content).toBe('Hello from agent');
    });

    it('should cap local log at 200 entries', async () => {
      for (let i = 0; i < 210; i++) {
        await ShipLog.append('ship-cap', { content: `entry-${i}` });
      }
      const stored = JSON.parse(sessionStorage.getItem('nice-ship-log-ship-cap'));
      expect(stored.length).toBe(200);
      expect(stored[0].content).toBe('entry-10'); // first 10 trimmed
    });

    it('should use DB when SB is ready', async () => {
      SB.isReady = () => true;
      const entry = await ShipLog.append('ship-2', {
        content: 'DB entry',
        role: 'user',
      });
      expect(entry).not.toBeNull();
      expect(_db.ship_log).toBeTruthy();
      expect(Object.values(_db.ship_log)[0].content).toBe('DB entry');
      SB.isReady = () => false;
    });

    it('should default role to system', async () => {
      const entry = await ShipLog.append('ship-1', { content: 'sys msg' });
      expect(entry.role).toBe('system');
    });
  });

  describe('getEntries', () => {
    it('should return empty array if no spaceshipId', async () => {
      expect(await ShipLog.getEntries(null)).toEqual([]);
    });

    it('should return entries from sessionStorage', async () => {
      await ShipLog.append('ship-3', { content: 'msg1' });
      await ShipLog.append('ship-3', { content: 'msg2' });
      await ShipLog.append('ship-3', { content: 'msg3' });

      const entries = await ShipLog.getEntries('ship-3', 50);
      expect(entries.length).toBe(3);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await ShipLog.append('ship-4', { content: `msg-${i}` });
      }
      const entries = await ShipLog.getEntries('ship-4', 3);
      expect(entries.length).toBe(3);
      expect(entries[0].content).toBe('msg-7'); // last 3
    });

    it('should default limit to 50', async () => {
      const entries = await ShipLog.getEntries('ship-empty');
      expect(entries).toEqual([]);
    });
  });

  describe('buildContext', () => {
    it('should return empty array for no entries', () => {
      expect(ShipLog.buildContext(null)).toEqual([]);
      expect(ShipLog.buildContext([])).toEqual([]);
    });

    it('should map user role to user', () => {
      const ctx = ShipLog.buildContext([
        { role: 'user', content: 'Hello', agent_id: null },
      ]);
      expect(ctx[0].role).toBe('user');
      expect(ctx[0].content).toBe('Hello');
      expect(ctx[0].name).toBe('system');
    });

    it('should map agent role to assistant', () => {
      const ctx = ShipLog.buildContext([
        { role: 'agent', content: 'Response', agent_id: 'a1' },
      ]);
      expect(ctx[0].role).toBe('assistant');
      expect(ctx[0].name).toBe('a1');
    });

    it('should handle multiple entries in order', () => {
      const ctx = ShipLog.buildContext([
        { role: 'user', content: 'Q1', agent_id: null },
        { role: 'agent', content: 'A1', agent_id: 'a1' },
        { role: 'user', content: 'Q2', agent_id: null },
      ]);
      expect(ctx.length).toBe(3);
      expect(ctx[0].role).toBe('user');
      expect(ctx[1].role).toBe('assistant');
      expect(ctx[2].role).toBe('user');
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('should not throw on subscribe', () => {
      expect(() => ShipLog.subscribe('ship-1', () => {})).not.toThrow();
    });

    it('should not throw on unsubscribe', () => {
      expect(() => ShipLog.unsubscribe()).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should return null if no spaceshipId', async () => {
      expect(await ShipLog.execute(null, null, 'test')).toBeNull();
    });

    it('should return null if no prompt', async () => {
      expect(await ShipLog.execute('ship-1', null, '')).toBeNull();
    });

    it('should return mock response with agent info', async () => {
      const bp = { id: 'a1', name: 'TestBot', config: { role: 'Research' } };
      const result = await ShipLog.execute('ship-exec', bp, 'Analyze this');

      expect(result).not.toBeNull();
      expect(result.agent).toBe('TestBot');
      expect(result.agentId).toBe('a1');
      expect(result.content).toBeTruthy();
      expect(result.metadata).toBeTruthy();
      expect(result.metadata.source).toBe('mock');
    });

    it('should log user message and agent response to ship log', async () => {
      await ShipLog.execute('ship-log-test', null, 'Hello');

      const entries = await ShipLog.getEntries('ship-log-test');
      expect(entries.length).toBe(2);
      expect(entries[0].role).toBe('user');
      expect(entries[0].content).toBe('Hello');
      expect(entries[1].role).toBe('agent');
    });

    it('should use NICE SPACESHIP as default agent name', async () => {
      const result = await ShipLog.execute('ship-1', null, 'Hi');
      expect(result.agent).toBe('NICE');
      expect(result.agentId).toBeNull();
    });

    it('should include metadata with timing and context info', async () => {
      const result = await ShipLog.execute('ship-meta', null, 'Test');
      expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.metadata.tokens_used).toBeGreaterThan(0);
      expect(typeof result.metadata.context_len).toBe('number');
    });

    it('should return no-provider message when no LLMs connected', async () => {
      State.set('enabled_models', {});

      const result = await ShipLog.execute('ship-nollm', null, 'Hello');
      // With new system, free models are always available — should get a mock response
      expect(result).not.toBeNull();
      expect(result.content).toBeTruthy();

      // Restore for other tests
      State.set('enabled_models', { 'gemini-2.5-flash': true, 'claude-sonnet-4-20250514': true });
    });
  });

  describe('relay', () => {
    it('should return null if no spaceshipId', async () => {
      expect(await ShipLog.relay(null, null, null, 'test')).toBeNull();
    });

    it('should return null if no message', async () => {
      expect(await ShipLog.relay('ship-1', null, null, '')).toBeNull();
    });

    it('should log a relay message with metadata', async () => {
      const from = { id: 'f1', name: 'Sender' };
      const to = { id: 't1', name: 'Receiver', config: { role: 'Research' } };

      await ShipLog.relay('ship-relay', from, to, 'Analyze this');

      const entries = await ShipLog.getEntries('ship-relay');
      const relayEntry = entries.find(e => e.metadata && e.metadata.type === 'relay');
      expect(relayEntry).toBeTruthy();
      expect(relayEntry.content).toContain('Receiver');
      expect(relayEntry.metadata.from).toBe('Sender');
      expect(relayEntry.metadata.to).toBe('Receiver');
    });

    it('should execute the receiving agent when toAgent is specified', async () => {
      const from = { id: 'f1', name: 'Sender' };
      const to = { id: 't1', name: 'Receiver', config: { role: 'default' } };

      const result = await ShipLog.relay('ship-relay2', from, to, 'Do something');
      expect(result).not.toBeNull();
      expect(result.agent).toBe('Receiver');
    });

    it('should return null when no toAgent is specified (broadcast)', async () => {
      const from = { id: 'f1', name: 'Sender' };
      const result = await ShipLog.relay('ship-relay3', from, null, 'Broadcast msg');
      expect(result).toBeNull();
    });

    it('should use System as fromName when no fromAgent', async () => {
      const to = { id: 't1', name: 'Bot', config: { role: 'default' } };
      await ShipLog.relay('ship-relay4', null, to, 'System message');

      const entries = await ShipLog.getEntries('ship-relay4');
      const relayEntry = entries.find(e => e.metadata && e.metadata.type === 'relay');
      expect(relayEntry.metadata.from).toBe('System');
    });
  });

  describe('chain', () => {
    it('should return null for empty agents array', async () => {
      expect(await ShipLog.chain('ship-1', [], 'test')).toBeNull();
    });

    it('should return null for null spaceshipId', async () => {
      expect(await ShipLog.chain(null, [{ id: '1' }], 'test')).toBeNull();
    });

    it('should return null for empty prompt', async () => {
      expect(await ShipLog.chain('ship-1', [{ id: '1' }], '')).toBeNull();
    });

    it('should run a single agent and return its response', async () => {
      const agent = { id: 'c1', name: 'ChainBot', config: { role: 'default' } };
      const result = await ShipLog.chain('ship-chain', [agent], 'Start task');

      expect(result).not.toBeNull();
      expect(result.agent).toBe('ChainBot');
      expect(result.content).toBeTruthy();
    });

    it('should run multiple agents in sequence and return last result', async () => {
      const agent1 = { id: 'c1', name: 'First', config: { role: 'Research' } };
      const agent2 = { id: 'c2', name: 'Second', config: { role: 'Analytics' } };

      const result = await ShipLog.chain('ship-chain2', [agent1, agent2], 'Analyze market');

      expect(result).not.toBeNull();
      expect(result.agent).toBe('Second');
    });

    it('should accumulate entries from all agents in the log', async () => {
      const agent1 = { id: 'c1', name: 'First', config: { role: 'default' } };
      const agent2 = { id: 'c2', name: 'Second', config: { role: 'default' } };

      await ShipLog.chain('ship-chain3', [agent1, agent2], 'Initial prompt');

      const entries = await ShipLog.getEntries('ship-chain3');
      // Each execute call logs a user message + agent response = 2 entries per agent
      expect(entries.length).toBeGreaterThanOrEqual(4);
    });
  });
});
