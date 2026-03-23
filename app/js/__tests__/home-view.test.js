/**
 * HomeView integration tests
 * Tests dashboard rendering, widget display, and graceful State handling.
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

// Mock SB
globalThis.SB = {
  client: null, isReady: () => false, isOnline: () => true,
  db: () => ({ list: async () => [], create: async () => ({}), update: async () => ({}), get: async () => null }),
  realtime: { subscribe: () => null, unsubscribe: () => {} },
};

// Mock Router
globalThis.Router = { navigate: vi.fn(), path: () => '/', on: () => {}, init: () => {} };

// Mock modules that HomeView may reference
globalThis.Gamification = {
  getRank: () => ({ name: 'Ensign' }), getXP: () => 0,
  getCurrentClass: () => ({ id: 'class-1', maxRarity: 'Common', slots: Array.from({length:6}, (_,i) => ({ id:i, maxRarity:'Common', label:'Agent '+i })) }), getSpaceshipClass: () => ({ id: 'class-1', maxRarity: 'Common', slots: Array.from({length:6}, (_,i) => ({ id:i, maxRarity:'Common', label:'Agent '+i })) }),
  renderResourceBar: () => '<div class="resource-bar"></div>',
  renderRankBadge: () => '<span class="rank-badge">Ensign</span>',
  addXP: () => {}, checkAchievements: () => {}, unlockAchievement: () => {},
  getStreak: () => ({ current: 0, best: 0 }),
  calcAgentRarity: () => ({ name: 'Common' }),
  canSlotAccept: () => true,
  _toStardate: () => '2026.072',
  SPACESHIP_CLASSES: [], RARITY_THRESHOLDS: [],
};
globalThis.AuditLog = { log: () => {}, getEntries: () => [], count: () => 0 };
globalThis.BlueprintStore = {
  listAgents: () => [], listSpaceships: () => [], getAgent: () => null, getSpaceship: () => null, init: () => {},
  // Activation API
  activateAgent: () => {}, deactivateAgent: () => {}, isAgentActivated: () => false,
  getActivatedAgentIds: () => [], getActivatedAgents: () => [],
  activateShip: () => {}, deactivateShip: () => {}, isShipActivated: () => false,
  getActivatedShipIds: () => [], getActivatedShips: () => [],
  getShipState: () => null, saveShipState: () => {},
  deactivateAllAgents: () => {}, deactivateAllShips: () => {},
};
globalThis.Notify = { send: () => {}, init: () => {} };

// Load HomeView
function loadScriptGlobal(relativePath) {
  const absPath = resolve(__dirname_local, '..', relativePath);
  let code = readFileSync(absPath, 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

beforeEach(() => {
  mockLocalStorage.clear();
  globalThis.State._reset();
  document.body.innerHTML = '<div id="test-el"></div>';
});

// Load after mocks are in place
loadScriptGlobal('views/home.js');

describe('HomeView', () => {
  it('has a title property', () => {
    expect(HomeView.title).toBe('Bridge');
  });

  it('renders without crashing when State is empty', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'pilot@test.com' });
    expect(() => HomeView.render(el)).not.toThrow();
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders welcome text for authenticated user', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'pilot@test.com', user_metadata: { display_name: 'TestPilot' } });
    HomeView.render(el);
    expect(el.innerHTML.length).toBeGreaterThan(100);
  });

  it('handles missing agents gracefully', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    // agents is undefined in State
    expect(() => HomeView.render(el)).not.toThrow();
  });

  it('handles missing missions gracefully', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    // missions is undefined
    expect(() => HomeView.render(el)).not.toThrow();
  });

  it('handles missing spaceships gracefully', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    expect(() => HomeView.render(el)).not.toThrow();
  });

  it('renders the bridge stats strip', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    HomeView.render(el);
    const stats = el.querySelector('.bridge-stats');
    expect(stats).toBeTruthy();
  });

  it('renders the bridge hero and feed panels', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    HomeView.render(el);
    const hero = el.querySelector('.bridge-hero');
    expect(hero).toBeTruthy();
    const feed = el.querySelector('.bridge-feed');
    expect(feed).toBeTruthy();
  });

  it('contains quick action buttons', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    HomeView.render(el);
    // Should have some actionable buttons
    const buttons = el.querySelectorAll('button, a[href]');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders for user without display_name', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'someone@example.com' });
    expect(() => HomeView.render(el)).not.toThrow();
    expect(el.innerHTML.length).toBeGreaterThan(100);
  });

  it('has a destroy method or handles teardown', () => {
    // destroy is optional but should not throw if called
    if (HomeView.destroy) {
      expect(() => HomeView.destroy()).not.toThrow();
    } else {
      expect(true).toBe(true);
    }
  });

  it('renders the bridge-wrap container', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'a@b.com' });
    HomeView.render(el);
    const wrap = el.querySelector('.bridge-wrap');
    expect(wrap).toBeTruthy();
  });
});
