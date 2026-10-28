/**
 * IntegrationsView OAuth start tests
 * Locks the connect contract: the app asks the *-oauth function's POST /start
 * for a consent URL with the user's JWT (never a user id in a link), lets the
 * response set the browser-binding cookie, and only then leaves for the
 * provider. Any failure stays in the app with an error toast.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(__dirname_local, '..', 'views/integrations.js');

const _store = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => _store[key] ?? null,
    setItem: (key, val) => { _store[key] = String(val); },
    removeItem: (key) => { delete _store[key]; },
    clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
  },
  writable: true,
});

globalThis.State = (() => {
  const _data = {};
  return {
    get: (key) => _data[key],
    set: (key, val) => { _data[key] = val; },
    on: () => {},
    off: () => {},
    _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); },
  };
})();

globalThis.Utils = { esc: (s) => String(s == null ? '' : s) };

let session = null;
globalThis.SB = {
  url: 'https://x.supabase.co', client: null, isReady: () => false, isOnline: () => true,
  db: () => ({ list: async () => [], create: async (r) => r, update: async () => null, get: async () => null, remove: async () => {} }),
  auth: { getSession: async () => session },
  realtime: { subscribe: () => null, unsubscribe: () => {} },
};

globalThis.Router = { navigate: vi.fn(), path: () => '/security', on: () => {}, init: () => {}, replace: () => {} };
globalThis.Notify = { send: vi.fn(), init: () => {} };

const START_PAGE = 'https://nicespaceship.ai/app/#/security';
const loc = { origin: 'https://nicespaceship.ai', href: START_PAGE };
Object.defineProperty(window, 'location', { value: loc, configurable: true, writable: true });

globalThis.fetch = vi.fn();

function loadScriptGlobal(relativePath) {
  let code = readFileSync(resolve(__dirname_local, '..', relativePath), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadScriptGlobal('views/integrations.js');

const BASE = 'https://api.nicespaceship.ai/functions/v1/github-oauth';
const CONSENT = 'https://github.com/login/oauth/authorize?client_id=abc&state=signed';
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const lastToast = () => Notify.send.mock.calls.at(-1)?.[0];

beforeEach(() => {
  State._reset();
  State.set('user', { id: 'user-1', email: 'ben@example.com' });
  session = { access_token: 'jwt-abc' };
  loc.href = START_PAGE;
  fetch.mockReset();
  Notify.send.mockClear();
});

describe('IntegrationsView._initiateOAuthGeneric', () => {
  it('asks /start with the JWT and the app redirect, then goes to the consent URL', async () => {
    fetch.mockResolvedValue(reply(200, { url: CONSENT }));
    await IntegrationsView._initiateOAuthGeneric('GitHub', BASE);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/start`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer jwt-abc');
    expect(JSON.parse(init.body)).toEqual({ redirect_url: 'https://nicespaceship.ai/app/#/security' });
    expect(url).not.toContain('user_id');
    expect(init.body).not.toContain('user-1');
    expect(loc.href).toBe(CONSENT);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in and calls nothing', async () => {
    State.set('user', null);
    await IntegrationsView._initiateOAuthGeneric('GitHub', BASE);
    expect(fetch).not.toHaveBeenCalled();
    expect(lastToast()).toMatchObject({ title: 'Sign In Required', message: 'Please sign in to connect GitHub.' });
    expect(loc.href).toBe(START_PAGE);
  });

  it('stays put when there is no session token', async () => {
    session = null;
    await IntegrationsView._initiateOAuthGeneric('GitHub', BASE);
    expect(fetch).not.toHaveBeenCalled();
    expect(lastToast()).toMatchObject({ title: 'Connection failed', type: 'error' });
    expect(loc.href).toBe(START_PAGE);
  });

  it('stays put when /start refuses', async () => {
    fetch.mockResolvedValue(reply(401, { error: 'Sign in to connect GitHub.' }));
    await IntegrationsView._initiateOAuthGeneric('GitHub', BASE);
    expect(lastToast()).toMatchObject({ title: 'Connection failed', message: 'Could not start connecting GitHub, please try again.' });
    expect(loc.href).toBe(START_PAGE);
  });

  it('stays put when the request itself fails', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await IntegrationsView._initiateOAuthGeneric('GitHub', BASE);
    expect(lastToast()).toMatchObject({ title: 'Connection failed' });
    expect(loc.href).toBe(START_PAGE);
  });

  it('never navigates to a non-https consent URL', async () => {
    for (const bad of ['javascript:alert(1)', 'http://github.com/login', '', null]) {
      fetch.mockResolvedValue(reply(200, { url: bad }));
      await IntegrationsView._initiateOAuthGeneric('GitHub', BASE);
      expect(loc.href).toBe(START_PAGE);
    }
  });
});

describe('integrations.js source', () => {
  it('never builds an /authorize link or puts a user id in a URL', () => {
    const src = readFileSync(SOURCE_PATH, 'utf-8');
    expect(src).not.toMatch(/\/authorize\b/);
    expect(src).not.toMatch(/user_id=/);
  });
});
