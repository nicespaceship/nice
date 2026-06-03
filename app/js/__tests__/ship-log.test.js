import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  functions: { invoke: async () => ({ data: { content: 'Mock LLM response for testing.', model: 'mock-test', usage: { input_tokens: 10, output_tokens: 20 } }, error: null }) },
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
    State.set('enabled_models', { 'gemini-2.5-flash': true, 'claude-sonnet-4-6': true });
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

    it('should use DB when SB is ready (real UUID scope)', async () => {
      SB.isReady = () => true;
      const uuid = '22222222-3333-4444-8555-666666666666';
      const entry = await ShipLog.append(uuid, {
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

    it('routes mission-<uuid> scope to mission_id column, null spaceship_id', async () => {
      // Parses the synthetic id MissionRunner fabricates for ship-less
      // missions. Before this routing, spaceship_id='mission-<uuid>' was
      // an invalid UUID and inserts silently failed.
      SB.isReady = () => true;
      const missionUuid = '78199ef5-e3ab-4f5b-bec5-fe4825db879c';
      const entry = await ShipLog.append('mission-' + missionUuid, {
        content: 'ship-less mission step',
        role: 'agent',
      });
      expect(entry).not.toBeNull();
      expect(entry.mission_id).toBe(missionUuid);
      expect(entry.spaceship_id).toBeNull();
      SB.isReady = () => false;
    });

    it('keeps real UUID scope ids on spaceship_id (regression guard)', async () => {
      SB.isReady = () => true;
      const realShipUuid = 'e4a47d6e-f741-4ec8-9a66-42017368330d';
      const entry = await ShipLog.append(realShipUuid, {
        content: 'ship-backed step',
        role: 'agent',
      });
      expect(entry.spaceship_id).toBe(realShipUuid);
      expect(entry.mission_id ?? null).toBeNull();
      // Real UUID ⇒ persisted to DB
      expect(_db.ship_log).toBeTruthy();
      expect(Object.values(_db.ship_log)[0].content).toBe('ship-backed step');
      SB.isReady = () => false;
    });

    it('skips DB write for non-UUID scopes (default-ship, test ids, legacy keys)', async () => {
      // The 'default-ship' sentinel used to slip into the spaceship_id
      // UUID column and 400 every single ship_log write during an agent
      // run. Non-UUID scopes now bypass the DB entirely and land in
      // sessionStorage only; the raw scope id still keys the bucket so
      // callers that read back with the same id see their entries.
      SB.isReady = () => true;
      const entry = await ShipLog.append('default-ship', {
        content: 'trace with no real ship',
        role: 'user',
      });
      expect(entry).not.toBeNull();
      // DB was NOT touched
      expect(_db.ship_log ?? {}).toEqual({});
      // Local fallback still carries the raw scope id so reads work
      expect(entry.spaceship_id).toBe('default-ship');
      const stored = JSON.parse(sessionStorage.getItem('nice-ship-log-default-ship'));
      expect(stored.length).toBe(1);
      expect(stored[0].content).toBe('trace with no real ship');
      SB.isReady = () => false;
    });

    it('coerces non-UUID agent_id to null and stashes blueprint id on metadata', async () => {
      // ship_log.agent_id is a UUID column. Catalog blueprints carry
      // string ids like 'bp-agent-inbox-captain' — passing those through
      // made every insert fail at the DB with 400 ("invalid input syntax
      // for type uuid"). Trace context still wants the blueprint id, so
      // it lands on metadata.agent_blueprint_id.
      SB.isReady = () => true;
      const entry = await ShipLog.append('ship-1', {
        agentId: 'bp-agent-inbox-captain',
        role: 'agent',
        content: 'thinking',
        metadata: { event: 'tool_use', tool_name: 'gmail_search_messages' },
      });
      expect(entry.agent_id).toBeNull();
      expect(entry.metadata.agent_blueprint_id).toBe('bp-agent-inbox-captain');
      expect(entry.metadata.event).toBe('tool_use');
      SB.isReady = () => false;
    });

    it('passes through real UUID agent_id unchanged', async () => {
      SB.isReady = () => true;
      const realUuid = '11111111-2222-4333-8444-555555555555';
      const entry = await ShipLog.append('ship-1', {
        agentId: realUuid,
        role: 'agent',
        content: 'reply',
      });
      expect(entry.agent_id).toBe(realUuid);
      expect(entry.metadata.agent_blueprint_id).toBeUndefined();
      SB.isReady = () => false;
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

    it('subscribe(null, cb) opens an all-ships channel and fans out across ships', () => {
      // Regression: the old `if (!spaceshipId ...) return` rejected the null
      // ("all ships") subscription the Ship's Log view uses, and the channel
      // closure filtered to the first captured id. Both are fixed here.
      const origReady = SB.isReady;
      const origRealtime = SB.realtime;
      let channelCb = null;
      SB.isReady = () => true;
      SB.realtime = { subscribe: (_table, cb) => { channelCb = cb; return { _table }; }, unsubscribe: () => {} };
      const received = [];
      try {
        ShipLog.subscribe(null, (entry) => received.push(entry));
        expect(typeof channelCb).toBe('function'); // channel created despite null id
        channelCb({ new: { spaceship_id: 'ship-42', content: 'hi' } });
        channelCb({ new: { spaceship_id: 'ship-99', content: 'yo' } });
        expect(received.map(e => e.spaceship_id)).toEqual(['ship-42', 'ship-99']);
      } finally {
        ShipLog.unsubscribe();
        SB.isReady = origReady;
        SB.realtime = origRealtime;
      }
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
      expect(result.metadata.source).toBe('llm');
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
      State.set('enabled_models', { 'gemini-2.5-flash': true, 'claude-sonnet-4-6': true });
    });

    // 2026-05-08: Falcon M365 dispatch surfaced literal '[object Object]' in
    // the captain's [CREW REPORT] block. Root cause was String() coercion
    // of an object content shape from nice-ai. These tests pin the
    // normalized output so future content-shape regressions don't make
    // it back to user-visible chat.
    describe('content normalization (Bug 2 regression)', () => {
      let _origInvoke;
      beforeEach(() => { _origInvoke = SB.functions.invoke; });
      afterEach(() => { SB.functions.invoke = _origInvoke; });

      it('JSON-stringifies an object-shaped content instead of coercing to "[object Object]"', async () => {
        SB.functions.invoke = async () => ({
          data: { content: { events: [{ subject: 'Standup', start: '10am' }] }, model: 'm', usage: { input_tokens: 1, output_tokens: 1 } },
          error: null,
        });
        const result = await ShipLog.execute('ship-objcontent', null, 'check calendar');
        expect(result.content).not.toBe('[object Object]');
        expect(typeof result.content).toBe('string');
        expect(result.content).toContain('Standup');
      });

      it('extracts text from an Anthropic-style content array', async () => {
        SB.functions.invoke = async () => ({
          data: { content: [{ type: 'text', text: 'Hello from Claude' }], model: 'm', usage: { input_tokens: 1, output_tokens: 1 } },
          error: null,
        });
        const result = await ShipLog.execute('ship-anthropic', null, 'hi');
        expect(result.content).toBe('Hello from Claude');
      });

      it('falls back to JSON when array elements have no .text and no .type', async () => {
        SB.functions.invoke = async () => ({
          data: { content: [{ surprise: 'gotcha' }], model: 'm', usage: { input_tokens: 1, output_tokens: 1 } },
          error: null,
        });
        const result = await ShipLog.execute('ship-weird-array', null, 'hi');
        expect(result.content).not.toBe('[object Object]');
        expect(result.content).toContain('gotcha');
      });

      it('handles null/undefined content gracefully', async () => {
        SB.functions.invoke = async () => ({
          data: { content: null, model: 'm', usage: { input_tokens: 1, output_tokens: 1 } },
          error: null,
        });
        const result = await ShipLog.execute('ship-nullcontent', null, 'hi');
        expect(result.content).toBe('');
      });
    });

    // 2026-05-15: ship-log.js:362 referenced SB.auth.session() (sync,
    // nonexistent) instead of awaiting SB.auth.getSession() (async). The
    // optional-chain swallowed the typo and the Authorization header silently
    // fell back to the HS256 anon key, which nice-ai's strict
    // auth.getUser() rejected with 401 on every streaming chat. Pin the
    // Bearer-token source so the typo can't return.
    describe('streaming auth (Bug regression)', () => {
      let _origInvoke, _origInvokeStream, _origAuth, _origUrl, _origKey, _origFetch;
      const _ANON_KEY = 'eyJ.anon.key.placeholder';
      const _USER_JWT = 'eyJ.user.jwt.placeholder';
      let _capturedHeaders = null;

      beforeEach(() => {
        _origInvoke = SB.functions.invoke;
        _origInvokeStream = SB.functions.invokeStream;
        _origAuth = SB.auth;
        _origUrl = SB._url; _origKey = SB._key;
        _origFetch = globalThis.fetch;
        _capturedHeaders = null;
        SB.functions.invokeStream = async () => null; // gates the streaming branch in execute()
        SB._url = 'https://test.supabase.co';
        SB._key = _ANON_KEY;
        SB.auth = { getSession: async () => ({ access_token: _USER_JWT }) };
        globalThis.fetch = async (url, opts) => {
          _capturedHeaders = opts?.headers || {};
          // Emit one SSE chunk + completion so _callLLMStream resolves cleanly
          const sse =
            'data: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n' +
            'data: [DONE]\n\n';
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sse));
              controller.close();
            },
          });
          return { ok: true, status: 200, body: stream };
        };
      });
      afterEach(() => {
        SB.functions.invoke = _origInvoke;
        SB.functions.invokeStream = _origInvokeStream;
        SB.auth = _origAuth;
        SB._url = _origUrl; SB._key = _origKey;
        globalThis.fetch = _origFetch;
      });

      it('uses the user JWT (not the anon key) as the streaming Bearer token', async () => {
        const onChunk = () => {};
        await ShipLog.execute('ship-stream-auth', { id: 'a1', name: 'StreamBot', config: {} }, 'hi', { onChunk });
        expect(_capturedHeaders).not.toBeNull();
        expect(_capturedHeaders.Authorization).toBe('Bearer ' + _USER_JWT);
        expect(_capturedHeaders.Authorization).not.toBe('Bearer ' + _ANON_KEY);
        expect(_capturedHeaders.apikey).toBe(_ANON_KEY);
      });

      it('falls back to the anon key when no session is available (guest path)', async () => {
        SB.auth = { getSession: async () => null };
        const onChunk = () => {};
        await ShipLog.execute('ship-stream-anon', { id: 'a1', name: 'StreamBot', config: {} }, 'hi', { onChunk });
        expect(_capturedHeaders.Authorization).toBe('Bearer ' + _ANON_KEY);
      });
    });

    // 2026-05-16: previous session (#515) added MODEL_ALIASES to canonicalize
    // stale model ids before they hit nice-ai. But LLMConfig.forBlueprint
    // already returned a `fallbackChain` array — no caller consumed it.
    // When a model 404'd at runtime (post-#515 still possible for any id not
    // in MODEL_ALIASES) or 503'd, the call failed instead of degrading.
    // _callLLM + _callLLMStream now walk the chain on retryable HTTP
    // errors (404/429/503), capped at 3 fallback attempts, skipping 402
    // (billing) and 400/401/403 (validation/auth — same problem on every model).
    describe('LLM fallback on retryable errors', () => {
      let _origInvoke, _origLLMConfig;
      let _origInvokeStream, _origAuth, _origFetch, _origUrl, _origKey;
      let _invokeCalls;
      beforeEach(() => {
        _origInvoke = SB.functions.invoke;
        _origLLMConfig = globalThis.LLMConfig;
        _invokeCalls = [];
        globalThis.LLMConfig = {
          forBlueprint: () => ({
            model: 'claude-4-7-opus',
            temperature: 0.7, max_tokens: 1024,
            fallbackChain: [
              { id: 'claude-4-6-sonnet', tier: 'standard', noTools: false },
              { id: 'gemini-2-5-flash',  tier: 'free',     noTools: false },
            ],
          }),
        };
      });
      afterEach(() => {
        SB.functions.invoke = _origInvoke;
        globalThis.LLMConfig = _origLLMConfig;
      });

      it('walks the chain on 404 (model not found) and surfaces the fallback model', async () => {
        const scripted = [
          { data: null, error: { context: { status: 404 }, message: 'model not found' } },
          { data: { content: 'ok from sonnet', model: 'claude-4-6-sonnet', usage: { input_tokens: 1, output_tokens: 1 } }, error: null },
        ];
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return scripted.shift();
        };
        const r = await ShipLog.execute('ship-404', { id: 'a', name: 'A', config: {} }, 'hi');
        expect(_invokeCalls).toEqual(['claude-4-7-opus', 'claude-4-6-sonnet']);
        expect(r.content).toBe('ok from sonnet');
      });

      it('retries the SAME model on a transient 503 and recovers without swapping', async () => {
        const scripted = [
          { data: null, error: { context: { status: 503 }, message: 'high demand' } },
          { data: { content: 'recovered', model: 'claude-4-7-opus', usage: { input_tokens: 1, output_tokens: 1 } }, error: null },
        ];
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return scripted.shift();
        };
        const r = await ShipLog.execute('ship-503-retry', { id: 'a', name: 'A', config: {} }, 'hi');
        // same model retried in place — no swap to the fallback chain
        expect(_invokeCalls).toEqual(['claude-4-7-opus', 'claude-4-7-opus']);
        expect(r.content).toBe('recovered');
      });

      it('exhausts same-model retries on persistent 503, then walks the chain', async () => {
        const scripted = [
          { data: null, error: { context: { status: 503 }, message: 'service unavailable' } },
          { data: null, error: { context: { status: 503 }, message: 'service unavailable' } },
          { data: null, error: { context: { status: 503 }, message: 'service unavailable' } },
          { data: { content: 'fallback ok', model: 'claude-4-6-sonnet', usage: { input_tokens: 1, output_tokens: 1 } }, error: null },
        ];
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return scripted.shift();
        };
        const r = await ShipLog.execute('ship-503', { id: 'a', name: 'A', config: {} }, 'hi');
        // primary retried 3x (1 + 2 backoff) before swapping to the fallback
        expect(_invokeCalls).toEqual(['claude-4-7-opus', 'claude-4-7-opus', 'claude-4-7-opus', 'claude-4-6-sonnet']);
        expect(r.content).toBe('fallback ok');
      });

      it('exhausts same-model retries on persistent 429, then walks the chain', async () => {
        const scripted = [
          { data: null, error: { context: { status: 429 }, message: 'rate limit' } },
          { data: null, error: { context: { status: 429 }, message: 'rate limit' } },
          { data: null, error: { context: { status: 429 }, message: 'rate limit' } },
          { data: { content: 'rl fallback', model: 'claude-4-6-sonnet', usage: { input_tokens: 1, output_tokens: 1 } }, error: null },
        ];
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return scripted.shift();
        };
        const r = await ShipLog.execute('ship-429', { id: 'a', name: 'A', config: {} }, 'hi');
        expect(_invokeCalls).toEqual(['claude-4-7-opus', 'claude-4-7-opus', 'claude-4-7-opus', 'claude-4-6-sonnet']);
        expect(r.content).toBe('rl fallback');
      });

      it('does NOT fall back on 402 (billing) — caller must surface the upgrade CTA, never auto-swap pools', async () => {
        const scripted = [
          { data: null, error: { context: { status: 402, json: async () => ({ error: 'pay up', code: 'subscription_required' }) }, message: 'payment required' } },
        ];
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return scripted.shift();
        };
        await expect(ShipLog.execute('ship-402', { id: 'a', name: 'A', config: {} }, 'hi'))
          .rejects.toThrow(/AI call failed/);
        expect(_invokeCalls).toEqual(['claude-4-7-opus']);
      });

      it('does NOT fall back on 401 (auth) — same problem on every model', async () => {
        const scripted = [
          { data: null, error: { context: { status: 401 }, message: 'unauthorized' } },
        ];
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return scripted.shift();
        };
        await expect(ShipLog.execute('ship-401', { id: 'a', name: 'A', config: {} }, 'hi'))
          .rejects.toThrow();
        expect(_invokeCalls).toEqual(['claude-4-7-opus']);
      });

      it('caps at 3 fallback attempts when the chain is longer', async () => {
        globalThis.LLMConfig.forBlueprint = () => ({
          model: 'claude-4-7-opus',
          temperature: 0.7, max_tokens: 1024,
          fallbackChain: [
            { id: 'gpt-5-4-pro',       tier: 'premium',  noTools: false },
            { id: 'gemini-2-5-pro',    tier: 'premium',  noTools: false },
            { id: 'claude-4-6-sonnet', tier: 'standard', noTools: false },
            { id: 'gpt-5-mini',        tier: 'standard', noTools: false },
            { id: 'gemini-2-5-flash',  tier: 'free',     noTools: false },
          ],
        });
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return { data: null, error: { context: { status: 503 }, message: 'down' } };
        };
        await expect(ShipLog.execute('ship-cap', { id: 'a', name: 'A', config: {} }, 'hi')).rejects.toThrow();
        // primary + 3 fallback models = 4 distinct models, each retried 3x = 12 calls
        expect(new Set(_invokeCalls).size).toBe(4);
        expect(_invokeCalls.length).toBe(12);
      });

      it('empty fallback chain → retries the same model, then throws', async () => {
        globalThis.LLMConfig.forBlueprint = () => ({
          model: 'claude-4-7-opus',
          temperature: 0.7, max_tokens: 1024,
          fallbackChain: [],
        });
        SB.functions.invoke = async (_n, opts) => {
          _invokeCalls.push(opts.body.model);
          return { data: null, error: { context: { status: 503 }, message: 'down' } };
        };
        await expect(ShipLog.execute('ship-empty', { id: 'a', name: 'A', config: {} }, 'hi')).rejects.toThrow();
        // no fallback to swap to, but the transient error still gets same-model retries
        expect(_invokeCalls).toEqual(['claude-4-7-opus', 'claude-4-7-opus', 'claude-4-7-opus']);
      });

      describe('streaming pre-stream fallback', () => {
        beforeEach(() => {
          _origInvokeStream = SB.functions.invokeStream;
          _origAuth = SB.auth;
          _origFetch = globalThis.fetch;
          _origUrl = SB._url; _origKey = SB._key;
          SB.functions.invokeStream = async () => null;
          SB._url = 'https://test.supabase.co';
          SB._key = 'anon-key';
          SB.auth = { getSession: async () => ({ access_token: 'user-jwt' }) };
        });
        afterEach(() => {
          SB.functions.invokeStream = _origInvokeStream;
          SB.auth = _origAuth;
          SB._url = _origUrl; SB._key = _origKey;
          globalThis.fetch = _origFetch;
        });

        function _streamResponse(text) {
          const sse = 'data: {"content":"' + text + '"}\n\ndata: [DONE]\n\n';
          const stream = new ReadableStream({
            start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); },
          });
          return { ok: true, status: 200, body: stream };
        }

        function _errorResponse(status, errBody) {
          return {
            ok: false, status, body: null,
            clone: () => ({ json: async () => errBody }),
            text: async () => JSON.stringify(errBody),
          };
        }

        it('falls back on pre-stream 404 (mid-stream cannot fall back)', async () => {
          const fetchCalls = [];
          const responses = [
            _errorResponse(404, { error: 'not found' }),
            _streamResponse('hi'),
          ];
          globalThis.fetch = async (_url, opts) => {
            fetchCalls.push(JSON.parse(opts.body).model);
            return responses.shift();
          };
          const r = await ShipLog.execute('ship-stream-404', { id: 'a', name: 'A', config: {} }, 'hi', { onChunk: () => {} });
          expect(fetchCalls).toEqual(['claude-4-7-opus', 'claude-4-6-sonnet']);
          expect(r.content).toBe('hi');
        });

        it('does NOT fall back on pre-stream 402 (billing)', async () => {
          const fetchCalls = [];
          globalThis.fetch = async (_url, opts) => {
            fetchCalls.push(JSON.parse(opts.body).model);
            return _errorResponse(402, { error: 'pay up', code: 'subscription_required' });
          };
          await expect(
            ShipLog.execute('ship-stream-402', { id: 'a', name: 'A', config: {} }, 'hi', { onChunk: () => {} })
          ).rejects.toThrow();
          expect(fetchCalls).toEqual(['claude-4-7-opus']);
        });

        it('does NOT fall back on pre-stream 401 (auth)', async () => {
          const fetchCalls = [];
          globalThis.fetch = async (_url, opts) => {
            fetchCalls.push(JSON.parse(opts.body).model);
            return _errorResponse(401, { error: 'unauthorized' });
          };
          await expect(
            ShipLog.execute('ship-stream-401', { id: 'a', name: 'A', config: {} }, 'hi', { onChunk: () => {} })
          ).rejects.toThrow();
          expect(fetchCalls).toEqual(['claude-4-7-opus']);
        });
      });
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
