/**
 * DocsContent browser-load regression. terminology.js declares
 * `const Terminology` — in a real <script> that is a global *lexical*
 * binding, never a window property, so a UMD wrapper that reads
 * `root.Terminology` gets undefined and every lazy getter throws when
 * docs.js renders. The Node require() path masks this (it requires
 * terminology.js directly), so this test simulates the browser
 * condition instead: both sources evaluated in one shared scope with
 * `module` and `self` shadowed to undefined, exactly like two classic
 * script tags sharing the global lexical environment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const termSrc = readFileSync(resolve(__dir, '../lib/terminology.js'), 'utf-8');
const docsSrc = readFileSync(resolve(__dir, '../lib/docs-content.js'), 'utf-8');

function loadAsBrowserScripts() {
  const root = {};
  // eslint-disable-next-line no-new-func
  const run = new Function('root', `
    var module; var self = root; var window = root;
    ${termSrc}
    ${docsSrc}
    return root.DocsContent;
  `);
  return run(root);
}

describe('DocsContent loaded as browser scripts', () => {
  it('resolves section bodies through the script-scoped Terminology binding', () => {
    const DocsContent = loadAsBrowserScripts();
    expect(DocsContent).toBeTruthy();
    const body = DocsContent.BODIES['getting-started'];
    expect(typeof body).toBe('string');
    expect(body).toContain('Getting Started');
  });

  it('resolves themed section labels and descriptions', () => {
    const DocsContent = loadAsBrowserScripts();
    const ships = DocsContent.SECTIONS.find(s => s.id === 'spaceships');
    // Business default vocabulary (no theme persisted in this scope).
    expect(ships.label).toBe('Workspaces');
    expect(ships.description).toContain('team of agents');
  });
});
