import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const require = createRequire(import.meta.url);
installViewMocks();

beforeAll(() => {
  loadModule('lib/token-config.js');
  globalThis.VaultView = { MODEL_CATALOG: require('../lib/model-catalog.js').MODEL_CATALOG };
  globalThis.DocsContent = require('../lib/docs-content.js');
  loadModule('views/docs.js');
});

describe('DocsView AI Models table', () => {
  function rows() {
    const el = document.createElement('div');
    window.location.hash = '#/docs?s=models';
    DocsView.render(el);
    return [...el.querySelectorAll('[data-models-table] tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
  }

  it('labels each model with the pool that pays for it', () => {
    const byName = Object.fromEntries(rows().map(r => [r[0], r]));
    expect(byName['Gemini 2.5 Flash'][2]).toBe('Free');
    expect(byName['GPT-5 mini'][2]).toBe('Standard');
    expect(byName['Claude 4.6 Sonnet'][2]).toBe('Claude');
    expect(byName['OpenAI o3'][2]).toBe('Premium');
  });

  it('fills the notes column from the catalog', () => {
    rows().forEach(r => expect(r[3]).not.toBe(''));
  });
});
