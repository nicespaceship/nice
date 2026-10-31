/**
 * Router nav highlighting (sidebar + mobile tab bar). Router._updateNav is
 * the single owner of .active and aria-current on main-nav links; syncNav
 * re-runs it after a view rewrites the URL with history.replaceState.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('Router on a route with no view', () => {
  // Routes register once: the router keeps the first match for a path.
  const spaceView = { title: 'Space', render: vi.fn((el) => { el.innerHTML = '<p>space</p>'; }), destroy: vi.fn() };
  RealRouter.on('/space', spaceView);
  RealRouter.on('/ship', { title: 'Ship', render: (el) => { el.innerHTML = '<p>ship</p>'; } });
  let host, reduced;
  beforeEach(() => {
    reduced = true;
    window.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
    globalThis.CoreReactor = { setVisible: vi.fn() };
    document.body.insertAdjacentHTML('beforeend', '<div id="app-fixed-tabs"><button>Schematic</button></div><h1 id="app-page-title"></h1>');
    host = document.createElement('div');
    document.body.appendChild(host);
    spaceView.render.mockClear();
    spaceView.destroy.mockClear();
  });
  afterEach(() => { delete globalThis.CoreReactor; });

  it('tears down the previous view and clears its page furniture before Page Not Found', () => {
    history.replaceState(null, '', '#/space');
    RealRouter.init(host);
    expect(host.textContent).toBe('space');
    CoreReactor.setVisible.mockClear();
    history.replaceState(null, '', '#/no-such-place');
    RealRouter.refresh();
    expect(spaceView.destroy).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Page Not Found');
    expect(document.getElementById('app-fixed-tabs').children).toHaveLength(0);
    expect(CoreReactor.setVisible).toHaveBeenCalledWith(false);
    expect(document.title).toBe('Page Not Found — NICE');
    expect(document.getElementById('app-page-title').textContent).toBe('Page Not Found');
    expect(current()).toEqual([]);
    // Leaving the not-found page destroys nothing twice.
    history.replaceState(null, '', '#/space');
    RealRouter.refresh();
    expect(spaceView.destroy).toHaveBeenCalledTimes(1);
  });

  it('cancels the swap still waiting from the route before', () => {
    vi.useFakeTimers();
    try {
      reduced = false; // animated swaps
      history.replaceState(null, '', '#/ship');
      RealRouter.init(host);           // first render is instant
      spaceView.destroy.mockClear();   // the last test left Space drawn
      history.replaceState(null, '', '#/space');
      RealRouter.refresh();            // swap to Space waits 120ms
      vi.advanceTimersByTime(30);
      history.replaceState(null, '', '#/no-such-place');
      RealRouter.refresh();
      vi.advanceTimersByTime(500);
      expect(host.textContent).toContain('Page Not Found');
      expect(spaceView.render).not.toHaveBeenCalled();
      // Space never drew, so it is not torn down either.
      expect(spaceView.destroy).not.toHaveBeenCalled();
      expect(host.classList.contains('view-exit')).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('reports the view it has drawn, and none while a swap is on its way', () => {
    vi.useFakeTimers();
    try {
      reduced = false;
      history.replaceState(null, '', '#/space');
      RealRouter.init(host);
      expect(RealRouter.drawn()).toBe(spaceView);
      history.replaceState(null, '', '#/ship');
      RealRouter.refresh();
      expect(RealRouter.drawn()).toBeNull();
      vi.advanceTimersByTime(500);
      expect(RealRouter.drawn().title).toBe('Ship');
    } finally { vi.useRealTimers(); }
  });

  it('tears down a view once, after its delayed swap drew it', () => {
    vi.useFakeTimers();
    try {
      reduced = false;
      history.replaceState(null, '', '#/ship');
      RealRouter.init(host);
      spaceView.destroy.mockClear();
      history.replaceState(null, '', '#/space');
      RealRouter.refresh();
      vi.advanceTimersByTime(500);     // Space draws
      expect(spaceView.render).toHaveBeenCalledTimes(1);
      history.replaceState(null, '', '#/ship');
      RealRouter.refresh();
      history.replaceState(null, '', '#/no-such-place');
      RealRouter.refresh();            // before Ship's swap draws
      vi.advanceTimersByTime(500);
      expect(spaceView.destroy).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

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
