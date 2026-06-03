import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// localStorage stub (ModelIntel.init() reads it at module load)
const _ls = {};
globalThis.localStorage = {
  getItem: (k) => _ls[k] ?? null,
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
};

// Utils.KEYS.modelIntel is read at eval time.
globalThis.Utils = { KEYS: { modelIntel: 'nice-model-intel' } };

// Mirror LLM_MODELS shape: { id, label, provider } where provider is the
// lowercased provider NAME and id is the model id.
globalThis.LLM_MODELS = [
  { id: 'claude-4-7-opus',   label: 'Claude 4.7 Opus',   provider: 'anthropic' },
  { id: 'claude-4-6-sonnet', label: 'Claude 4.6 Sonnet', provider: 'anthropic' },
  { id: 'gpt-5-mini',        label: 'GPT-5 Mini',        provider: 'openai' },
  { id: 'gemini-2-5-flash',  label: 'Gemini 2.5 Flash',  provider: 'google' },
];

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('lib/model-intel.js');

describe('ModelIntel.bestModel', () => {
  beforeEach(() => {
    localStorage.clear();
    ModelIntel.init();
  });

  // The keys callers actually pass are enabled MODEL ids, not provider names.
  const ENABLED = ['claude-4-7-opus', 'claude-4-6-sonnet', 'gpt-5-mini'];

  it('returns null when no models are enabled', () => {
    expect(ModelIntel.bestModel('bp-1', [])).toBeNull();
  });

  it('returns null without a blueprint id', () => {
    expect(ModelIntel.bestModel(null, ENABLED)).toBeNull();
  });

  it('matches enabled model IDs (not provider names) — the regression', () => {
    // Before the fix this filtered LLM_MODELS by m.provider against a list
    // of model ids, which never matched → always null.
    const best = ModelIntel.bestModel('bp-fresh', ENABLED);
    expect(best).not.toBeNull();
    expect(ENABLED).toContain(best);
  });

  it('falls back to the first enabled model when there is no history', () => {
    expect(ModelIntel.bestModel('bp-fresh', ENABLED)).toBe('claude-4-7-opus');
  });

  it('honors a pinned model when it is enabled', () => {
    ModelIntel.setPreference('bp-pin', 'gpt-5-mini');
    expect(ModelIntel.bestModel('bp-pin', ENABLED)).toBe('gpt-5-mini');
  });

  it('ignores a pinned model that is not enabled', () => {
    ModelIntel.setPreference('bp-pin2', 'gemini-2-5-pro'); // not in ENABLED
    const best = ModelIntel.bestModel('bp-pin2', ENABLED);
    expect(ENABLED).toContain(best);
  });

  it('prefers the model with the best measured score once it has enough runs', () => {
    const bp = 'bp-scored';
    // Opus: 5 runs, all fail. Sonnet: 5 runs, all succeed, fast + cheap.
    for (let i = 0; i < 5; i++) {
      ModelIntel.log(bp, 'claude-4-7-opus', { success: false, speedMs: 9000, costTokens: 9000 });
      ModelIntel.log(bp, 'claude-4-6-sonnet', { success: true, speedMs: 1000, costTokens: 100 });
    }
    expect(ModelIntel.bestModel(bp, ENABLED)).toBe('claude-4-6-sonnet');
  });
});
