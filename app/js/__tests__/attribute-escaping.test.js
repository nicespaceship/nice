import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

/* Utils.esc escapes <, > and & but not quotes, so text it escapes can still
   close a quoted HTML attribute and add an event handler. Every value inside
   an attribute goes through Utils.escAttr. This scans the app's source for
   esc calls that sit inside an open attribute value. */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Known exceptions, by file and a snippet of the line.
const ALLOWED = [
  // Lowercased and reduced to [a-z0-9-] right after, so nothing can close the attribute.
  ['views/vault.js', 'id="vault-upsell-${_esc(name).toLowerCase().replace('],
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return name.endsWith('.js') && !name.includes('bundle') ? [p] : [];
  });
}

const CALL = /(?<![\w.])(?:_esc|esc|Utils\.esc)\(/g;

function insideAttribute(line, at) {
  const before = line.slice(0, at);
  const open = Math.max(before.lastIndexOf('="'), before.lastIndexOf("='"));
  if (open < 0) return false;
  const quote = before[open + 1];
  const rest = before.slice(open + 2).replace(/\$\{[^}]*/g, '');
  return !rest.includes(quote);
}

describe('attribute escaping', () => {
  it('uses Utils.escAttr, not Utils.esc, inside HTML attributes', () => {
    const found = [];
    for (const file of files(root)) {
      const rel = relative(root, file);
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(CALL)) {
          if (!insideAttribute(line, m.index)) continue;
          if (ALLOWED.some(([f, snip]) => f === rel && line.includes(snip))) continue;
          found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  it('escAttr keeps a quote inside the attribute', () => {
    const div = document.createElement('div');
    const bad = 'x" onmouseover="alert(1)';
    div.innerHTML = `<span title="${Utils.escAttr(bad)}"></span>`;
    expect(div.querySelector('[onmouseover]')).toBeNull();
    expect(div.firstChild.getAttribute('title')).toBe(bad);
  });
});
