/**
 * HomeView tests
 * Home (#/) leads with what needs the user, then their spaceships, then the
 * two ways to start. Counts come from AlertCounts; ships from
 * Blueprints.getUserShips.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

globalThis.State = (() => {
  const _data = {};
  const _listeners = {};
  return {
    get: (key) => _data[key],
    set: (key, val) => { _data[key] = val; (_listeners[key] || []).forEach(fn => fn(val)); },
    on: (key, fn) => { _listeners[key] = _listeners[key] || []; _listeners[key].push(fn); },
    off: (key, fn) => { _listeners[key] = (_listeners[key] || []).filter(f => f !== fn); },
    _count: (key) => (_listeners[key] || []).length,
    _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); Object.keys(_listeners).forEach(k => delete _listeners[k]); },
  };
})();

globalThis.Utils = {
  esc: (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  initials: (name) => {
    const words = String(name || '').replace(/^the\s+/i, '').trim().split(/\s+/).filter(Boolean);
    return words.length ? (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase() : '?';
  },
};

globalThis.Terminology = {
  label: (noun, opts = {}) => {
    const word = opts.plural ? 'Missions' : 'Mission';
    return opts.lowercase ? word.toLowerCase() : word;
  },
};

let counts = {};
globalThis.AlertCounts = { count: (k) => counts[k] || 0 };

let ships = [];
globalThis.Blueprints = { getUserShips: () => ships };

globalThis.Theme = { current: () => 'hal-9000', getTheme: () => ({ persona: { callsign: 'Dave' } }) };

function loadScriptGlobal(relativePath) {
  let code = readFileSync(resolve(__dirname_local, '..', relativePath), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}
loadScriptGlobal('views/home.js');

let el;
beforeEach(() => {
  HomeView.destroy();
  State._reset();
  counts = {};
  ships = [];
  document.body.innerHTML = '<div id="app-view"></div>';
  el = document.getElementById('app-view');
});

describe('HomeView', () => {
  it('is titled Home', () => {
    expect(HomeView.title).toBe('Home');
  });

  it('greets the signed-in user by display name, else the theme callsign', () => {
    HomeView.render(el);
    expect(el.querySelector('.home-title').textContent).toMatch(/, Dave\.$/);

    State.set('user', { user_metadata: { display_name: 'Ben' } });
    HomeView.render(el);
    expect(el.querySelector('.home-title').textContent).toMatch(/, Ben\.$/);
  });

  it('lists what needs the user, each linking to where they act on it', () => {
    counts = { outbox: 3, missions: 1, schematic: 2 };
    HomeView.render(el);
    const needs = [...el.querySelectorAll('.home-need')];
    expect(needs.map(n => n.querySelector('.home-need-text').textContent)).toEqual([
      '3 drafts waiting for your review',
      '1 mission run needs you',
      '2 crew problems to check',
    ]);
    expect(needs.map(n => n.getAttribute('href'))).toEqual(['#/outbox', '#/bridge?tab=missions', '#/crew']);
    expect(el.querySelector('.home-sub').textContent).toBe('Here is what needs you.');
  });

  it('shows no needs section when nothing is waiting', () => {
    HomeView.render(el);
    expect(el.querySelector('.home-needs')).toBeNull();
  });

  it('links each spaceship to its crew view', () => {
    ships = [{ id: 'ship 1', name: 'Sunrise Bakery', category: 'Bakery' }];
    HomeView.render(el);
    const card = el.querySelector('.home-ship');
    expect(card.getAttribute('href')).toBe('#/crew?ship=ship%201');
    expect(card.querySelector('.home-ship-mark').textContent).toBe('SB');
    expect(card.querySelector('.home-ship-meta').textContent).toBe('Bakery');
    expect(el.querySelector('.home-sub').textContent).toBe('Nothing needs you right now.');
  });

  it('does not repeat the name when the category matches it', () => {
    ships = [{ id: 'b', name: 'Bakery', category: 'Bakery' }];
    HomeView.render(el);
    expect(el.querySelector('.home-ship-meta').textContent).toBe('Spaceship');
  });

  it('offers the Library when the user has no spaceship', () => {
    HomeView.render(el);
    expect(el.querySelector('.home-ship')).toBeNull();
    expect(el.querySelector('.home-empty a').getAttribute('href')).toBe('#/library?tab=spaceship');
  });

  it('escapes spaceship names', () => {
    ships = [{ id: 'x', name: '<img src=x onerror=alert(1)>' }];
    HomeView.render(el);
    expect(el.querySelector('.home-ship img')).toBeNull();
  });

  it('re-renders once when watched state changes, and stops after destroy', () => {
    HomeView.render(el);
    expect(el.querySelectorAll('.home-need').length).toBe(0);
    counts = { outbox: 1 };
    State.set('content-queue', [{}]);
    expect(el.querySelectorAll('.home-need').length).toBe(1);

    HomeView.destroy();
    expect(State._count('content-queue')).toBe(0);
  });

  it('subscribes once across repeated renders', () => {
    HomeView.render(el);
    HomeView.render(el);
    expect(State._count('spaceships')).toBe(1);
  });
});
