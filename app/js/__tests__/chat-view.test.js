/**
 * ChatView (#/space): the model cards. Pinned here:
 *   - one card per model the user switched on and can run, no NICE Auto,
 *   - the free model is the one selected card by default,
 *   - clicking a card toggles it and the choice persists,
 *   - each card shows its own thread; old conversations land on cards,
 *   - status dots (go / busy / stop / none), notes for free users and guests,
 *   - everything user-written is escaped, listeners go away on destroy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const __dir = dirname(fileURLToPath(import.meta.url));

installViewMocks();
loadModule('lib/llm-config.js');
loadModule('lib/token-config.js');
// model-catalog.js is UMD: hide `module` so it assigns the browser global.
new Function('module', 'self', readFileSync(resolve(__dir, '../lib/model-catalog.js'), 'utf-8'))(undefined, globalThis);
loadModule('lib/space-cards.js');
loadModule('views/chat.js');

let messages = [];
globalThis.PromptPanel = {
  messages: () => messages,
  _md: (t) => `<p>${Utils.esc(t)}</p>`,
  toggle: vi.fn(),
};
globalThis.CoreReactor = { setVisible: vi.fn() };

const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const card = (el, id) => el.querySelector(`.space-card[data-model="${id}"]`);
const ids = (el) => [...el.querySelectorAll('.space-card')].map(c => c.dataset.model);

let el;
function mount() {
  el = document.createElement('div');
  document.body.appendChild(el);
  ChatView.render(el);
  return el;
}

beforeEach(() => {
  messages = [];
  localStorage.setItem('sb-test-auth-token', '{"access_token":"tok"}');
  globalThis.Subscription = { isPro: () => true, getAddons: () => [] };
  State.set('user', { id: 'u1', email: 'pilot@test.com' });
  State.set('enabled_models', { 'gemini-2-5-flash': true, 'grok-4-3': true, 'deepseek-v4-flash': true, 'claude-4-6-sonnet': true, 'nice-auto': true });
});
afterEach(() => {
  ChatView.destroy();
  SpaceCards.endAll();
  delete globalThis.Subscription;
});

describe('ChatView', () => {
  it('is titled Space', () => {
    expect(ChatView.title).toBe('Space');
  });

  it('shows a card for each model the user can run, never NICE Auto', () => {
    mount();
    // Claude needs the Claude add-on, so it gets no card.
    expect(ids(el)).toEqual(['gemini-2-5-flash', 'grok-4-3', 'deepseek-v4-flash']);
    expect(card(el, 'grok-4-3').querySelector('.space-card-name').textContent).toBe('Grok 4.3');
    expect(card(el, 'grok-4-3').querySelector('.space-card-sub').textContent).toBe('xAI · Standard');
  });

  it('selects only the free model by default, with a go dot', () => {
    mount();
    const gem = card(el, 'gemini-2-5-flash');
    expect(gem.classList.contains('is-selected')).toBe(true);
    expect(gem.querySelector('.space-card-head').getAttribute('aria-pressed')).toBe('true');
    expect(gem.querySelector('.space-dot').dataset.dot).toBe('go');
    expect(el.querySelectorAll('.space-card.is-selected')).toHaveLength(1);
    expect(card(el, 'grok-4-3').querySelector('.space-dot').dataset.dot).toBe('off');
  });

  it('toggles a card on click and keeps the choice', async () => {
    mount();
    card(el, 'grok-4-3').querySelector('.space-card-body').click();
    await frame();
    expect(card(el, 'grok-4-3').classList.contains('is-selected')).toBe(true);
    expect(JSON.parse(localStorage.getItem(Utils.KEYS.spaceCards))).toEqual(['gemini-2-5-flash', 'grok-4-3']);
    ChatView.destroy();
    mount();
    expect(el.querySelectorAll('.space-card.is-selected')).toHaveLength(2);
  });

  it("shows each model's latest exchange on its own card, escaped", () => {
    messages = [
      { role: 'user', text: 'Name it <b>now</b>', to: ['gemini-2-5-flash', 'grok-4-3'], v: 2 },
      { role: 'assistant', text: 'Rise & Co.', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
      { role: 'assistant', text: 'Crumb Theory', modelId: 'grok-4-3', agent: 'NICE', v: 2 },
    ];
    mount();
    expect(card(el, 'gemini-2-5-flash').querySelector('.space-reply').textContent).toBe('Rise & Co.');
    expect(card(el, 'grok-4-3').querySelector('.space-reply').textContent).toBe('Crumb Theory');
    expect(card(el, 'grok-4-3').querySelector('.space-ask').textContent).toContain('Name it <b>now</b>');
    expect(el.querySelector('.space-ask b')).toBeNull();
    expect(card(el, 'deepseek-v4-flash').querySelector('.space-reply')).toBeNull();
  });

  it('puts an old single-thread conversation on the card of the model that answered', () => {
    messages = SpaceCards.tagLegacy([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello from Grok', agent: 'NICE', model: 'NICE Auto → Grok 4.3' },
      { role: 'user', text: 'Still there?' },
      { role: 'assistant', text: 'From an unknown model', agent: 'NICE', model: 'Retired Model 1' },
    ]);
    mount();
    expect(card(el, 'grok-4-3').textContent).toContain('Hello from Grok');
    expect(card(el, 'gemini-2-5-flash').textContent).toContain('From an unknown model');
  });

  it('expands a card to its whole thread and back', async () => {
    messages = [
      { role: 'user', text: 'One', to: ['gemini-2-5-flash'], v: 2 },
      { role: 'assistant', text: 'First answer', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
      { role: 'user', text: 'Two', to: ['gemini-2-5-flash'], v: 2 },
      { role: 'assistant', text: 'Second answer', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
    ];
    mount();
    expect(card(el, 'gemini-2-5-flash').textContent).not.toContain('First answer');
    card(el, 'gemini-2-5-flash').querySelector('.space-more').click();
    const open = card(el, 'gemini-2-5-flash');
    expect(open.classList.contains('is-expanded')).toBe(true);
    expect(open.textContent).toContain('First answer');
    expect(open.querySelector('.space-more').getAttribute('aria-expanded')).toBe('true');
    // Reading an open card doesn't toggle its selection.
    open.querySelector('.space-card-body').click();
    await frame();
    expect(card(el, 'gemini-2-5-flash').classList.contains('is-selected')).toBe(true);
  });

  it('marks a thinking card busy and a failed one stop, with a Wallet link for billing', async () => {
    messages = [
      { role: 'user', text: 'Go', to: ['grok-4-3', 'deepseek-v4-flash'], v: 2 },
      { role: 'assistant', text: 'Your Standard pool is empty.', modelId: 'deepseek-v4-flash', error: true, billing: true, agent: 'NICE', v: 2 },
    ];
    mount();
    SpaceCards.setLive('grok-4-3', { text: '' });
    await frame();
    expect(card(el, 'grok-4-3').querySelector('.space-dot').dataset.dot).toBe('busy');
    expect(card(el, 'grok-4-3').textContent).toContain('Thinking');
    const ds = card(el, 'deepseek-v4-flash');
    expect(ds.querySelector('.space-dot').dataset.dot).toBe('stop');
    expect(ds.querySelector('.space-err').textContent).toContain('Your Standard pool is empty.');
    expect(ds.querySelector('.space-err a').getAttribute('href')).toBe('#/wallet');
    SpaceCards.setLive('grok-4-3', { text: 'Half an ans' });
    await frame();
    expect(card(el, 'grok-4-3').querySelector('.space-reply').textContent).toBe('Half an ans');
  });

  it('asks for approval on the card and hands the answer back', async () => {
    messages = [
      { role: 'user', text: 'Plan my launch', to: ['gemini-2-5-flash'], v: 2 },
      { role: 'assistant', text: 'On it.', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
    ];
    mount();
    const asked = SpaceCards.requestApproval('gemini-2-5-flash', { tool: 'Create Mission', input: { title: 'Write <b>a</b> tagline' } });
    await frame();
    const box = card(el, 'gemini-2-5-flash').querySelector('.space-approval');
    expect(box.textContent).toContain('Create Mission needs your approval.');
    expect(box.textContent).toContain('Write <b>a</b> tagline');
    expect(box.querySelector('b')).toBeNull();
    expect(card(el, 'gemini-2-5-flash').querySelector('.space-dot').dataset.dot).toBe('busy');
    box.querySelector('[data-act="approve"]').click();
    await expect(asked).resolves.toBe(true);
    await frame();
    expect(card(el, 'gemini-2-5-flash').querySelector('.space-approval')).toBeNull();
    // Selecting text or reading doesn't count: the click went to the button only.
    expect(card(el, 'gemini-2-5-flash').classList.contains('is-selected')).toBe(true);
  });

  it('gives a free user the free card and a note about plans', () => {
    Subscription.isPro = () => false;
    mount();
    expect(ids(el)).toEqual(['gemini-2-5-flash']);
    expect(el.querySelector('.space-note').textContent).toContain('More models come with a plan');
    expect(el.querySelector('.space-note a').getAttribute('href')).toBe('#/wallet');
  });

  it('links to the AI models settings', () => {
    mount();
    expect(el.querySelector('a.space-link').getAttribute('href')).toBe('#/security?tab=models');
  });

  it('offers a new chat once there is one, through the sidebar button', () => {
    messages = [{ role: 'user', text: 'Hi', to: ['gemini-2-5-flash'], v: 2 }];
    const side = document.createElement('button');
    side.id = 'side-chat-new';
    const onNew = vi.fn();
    side.addEventListener('click', onNew);
    document.body.appendChild(side);
    mount();
    el.querySelector('[data-act="new"]').click();
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("links to the full chat while NICE's own replies are in it", async () => {
    messages = [{ role: 'user', text: 'Hi', to: ['gemini-2-5-flash'], v: 2 }];
    mount();
    expect(el.querySelector('[data-act="full"]')).toBeNull();
    messages.push({ role: 'user', text: '/help', v: 2 }, { role: 'assistant', text: 'Slash commands', agent: null, v: 2 });
    document.dispatchEvent(new CustomEvent('nice:chat-saved'));
    await frame();
    el.querySelector('[data-act="full"]').click();
    expect(PromptPanel.toggle).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain('Slash commands');
  });

  describe('signed out', () => {
    beforeEach(() => {
      localStorage.removeItem('sb-test-auth-token');
      State.set('user', null);
    });

    it('still shows the free card, asks the visitor to sign in, and never shows a cached chat', () => {
      messages = [
        { role: 'user', text: 'leaked from prior account', to: ['gemini-2-5-flash'], v: 2 },
        { role: 'assistant', text: 'leaked reply', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
      ];
      Subscription.isPro = () => false;
      mount();
      expect(ids(el)).toEqual(['gemini-2-5-flash']);
      expect(el.innerHTML).not.toContain('leaked');
      expect(el.querySelector('.space-note').textContent).toContain('Sign in');
      expect(el.querySelector('[data-act="new"]')).toBeNull();
    });
  });

  it('stops listening on destroy', async () => {
    mount();
    ChatView.destroy();
    const before = el.innerHTML;
    SpaceCards.setLive('grok-4-3', { text: 'late' });
    card(el, 'grok-4-3').querySelector('.space-card-body').click();
    await frame();
    expect(el.innerHTML).toBe(before);
    expect(SpaceCards.selected()).toEqual(['gemini-2-5-flash']);
  });
});
