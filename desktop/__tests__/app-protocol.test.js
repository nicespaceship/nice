// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const { resolveAppRequest, CSP, ORIGIN, cspFor } = require('../app-protocol.js');

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
