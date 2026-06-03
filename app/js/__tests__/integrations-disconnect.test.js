/**
 * IntegrationsView disconnect tests
 * Locks the await-confirmed disconnect contract: a persisted MCP row is
 * dropped from State only after the DB delete resolves, so a silently-failed
 * write can't leave a revoked-looking integration live for the agents.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// ── Mock environment ──
const _store = {};
const mockLocalStorage = {
  getItem: (key) => _store[key] ?? null,
  setItem: (key, val) => { _store[key] = String(val); },
  removeItem: (key) => { delete _store[key]; },
  clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
  get length() { return Object.keys(_store).length; },
  key: (i) => Object.keys(_store)[i] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => 'test-' + Math.random().toString(36).slice(2, 10);
}

// Mock State
globalThis.State = (() => {
  const _data = {};
  const _listeners = {};
  return {
    get: (key) => _data[key],
    set: (key, val) => { _data[key] = val; (_listeners[key] || []).forEach(fn => fn(val)); },
    on: (key, fn) => { _listeners[key] = _listeners[key] || []; _listeners[key].push(fn); },
    off: (key, fn) => { _listeners[key] = (_listeners[key] || []).filter(f => f !== fn); },
    _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); Object.keys(_listeners).forEach(k => delete _listeners[k]); },
  };
})();

globalThis.Utils = { esc: (s) => String(s == null ? '' : s) };

// Mock SB — `remove` is controllable per test via `removeImpl`, and every
// delete id is recorded in `removeCalls`.
let removeCalls = [];
let removeImpl = async () => {};
globalThis.SB = {
  url: 'https://x.supabase.co', client: null, isReady: () => false, isOnline: () => true,
  db: () => ({
    list: async () => [],
    create: async (row) => ({ ...row, id: 'new' }),
    update: async () => ({}),
    get: async () => null,
    remove: async (id) => { removeCalls.push(id); return removeImpl(id); },
  }),
  realtime: { subscribe: () => null, unsubscribe: () => {} },
};

globalThis.Router = { navigate: vi.fn(), path: () => '/security', on: () => {}, init: () => {}, replace: () => {} };
globalThis.Notify = { send: vi.fn(), init: () => {} };

// Controllable confirm()
let confirmReturn = true;
let confirmCalls = 0;
globalThis.confirm = () => { confirmCalls++; return confirmReturn; };
if (typeof window !== 'undefined') window.confirm = globalThis.confirm;

function loadScriptGlobal(relativePath) {
  const absPath = resolve(__dirname_local, '..', relativePath);
  let code = readFileSync(absPath, 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadScriptGlobal('views/integrations.js');

const UUID = '3f1aa8c0-1234-4abc-89ab-0123456789ab';
const el = () => document.getElementById('test-el');
const seed = (rows) => State.set('mcp_connections', rows);

beforeEach(() => {
  mockLocalStorage.clear();
  State._reset();
  document.body.innerHTML = '<div id="test-el"></div>';
  removeCalls = [];
  removeImpl = async () => {};
  confirmReturn = true;
  confirmCalls = 0;
  Notify.send.mockClear();
});

describe('IntegrationsView._isPersistedId', () => {
  it('is true for a row carrying its Supabase UUID', () => {
    expect(IntegrationsView._isPersistedId(UUID)).toBe(true);
  });

  it('is false for synthetic in-session ids and seed ids', () => {
    expect(IntegrationsView._isPersistedId('mc-1717430400000')).toBe(false);
    expect(IntegrationsView._isPersistedId('mc-gmail')).toBe(false);
  });

  it('is false for nullish / non-string ids', () => {
    expect(IntegrationsView._isPersistedId(null)).toBe(false);
    expect(IntegrationsView._isPersistedId(undefined)).toBe(false);
    expect(IntegrationsView._isPersistedId('')).toBe(false);
    expect(IntegrationsView._isPersistedId(123)).toBe(false);
  });
});

describe('IntegrationsView._disconnectMcp', () => {
  it('aborts without touching State or the DB when the user cancels', async () => {
    confirmReturn = false;
    seed([{ id: UUID, name: 'Notion', status: 'connected' }]);
    await IntegrationsView._disconnectMcp(UUID, el());
    expect(removeCalls).toEqual([]);
    expect(State.get('mcp_connections')).toHaveLength(1);
  });

  it('drops a persisted row only after the DB delete resolves', async () => {
    seed([{ id: UUID, name: 'Notion', status: 'connected' }]);
    await IntegrationsView._disconnectMcp(UUID, el());
    expect(removeCalls).toEqual([UUID]);
    expect(State.get('mcp_connections')).toEqual([]);
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'MCP Disconnected' }));
  });

  it('keeps the row connected and warns when the DB delete fails', async () => {
    removeImpl = async () => { throw new Error('RLS denied'); };
    seed([{ id: UUID, name: 'Notion', status: 'connected' }]);
    await IntegrationsView._disconnectMcp(UUID, el());
    expect(removeCalls).toEqual([UUID]);
    expect(State.get('mcp_connections')).toHaveLength(1);
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Disconnect failed', type: 'error' }));
  });

  it('drops a local-only (mc-) row without a DB delete', async () => {
    seed([{ id: 'mc-123', name: 'Custom', status: 'connected' }]);
    await IntegrationsView._disconnectMcp('mc-123', el());
    expect(removeCalls).toEqual([]);
    expect(State.get('mcp_connections')).toEqual([]);
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'MCP Disconnected' }));
  });

  it('ignores a re-entrant click while a delete is in flight', async () => {
    let release;
    removeImpl = () => new Promise((res) => { release = res; });
    seed([{ id: UUID, name: 'Notion', status: 'connected' }]);
    const p1 = IntegrationsView._disconnectMcp(UUID, el());
    const p2 = IntegrationsView._disconnectMcp(UUID, el());
    await p2;
    expect(confirmCalls).toBe(1);
    expect(removeCalls).toEqual([UUID]);
    release();
    await p1;
    expect(State.get('mcp_connections')).toEqual([]);
  });
});
