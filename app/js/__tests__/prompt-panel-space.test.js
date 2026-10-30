/**
 * PromptPanel on Space (#/space): the prompt goes to the selected model
 * cards, each answering in its own thread. Pinned here:
 *   - only the selected models are called, each with its own thread,
 *   - replies come back tagged with the model that wrote them,
 *   - one failing model (a 402) doesn't touch the others,
 *   - the "To …" label replaces the model dropdown on Space only,
 *   - conversations from before cards load onto the right cards,
 *   - comparisons saved before cards still render on the monitor,
 *   - nice-ai's non-stream `content` array is flattened to text.
 * Mounted via the same _buildDOM() seam as the model-dropdown tests; the
 * nice-ai edge function is a mocked fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const __dir = dirname(fileURLToPath(import.meta.url));

installViewMocks({
  sb: {
    _key: 'anon-key',
    client: {
      supabaseUrl: 'https://sb.test',
      auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    },
  },
});
loadModule('lib/blueprint-utils.js');
loadModule('lib/llm-config.js');
loadModule('lib/token-config.js');
// model-catalog.js is UMD: hide `module` so it assigns the browser global.
new Function('module', 'self', readFileSync(resolve(__dir, '../lib/model-catalog.js'), 'utf-8'))(undefined, globalThis);
loadModule('lib/space-cards.js');
loadModule('views/prompt-panel.js');

globalThis.CoreReactor = { init() {}, setState() {} };
globalThis.CoreVoice = { stop() {}, isSpeaking: () => false, isMuted: () => false, canSpeak: () => false };

const ENABLED = { 'gemini-2-5-flash': true, 'grok-4-3': true, 'deepseek-v4-flash': true, 'claude-4-6-sonnet': true, 'nice-auto': true };

let calls;
// nice-ai stand-in: answers per model; DeepSeek's pool is empty.
function mockNiceAi() {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.model === 'deepseek-v4-flash') {
      return { ok: false, status: 402, text: async () => JSON.stringify({ error: 'Your Standard pool is empty.', code: 'insufficient_tokens' }) };
    }
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ content: [{ type: 'text', text: `Answer from ${body.model}` }] }),
    };
  });
}

const settled = () => vi.waitFor(() => { if (SpaceCards.busy()) throw new Error('still answering'); });

beforeEach(() => {
  PromptPanel.destroy();
  localStorage.setItem('sb-test-auth-token', '{"access_token":"tok"}');
  globalThis.LLM_MODELS = [];
  globalThis.LLM_PROVIDERS = [];
  globalThis.Subscription = { isPro: () => true, getAddons: () => [], handleBillingError: vi.fn() };
  State.set('enabled_models', ENABLED);
  history.replaceState(null, '', '#/space');
  mockNiceAi();
  PromptPanel._buildDOM();
  PromptPanel._reload();
});
afterEach(() => {
  delete globalThis.LLM_MODELS;
  delete globalThis.LLM_PROVIDERS;
  delete globalThis.Subscription;
  delete globalThis.fetch;
});

describe('Sending to the selected cards', () => {
  it('sends to the free model alone by default', async () => {
    PromptPanel._sendToCards('Name my bakery');
    await settled();
    expect(calls.map(c => c.model)).toEqual(['gemini-2-5-flash']);
    const msgs = PromptPanel.messages();
    expect(msgs[0]).toMatchObject({ role: 'user', text: 'Name my bakery', to: ['gemini-2-5-flash'] });
    expect(msgs[1]).toMatchObject({ role: 'assistant', text: 'Answer from gemini-2-5-flash', modelId: 'gemini-2-5-flash', model: 'Gemini 2.5 Flash' });
  });

  it('sends only to the selected models, in parallel, and tags each reply', async () => {
    SpaceCards.toggle('grok-4-3');
    PromptPanel._sendToCards('Name my bakery');
    expect(SpaceCards.live('gemini-2-5-flash')).toBeTruthy();
    expect(SpaceCards.live('grok-4-3')).toBeTruthy();
    await settled();
    expect(calls.map(c => c.model).sort()).toEqual(['gemini-2-5-flash', 'grok-4-3']);
    const replies = PromptPanel.messages().filter(m => m.role === 'assistant');
    expect(replies.map(m => [m.modelId, m.text]).sort()).toEqual([
      ['gemini-2-5-flash', 'Answer from gemini-2-5-flash'],
      ['grok-4-3', 'Answer from grok-4-3'],
    ]);
  });

  it('gives each model its own thread as history', async () => {
    SpaceCards.toggle('grok-4-3');
    PromptPanel._sendToCards('First');
    await settled();
    SpaceCards.toggle('gemini-2-5-flash'); // Grok alone now
    PromptPanel._sendToCards('Second');
    await settled();
    SpaceCards.toggle('gemini-2-5-flash');
    calls = [];
    PromptPanel._sendToCards('Third');
    await settled();
    const sent = Object.fromEntries(calls.map(c => [c.model, c.messages.map(m => m.role + ':' + JSON.stringify(m.content))]));
    expect(sent['grok-4-3']).toHaveLength(5);
    expect(sent['gemini-2-5-flash']).toHaveLength(3);
    expect(sent['gemini-2-5-flash'].join(' ')).not.toContain('Second');
    expect(sent['gemini-2-5-flash'][1]).toBe('assistant:"Answer from gemini-2-5-flash"');
  });

  it('keeps one failing model on its own card', async () => {
    SpaceCards.toggle('grok-4-3');
    SpaceCards.toggle('deepseek-v4-flash');
    PromptPanel._sendToCards('Name my bakery');
    await settled();
    const replies = PromptPanel.messages().filter(m => m.role === 'assistant');
    const byModel = Object.fromEntries(replies.map(m => [m.modelId, m]));
    expect(byModel['gemini-2-5-flash'].error).toBeUndefined();
    expect(byModel['grok-4-3'].text).toBe('Answer from grok-4-3');
    expect(byModel['deepseek-v4-flash']).toMatchObject({ error: true, billing: true, text: 'Your Standard pool is empty.' });
    expect(Subscription.handleBillingError).toHaveBeenCalledWith(expect.objectContaining({ code: 'insufficient_tokens' }));
    // The failed exchange stays out of DeepSeek's next history.
    expect(SpaceCards.historyFor(PromptPanel.messages(), 'deepseek-v4-flash')).toEqual([]);
  });

  it("tells a card it can't read an attached image without calling it", async () => {
    globalThis.LLM_MODELS = ModelCatalog.MODEL_CATALOG;
    SpaceCards.toggle('grok-4-3');
    PromptPanel._sendToCards('What is in this photo?', [{ kind: 'image', dataUrl: 'data:image/png;base64,AA', mimeType: 'image/png', name: 'shop.png' }]);
    await settled();
    expect(calls.map(c => c.model)).toEqual(['gemini-2-5-flash']);
    const grok = PromptPanel.messages().find(m => m.modelId === 'grok-4-3');
    expect(grok).toMatchObject({ error: true });
    expect(grok.text).toContain("can't read images");
  });

  it('drops replies still on their way when another conversation opens', async () => {
    let release;
    globalThis.fetch = vi.fn(() => new Promise(r => { release = r; }));
    PromptPanel._sendToCards('Slow one');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    PromptPanel._reload();
    expect(SpaceCards.busy()).toBe(false);
    release({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'late' }] }) });
    await new Promise(r => setTimeout(r, 0));
    expect(PromptPanel.messages().some(m => m.text === 'late')).toBe(false);
  });
});

describe('The "To …" label', () => {
  it('names the one model, counts several, and replaces the dropdown on Space', () => {
    PromptPanel._renderTargets();
    const label = document.getElementById('nice-ai-targets');
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe('To Gemini 2.5 Flash');
    expect(document.getElementById('nice-ai-model').hidden).toBe(true);
    SpaceCards.toggle('grok-4-3');
    PromptPanel._renderTargets();
    expect(label.textContent).toBe('To 2 models');
    expect(label.title).toBe('Gemini 2.5 Flash, Grok 4.3');
  });

  it('gives the dropdown back outside Space, and the Compare toggle is gone', () => {
    history.replaceState(null, '', '#/crew');
    PromptPanel._renderTargets();
    expect(document.getElementById('nice-ai-targets').hidden).toBe(true);
    expect(document.getElementById('nice-ai-model').hidden).toBe(false);
    expect(document.getElementById('nice-ai-compare')).toBeNull();
  });
});

describe('Conversations from before cards', () => {
  it('load with each reply on the card of the model that answered', () => {
    localStorage.setItem(Utils.KEYS.aiMessages, JSON.stringify([
      { role: 'user', text: 'Hi', ts: 1 },
      { role: 'assistant', text: 'Hello', agent: 'NICE', model: 'NICE Auto → Grok 4.3', ts: 2 },
      { role: 'user', text: 'Plain question', ts: 3 },
      { role: 'assistant', text: 'Plain answer', agent: 'NICE', model: 'Gemini 2.5 Flash', ts: 4 },
    ]));
    PromptPanel._reload();
    const t = SpaceCards.threads(PromptPanel.messages());
    expect(t['grok-4-3'].map(ex => ex.replies[0].text)).toEqual(['Hello']);
    expect(t['gemini-2-5-flash'].map(ex => ex.replies[0].text)).toEqual(['Plain answer']);
  });

  it('continue with the old thread as the card history', async () => {
    localStorage.setItem(Utils.KEYS.aiMessages, JSON.stringify([
      { role: 'user', text: 'Old question', ts: 1 },
      { role: 'assistant', text: 'Old answer', agent: 'NICE', model: 'Gemini 2.5 Flash', ts: 2 },
    ]));
    PromptPanel._reload();
    PromptPanel._sendToCards('New question');
    await settled();
    expect(calls[0].messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(calls[0].messages[1].content).toBe('Old answer');
  });
});

describe('PromptPanel._compareCardHTML (comparisons saved before cards)', () => {
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
