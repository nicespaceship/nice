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

const THEMES = {
  nice: { id: 'nice', reactor: false },
  'hal-9000': { id: 'hal-9000', reactor: { html: () => '<div class="hal-eye"></div>' } },
};
let active = 'nice';
globalThis.Theme = {
  current: () => active,
  getTheme: (id) => THEMES[id] || null,
};

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
