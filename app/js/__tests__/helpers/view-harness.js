/**
 * NICE — View render-test harness
 *
 * Consolidates the per-file mock stack that home-view.test.js and
 * missions-view.test.js each hand-rolled, so a view test can:
 *   1. install a complete set of global stubs the views expect,
 *   2. load the real view IIFE into globalThis,
 *   3. mount it into a fresh jsdom container, and
 *   4. assert on the rendered DOM + bound listeners.
 *
 * The existing `blueprints.test.js` stubs `BlueprintsView` entirely (it tests
 * the `Blueprints` *lib*), so view render/lifecycle has had no coverage. This
 * harness is the missing piece.
 *
 * The global `setup.js` already provides the real `Utils` plus most leaf libs
 * (TokenConfig, BlueprintUtils, CardRenderer, Gamification, …) and a minimal
 * State/SB/Router. This harness installs *richer* State/SB/Router/Notify stubs
 * (matching the surface real views actually call — onScoped/destroyScoped,
 * SB.realtime, Router.navigate spies) without disturbing the real libs.
 *
 * Usage:
 *   import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';
 *   const mocks = installViewMocks();          // top of file; registers a reset beforeEach
 *   loadModule('lib/stripe-config.js');        // any view-specific deps
 *   loadModule('views/wallet.js');             // the real view
 *
 *   it('renders', async () => {
 *     const { el } = await mountView(WalletView, { state: { user: { id: 'u1' } } });
 *     expect(el.querySelector('.wallet-wrap')).toBeTruthy();
 *   });
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_JS = resolve(HERE, '../..'); // app/js

/**
 * Load an IIFE module file into globalThis, mirroring a browser <script> tag
 * (the same trick setup.js's loadScriptGlobal uses). `relPath` is relative to
 * app/js — e.g. 'views/wallet.js' or 'lib/stripe-config.js'.
 *
 * Works for any top-level `const X = (() => { … })()` module, view or lib.
 */
export function loadModule(relPath) {
  const abs = resolve(APP_JS, relPath);
  let code = readFileSync(abs, 'utf-8');
  // Promote every column-0 `const X =` to `globalThis.X =` so the module
  // publishes itself, exactly as a <script> tag would in the browser. This
  // assumes the file's only column-0 const is its module IIFE (true for every
  // view/lib here); a future module with a second top-level const would also
  // be promoted to a global — usually harmless, but worth knowing.
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  // eslint-disable-next-line no-eval
  eval(code);
}

/**
 * A pub/sub State mock mirroring the real app/js/lib/state.js surface:
 * get/set/on/off/onScoped/destroyScoped/KEYS. `on` fires immediately if the
 * key already has a value (real State does this). Adds a test-only `_reset`.
 *
 * NB: the real State has no `setBatched` despite an older CLAUDE.md note, so
 * this mock deliberately omits it — a view relying on setBatched would fail in
 * production, and the test should fail too.
 */
export function makeState() {
  const _data = {};
  const _subs = {};
  let _scoped = [];

  const off = (key, fn) => {
    if (_subs[key]) _subs[key] = _subs[key].filter(f => f !== fn);
  };
  const on = (key, fn) => {
    (_subs[key] || (_subs[key] = [])).push(fn);
    if (_data[key] !== undefined) fn(_data[key]);
  };

  return {
    get: (key) => _data[key],
    set: (key, val) => {
      _data[key] = val;
      (_subs[key] || []).forEach(fn => fn(val));
    },
    on,
    off,
    onScoped: (key, fn) => { on(key, fn); _scoped.push({ key, fn }); },
    destroyScoped: () => { _scoped.forEach(({ key, fn }) => off(key, fn)); _scoped = []; },
    KEYS: {
      user: 'user', agents: 'agents', missions: 'missions', spaceships: 'spaceships',
      enabledModels: 'enabled_models', notifications: 'notifications', blueprints: 'blueprints',
      activeSkin: 'active_skin', mcpConnections: 'mcp_connections', tokenBalance: 'token_balance',
    },
    _reset: () => {
      for (const k in _data) delete _data[k];
      for (const k in _subs) delete _subs[k];
      _scoped = [];
    },
  };
}

/**
 * A Supabase client mock. `client` is null by default (offline) — views guard
 * on it. Pass overrides to supply a `client` with chained query builders, etc.
 */
export function makeSB(overrides = {}) {
  return {
    client: null,
    isReady: () => false,
    isOnline: () => true,
    db: () => ({
      list: async () => [],
      create: async (row) => ({ ...row }),
      update: async () => ({}),
      get: async () => null,
      remove: async () => {},
    }),
    realtime: { subscribe: () => null, unsubscribe: () => {} },
    auth: () => ({ getUser: async () => ({ data: null }) }),
    ...overrides,
  };
}

/**
 * Install the rich global stubs views expect and register a beforeEach that
 * resets State, localStorage, and document.body between tests. Returns the
 * stub handles so a test can assert on Router.navigate / Notify.send spies or
 * reach into State.
 *
 * @param {object} [opts]
 * @param {string} [opts.path='/']  Router.path() return value
 * @param {object} [opts.sb]        makeSB overrides (e.g. a fake client)
 */
export function installViewMocks(opts = {}) {
  const State = makeState();
  const SB = makeSB(opts.sb);
  const Router = { navigate: vi.fn(), path: () => opts.path || '/', on: () => {}, init: () => {} };
  const Notify = { send: vi.fn(), init: () => {}, badge: () => {} };

  globalThis.State = State;
  globalThis.SB = SB;
  globalThis.Router = Router;
  globalThis.Notify = Notify;

  beforeEach(() => {
    State._reset();
    if (globalThis.localStorage?.clear) globalThis.localStorage.clear();
    Router.navigate.mockClear?.();
    Notify.send.mockClear?.();
    document.body.innerHTML = '';
  });

  return { State, SB, Router, Notify };
}

/**
 * Mount a view into a fresh container appended to document.body.
 *
 * Seeds State with `state` first, creates the host element, then calls
 * `View.render(host, opts)`. Awaits the result so async views (render returns
 * a Promise) are fully painted before the test asserts.
 *
 * @param {{render: Function}} View   the view module (e.g. WalletView)
 * @param {object} [config]
 * @param {object} [config.state]     key→value pairs to seed into State
 * @param {*}      [config.opts]      second arg passed to View.render
 * @returns {Promise<{el: HTMLElement}>}
 */
export async function mountView(View, { state = {}, opts } = {}) {
  for (const [k, v] of Object.entries(state)) globalThis.State.set(k, v);
  const el = document.createElement('div');
  el.className = 'view-host';
  document.body.appendChild(el);
  const r = View.render(el, opts);
  if (r && typeof r.then === 'function') await r;
  return { el };
}
