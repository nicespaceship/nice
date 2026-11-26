import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createHash } from 'crypto';

// The desktop app runs NICE under script-src 'self' plus the hashes of the
// inline <script> blocks written in index.html (desktop/app-protocol.js):
// on*="" handlers, javascript: URLs and eval / new Function do not run
// there. This keeps them out of the app.
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'vendor' || /\.bundle(\.min)?\.js$/.test(name)) continue;
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|html)$/.test(name)) out.push(p);
  }
  return out;
}

const sources = [join(APP, 'index.html'), ...files(join(APP, 'js'))].map(p => ({ p: relative(APP, p), s: readFileSync(p, 'utf8') }));

describe('NICE runs without inline script or eval', () => {
  it('has no on*= event handler attributes or javascript: links', () => {
    const patterns = [
      /\son[a-z]+\s*=\s*["'{]/g,                   // onclick="…" / onclick='…'
      /<[^>]*\son[a-z]+=[^\s"'>][^>]*>/g,           // onclick=foo (unquoted, in markup)
      /setAttribute\(\s*['"]on[a-z]+['"]/g,           // el.setAttribute('onclick', …)
      /href\s*=\s*["'`]\s*javascript:/gi,           // <a href="javascript:…">
    ];
    const hits = sources.flatMap(({ p, s }) => patterns.flatMap(re => (s.match(re) || []).map(m => p + ': ' + m.trim().slice(0, 80))));
    expect(hits).toEqual([]);
  });

  it('allows each inline <script> block in index.html by hash in the desktop policy', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8');
    const { cspFor } = createRequire(import.meta.url)('../../../desktop/app-protocol.js');
    const scriptSrc = cspFor(html).split('; ').find(d => d.startsWith('script-src'));
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(scriptSrc).toContain("'sha256-" + createHash('sha256').update(b, 'utf8').digest('base64') + "'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    // Inline scripts with attributes (type, nonce…) would not be hashed: keep them out.
    expect(html.match(/<script(?![^>]*\ssrc=)\s[^>]*>/g) || []).toEqual([]);
  });

  it('never builds code from strings', () => {
    const hits = sources.flatMap(({ p, s }) => (s.match(/new Function\s*\(|(?<![\w.])eval\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/g) || []).map(m => p + ': ' + m));
    expect(hits).toEqual([]);
  });
});
