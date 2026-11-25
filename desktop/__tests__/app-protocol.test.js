// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const { resolveAppRequest, CSP, ORIGIN, cspFor, isAppPage, replacesAppPage } = require('../app-protocol.js');

const ROOT = path.resolve('/repo');

describe('nice:// maps to the served folders only', () => {
  it('serves app, public and assets files with their types', () => {
    expect(resolveAppRequest(ORIGIN + '/app/index.html', ROOT)).toEqual({ file: path.join(ROOT, 'app/index.html'), mime: 'text/html; charset=utf-8', isDocument: true });
    expect(resolveAppRequest(ORIGIN + '/public/css/theme.css?v=55', ROOT)).toMatchObject({ file: path.join(ROOT, 'public/css/theme.css'), mime: 'text/css; charset=utf-8', isDocument: false });
    expect(resolveAppRequest(ORIGIN + '/assets/nice-mark.svg', ROOT).mime).toBe('image/svg+xml');
    expect(resolveAppRequest(ORIGIN + '/app/', ROOT).file).toBe(path.join(ROOT, 'app/index.html'));
  });

  it('refuses other folders, other hosts and escapes', () => {
    for (const bad of [
      ORIGIN + '/desktop/main.js',
      ORIGIN + '/.env',
      ORIGIN + '/',
      ORIGIN + '/app/../desktop/main.js',
      ORIGIN + '/app/%2e%2e/desktop/main.js',
      ORIGIN + '/app/..%2fdesktop/main.js',
      ORIGIN + '/app/..%5cdesktop/main.js',
      ORIGIN + '/app/..%2fassets/nice-mark.svg',
      ORIGIN + '/public/..%2fapp/index.html',
      ORIGIN + '/assets/x/..%2f..%2fapp/index.html',
      ORIGIN + '/app/x%00.js',
      ORIGIN + '/app/%E0%A4%A',
      'nice://other/app/index.html',
      'file:///repo/app/index.html',
      'not a url',
    ]) {
      expect(resolveAppRequest(bad, ROOT), bad).toBeNull();
    }
  });
});

describe('the Code bridge answers NICE\'s own page only', () => {
  it('accepts the app page, with any query or hash', () => {
    for (const ok of [
      ORIGIN + '/app/',
      ORIGIN + '/app/index.html',
      ORIGIN + '/app/#/space',
      ORIGIN + '/app/index.html?v=3#/crew?ship=1',
    ]) expect(isAppPage(ok), ok).toBe(true);
  });

  it('refuses other pages under /app/, other hosts and schemes', () => {
    for (const bad of [
      ORIGIN + '/app/preview.html',
      ORIGIN + '/app/app/index.html',
      ORIGIN + '/app/js/nice.js',
      ORIGIN + '/app',
      ORIGIN + '/',
      ORIGIN + '/public/index.html',
      ORIGIN + '/app/%69ndex.html',
      'nice://other/app/',
      'nice://x@app/app/',
      'https://nicespaceship.ai/app/',
      'file:///repo/app/index.html',
      'about:blank',
      '',
      null,
    ]) expect(isAppPage(bad), String(bad)).toBe(false);
  });
});

describe('which navigations stop a page\'s commands', () => {
  const nav = (url, extra = {}) => ({ url, isMainFrame: true, isSameDocument: false, ...extra });

  it('a reload or another nice://app/ document in the main frame', () => {
    expect(replacesAppPage(nav(ORIGIN + '/app/'))).toBe(true);
    expect(replacesAppPage(nav(ORIGIN + '/'))).toBe(true);
  });

  it('not links will-navigate cancels, hash changes or frames', () => {
    for (const url of ['https://checkout.stripe.com/c/pay/x', 'https://accounts.google.com/o/oauth2', 'mailto:hello@example.com', 'tel:+15550100', 'https://nicespaceship.ai/']) {
      expect(replacesAppPage(nav(url)), url).toBe(false);
    }
    expect(replacesAppPage(nav(ORIGIN + '/app/#/crew', { isSameDocument: true }))).toBe(false);
    expect(replacesAppPage(nav(ORIGIN + '/app/', { isMainFrame: false }))).toBe(false);
    expect(replacesAppPage(null)).toBe(false);
  });
});

describe('the page policy', () => {
  it('runs only NICE\'s own scripts: nothing inline, no eval, no other origin', () => {
    const script = CSP.split('; ').find(d => d.startsWith('script-src'));
    expect(script).toBe("script-src 'self'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("base-uri 'self'");
    expect(CSP).toContain("frame-ancestors 'none'");
  });

  it('allows the inline scripts written in the page by hash, and nothing else inline', () => {
    const csp = cspFor('<p>x</p><script>\n  hello();\n</script><script src="a.js"></script>');
    const script = csp.split('; ').find(d => d.startsWith('script-src'));
    expect(script).toMatch(/^script-src 'self' 'sha256-[A-Za-z0-9+/=]+'$/);
    expect(script).not.toContain('unsafe');
  });

  it('connects only to NICE\'s own API hosts', () => {
    const connect = CSP.split('; ').find(d => d.startsWith('connect-src'));
    expect(connect).not.toContain('*');
    expect(connect).toContain('https://api.nicespaceship.ai');
    expect(connect).toContain('https://zacllshbgmnwsmliteqx.supabase.co');
  });
});
