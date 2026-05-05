/**
 * HomeView integration tests
 * Tests Claude-style chat home page rendering.
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

// Mock Utils
globalThis.Utils = {
  esc: (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  timeAgo: () => 'just now',
  // HomeView gates chat-history reads on this. Tests want the gate to PASS
  // by default (so the existing assertions about message rendering still
  // hold); the leak case is covered by an explicit "no auth" test below.
  hasAuthSession: () => true,
  KEYS: {
    aiMessages: 'nice-ai-messages',
    conversations: 'nice-conversations',
    activeConv: 'nice-active-conv',
  },
};

// Mock PromptPanel
globalThis.PromptPanel = {
  init: () => {}, show: () => {}, hide: () => {}, syncRoute: () => {},
  prefill: () => {}, toggle: () => {}, destroy: () => {},
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
  it('has title "NICE"', () => {
    expect(HomeView.title).toBe('NICE SPACESHIP');
  });

  it('renders without crashing when State is empty', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'pilot@test.com' });
    expect(() => HomeView.render(el)).not.toThrow();
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders greeting with display name', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'pilot@test.com', user_metadata: { display_name: 'TestPilot' } });
    HomeView.render(el);
    expect(el.innerHTML).toContain('TestPilot');
  });

  it('handles missing user gracefully', () => {
    const el = document.getElementById('test-el');
    expect(() => HomeView.render(el)).not.toThrow();
  });

  it('renders the chat-home container', () => {
    const el = document.getElementById('test-el');
    HomeView.render(el);
    const wrap = el.querySelector('.chat-home');
    expect(wrap).toBeTruthy();
  });

  it('shows greeting in empty state', () => {
    const el = document.getElementById('test-el');
    HomeView.render(el);
    const greeting = el.querySelector('.chat-home-greeting');
    expect(greeting).toBeTruthy();
    expect(greeting.textContent).toMatch(/Good (morning|afternoon|evening)/);
  });

  it('does not render action pills', () => {
    const el = document.getElementById('test-el');
    HomeView.render(el);
    const pills = el.querySelectorAll('.chat-pill');
    expect(pills.length).toBe(0);
  });

  it('renders conversation when messages exist', () => {
    mockLocalStorage.setItem('nice-ai-messages', JSON.stringify([
      { role: 'user', text: 'hello', ts: Date.now() },
      { role: 'assistant', text: 'Hi there', agent: 'NICE', ts: Date.now() },
    ]));
    const el = document.getElementById('test-el');
    HomeView.render(el);
    const feed = el.querySelector('.chat-home-feed');
    expect(feed).toBeTruthy();
    expect(feed.innerHTML).toContain('hello');
  });

  it('renders for user without display_name', () => {
    const el = document.getElementById('test-el');
    State.set('user', { id: 'u1', email: 'someone@example.com' });
    expect(() => HomeView.render(el)).not.toThrow();
    expect(el.innerHTML).toContain('someone');
  });

  it('has a destroy method that does not throw', () => {
    expect(() => HomeView.destroy()).not.toThrow();
  });

  it('renders greeting without buttons when no messages', () => {
    const el = document.getElementById('test-el');
    HomeView.render(el);
    // No messages = empty greeting, no buttons in HomeView itself
    const greeting = el.querySelector('.chat-home-greeting');
    expect(greeting).toBeTruthy();
  });

  it('shows new chat button when messages exist', () => {
    mockLocalStorage.setItem('nice-ai-messages', JSON.stringify([
      { role: 'user', text: 'test', ts: Date.now() },
    ]));
    const el = document.getElementById('test-el');
    HomeView.render(el);
    const newBtn = el.querySelector('#chat-home-new');
    expect(newBtn).toBeTruthy();
  });

  // Regression: signed-out cockpit on a shared browser was rendering the
  // previous account's chat history straight from localStorage (observed on
  // prod 2026-05-05). HomeView now gates the read on Utils.hasAuthSession.
  describe('signed-out cache leak gate', () => {
    it('suppresses chat history when Utils.hasAuthSession returns false', () => {
      const original = Utils.hasAuthSession;
      Utils.hasAuthSession = () => false;
      try {
        mockLocalStorage.setItem('nice-ai-messages', JSON.stringify([
          { role: 'user', text: 'leaked from prior account', ts: Date.now() },
          { role: 'assistant', text: 'leaked reply', agent: 'NICE', ts: Date.now() },
        ]));
        const el = document.getElementById('test-el');
        HomeView.render(el);
        // Empty-state greeting renders, the leaked content does not.
        expect(el.innerHTML).not.toContain('leaked from prior account');
        expect(el.innerHTML).not.toContain('leaked reply');
        expect(el.querySelector('#chat-home-new')).toBeNull();
        expect(el.querySelector('.chat-home-greeting')).toBeTruthy();
      } finally {
        Utils.hasAuthSession = original;
      }
    });
  });
});
