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

// Mock SB — `create`/`remove` are controllable per test, and every call is
// recorded so tests can assert what hit the DB.
const DB_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let removeCalls = [];
let removeImpl = async () => {};
let createCalls = [];
let createImpl = async (row) => ({ ...row, id: DB_UUID });
let updateCalls = [];
let updateImpl = async (id, changes) => ({ id, name: 'Zapier', catalog_id: 'zapier', available_tools: [], ...changes });
globalThis.SB = {
  url: 'https://x.supabase.co', client: null, isReady: () => false, isOnline: () => true,
  db: () => ({
    list: async () => [],
    create: async (row) => { createCalls.push(row); return createImpl(row); },
    update: async (id, changes) => { updateCalls.push({ id, changes }); return updateImpl(id, changes); },
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

// Every shipped catalog entry is OAuth (redirects away) or Zapier, so the
// standard non-OAuth create branch is unreachable from the live catalog.
// Inject a synthetic api-key entry to exercise it.
IntegrationsView.MCP_CATALOG.push({
  id: 'teststd', name: 'Test Std', cat: 'other', auth: 'apikey',
  transport: 'json-rpc', tools: ['t1', 't2'], desc: 'Test standard connection',
});

const UUID = '3f1aa8c0-1234-4abc-89ab-0123456789ab';
const el = () => document.getElementById('test-el');
const seed = (rows) => State.set('mcp_connections', rows);

function setupCustomForm(name, url, auth = 'none', transport = 'json-rpc') {
  document.body.innerHTML += `
    <div id="modal-add-mcp" class="open"></div>
    <form id="mcp-custom-form"></form>
    <div id="mcp-error"></div>
    <input id="mcp-name"><input id="mcp-url">
    <select id="mcp-transport"><option value="${transport}">${transport}</option></select>
    <select id="mcp-auth"><option value="${auth}">${auth}</option></select>`;
  document.getElementById('mcp-name').value = name;
  document.getElementById('mcp-url').value = url;
}

function setupZapierForm(url) {
  document.body.innerHTML += `
    <div id="modal-zapier" class="open"></div>
    <form id="zapier-form"></form>
    <div id="zapier-error"></div>
    <input id="zapier-url">`;
  document.getElementById('zapier-url').value = url;
}

beforeEach(() => {
  mockLocalStorage.clear();
  State._reset();
  document.body.innerHTML = '<div id="test-el"></div>';
  removeCalls = [];
  removeImpl = async () => {};
  createCalls = [];
  createImpl = async (row) => ({ ...row, id: DB_UUID });
  updateCalls = [];
  updateImpl = async (id, changes) => ({ id, name: 'Zapier', catalog_id: 'zapier', available_tools: [], ...changes });
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

describe('IntegrationsView._connectMcp (standard / persisted)', () => {
  it('seeds State from the returned DB row so the id is the real UUID', async () => {
    State.set('user', { id: 'u1' });
    await IntegrationsView._connectMcp('teststd', el());
    const conns = State.get('mcp_connections');
    expect(conns).toHaveLength(1);
    expect(conns[0].id).toBe(DB_UUID);
    expect(IntegrationsView._isPersistedId(conns[0].id)).toBe(true);
    expect(createCalls[0]).toMatchObject({ catalog_id: 'teststd', name: 'Test Std', status: 'connected' });
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'MCP Connected' }));
  });

  it('adds nothing and warns when the insert fails', async () => {
    createImpl = async () => { throw new Error('insert failed'); };
    State.set('user', { id: 'u1' });
    await IntegrationsView._connectMcp('teststd', el());
    expect(State.get('mcp_connections') || []).toHaveLength(0);
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Connection failed', type: 'error' }));
  });

  it('keeps a local-only mc- row when signed out (no DB to persist to)', async () => {
    await IntegrationsView._connectMcp('teststd', el());
    const conns = State.get('mcp_connections');
    expect(conns).toHaveLength(1);
    expect(conns[0].id.startsWith('mc-')).toBe(true);
    expect(createCalls).toHaveLength(0);
  });

  it('ignores a re-entrant click while an insert is in flight', async () => {
    State.set('user', { id: 'u1' });
    let release;
    createImpl = () => new Promise((res) => { release = res; });
    const p1 = IntegrationsView._connectMcp('teststd', el());
    const p2 = IntegrationsView._connectMcp('teststd', el());
    await p2;
    expect(createCalls).toHaveLength(1);
    release({ id: DB_UUID, name: 'Test Std', catalog_id: 'teststd', status: 'connected', available_tools: ['t1'] });
    await p1;
    expect(State.get('mcp_connections')).toHaveLength(1);
    expect(State.get('mcp_connections')[0].id).toBe(DB_UUID);
  });
});

describe('IntegrationsView._addCustomMcp', () => {
  const ev = { preventDefault() {} };

  it('seeds State from the returned DB row (real UUID, reconciled)', async () => {
    State.set('user', { id: 'u1' });
    setupCustomForm('My MCP', 'https://x.example.com');
    await IntegrationsView._addCustomMcp(ev, el());
    const conns = State.get('mcp_connections');
    expect(conns).toHaveLength(1);
    expect(conns[0].id).toBe(DB_UUID);
    expect(IntegrationsView._isPersistedId(conns[0].id)).toBe(true);
    expect(createCalls[0]).toMatchObject({ name: 'My MCP', server_url: 'https://x.example.com', status: 'connected' });
  });

  it('keeps the modal open with an error when the insert fails', async () => {
    createImpl = async () => { throw new Error('insert failed'); };
    State.set('user', { id: 'u1' });
    setupCustomForm('My MCP', 'https://x.example.com');
    await IntegrationsView._addCustomMcp(ev, el());
    expect(State.get('mcp_connections') || []).toHaveLength(0);
    expect(document.getElementById('mcp-error').textContent).toMatch(/could not save/i);
  });

  it('validates name and url before any DB write', async () => {
    State.set('user', { id: 'u1' });
    setupCustomForm('', '');
    await IntegrationsView._addCustomMcp(ev, el());
    expect(createCalls).toHaveLength(0);
    expect(document.getElementById('mcp-error').textContent).toMatch(/required/i);
  });
});

describe('IntegrationsView._connectZapier', () => {
  const ev = { preventDefault() {} };
  const ZURL = 'https://mcp.zapier.com/api/mcp/s/abc/sse';

  it('has a zapier catalog entry to build the connection from', () => {
    expect(IntegrationsView.MCP_CATALOG.find((m) => m.id === 'zapier')).toBeTruthy();
  });

  it('rejects a non-zapier url with no DB write', async () => {
    State.set('user', { id: 'u1' });
    setupZapierForm('https://evil.example.com/');
    await IntegrationsView._connectZapier(ev, el());
    expect(createCalls).toHaveLength(0);
    expect(document.getElementById('zapier-error').textContent).toMatch(/mcp\.zapier\.com/);
  });

  it('seeds State from the returned row (real UUID) on a fresh connect', async () => {
    State.set('user', { id: 'u1' });
    setupZapierForm(ZURL);
    await IntegrationsView._connectZapier(ev, el());
    const conns = State.get('mcp_connections');
    expect(conns).toHaveLength(1);
    expect(conns[0].id).toBe(DB_UUID);
    expect(createCalls[0]).toMatchObject({ catalog_id: 'zapier', server_url: ZURL });
  });

  it('reconciles an in-session mc- row to the persisted UUID on reconnect (no duplicate)', async () => {
    State.set('user', { id: 'u1' });
    seed([{ id: 'mc-9', name: 'Zapier', catalog_id: 'zapier', server_url: 'https://mcp.zapier.com/old', status: 'connected' }]);
    setupZapierForm(ZURL);
    await IntegrationsView._connectZapier(ev, el());
    const conns = State.get('mcp_connections');
    expect(conns).toHaveLength(1);
    expect(conns[0].id).toBe(DB_UUID);
    expect(createCalls).toHaveLength(1);
  });

  it('updates an existing persisted row in place on reconnect', async () => {
    State.set('user', { id: 'u1' });
    seed([{ id: UUID, name: 'Zapier', catalog_id: 'zapier', server_url: 'https://mcp.zapier.com/old', status: 'connected' }]);
    setupZapierForm(ZURL);
    await IntegrationsView._connectZapier(ev, el());
    const conns = State.get('mcp_connections');
    expect(conns).toHaveLength(1);
    expect(conns[0].id).toBe(UUID);
    expect(conns[0].server_url).toBe(ZURL);
    expect(updateCalls[0].id).toBe(UUID);
    expect(createCalls).toHaveLength(0);
  });

  it('leaves State unchanged and warns when the save fails', async () => {
    createImpl = async () => { throw new Error('insert failed'); };
    State.set('user', { id: 'u1' });
    setupZapierForm(ZURL);
    await IntegrationsView._connectZapier(ev, el());
    expect(State.get('mcp_connections') || []).toHaveLength(0);
    expect(document.getElementById('zapier-error').textContent).toMatch(/could not save/i);
  });
});
