/**
 * CoreReactor — the reactor shows only while the active theme has one.
 *
 * NICE sets `reactor:false` in THEMES, so a view's setVisible(true) must not
 * show it there, and a theme switch must re-evaluate: HAL → NICE hides it,
 * NICE → HAL brings it back without the view asking again.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

const STUB_THEMES = {
  nice: { id: 'nice', reactor: false },
  'hal-9000': { id: 'hal-9000', reactor: { html: () => '<div class="hal-eye"></div>' } },
};
let THEMES = STUB_THEMES;
let active = 'nice';
globalThis.Theme = {
  current: () => active,
  getTheme: (id) => THEMES[id] || null,
};

// The real THEMES SSOT: evaluate only the Theme IIFE out of nice.js (the
// rest of the file boots the app). Reactor markup builders are stubbed.
function loadRealThemes() {
  const src = readFileSync(resolve(__dirname_local, '..', 'nice.js'), 'utf-8');
  const start = src.indexOf('const Theme = (() => {');
  const end = src.indexOf('\n})();', start) + '\n})();'.length;
  const stubs = 'const DefaultCore = { html: () => "<i class=default-core></i>" };'
    + 'const HalCore = { html: () => "<i class=hal-core></i>" };'
    + 'const JarvisHUD = { hud: () => "<i class=jv-hud></i>", arcReactor: () => "" };';
  // eslint-disable-next-line no-new-func
  const RealTheme = new Function(stubs + src.slice(start, end) + '\nreturn Theme;')();
  return Object.fromEntries(RealTheme.THEMES.map(t => [t.id, t]));
}

function loadCoreReactor() {
  const code = readFileSync(resolve(__dirname_local, '..', 'lib/core-reactor.js'), 'utf-8');
  const patched = code.replace(/^const CoreReactor/m, 'globalThis.CoreReactor');
  // eslint-disable-next-line no-new-func
  new Function(patched)();
}

loadCoreReactor();

const visible = () => document.documentElement.classList.contains('reactor-visible');
const reactor = () => document.getElementById('jv-pp-reactor');

beforeEach(() => {
  THEMES = STUB_THEMES;
  active = 'nice';
  CoreReactor.setVisible(false);
  CoreReactor.paint();
});

describe('CoreReactor visibility follows the theme', () => {
  it('never shows the reactor while NICE (reactor:false) is active', () => {
    CoreReactor.setVisible(true);
    expect(visible()).toBe(false);
    expect(reactor().innerHTML).toBe('');
  });

  it('shows it for a theme that registers one', () => {
    active = 'hal-9000';
    CoreReactor.paint();
    CoreReactor.setVisible(true);
    expect(visible()).toBe(true);
    expect(reactor().innerHTML).toContain('hal-eye');
  });

  it('re-evaluates on a theme switch without the view asking again', () => {
    active = 'hal-9000';
    CoreReactor.paint();
    CoreReactor.setVisible(true);
    expect(visible()).toBe(true);

    active = 'nice';
    CoreReactor.paint();
    expect(visible()).toBe(false);

    active = 'hal-9000';
    CoreReactor.paint();
    expect(visible()).toBe(true);
  });

  it('stays hidden after a view hides it, whatever the theme', () => {
    active = 'hal-9000';
    CoreReactor.paint();
    CoreReactor.setVisible(true);
    CoreReactor.setVisible(false);
    CoreReactor.paint();
    expect(visible()).toBe(false);
  });
});

describe('THEMES SSOT', () => {
  const real = loadRealThemes();

  it('turns the reactor off for both NICE themes', () => {
    expect(real.nice.reactor).toBe(false);
    expect(real['nice-dark'].reactor).toBe(false);
  });

  it('keeps a reactor on every other theme, and CoreReactor shows it', () => {
    const others = Object.keys(real).filter(id => id !== 'nice' && id !== 'nice-dark');
    expect(others.length).toBeGreaterThanOrEqual(10);
    THEMES = real;
    for (const id of others) {
      expect(typeof real[id].reactor.html).toBe('function');
      active = id;
      CoreReactor.paint();
      CoreReactor.setVisible(true);
      expect(visible()).toBe(true);
      expect(reactor().innerHTML).not.toBe('');
    }
    for (const id of ['nice', 'nice-dark']) {
      active = id;
      CoreReactor.paint();
      expect(visible()).toBe(false);
      expect(reactor().innerHTML).toBe('');
    }
  });
});
