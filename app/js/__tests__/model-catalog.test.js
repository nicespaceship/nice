/**
 * ModelCatalog tests — the SSOT for the AI-model presentation layer (display
 * name, provider, speed/quality, marketing copy, and the per-model attachment
 * capability flags that drive prompt-panel gating). The `id` field joins to
 * TokenConfig.MODELS (the SSOT for pool + weight); the headline test here pins
 * that join so a model added to one SSOT but not the other fails CI.
 *
 * model-catalog.js is a UMD module (ends `}));`), so the setup.js loadScript
 * regex won't promote it — load it through a CommonJS shim and read
 * module.exports. TokenConfig is already a global (setup.js loads it).
 */

import { describe, it, expect } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));

function loadUMD(rel) {
  const code = readFileSync(resolve(__dir, rel), 'utf-8');
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports); // CommonJS branch
  return mod.exports;
}
const { MODEL_CATALOG, getById, listProviders } = loadUMD('../lib/model-catalog.js');

describe('ModelCatalog.MODEL_CATALOG — shape', () => {
  it('gives every entry the required presentation + capability fields', () => {
    for (const m of MODEL_CATALOG) {
      expect(typeof m.id, m.id).toBe('string');
      expect(m.id).toBeTruthy();
      expect(typeof m.name, m.id).toBe('string');
      expect(m.name).toBeTruthy();
      expect(typeof m.provider, m.id).toBe('string');
      expect(typeof m.speed, m.id).toBe('string');
      expect(typeof m.quality, m.id).toBe('string');
      expect(typeof m.desc, m.id).toBe('string');
      expect(m.desc).toBeTruthy();
      // Capability flags are read as booleans by the prompt-panel gate — a
      // missing/undefined flag would read as "no capability". Pin the type.
      for (const cap of ['vision', 'pdf', 'audio', 'video']) {
        expect(typeof m[cap], `${m.id}.${cap}`).toBe('boolean');
      }
    }
  });

  it('has unique model ids', () => {
    const ids = MODEL_CATALOG.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the free Gemini Flash fully multimodal (the attachment fallback target)', () => {
    const flash = getById('gemini-2-5-flash');
    expect(flash).not.toBeNull();
    expect(flash.vision).toBe(true);
    expect(flash.pdf).toBe(true);
    expect(flash.audio).toBe(true);
    expect(flash.video).toBe(true);
  });
});

describe('ModelCatalog.getById', () => {
  it('returns the entry for a known id', () => {
    const m = getById('claude-4-7-opus');
    expect(m).not.toBeNull();
    expect(m.name).toBe('Claude 4.7 Opus');
    expect(m.provider).toBe('Anthropic');
  });

  it('returns null for an unknown id', () => {
    expect(getById('gpt-9-ultra')).toBeNull();
  });

  it('returns null for missing / empty input', () => {
    expect(getById()).toBeNull();
    expect(getById('')).toBeNull();
  });

  it('returns the live catalog object, not a copy', () => {
    expect(getById('gpt-5-mini')).toBe(MODEL_CATALOG.find(m => m.id === 'gpt-5-mini'));
  });
});

describe('ModelCatalog.listProviders', () => {
  it('returns the provider set with no duplicates', () => {
    const provs = listProviders();
    expect(new Set(provs).size).toBe(provs.length);
  });

  it('covers every provider present in the catalog', () => {
    const provs = listProviders();
    for (const m of MODEL_CATALOG) expect(provs).toContain(m.provider);
  });

  it('matches the current provider roster', () => {
    expect([...listProviders()].sort()).toEqual(['Anthropic', 'Google', 'Meta', 'OpenAI', 'xAI']);
  });
});

describe('ModelCatalog ↔ TokenConfig.MODELS join (SSOT invariant)', () => {
  it('gives every catalog id a TokenConfig.MODELS entry (pool + weight)', () => {
    for (const m of MODEL_CATALOG) {
      expect(TokenConfig.MODELS[m.id], `${m.id} missing from TokenConfig.MODELS`).toBeDefined();
    }
  });

  it('gives every TokenConfig.MODELS id a catalog entry (presentation)', () => {
    for (const id of Object.keys(TokenConfig.MODELS)) {
      expect(getById(id), `${id} missing from MODEL_CATALOG`).not.toBeNull();
    }
  });

  it('describes the exact same model set across both SSOTs', () => {
    const catalogIds = MODEL_CATALOG.map(m => m.id).sort();
    const configIds = Object.keys(TokenConfig.MODELS).sort();
    expect(catalogIds).toEqual(configIds);
  });
});
