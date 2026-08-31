/**
 * PromptPanel model-dropdown tests — Longeron Auto default + selection survival.
 *
 * _populateModelDropdown rebuilds the select from LLM_MODELS × enabled_models
 * whenever enabled models change. Three behaviors are pinned here:
 *   - a fresh populate defaults to Longeron Auto (the pre-populate placeholder is
 *     not a user choice),
 *   - a pick the user made through the change handler survives a repopulate,
 *   - dotted and dashed ids normalize when checking survival.
 * Mounted via the same _buildDOM() seam as prompt-panel-attachments.test.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('lib/blueprint-utils.js');
loadModule('lib/llm-config.js');
loadModule('views/prompt-panel.js');

globalThis.CoreReactor = { init() {}, setState() {} };
globalThis.CoreVoice = { stop() {}, isSpeaking: () => false, isMuted: () => false };

const MODELS = [
  { id: 'gemini-2-5-flash',  label: 'Gemini 2.5 Flash',  provider: 'google' },
  { id: 'gpt-5-mini',        label: 'GPT-5 mini',        provider: 'openai' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'deepseek' },
];
const PROVIDERS = [
  { id: 'google',   name: 'Google' },
  { id: 'openai',   name: 'OpenAI' },
  { id: 'deepseek', name: 'DeepSeek' },
];
const ENABLED = { 'gemini-2-5-flash': true, 'gpt-5-mini': true, 'deepseek-v4-flash': true };

function select() { return document.getElementById('nice-ai-model'); }

beforeEach(() => {
  PromptPanel.destroy(); // resets _userPickedModel + _lastModelValue
  globalThis.LLM_MODELS = MODELS.map(m => ({ ...m }));
  globalThis.LLM_PROVIDERS = PROVIDERS.map(p => ({ ...p }));
  globalThis.State.set('enabled_models', { ...ENABLED });
  PromptPanel._buildDOM();
});
afterEach(() => {
  delete globalThis.LLM_MODELS;
  delete globalThis.LLM_PROVIDERS;
});

describe('PromptPanel._populateModelDropdown', () => {
  it('defaults a fresh populate to Longeron Auto', () => {
    PromptPanel._populateModelDropdown();
    expect(select().value).toBe('nice-auto');
    expect(Array.from(select().options)[0].value).toBe('nice-auto');
  });

  it('does not treat the pre-populate dotted placeholder as a user pick', () => {
    select().innerHTML = '<option value="gemini-2.5-flash">Gemini 2.5 Flash</option>';
    select().value = 'gemini-2.5-flash';
    PromptPanel._populateModelDropdown();
    expect(select().value).toBe('nice-auto');
  });

  it('preserves an explicit user pick across a repopulate', () => {
    PromptPanel._populateModelDropdown();
    select().value = 'deepseek-v4-flash';
    PromptPanel._onModelSelectChange();
    PromptPanel._populateModelDropdown();
    expect(select().value).toBe('deepseek-v4-flash');
  });

  it('falls back to Longeron Auto when the user pick no longer survives', () => {
    PromptPanel._populateModelDropdown();
    select().value = 'deepseek-v4-flash';
    PromptPanel._onModelSelectChange();
    globalThis.State.set('enabled_models', { 'gemini-2-5-flash': true, 'gpt-5-mini': true });
    globalThis.LLM_MODELS = MODELS.filter(m => m.id !== 'deepseek-v4-flash');
    PromptPanel._populateModelDropdown();
    expect(select().value).toBe('nice-auto');
  });

  it('_getSelectedModel marks Longeron Auto with the auto flag', () => {
    PromptPanel._populateModelDropdown();
    expect(PromptPanel._getSelectedModel()).toEqual({ id: 'nice-auto', label: 'Longeron Auto', auto: true });
  });
});
