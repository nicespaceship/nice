import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// A missing or renamed file fails silently in production: the host answers
// any unknown /app/ path with index.html (200), so a script tag or a
// precache entry pointing nowhere just yields HTML where JS was expected.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const APP = join(ROOT, 'app');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('files the app points to exist', () => {
  it('every local script and stylesheet in index.html', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)].map(m => m[1])
      .filter(u => !/^(https?:|data:|#)/.test(u))
      .map(u => u.split('?')[0]);
    expect(refs.length).toBeGreaterThan(50);
    const missing = refs.filter(u => !existsSync(u.startsWith('/') ? join(ROOT, u) : join(APP, u)));
    expect(missing).toEqual([]);
  });

  it('every entry in the service worker precache list', () => {
    const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
    const list = sw.slice(sw.indexOf('PRECACHE_ASSETS'), sw.indexOf('];', sw.indexOf('PRECACHE_ASSETS')));
    const paths = [...list.matchAll(/'(\/[^']+)'/g)].map(m => m[1]).filter(p => p !== '/app/' && p !== '/');
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.filter(p => !existsSync(join(ROOT, p)))).toEqual([]);
  });
});

describe('the vendored supabase-js', () => {
  it('is byte-identical to the pinned @supabase/supabase-js in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const version = pkg.devDependencies['@supabase/supabase-js'];
    const vendored = join(APP, 'vendor', `supabase-js-${version}.js`);
    expect(existsSync(vendored)).toBe(true);
    expect(sha(vendored)).toBe(sha(join(ROOT, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')));
    expect(readFileSync(join(APP, 'index.html'), 'utf8')).toContain(`./vendor/supabase-js-${version}.js`);
  });
});
