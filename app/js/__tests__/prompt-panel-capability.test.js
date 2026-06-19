/**
 * PromptPanel model-capability gate tests — third consumer of the view-harness.
 *
 * Covers the consumer-side capability gate in the 3,689-LOC prompt-panel
 * god-file. AttachmentUtils (separately tested) maps a file *kind* → required
 * capability ('vision'/'pdf'/'audio'/'video'); these two helpers map a *model
 * id* → can-it-read-that-capability, and decide whether a model may serve a
 * request that carries staged attachments:
 *   - _modelHasCapability(id, cap) — looks the model up in the LLM_MODELS
 *     registry and returns false ONLY when the flag is explicitly false.
 *     Permissive by design: missing registry, unknown id, or an undeclared
 *     flag all read as "satisfied". Normalizes dotted vs dashed ids so the
 *     default select value `gemini-2.5-flash` matches the catalog row
 *     `gemini-2-5-flash` — a silent-break footgun if that ever regresses.
 *   - _modelSatisfies(id, caps) — true iff the model clears every capability
 *     in the set; backs the model-change guard (revert + toast) and the
 *     soft-fallback (auto-switch to Gemini Flash).
 *
 * Both are exposed on PromptPanel's public API as test seams (like the
 * app-context helpers in prompt-panel-context.test.js); loaded whole via the
 * harness. The harness does not define LLM_MODELS, so each test owns it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

installViewMocks();
loadModule('views/prompt-panel.js');

// Mirrors the MODEL_CATALOG capability-flag shape (CLAUDE.md model table).
const CATALOG = [
  { id: 'gemini-2-5-flash',  vision: true,  pdf: true,  audio: true,  video: true  },
  { id: 'claude-4-6-sonnet', vision: true,  pdf: true,  audio: false, video: false },
  { id: 'gpt-5-mini',        vision: true,  pdf: false, audio: false, video: false },
  { id: 'grok' }, // no capability flags declared at all
];

beforeEach(() => { globalThis.LLM_MODELS = CATALOG.map(m => ({ ...m })); });
afterEach(() => { delete globalThis.LLM_MODELS; });

describe('PromptPanel._modelHasCapability', () => {
  it('is permissive when the model registry is absent', () => {
    delete globalThis.LLM_MODELS;
    expect(PromptPanel._modelHasCapability('anything', 'vision')).toBe(true);
  });

  it('is permissive for an unknown model id', () => {
    expect(PromptPanel._modelHasCapability('made-up-model', 'audio')).toBe(true);
  });

  it('blocks only an explicitly-false capability flag', () => {
    expect(PromptPanel._modelHasCapability('claude-4-6-sonnet', 'audio')).toBe(false);
    expect(PromptPanel._modelHasCapability('claude-4-6-sonnet', 'video')).toBe(false);
    expect(PromptPanel._modelHasCapability('gpt-5-mini', 'pdf')).toBe(false);
  });

  it('clears an explicitly-true capability flag', () => {
    expect(PromptPanel._modelHasCapability('claude-4-6-sonnet', 'vision')).toBe(true);
    expect(PromptPanel._modelHasCapability('gemini-2-5-flash', 'video')).toBe(true);
  });

  it('treats an undeclared capability as satisfied (undefined !== false)', () => {
    // grok declares no flags — every cap reads as allowed, by design.
    expect(PromptPanel._modelHasCapability('grok', 'vision')).toBe(true);
    expect(PromptPanel._modelHasCapability('grok', 'audio')).toBe(true);
  });

  it('matches a dotted select id against a dashed catalog id (the gemini footgun)', () => {
    // default select option is `gemini-2.5-flash`; the catalog row is dashed.
    expect(PromptPanel._modelHasCapability('gemini-2.5-flash', 'video')).toBe(true);
    expect(PromptPanel._modelHasCapability('gemini-2.5-flash', 'pdf')).toBe(true);
  });

  it('matches when only the catalog id carries the dots', () => {
    globalThis.LLM_MODELS = [{ id: 'gemini-2.5-flash', vision: false }];
    expect(PromptPanel._modelHasCapability('gemini-2-5-flash', 'vision')).toBe(false);
  });

  it('matches on an exact id with no normalization needed', () => {
    expect(PromptPanel._modelHasCapability('gpt-5-mini', 'vision')).toBe(true);
    expect(PromptPanel._modelHasCapability('gpt-5-mini', 'pdf')).toBe(false);
  });
});

describe('PromptPanel._modelSatisfies', () => {
  it('is vacuously true for an empty capability set', () => {
    expect(PromptPanel._modelSatisfies('gpt-5-mini', new Set())).toBe(true);
  });

  it('is true when the model clears every required capability', () => {
    expect(PromptPanel._modelSatisfies('gemini-2-5-flash', new Set(['vision', 'pdf', 'audio', 'video']))).toBe(true);
    expect(PromptPanel._modelSatisfies('claude-4-6-sonnet', new Set(['vision', 'pdf']))).toBe(true);
  });

  it('is false when any single required capability is unmet', () => {
    // sonnet reads images+PDFs but not audio → an image+audio request fails.
    expect(PromptPanel._modelSatisfies('claude-4-6-sonnet', new Set(['vision', 'audio']))).toBe(false);
    // gpt-5-mini reads images but not PDFs.
    expect(PromptPanel._modelSatisfies('gpt-5-mini', new Set(['vision', 'pdf']))).toBe(false);
  });

  it('stays permissive across the whole set when the registry is missing', () => {
    delete globalThis.LLM_MODELS;
    expect(PromptPanel._modelSatisfies('gpt-5-mini', new Set(['vision', 'pdf', 'audio', 'video']))).toBe(true);
  });
});
