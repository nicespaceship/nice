/**
 * PromptPanel Compare (standalone chat): one question to two or three
 * models, answers side by side, keep one. Pinned here:
 *   - which models are offered (enabled and runnable right now),
 *   - the Compare strip only appears in standalone chat (#/chat),
 *   - the comparison card's states (writing, answered, error, kept),
 *   - nice-ai's non-stream `content` array is flattened to text.
 * Mounted via the same _buildDOM() seam as the model-dropdown tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const __dir = dirname(fileURLToPath(import.meta.url));

installViewMocks();
loadModule('lib/blueprint-utils.js');
loadModule('lib/llm-config.js');
loadModule('lib/token-config.js');
// model-catalog.js is UMD: hide `module` so it assigns the browser global.
new Function('module', 'self', readFileSync(resolve(__dir, '../lib/model-catalog.js'), 'utf-8'))(undefined, globalThis);
loadModule('views/prompt-panel.js');

globalThis.CoreReactor = { init() {}, setState() {} };
globalThis.CoreVoice = { stop() {}, isSpeaking: () => false, isMuted: () => false };

const STANDARD = { standard: { allowance: 1000, used: 0, purchased: 0 } };

function chips() {
  return [...document.querySelectorAll('.nice-ai-compare-chip span')].map(n => n.textContent);
}

beforeEach(() => {
  PromptPanel.destroy();
  globalThis.LLM_MODELS = [];
  globalThis.LLM_PROVIDERS = [];
  globalThis.Subscription = { getAddons: () => [] };
  State.set('enabled_models', { 'gemini-2-5-flash': true, 'grok-4-3': true, 'deepseek-v4-flash': true, 'claude-4-6-sonnet': true });
  State.set('token_balance', { pools: STANDARD });
  history.replaceState(null, '', '#/chat');
  PromptPanel._buildDOM();
});
afterEach(() => {
  delete globalThis.LLM_MODELS;
  delete globalThis.LLM_PROVIDERS;
  delete globalThis.Subscription;
});

describe('PromptPanel._compareCandidates', () => {
  it('offers enabled models the user can run now, free first', () => {
    // Claude needs the Claude add-on, so it is left out.
    expect(PromptPanel._compareCandidates()).toEqual(['gemini-2-5-flash', 'grok-4-3', 'deepseek-v4-flash']);
  });

  it('drops paid models once their pool is empty', () => {
    State.set('token_balance', { pools: { standard: { allowance: 1000, used: 1000, purchased: 0 } } });
    expect(PromptPanel._compareCandidates()).toEqual(['gemini-2-5-flash']);
  });

  it('leaves out models the user switched off', () => {
    State.set('enabled_models', { 'gemini-2-5-flash': true, 'grok-4-3': false, 'deepseek-v4-flash': true });
    expect(PromptPanel._compareCandidates()).toEqual(['gemini-2-5-flash', 'deepseek-v4-flash']);
  });
});

describe('Compare strip', () => {
  it('shows the toggle in standalone chat and picks up to three models', () => {
    PromptPanel.syncRoute();
    expect(document.getElementById('nice-ai-compare').hidden).toBe(false);
    PromptPanel._setCompare(true);
    expect(chips()).toEqual(['Gemini 2.5 Flash', 'Grok 4.3', 'DeepSeek V4 Flash']);
    expect(document.getElementById('nice-ai-model').hidden).toBe(true);
    PromptPanel._setCompare(false);
    expect(document.getElementById('nice-ai-compare-bar').hidden).toBe(true);
    expect(document.getElementById('nice-ai-model').hidden).toBe(false);
  });

  it('explains what is missing when fewer than two models can run', () => {
    State.set('token_balance', { pools: {} });
    PromptPanel._setCompare(true);
    expect(chips()).toEqual([]);
    expect(document.querySelector('.nice-ai-compare-note').textContent).toContain('Compare needs two models');
  });

  it('hides the toggle outside standalone chat', () => {
    history.replaceState(null, '', '#/crew');
    PromptPanel.syncRoute();
    expect(document.getElementById('nice-ai-compare').hidden).toBe(true);
  });
});

describe('PromptPanel._compareCardHTML', () => {
  const base = { role: 'assistant', type: 'compare', ts: Date.now(), picked: null };

  it('shows a writing state, answers with a keep button, and errors', () => {
    const html = PromptPanel._compareCardHTML({ ...base, answers: [
      { model: 'gemini-2-5-flash', label: 'Gemini 2.5 Flash', pool: 'Free', text: '', pending: true },
      { model: 'grok-4-3', label: 'Grok 4.3', pool: 'Standard', text: 'Lemon buns.', pending: false },
      { model: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', pool: 'Standard', text: '', pending: false, error: 'Out of <b>tokens</b>' },
    ] }, 4);
    const el = document.createElement('div');
    el.innerHTML = html;
    const cards = el.querySelectorAll('.monitor-compare-card');
    expect(cards[0].textContent).toContain('Writing');
    expect(cards[1].querySelector('.monitor-compare-pick').dataset).toMatchObject({ msg: '4', answer: '1' });
    expect(cards[2].querySelector('.monitor-compare-error').textContent).toBe('Out of <b>tokens</b>');
    expect(cards[2].querySelector('b')).toBeNull();
  });

  it('marks the kept answer and dims the rest', () => {
    const html = PromptPanel._compareCardHTML({ ...base, picked: 0, answers: [
      { label: 'Gemini 2.5 Flash', pool: 'Free', text: 'A', pending: false },
      { label: 'Grok 4.3', pool: 'Standard', text: 'B', pending: false },
    ] }, 0);
    const el = document.createElement('div');
    el.innerHTML = html;
    const cards = el.querySelectorAll('.monitor-compare-card');
    expect(cards[0].classList.contains('picked')).toBe(true);
    expect(cards[0].textContent).toContain('Kept');
    expect(cards[1].classList.contains('dim')).toBe(true);
    expect(el.querySelector('.monitor-compare-pick')).toBeNull();
  });

  it('treats an answer left pending by a reload as interrupted', () => {
    const html = PromptPanel._compareCardHTML({ ...base, ts: Date.now() - 10 * 60 * 1000, answers: [
      { label: 'Grok 4.3', pool: 'Standard', text: '', pending: true },
    ] }, 0);
    expect(html).toContain('Interrupted before it finished.');
  });
});

describe('PromptPanel._contentText', () => {
  it('joins the text parts of nice-ai content', () => {
    expect(PromptPanel._contentText([{ type: 'text', text: 'Hello ' }, { type: 'image', url: 'x' }, { type: 'text', text: 'there' }])).toBe('Hello there');
  });
  it('passes strings through and turns anything else into empty text', () => {
    expect(PromptPanel._contentText('plain')).toBe('plain');
    expect(PromptPanel._contentText(null)).toBe('');
    expect(PromptPanel._contentText({ text: 'x' })).toBe('');
  });
});
