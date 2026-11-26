import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* OwnKeys is loaded by setup.js. A fake window.NiceDesktop.llm, shaped like
   desktop/preload.js. */
function fakeLlm({ keys = { openai: true }, models = { openai: [{ id: 'gpt-5', label: 'GPT-5' }, { id: 'gpt-4o', label: 'GPT-4o' }] } } = {}) {
  const saved = { ...keys };
  return {
    providers: vi.fn(async () => [
      { id: 'anthropic', label: 'Anthropic', hasKey: !!saved.anthropic },
      { id: 'openai', label: 'OpenAI', hasKey: !!saved.openai },
    ]),
    models: vi.fn(async (p) => {
      if (models[p] instanceof Error) throw { code: 'EKEY', message: models[p].message };
      return models[p] || [];
    }),
    setKey: vi.fn(async (p) => { saved[p] = true; return models[p] || []; }),
    clearKey: vi.fn(async (p) => { delete saved[p]; }),
    chat: vi.fn(async () => ({ content: [{ type: 'text', text: 'hi' }] })),
  };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => { OwnKeys._test.reset(); localStorage.removeItem(Utils.KEYS.ownModels); delete window.NiceDesktop; });
afterEach(() => { delete window.NiceDesktop; document.body.innerHTML = ''; });

describe('OwnKeys', () => {
  it('reads and makes own-key ids', () => {
    expect(OwnKeys.idFor('openai', 'gpt-5')).toBe('byo:openai:gpt-5');
    expect(OwnKeys.parse('byo:groq:meta-llama/llama-4:scout')).toEqual({ provider: 'groq', model: 'meta-llama/llama-4:scout' });
    for (const bad of ['gpt-5', 'byo:', 'byo:openai', 'byo:openai:', 'byo::x', null]) expect(OwnKeys.parse(bad)).toBeNull();
    expect(OwnKeys.isOwnKey('byo:openai:gpt-5')).toBe(true);
    expect(OwnKeys.isOwnKey('gpt-5-mini')).toBe(false);
  });

  it('is off on the website: no models, and a call says it runs in the desktop app', async () => {
    expect(OwnKeys.available()).toBe(false);
    await OwnKeys.load();
    expect(OwnKeys.models()).toEqual([]);
    OwnKeys.setOn('byo:openai:gpt-5', true);
    expect(OwnKeys.switchedOn()).toEqual([]);
    await expect(OwnKeys.chat({})).rejects.toMatchObject({ code: 'ENODESKTOP' });
  });

  it('loads the models of providers with a key, and says when a list fails', async () => {
    window.NiceDesktop = { llm: fakeLlm({ keys: { openai: true, anthropic: true }, models: { openai: [{ id: 'gpt-5', label: 'GPT-5' }], anthropic: new Error('Anthropic refused the key.') } }) };
    const heard = vi.fn();
    document.addEventListener(OwnKeys.EVENT, heard);
    await OwnKeys.load();
    document.removeEventListener(OwnKeys.EVENT, heard);
    expect(heard).toHaveBeenCalled();
    expect([...OwnKeys.groups().keys()]).toEqual(['anthropic', 'openai']);
    expect(OwnKeys.groups().get('anthropic')).toMatchObject({ models: [], error: 'Anthropic refused the key.' });
    expect(OwnKeys.models()).toEqual([{ id: 'byo:openai:gpt-5', label: 'GPT-5', provider: 'openai', providerLabel: 'OpenAI' }]);
    expect(OwnKeys.label('byo:openai:gpt-5')).toBe('GPT-5');
    expect(OwnKeys.label('byo:openai:gpt-9')).toBe('gpt-9');
    expect(OwnKeys.providerLabel('byo:openai:gpt-5')).toBe('OpenAI (your key)');
  });

  it('tries the providers again after a failed read', async () => {
    const llm = fakeLlm();
    llm.providers.mockRejectedValueOnce({ code: 'EUNKNOWN', message: 'x' });
    window.NiceDesktop = { llm };
    await OwnKeys.load();
    expect(OwnKeys.models()).toEqual([]);
    await OwnKeys.load();
    expect(OwnKeys.models()).toHaveLength(2);
  });

  it('keeps the switched-on models on this computer, and offers only those that can run', async () => {
    window.NiceDesktop = { llm: fakeLlm() };
    await OwnKeys.load();
    OwnKeys.setOn('byo:openai:gpt-5', true);
    OwnKeys.setOn('byo:openai:gone', true);
    OwnKeys.setOn('not-own', true);
    expect(JSON.parse(localStorage.getItem(Utils.KEYS.ownModels))).toEqual(['byo:openai:gpt-5', 'byo:openai:gone']);
    expect(OwnKeys.switchedOn()).toEqual(['byo:openai:gpt-5']);
    OwnKeys.setOn('byo:openai:gpt-5', false);
    expect(OwnKeys.switchedOn()).toEqual([]);
  });

  it('lets the user switch a provider\'s models on in API keys', async () => {
    window.NiceDesktop = { llm: fakeLlm() };
    await OwnKeys.load();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    await OwnKeys.openKeys(opener);
    await flush();
    const row = document.querySelector('.own-key-row[data-provider="openai"]');
    expect(row.querySelector('summary').textContent).toBe('In Space and chat: 0 of 2 models');
    const box = row.querySelector('input[data-model="byo:openai:gpt-5"]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(OwnKeys.isOn('byo:openai:gpt-5')).toBe(true);
    expect(row.querySelector('summary').textContent).toBe('In Space and chat: 1 of 2 models');
    // A provider without a key has no model list.
    expect(document.querySelector('.own-key-row[data-provider="anthropic"] details')).toBeNull();
    document.getElementById('own-keys-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('own-keys-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('shows the model switches once the list loads, when the dialog opened first', async () => {
    window.NiceDesktop = { llm: fakeLlm() };
    await OwnKeys.openKeys();
    await flush();
    expect(document.querySelector('.own-key-row[data-provider="openai"] details')).toBeNull();
    await OwnKeys.load();
    await flush();
    expect(document.querySelector('.own-key-row[data-provider="openai"] summary').textContent).toBe('In Space and chat: 0 of 2 models');
  });

  it('keeps focus on the same switch when the list repaints', async () => {
    window.NiceDesktop = { llm: fakeLlm() };
    await OwnKeys.load();
    await OwnKeys.openKeys();
    await flush();
    const box = () => document.querySelector('input[data-model="byo:openai:gpt-4o"]');
    document.querySelector('.own-key-row[data-provider="openai"] details').open = true;
    box().focus();
    await OwnKeys.load(true);
    await flush();
    expect(document.activeElement).toBe(box());
  });

  it('closes when the route changes', async () => {
    window.NiceDesktop = { llm: fakeLlm() };
    await OwnKeys.openKeys();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.getElementById('own-keys-dialog')).toBeNull();
  });

  it('keys names and model names out of the markup', async () => {
    window.NiceDesktop = { llm: fakeLlm({ models: { openai: [{ id: 'x"><img src=x onerror=alert(1)>', label: '<b>bold</b>' }] } }) };
    await OwnKeys.load();
    await OwnKeys.openKeys();
    await flush();
    const list = document.getElementById('own-keys-list');
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
    expect(list.querySelector('.own-key-model span').textContent).toBe('<b>bold</b>');
  });
});
