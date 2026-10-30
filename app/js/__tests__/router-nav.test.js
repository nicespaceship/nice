/**
 * Router nav highlighting (sidebar + mobile tab bar). Router._updateNav is
 * the single owner of .active and aria-current on main-nav links; syncNav
 * re-runs it after a view rewrites the URL with history.replaceState.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// setup.js installs a Router mock; load the real module under its own name.
const RealRouter = (() => {
  const code = readFileSync(resolve(__dirname_local, '..', 'lib/router.js'), 'utf-8');
  return new Function(code.replace(/^const Router\s*=/m, 'return'))();
})();

beforeEach(() => {
  document.body.innerHTML = `
    <nav>
      <a class="side-brand" data-home-link href="#/">NICE</a>
      <a class="side-link" data-nav="space" href="#/space">Space</a>
      <a class="side-link" data-nav="ship" href="#/ship">Ship</a>
      <a class="side-link side-ship" data-ship="s1" href="#/crew?ship=s1">Bakery</a>
    </nav>
    <nav class="app-tabbar">
      <a class="tab" href="#/space">Space</a>
      <a class="tab" href="#/crew">Crew</a>
      <a class="tab" href="#/ship">Ship</a>
    </nav>`;
});

function current() {
  return [...document.querySelectorAll('[aria-current="page"]')].map(a => a.textContent);
}

describe('Router.syncNav', () => {
  it('marks the link for the current path active, with aria-current', () => {
    history.replaceState(null, '', '#/ship');
    RealRouter.syncNav();
    expect(current()).toEqual(['Ship', 'Ship']);
    expect(document.querySelector('[data-nav="ship"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-nav="space"]').classList.contains('active')).toBe(false);
  });

  it('follows a replaceState to another route', () => {
    history.replaceState(null, '', '#/ship');
    RealRouter.syncNav();
    history.replaceState(null, '', '#/bridge?tab=missions');
    RealRouter.syncNav();
    expect(current()).toEqual([]);
  });

  it('marks the NICE mark current on Home only, without .active', () => {
    history.replaceState(null, '', '#/');
    RealRouter.syncNav();
    expect(current()).toEqual(['NICE']);
    expect(document.querySelector('[data-home-link]').classList.contains('active')).toBe(false);
    history.replaceState(null, '', '#/ship');
    RealRouter.syncNav();
    expect(document.querySelector('[data-home-link]').hasAttribute('aria-current')).toBe(false);
  });

  it('never highlights spaceship links (their href carries ?ship=)', () => {
    history.replaceState(null, '', '#/crew?ship=s1');
    RealRouter.syncNav();
    expect(document.querySelector('[data-ship="s1"]').classList.contains('active')).toBe(false);
    expect(current()).toEqual(['Crew']);
  });

  it('announces the sync so spaceship links can highlight themselves', () => {
    const seen = vi.fn();
    window.addEventListener('nice:navsync', seen);
    history.replaceState(null, '', '#/crew');
    RealRouter.syncNav();
    window.removeEventListener('nice:navsync', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].detail.path).toBe('/crew');
  });
});
