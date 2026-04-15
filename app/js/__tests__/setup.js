/**
 * NICE SPACESHIP Test Setup
 * Provides mock localStorage, State, and DOM helpers for unit tests.
 * Loads IIFE modules via eval to match browser <script> tag behavior.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// Mock localStorage
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

// Mock crypto.randomUUID
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/** Load a script file into globalThis (like a browser <script> tag) */
function loadScript(relativePath) {
  const absPath = resolve(__dirname_local, '..', relativePath);
  const code = readFileSync(absPath, 'utf-8');
  // eval in global scope so `const X = (() => {...})()` defines globalThis.X
  const script = new Function(code.replace(/^const (\w+)/m, 'globalThis.$1'));
  script();
}

/** Load a script preserving all top-level const declarations as globals */
function loadScriptGlobal(relativePath) {
  const absPath = resolve(__dirname_local, '..', relativePath);
  let code = readFileSync(absPath, 'utf-8');
  // Replace top-level `const X =` with `globalThis.X =`
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Mock SB (Supabase client stub — needed by Notify and views)
globalThis.SB = {
  client: null,
  db: () => ({
    list: async () => [],
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({}),
    get: async () => null,
  }),
  auth: () => ({ getUser: async () => ({ data: null }) }),
};

// Mock Router
globalThis.Router = {
  navigate: () => {},
  path: () => '/',
  on: () => {},
  init: () => {},
};

// Mock Theme (needed by CommandPalette)
globalThis.Theme = {
  set: () => {},
  get: () => 'spaceship',
};

// Mock Keyboard (needed by CommandPalette)
globalThis.Keyboard = {
  showHelp: () => {},
};

// Mock State module
globalThis.State = (() => {
  const _data = {};
  const _listeners = {};
  return {
    get: (key) => _data[key],
    set: (key, val) => {
      _data[key] = val;
      (_listeners[key] || []).forEach(fn => fn(val));
    },
    setBatched: (obj) => {
      Object.entries(obj).forEach(([k, v]) => globalThis.State.set(k, v));
    },
    on: (key, fn) => {
      _listeners[key] = _listeners[key] || [];
      _listeners[key].push(fn);
    },
    off: (key, fn) => {
      _listeners[key] = (_listeners[key] || []).filter(f => f !== fn);
    },
    _reset: () => {
      Object.keys(_data).forEach(k => delete _data[k]);
      Object.keys(_listeners).forEach(k => delete _listeners[k]);
    },
  };
})();

// Load real IIFE modules into global scope (order matters for dependencies)
loadScriptGlobal('lib/utils.js');
loadScriptGlobal('lib/audit-log.js');
loadScriptGlobal('lib/onboarding.js');  // Depends on AuditLog + State (both already available)
loadScriptGlobal('lib/notify.js');      // Before Gamification (Gamification calls Notify.send)
loadScriptGlobal('lib/gamification.js');
loadScriptGlobal('lib/data-io.js');
loadScriptGlobal('lib/command-palette.js');
loadScriptGlobal('lib/blueprint-markdown.js');
loadScriptGlobal('lib/prompt-builder.js');
loadScriptGlobal('lib/mission-router.js');
loadScriptGlobal('lib/tool-registry.js');
loadScriptGlobal('lib/virtual-fs.js');
loadScriptGlobal('lib/browser-tools.js');
loadScriptGlobal('lib/blueprint-utils.js');
loadScriptGlobal('lib/card-renderer.js');
loadScriptGlobal('lib/agent-memory.js');
loadScriptGlobal('lib/ship-behaviors.js');
loadScriptGlobal('lib/mcp-bridge.js');
loadScriptGlobal('lib/model-intel.js');
loadScriptGlobal('lib/agent-executor.js');

// Reset helper
beforeEach(() => {
  mockLocalStorage.clear();
  globalThis.State._reset();
});
