/**
 * Router + sign-in callbacks.
 *
 * Supabase returns OAuth and password-reset sign-ins as a URL fragment
 * (#access_token=…&refresh_token=…). That fragment isn't a route: the router
 * must show home while Supabase reads and clears it, and must never print it
 * on a Page Not Found. Loads the real router (the older router.test.js tests
 * copies of its logic).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

function loadScriptGlobal(relativePath) {
  let code = readFileSync(resolve(__dirname_local, '..', relativePath), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// jsdom has no matchMedia; the router's transitions ask about reduced motion.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

loadScriptGlobal('lib/utils.js');
loadScriptGlobal('lib/router.js');

const CALLBACK = 'access_token=secret-access&expires_in=3600&refresh_token=secret-refresh&token_type=bearer';
const host = document.createElement('div');

beforeAll(() => {
  Router.on('/', { title: 'Home', render: (el) => { el.innerHTML = '<p>Home view</p>'; } });
  Router.init(host);
});
beforeEach(() => {
  window.location.hash = '';
});

describe('Router.path() with sign-in callbacks', () => {
  it('reads an implicit-grant fragment as home', () => {
    window.location.hash = `#${CALLBACK}`;
    expect(Router.path()).toBe('/');
  });

  it('reads a fragment behind an old #/ return address as home', () => {
    window.location.hash = `#/#${CALLBACK}`;
    expect(Router.path()).toBe('/');
  });

  it('reads a provider error fragment as home', () => {
    window.location.hash = '#error=access_denied&error_code=403&error_description=User+denied';
    expect(Router.path()).toBe('/');
  });

  it('still parses ordinary routes and their queries', () => {
    window.location.hash = '#/bridge?tab=missions';
    expect(Router.path()).toBe('/bridge');
  });
});

describe('Router Page Not Found', () => {
  it('shows home, not Page Not Found, for a callback, and never prints the tokens', () => {
    window.location.hash = `#/#${CALLBACK}`;
    Router.refresh();
    expect(host.textContent).toContain('Home view');
    expect(host.textContent).not.toContain('secret-access');
    expect(host.textContent).not.toContain('secret-refresh');
  });

  it('escapes the unmatched path', () => {
    window.location.hash = '#/missing&page';
    Router.refresh();
    expect(host.querySelector('code').textContent).toBe('/missing&page');
    expect(host.innerHTML).toContain('/missing&amp;page');
  });
});
