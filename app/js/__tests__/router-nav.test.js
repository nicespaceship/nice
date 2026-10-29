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
      <a class="side-link" data-nav="home" href="#/">Home</a>
      <a class="side-link" data-nav="chat" href="#/chat">Chat</a>
      <a class="side-link" data-nav="outbox" href="#/outbox">Outbox</a>
      <a class="side-link side-ship" data-ship="s1" href="#/crew?ship=s1">Bakery</a>
    </nav>
    <nav class="app-tabbar">
      <a class="tab" href="#/">Home</a>
      <a class="tab" href="#/crew">Crew</a>
      <a class="tab" href="#/outbox">Outbox</a>
    </nav>`;
});

function current() {
  return [...document.querySelectorAll('[aria-current="page"]')].map(a => a.textContent);
}

describe('Router.syncNav', () => {
  it('marks the link for the current path active, with aria-current', () => {
    history.replaceState(null, '', '#/outbox');
    RealRouter.syncNav();
    expect(current()).toEqual(['Outbox', 'Outbox']);
    expect(document.querySelector('[data-nav="outbox"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-nav="home"]').classList.contains('active')).toBe(false);
  });

  it('follows a replaceState to another route', () => {
    history.replaceState(null, '', '#/outbox');
    RealRouter.syncNav();
    history.replaceState(null, '', '#/bridge?tab=missions');
    RealRouter.syncNav();
    expect(current()).toEqual([]);
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
