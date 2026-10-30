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
globalThis.CoreVoice = { stop() {}, isSpeaking: () => false, isMuted: () => false, canSpeak: () => false, getConfig: () => null };

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

// What the user does: type into the panel and press Enter.
function send(text) {
  const input = document.getElementById('nice-ai-input');
  input.value = text;
  PromptPanel._send();
}
const monitorOpen = () => document.querySelector('.app-main').classList.contains('monitor-active');

beforeEach(() => {
  PromptPanel.destroy();
  // The shell the panel mounts into: the view and the monitor overlay.
  document.body.innerHTML = '<div class="app-main"><div class="app-view-content" id="app-view"></div>'
    + '<div class="nice-monitor" id="nice-monitor"><button id="nice-monitor-back"></button><div id="nice-monitor-content"></div></div></div>';
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

  it('retries a failed card with the same prompt, alone', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push(JSON.parse(init.body));
      return ++n === 1
        ? { ok: false, status: 500, text: async () => JSON.stringify({ error: 'Provider timed out' }) }
        : { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'Crumb Theory' }] }) };
    });
    State.set('user', { id: 'u1' });
    PromptPanel._sendToCards('Name my bakery');
    await settled();
    expect(PromptPanel.messages().slice(-1)[0]).toMatchObject({ error: true, text: 'Provider timed out' });
    expect(PromptPanel.retryCard('gemini-2-5-flash')).toBe(true);
    await settled();
    const msgs = PromptPanel.messages();
    expect(msgs.map(m => m.text)).toEqual(['Name my bakery', 'Crumb Theory']);
    expect(calls[1].model).toBe('gemini-2-5-flash');
    expect(calls[1].messages.map(m => m.role)).toEqual(['user']);
    expect(PromptPanel.retryCard('gemini-2-5-flash')).toBe(false);
  });

  it('retries a failed card while another card is still answering', async () => {
    let releaseGrok;
    let geminiCalls = 0;
    globalThis.fetch = vi.fn((url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (body.model === 'grok-4-3') return new Promise(r => { releaseGrok = r; });
      return Promise.resolve(++geminiCalls === 1
        ? { ok: false, status: 500, text: async () => JSON.stringify({ error: 'Provider blew up' }) }
        : { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'Gemini on retry' }] }) });
    });
    State.set('user', { id: 'u1' });
    SpaceCards.toggle('grok-4-3');
    PromptPanel._sendToCards('Name my bakery');
    await vi.waitFor(() => expect(PromptPanel.messages().some(m => m.error)).toBe(true));
    expect(SpaceCards.live('grok-4-3')).toBeTruthy();
    expect(PromptPanel.retryCard('gemini-2-5-flash')).toBe(true);
    await vi.waitFor(() => expect(PromptPanel.messages().slice(-1)[0].text).toBe('Gemini on retry'));
    // Grok is still out, so the panel stays locked.
    expect(document.getElementById('nice-ai-send').disabled).toBe(true);
    expect(PromptPanel.retryCard('grok-4-3')).toBe(false);
    releaseGrok({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'Grok, late' }] }) });
    await settled();
    expect(document.getElementById('nice-ai-send').disabled).toBe(false);
  });

  it('does not retry for a signed-out visitor', async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: false, status: 500, text: async () => JSON.stringify({ error: 'Provider blew up' }) };
    });
    PromptPanel._sendToCards('Name my bakery');
    await settled();
    State.set('user', null);
    expect(PromptPanel.retryCard('gemini-2-5-flash')).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('raises one billing toast for cards that share an empty pool', async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (body.model === 'gemini-2-5-flash') {
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) };
      }
      return { ok: false, status: 402, text: async () => JSON.stringify({ error: 'Your Standard pool is empty.', code: 'insufficient_tokens' }) };
    });
    SpaceCards.toggle('grok-4-3');
    SpaceCards.toggle('deepseek-v4-flash');
    PromptPanel._sendToCards('Name my bakery');
    await settled();
    expect(PromptPanel.messages().filter(m => m.billing).map(m => m.modelId).sort()).toEqual(['deepseek-v4-flash', 'grok-4-3']);
    expect(Subscription.handleBillingError).toHaveBeenCalledTimes(1);
  });

  it('reads a card reply aloud once, not again when the monitor opens', async () => {
    CoreVoice.canSpeak = () => true;
    CoreVoice.speak = vi.fn();
    try {
      PromptPanel._sendToCards('Name my bakery');
      await settled();
      await vi.waitFor(() => expect(CoreVoice.speak).toHaveBeenCalledTimes(1));
      PromptPanel.toggle();
      expect(monitorOpen()).toBe(true);
      expect(CoreVoice.speak).toHaveBeenCalledTimes(1);
    } finally {
      CoreVoice.canSpeak = () => false;
      delete CoreVoice.speak;
    }
  });

  it('drops a reply still on its way when a guided flow takes over', async () => {
    let release;
    globalThis.fetch = vi.fn(() => new Promise(r => { release = r; }));
    PromptPanel._sendToCards('Slow one');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    PromptPanel.startFlow({ steps: [{ key: 'name', question: 'What is your business called?' }] });
    expect(SpaceCards.busy()).toBe(false);
    release({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'late' }] }) });
    await new Promise(r => setTimeout(r, 0));
    expect(PromptPanel.messages().map(m => m.text)).toEqual(['What is your business called?']);
    PromptPanel.cancelFlow();
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

describe('Sending from the panel on Space', () => {
  beforeEach(() => { State.set('user', { id: 'u1', email: 'pilot@test.com' }); });
  afterEach(() => { delete globalThis.Blueprints; delete globalThis.ShipLog; });

  it("answers slash commands itself on the monitor, then hides it when a prompt goes to the cards", async () => {
    send('/help');
    expect(calls).toHaveLength(0);
    expect(monitorOpen()).toBe(true);
    const help = PromptPanel.messages().slice(-2);
    expect(help[0].to).toBeUndefined();
    expect(help[1].modelId).toBeUndefined();
    send('Name my bakery');
    expect(monitorOpen()).toBe(false);
    await settled();
    expect(calls.map(c => c.model)).toEqual(['gemini-2-5-flash']);
    expect(PromptPanel.messages().slice(-1)[0]).toMatchObject({ modelId: 'gemini-2-5-flash' });
  });

  it('keeps navigation with NICE', () => {
    vi.useFakeTimers();
    try {
      send('create a mission');
      expect(monitorOpen()).toBe(true);
      // The reply lands after a short beat, then the command runs.
      vi.advanceTimersByTime(1000);
    } finally { vi.useRealTimers(); }
    expect(PromptPanel.messages().slice(-1)[0].text).toContain('Opening Missions');
    expect(calls).toHaveLength(0);
    expect(PromptPanel.messages().some(m => m.to || m.modelId)).toBe(false);
  });

  it('keeps auto-missions with NICE', async () => {
    send('write me a tagline');
    expect(monitorOpen()).toBe(true);
    await vi.waitFor(() => expect(PromptPanel.messages().slice(-1)[0].text).toContain('Mission Created'));
    expect(calls).toHaveLength(0);
    expect(PromptPanel.messages().some(m => m.to || m.modelId)).toBe(false);
  });

  describe('a reply that asks NICE to run a command', () => {
    let run;
    beforeEach(() => {
      State.set('spaceships', [{ id: 's1' }]); // review mode is the default
      run = vi.fn(async (input) => ({ ok: true, msg: `Mission created: ${input.title}` }));
      ToolRegistry.register({ id: 'create-mission', name: 'Create Mission', sideEffect: true, execute: run });
      globalThis.fetch = vi.fn(async (url, init) => {
        calls.push(JSON.parse(init.body));
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'On it. [EXEC: create_mission | Write a tagline]' }] }) };
      });
    });
    const id = 'gemini-2-5-flash';

    it('asks on the card, not behind it, and runs the command once approved', async () => {
      send('Plan my launch');
      await vi.waitFor(() => expect(SpaceCards.approval(id)).toBeTruthy());
      expect(SpaceCards.approval(id)).toMatchObject({ tool: 'Create Mission', input: { title: 'Write a tagline' } });
      expect(monitorOpen()).toBe(false);
      expect(document.querySelector('.monitor-approval')).toBeNull();
      expect(run).not.toHaveBeenCalled();
      SpaceCards.answer(id, true, SpaceCards.approval(id).token);
      await vi.waitFor(() => expect(PromptPanel.messages().slice(-1)[0]).toMatchObject({ modelId: id, note: true, text: '**Done:** Mission created: Write a tagline' }));
      expect(run).toHaveBeenCalledTimes(1);
      expect(SpaceCards.approval(id)).toBeNull();
    });

    it('records a denial on the card and runs nothing', async () => {
      send('Plan my launch');
      await vi.waitFor(() => expect(SpaceCards.approval(id)).toBeTruthy());
      SpaceCards.answer(id, false, SpaceCards.approval(id).token);
      await vi.waitFor(() => expect(PromptPanel.messages().slice(-1)[0]).toMatchObject({ modelId: id, note: true }));
      expect(PromptPanel.messages().slice(-1)[0].text).toContain('Cancelled');
      expect(run).not.toHaveBeenCalled();
    });

    it('answers only the request the buttons were drawn for (a double click runs one command)', async () => {
      globalThis.fetch = vi.fn(async (url, init) => {
        calls.push(JSON.parse(init.body));
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'Two. [EXEC: create_mission | First one] [EXEC: create_mission | Second one]' }] }) };
      });
      send('Plan two things');
      await vi.waitFor(() => expect(SpaceCards.approval(id)).toBeTruthy());
      const first = SpaceCards.approval(id).token;
      expect(SpaceCards.answer(id, true, first)).toBe(true);
      await vi.waitFor(() => expect(SpaceCards.approval(id)?.input).toEqual({ title: 'Second one' }));
      // The second click of the double click still carries the first token.
      expect(SpaceCards.answer(id, true, first)).toBe(false);
      await new Promise(r => setTimeout(r, 0));
      expect(run).toHaveBeenCalledTimes(1);
      expect(SpaceCards.approval(id)).toBeTruthy();
    });

    it('runs nothing when several cards answer at once, and says so on each card', async () => {
      globalThis.fetch = vi.fn(async (url, init) => {
        calls.push(JSON.parse(init.body));
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'Done, I created the mission for you. [EXEC: create_mission | Multi]' }] }) };
      });
      SpaceCards.toggle('grok-4-3');
      send('Plan my launch');
      await settled();
      await new Promise(r => setTimeout(r, 0));
      expect(run).not.toHaveBeenCalled();
      expect(SpaceCards.approval(id)).toBeNull();
      const notes = PromptPanel.messages().filter(m => m.note);
      expect(notes.map(m => m.modelId).sort()).toEqual(['gemini-2-5-flash', 'grok-4-3']);
      expect(notes[0].text).toBe('This model asked to run Create Mission. Send to this card alone to run it.');
      // Each note sits in its own card's exchange.
      const t = SpaceCards.threads(PromptPanel.messages());
      expect(t['grok-4-3'][0].replies.map(r => !!r.note)).toEqual([false, true]);
    });

    it('skips the waiting command when a new prompt goes to the card, under the reply that asked', async () => {
      let n = 0;
      globalThis.fetch = vi.fn(async (url, init) => {
        calls.push(JSON.parse(init.body));
        const text = ++n === 1 ? 'On it. [EXEC: create_mission | Pending one]' : 'Plain answer.';
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text }] }) };
      });
      send('Plan my launch');
      await vi.waitFor(() => expect(SpaceCards.approval(id)).toBeTruthy());
      send('Something else');
      await settled();
      await vi.waitFor(() => expect(PromptPanel.messages().some(m => m.note)).toBe(true));
      expect(SpaceCards.approval(id)).toBeNull();
      expect(run).not.toHaveBeenCalled();
      const t = SpaceCards.threads(PromptPanel.messages())[id];
      expect(t.map(ex => [ex.ask.text, ex.replies.map(r => r.text)])).toEqual([
        ['Plan my launch', ['On it. [EXEC: create_mission | Pending one]', '**Skipped:** Create Mission did not run because you sent this card a new prompt first.']],
        ['Something else', ['Plain answer.']],
      ]);
      expect(PromptPanel.messages().some(m => /declined/.test(m.text || ''))).toBe(false);
    });

    it('drops the question when the chat is cleared', async () => {
      send('Plan my launch');
      await vi.waitFor(() => expect(SpaceCards.approval(id)).toBeTruthy());
      send('/clear');
      expect(SpaceCards.approval(id)).toBeNull();
      await new Promise(r => setTimeout(r, 0));
      expect(run).not.toHaveBeenCalled();
      expect(PromptPanel.messages()).toEqual([]);
    });

    it('drops the question when another conversation opens', async () => {
      send('Plan my launch');
      await vi.waitFor(() => expect(SpaceCards.approval(id)).toBeTruthy());
      PromptPanel._reload();
      expect(SpaceCards.approval(id)).toBeNull();
      await new Promise(r => setTimeout(r, 0));
      expect(run).not.toHaveBeenCalled();
      expect(PromptPanel.messages().some(m => m.note)).toBe(false);
    });
  });

  it('keeps the prompt and says how to turn a model on when none is on', () => {
    State.set('enabled_models', {});
    PromptPanel._renderTargets();
    expect(document.getElementById('nice-ai-targets').hidden).toBe(true);
    send('Name my bakery');
    expect(calls).toHaveLength(0);
    expect(document.getElementById('nice-ai-input').value).toBe('Name my bakery');
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'No model is on' }));
    expect(PromptPanel.messages()).toEqual([]);
  });

  it('sends an @mention to the agent, not the cards', async () => {
    localStorage.setItem(Utils.KEYS.mcShip, 's1');
    State.set('spaceships', [{ id: 's1', slot_assignments: { 0: 'a1' } }]);
    State.set('agents', [{ id: 'a1', name: 'Scout', config: { role: 'Research' } }]);
    globalThis.Blueprints = { getAgent: (id) => (id === 'a1' ? { id: 'a1', name: 'Scout', config: {} } : null) };
    globalThis.ShipLog = { execute: vi.fn(async () => ({ content: 'Found 3 leads', agent: 'Scout' })) };
    send('@Scout find leads');
    expect(monitorOpen()).toBe(true);
    await vi.waitFor(() => expect(PromptPanel.messages().slice(-1)[0].text).toBe('Found 3 leads'));
    expect(ShipLog.execute).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(SpaceCards.offCard(PromptPanel.messages())).toHaveLength(1);
  });

  it('frees the cards when the server error merely mentions an abort', async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push(JSON.parse(init.body));
      return calls.length === 1
        ? { ok: false, status: 502, text: async () => JSON.stringify({ error: 'Upstream request aborted after 60s' }) }
        : { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ content: [{ type: 'text', text: 'Four.' }] }) };
    });
    send('what is two plus two');
    await settled();
    expect(PromptPanel.messages().slice(-1)[0]).toMatchObject({ modelId: 'gemini-2-5-flash', error: true, text: 'Upstream request aborted after 60s' });
    expect(document.getElementById('nice-ai-send').disabled).toBe(false);
    send('try again');
    await settled();
    expect(calls).toHaveLength(2);
    expect(PromptPanel.messages().slice(-1)[0]).toMatchObject({ modelId: 'gemini-2-5-flash', text: 'Four.' });
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

describe('Opening a stored conversation from the sidebar', () => {
  const store = (msgs) => localStorage.setItem(Utils.KEYS.aiMessages, JSON.stringify(msgs));

  it("shows NICE's own replies on the monitor, over the cards", () => {
    store([
      { role: 'user', text: 'Name it', to: ['gemini-2-5-flash'], v: 2 },
      { role: 'assistant', text: 'Rise & Co.', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
      { role: 'user', text: '@Scout find leads', v: 2 },
      { role: 'assistant', text: 'Found 3 leads', agent: 'Scout', v: 2 },
    ]);
    PromptPanel._showConversation();
    expect(monitorOpen()).toBe(true);
    expect(document.getElementById('nice-monitor-content').textContent).toContain('Found 3 leads');
  });

  it('opens straight onto the cards when every reply sits on one', () => {
    store([
      { role: 'user', text: 'Name it', to: ['gemini-2-5-flash'], v: 2 },
      { role: 'assistant', text: 'Rise & Co.', modelId: 'gemini-2-5-flash', agent: 'NICE', v: 2 },
    ]);
    PromptPanel._showConversation();
    expect(monitorOpen()).toBe(false);
    expect(SpaceCards.threads(PromptPanel.messages())['gemini-2-5-flash']).toHaveLength(1);
  });

  it('lands on Space from another page and keeps the monitor up', async () => {
    // The full panel this time: its hashchange handler closes the monitor on
    // navigation, except for the hop this open makes.
    PromptPanel.destroy();
    PromptPanel.init();
    history.replaceState(null, '', '#/crew');
    store([{ role: 'user', text: '/help', v: 2 }, { role: 'assistant', text: 'Slash commands', agent: null, v: 2 }]);
    PromptPanel._showConversation();
    expect(location.hash).toBe('#/space');
    await new Promise(r => setTimeout(r, 0));
    expect(monitorOpen()).toBe(true);
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

describe('PromptPanel._md lists', () => {
  it('puts no line breaks between list items or under the list', () => {
    const html = PromptPanel._md('Ideas:\n\n- Morning ritual\n- Neighborhood\n\n1. One\n2. Two\n\nWant more?');
    expect(html).toContain('<ul><li>Morning ritual</li><li>Neighborhood</li></ul>');
    expect(html).toContain('<ol><li class="monitor-ol-item">One</li><li class="monitor-ol-item">Two</li></ol>');
    expect(html).not.toMatch(/<\/(ul|ol)><br>/);
    expect(html).toContain('Want more?');
  });

  it('keeps line breaks in ordinary text', () => {
    expect(PromptPanel._md('Line one\nLine two')).toBe('<p>Line one<br>Line two</p>');
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
