/**
 * SpaceCards (lib/space-cards.js): the model cards on Space. Pinned here:
 *   - which cards appear (switched on ∩ the plan can run, no NICE Auto),
 *   - the default selection (the free model) and its persistence,
 *   - each card's thread inside one flat conversation,
 *   - the history a card sends (its successful exchanges only),
 *   - conversations from before cards landing on the right card.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const __dir = dirname(fileURLToPath(import.meta.url));

installViewMocks();
// model-catalog.js is UMD: hide `module` so it assigns the browser global.
new Function('module', 'self', readFileSync(resolve(__dir, '../lib/model-catalog.js'), 'utf-8'))(undefined, globalThis);
loadModule('lib/space-cards.js');

const ALL_ON = {
  'gemini-2-5-flash': true, 'grok-4-3': true, 'deepseek-v4-flash': true,
  'claude-4-6-sonnet': true, 'gpt-5-4-pro': true, 'nice-auto': true,
};

function pro(addons = []) {
  globalThis.Subscription = { isPro: () => true, getAddons: () => addons };
}

beforeEach(() => {
  globalThis.Subscription = { isPro: () => false, getAddons: () => [] };
  State.set('enabled_models', ALL_ON);
});
afterEach(() => { delete globalThis.Subscription; });

describe('SpaceCards.available', () => {
  it('gives a free user only the free card', () => {
    expect(SpaceCards.available()).toEqual(['gemini-2-5-flash']);
  });

  it('adds the models a Pro plan and its add-ons can run, in catalog order, never NICE Auto', () => {
    pro(['claude']);
    expect(SpaceCards.available()).toEqual(['gemini-2-5-flash', 'grok-4-3', 'deepseek-v4-flash', 'claude-4-6-sonnet']);
  });

  it('leaves out models switched off in Settings', () => {
    pro(['claude', 'premium']);
    State.set('enabled_models', { 'gemini-2-5-flash': true, 'grok-4-3': false, 'gpt-5-4-pro': true });
    expect(SpaceCards.available()).toEqual(['gemini-2-5-flash', 'gpt-5-4-pro']);
  });

  it('reads retired model ids under their current names', () => {
    State.set('enabled_models', { 'gemini-2.5-flash': true });
    expect(SpaceCards.available()).toEqual(['gemini-2-5-flash']);
  });

  it('keeps a card whose pool ran dry: the 402 explains it on the card', () => {
    pro();
    State.set('token_balance', { pools: { standard: { allowance: 1000, used: 1000, purchased: 0 } } });
    expect(SpaceCards.available()).toContain('grok-4-3');
  });
});

describe('SpaceCards selection', () => {
  beforeEach(() => pro(['claude']));

  it('selects exactly the free model by default', () => {
    expect(SpaceCards.selected()).toEqual(['gemini-2-5-flash']);
  });

  it('falls back to the first card when the free model has no card', () => {
    State.set('enabled_models', { 'grok-4-3': true, 'deepseek-v4-flash': true });
    expect(SpaceCards.selected()).toEqual(['grok-4-3']);
  });

  it('toggles cards in and out and persists the choice under Utils.KEYS.spaceCards', () => {
    SpaceCards.toggle('grok-4-3');
    SpaceCards.toggle('claude-4-6-sonnet');
    expect(SpaceCards.selected()).toEqual(['gemini-2-5-flash', 'grok-4-3', 'claude-4-6-sonnet']);
    SpaceCards.toggle('gemini-2-5-flash');
    expect(JSON.parse(localStorage.getItem(Utils.KEYS.spaceCards))).toEqual(['grok-4-3', 'claude-4-6-sonnet']);
    expect(SpaceCards.selected()).toEqual(['grok-4-3', 'claude-4-6-sonnet']);
  });

  it('never deselects the last card', () => {
    expect(SpaceCards.toggle('gemini-2-5-flash')).toEqual(['gemini-2-5-flash']);
    expect(SpaceCards.selected()).toEqual(['gemini-2-5-flash']);
  });

  it('ignores cards that are not on screen', () => {
    expect(SpaceCards.toggle('gpt-5-4-pro')).toEqual(['gemini-2-5-flash']);
  });

  it('keeps a saved pick whose card is gone and brings it back with the card', () => {
    SpaceCards.toggle('grok-4-3');
    globalThis.Subscription = { isPro: () => false, getAddons: () => [] };
    expect(SpaceCards.selected()).toEqual(['gemini-2-5-flash']);
    pro(['claude']);
    expect(SpaceCards.selected()).toEqual(['gemini-2-5-flash', 'grok-4-3']);
  });

  it('announces selection changes', () => {
    const seen = [];
    const fn = (e) => seen.push(e.detail);
    document.addEventListener(SpaceCards.EVENT, fn);
    SpaceCards.toggle('grok-4-3');
    document.removeEventListener(SpaceCards.EVENT, fn);
    expect(seen).toEqual([{ kind: 'selection' }]);
  });
});

describe('SpaceCards.threads and historyFor', () => {
  const cards = ['gemini-2-5-flash', 'grok-4-3', 'deepseek-v4-flash'];
  const convo = [
    { role: 'user', text: 'Name the bakery', to: ['gemini-2-5-flash', 'grok-4-3'], v: 2 },
    { role: 'assistant', text: 'Rise & Co.', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
    { role: 'assistant', text: 'Crumb Theory', modelId: 'grok-4-3', agent: 'NICE', v: 2 },
    { role: 'user', text: '/help', v: 2 },
    { role: 'assistant', text: 'Slash commands…', agent: null, v: 2 },
    { role: 'user', text: 'Shorter', to: ['grok-4-3', 'deepseek-v4-flash'], v: 2 },
    { role: 'assistant', text: 'Crumb', modelId: 'grok-4-3', agent: 'NICE', v: 2 },
    { role: 'assistant', text: 'Out of tokens', modelId: 'deepseek-v4-flash', error: true, billing: true, agent: 'NICE', v: 2 },
  ];

  it('gives each card only its own prompts and replies; NICE replies sit on no card', () => {
    const t = SpaceCards.threads(convo, cards);
    expect(t['gemini-2-5-flash'].map(ex => [ex.ask.text, ex.replies.map(r => r.text)])).toEqual([['Name the bakery', ['Rise & Co.']]]);
    expect(t['grok-4-3'].map(ex => [ex.ask.text, ex.replies.map(r => r.text)])).toEqual([
      ['Name the bakery', ['Crumb Theory']], ['Shorter', ['Crumb']],
    ]);
    const ds = t['deepseek-v4-flash'];
    expect(ds).toHaveLength(1);
    expect(ds[0].replies[0]).toMatchObject({ error: 'Out of tokens', billing: true });
  });

  it('sends a card its successful exchanges only', () => {
    expect(SpaceCards.historyFor(convo, 'grok-4-3', cards)).toEqual([
      { role: 'user', text: 'Name the bakery' }, { role: 'assistant', text: 'Crumb Theory' },
      { role: 'user', text: 'Shorter' }, { role: 'assistant', text: 'Crumb' },
    ]);
    expect(SpaceCards.historyFor(convo, 'deepseek-v4-flash', cards)).toEqual([]);
  });

  it('shows a thread whose model has no card on the default card', () => {
    const t = SpaceCards.threads(convo, ['gemini-2-5-flash']);
    const replies = t['gemini-2-5-flash'].flatMap(ex => ex.replies.map(r => `${r.model}:${r.text}`));
    expect(replies).toContain('grok-4-3:Crumb Theory');
    expect(replies).toContain('gemini-2-5-flash:Rise & Co.');
  });
});

describe('SpaceCards.tagLegacy', () => {
  it('puts each old reply in the card of the model that answered, or the default card', () => {
    const msgs = SpaceCards.tagLegacy([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello', agent: 'NICE', model: 'NICE Auto → Grok 4.3' },
      { role: 'user', text: 'And you?' },
      { role: 'assistant', text: 'Hey', agent: 'NICE', model: 'Gemini 2.5 Flash' },
      { role: 'user', text: 'Again' },
      { role: 'assistant', text: '**Connection Error:** timeout', agent: 'NICE', error: true },
    ]);
    expect(msgs.map(m => m.to || m.modelId)).toEqual([
      ['grok-4-3'], 'grok-4-3', ['gemini-2-5-flash'], 'gemini-2-5-flash', ['gemini-2-5-flash'], 'gemini-2-5-flash',
    ]);
    expect(msgs.every(m => m.v === SpaceCards.VERSION)).toBe(true);
  });

  it('spreads an old comparison over its models and leaves agent chats and slash commands off the cards', () => {
    const msgs = SpaceCards.tagLegacy([
      { role: 'user', text: 'Compare these' },
      { role: 'assistant', type: 'compare', picked: null, answers: [
        { model: 'gemini-2-5-flash', label: 'Gemini 2.5 Flash', text: 'A' },
        { model: 'grok-4-3', label: 'Grok 4.3', text: 'B' },
      ] },
      { role: 'user', text: '@Scout find leads' },
      { role: 'assistant', text: 'Found 3 leads', agent: 'Scout' },
      { role: 'user', text: '/help' },
      { role: 'assistant', text: 'Commands…', agent: null },
      { role: 'user', text: 'Unanswered' },
    ]);
    expect(msgs[0].to).toEqual(['gemini-2-5-flash', 'grok-4-3']);
    expect(msgs[2].to).toBeUndefined();
    expect(msgs[3].modelId).toBeUndefined();
    expect(msgs[4].to).toBeUndefined();
    expect(msgs[6].to).toEqual(['gemini-2-5-flash']);
    const t = SpaceCards.threads(msgs, ['gemini-2-5-flash', 'grok-4-3']);
    expect(t['grok-4-3'][0].replies[0]).toMatchObject({ model: 'grok-4-3', text: 'B' });
  });

  it('leaves messages already in the card shape alone', () => {
    const msg = { role: 'user', text: '/theme matrix', v: 2 };
    SpaceCards.tagLegacy([msg, { role: 'assistant', text: 'Done', agent: 'NICE', model: 'Gemini 2.5 Flash', v: 2 }]);
    expect(msg.to).toBeUndefined();
  });
});
