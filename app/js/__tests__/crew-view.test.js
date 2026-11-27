/**
 * CrewView (#/crew): one card per crew member framed in its model's
 * provider color, live status from AgentActivity, the agent's latest
 * exchanges from ShipLog, each card's own conversation (AgentExecutor), and
 * the ship's recent runs with an approval bar for runs in review.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
function load(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}
// model-catalog.js is UMD: hide `module` so it assigns the browser global.
new Function('module', 'self', readFileSync(resolve(__dir, '../lib/model-catalog.js'), 'utf-8'))(undefined, globalThis);

const CREW = [
  { index: 0, slot: { label: 'Head Baker', role: 'captain', title: null }, agentId: 'a1', agent: { id: 'a1', name: 'Baker Bot', config: { llm_engine: 'claude-4-6-sonnet' } } },
  { index: 1, slot: { label: 'Orders & Payments', role: 'finance', title: null }, agentId: 'a2', agent: { id: 'a2', name: 'Orders Agent', config: { llm_engine: 'gemini-2-5-flash' } } },
  { index: 2, slot: { label: 'Agent 3', role: 'marketing', title: null }, agentId: null, agent: null },
];

let shipId = 'ship-1';
let runs = [];
let entries = [];
let states = {};
let activityListeners = [];

globalThis.Blueprints = {
  getCurrentShipId: () => shipId,
  getUserShips: () => (shipId ? [{ id: 'ship-1', name: 'Sunrise Bakery' }] : []),
  getShipCrew: () => CREW,
};
globalThis.LLMConfig = { forBlueprint: (a) => ({ model: (a.config && a.config.llm_engine) || 'gemini-2-5-flash' }) };
globalThis.AgentActivity = {
  getState: (id) => states[id] || 'idle',
  subscribe: (fn) => { activityListeners.push(fn); return () => { activityListeners = activityListeners.filter(f => f !== fn); }; },
};
globalThis.ShipLog = { getEntries: async () => entries };
const realtime = { subscribe: vi.fn(() => ({ id: 'chan' })), unsubscribe: vi.fn() };
globalThis.SB = { db: () => ({ list: async () => runs }), realtime };
globalThis.PromptPanel = {};
globalThis.MissionRunner = {
  approveRun: vi.fn(async () => ({ resumed: false, persisted: true })),
  rejectRun: vi.fn(async () => ({ persisted: true })),
};
globalThis.Notify = { send: vi.fn() };

// CSelect reads these; jsdom has neither.
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!globalThis.CSS) globalThis.CSS = {};
if (!CSS.escape) CSS.escape = (v) => String(v).replace(/["\\]/g, '\\$&');
load('lib/cselect.js');
load('views/crew.js');

const flush = () => new Promise(r => setTimeout(r, 0));
let el;

beforeEach(() => {
  CrewView.destroy();
  State._reset();
  localStorage.clear();
  shipId = 'ship-1';
  runs = [];
  entries = [];
  states = {};
  vi.clearAllMocks();
  history.replaceState(null, '', '#/crew');
  document.body.innerHTML = '<div id="app-view"></div>';
  el = document.getElementById('app-view');
});

describe('CrewView', () => {
  it('shows the empty state when the user runs no spaceship', () => {
    shipId = null;
    CrewView.render(el);
    expect(el.querySelector('.crew-empty a[href="#/blueprints?tab=spaceship"]')).not.toBeNull();
    expect(el.querySelector('.crew-card')).toBeNull();
    expect(el.querySelector('.crew-empty h1').textContent).toBe('No project yet');
    expect(el.querySelector('.crew-empty a.btn-primary').textContent).toBe('Choose a project');
  });

  it('keeps open stations and the Captain role in a sci-fi theme', () => {
    const prev = globalThis.Theme;
    globalThis.Theme = { current: () => 'matrix' };
    try {
      CrewView.render(el);
      expect(el.querySelector('.crew-card-names span').textContent).toBe('Captain');
      expect(el.querySelector('.crew-card-open').textContent).toContain('Open station');
      expect(el.querySelector('.crew-head-text p:last-child').textContent).toBe('2 agents on 2 models, 1 open station');
    } finally {
      if (prev === undefined) delete globalThis.Theme; else globalThis.Theme = prev;
    }
  });

  it('renders one card per crew member, framed in its provider color', () => {
    CrewView.render(el);
    const cards = [...el.querySelectorAll('.crew-card:not(.crew-card-open)')];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('h3').textContent).toBe('Head Baker');
    expect(cards[0].querySelector('.crew-card-names span').textContent).toBe('Lead');
    expect(cards[0].querySelector('.crew-model').textContent).toContain('Claude 4.6 Sonnet');
    expect(cards[0].style.getPropertyValue('--crew-c')).toBe(ModelCatalog.providerColor('claude-4-6-sonnet'));
    expect(cards[1].style.getPropertyValue('--crew-c')).toBe(ModelCatalog.providerColor('gemini-2-5-flash'));
    expect(el.querySelector('.crew-card-open').textContent).toContain('Open role');
  });

  it('keeps a quote in a crew name inside its attributes', () => {
    const bad = 'Q" onmouseover="window.__pwned=1';
    const saved = { label: CREW[1].slot.label, name: CREW[1].agent.name };
    CREW[1].slot.label = bad;
    CREW[1].agent.name = bad;
    try {
      CrewView.render(el);
      expect(el.querySelector('[onmouseover]')).toBeNull();
      const card = el.querySelector('.crew-card[data-slot="1"]');
      expect(card.getAttribute('aria-label')).toBe(bad);
      expect(card.querySelector('.crew-send').getAttribute('aria-label')).toBe('Send to ' + bad);
    } finally {
      CREW[1].slot.label = saved.label;
      CREW[1].agent.name = saved.name;
    }
  });

  it('summarizes the crew in the header', () => {
    CrewView.render(el);
    expect(el.querySelector('.crew-head h1').textContent).toBe('Sunrise Bakery');
    expect(el.querySelector('.crew-head-text p:last-child').textContent).toBe('2 agents on 2 models, 1 open role');
  });

  it('opens the ship named in the URL', () => {
    history.replaceState(null, '', '#/crew?ship=ship-9');
    CrewView.render(el);
    expect(localStorage.getItem(Utils.KEYS.mcShip)).toBe('ship-9');
  });

  describe('the model menu on a card', () => {
    const LABELS = { 'nice-auto': 'NICE Auto', 'gemini-2-5-flash': 'Gemini 2.5 Flash', 'grok-4-3': 'Grok 4.3', 'claude-4-6-sonnet': 'Claude 4.6 Sonnet' };
    beforeEach(() => {
      globalThis.SpaceCards = { available: () => ['gemini-2-5-flash', 'grok-4-3'], label: (id) => LABELS[id] || id };
      Blueprints.setAgentModel = vi.fn(async (id, model) => ({ id, config: { llm_engine: model, model_chosen: true } }));
      // a2 is one of the user's agents; a1 is a catalog agent.
      State.set('agents', [{ id: 'a2', name: 'Orders Agent', config: { llm_engine: 'gemini-2-5-flash' } }]);
    });
    afterEach(() => { delete globalThis.SpaceCards; delete Blueprints.setAgentModel; delete globalThis.AgentExecutor; });
    const options = (slot) => [...el.querySelectorAll(`#crew-model-${slot} .bp-cselect-option`)].map(o => o.textContent);

    it('offers NICE Auto and the models the user can run, on their own agents only', () => {
      CrewView.render(el);
      expect(options(1)).toEqual(['NICE Auto', 'Gemini 2.5 Flash', 'Grok 4.3']);
      expect(el.querySelector('#crew-model-1 .bp-cselect-label').textContent).toBe('Gemini 2.5 Flash');
      expect(el.querySelector('#crew-model-1 .bp-cselect-trigger').getAttribute('aria-label')).toBe('Model for Orders & Payments');
      expect(el.querySelector('#crew-model-0')).toBeNull();
      expect(el.querySelector('.crew-card[data-slot="0"] .crew-model').textContent).toContain('Claude 4.6 Sonnet');
    });

    it('keeps the agent\'s current model in the list when the plan does not offer it', () => {
      State.set('agents', [{ id: 'a2', name: 'Orders Agent', config: { llm_engine: 'claude-4-6-sonnet' } }]);
      CREW[1].agent.config.llm_engine = 'claude-4-6-sonnet';
      try {
        CrewView.render(el);
        expect(options(1)).toEqual(['NICE Auto', 'Claude 4.6 Sonnet', 'Gemini 2.5 Flash', 'Grok 4.3']);
      } finally {
        CREW[1].agent.config.llm_engine = 'gemini-2-5-flash';
      }
    });

    it('saves a pick to the agent', async () => {
      CrewView.render(el);
      el.querySelector('#crew-model-1 .bp-cselect-option[data-value="grok-4-3"]').click();
      await flush();
      expect(Blueprints.setAgentModel).toHaveBeenCalledWith('a2', 'grok-4-3');
    });

    it('puts the menu back and says why when the save fails', async () => {
      Blueprints.setAgentModel = vi.fn(async () => { throw new Error('You are offline. Try again when you are back online.'); });
      CrewView.render(el);
      el.querySelector('#crew-model-1 .bp-cselect-option[data-value="grok-4-3"]').click();
      await flush();
      expect(el.querySelector('#crew-model-1').dataset.value).toBe('gemini-2-5-flash');
      expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Model not changed', message: 'You are offline. Try again when you are back online.' }));
    });

    it('waits while the card is answering', () => {
      State.set('user', { id: 'u1' });
      globalThis.AgentExecutor = { converse: vi.fn(() => ({ send: () => new Promise(() => {}) })) };
      CrewView.render(el);
      const form = el.querySelector('.crew-compose[data-slot="1"]');
      form.querySelector('input').value = 'Busy';
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      el.querySelector('#crew-model-1 .bp-cselect-option[data-value="grok-4-3"]').click();
      expect(Blueprints.setAgentModel).not.toHaveBeenCalled();
      expect(el.querySelector('#crew-model-1').dataset.value).toBe('gemini-2-5-flash');
    });
  });

  describe('a card as its own chat window', () => {
    // A conversation per call to converse(), answering when the test says.
    function fakeExecutor() {
      const convos = [];
      globalThis.AgentExecutor = {
        converse: vi.fn((agent, opts) => {
          const c = { agent, opts, sends: [] };
          c.send = vi.fn((text) => new Promise((resolve, reject) => c.sends.push({ text, resolve, reject })));
          convos.push(c);
          return c;
        }),
      };
      return convos;
    }
    const send = (slot, text) => {
      const form = el.querySelector(`.crew-compose[data-slot="${slot}"]`);
      form.querySelector('input').value = text;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      return form;
    };
    const card = (slot) => el.querySelector(`.crew-card[data-slot="${slot}"]`);

    beforeEach(() => { State.set('user', { id: 'u1' }); });
    afterEach(() => { delete globalThis.AgentExecutor; delete globalThis.NICE; });

    it('sends to that agent and shows the reply in its own card', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      const form = send(1, 'How many pre-orders came in?');
      expect(AgentExecutor.converse).toHaveBeenCalledWith(CREW[1].agent, expect.objectContaining({ spaceshipId: 'ship-1' }));
      expect(convos[0].sends[0].text).toBe('How many pre-orders came in?');
      expect(form.querySelector('input').value).toBe('');
      expect(card(1).querySelector('.crew-log').textContent).toContain('Working…');
      expect(card(1).getAttribute('aria-busy')).toBe('true');
      expect(card(1).querySelector('.crew-status').textContent).toContain('Working…');
      expect(card(1).querySelector('.crew-send').getAttribute('aria-label')).toBe('Stop Orders & Payments');
      PromptPanel._md = (t) => '<p>' + t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>';
      try {
        convos[0].sends[0].resolve({ text: '**42** pre-orders', done: true });
        await flush();
      } finally {
        delete PromptPanel._md;
      }
      const log = card(1).querySelector('.crew-log');
      expect(log.textContent).toContain('How many pre-orders came in?');
      expect(log.querySelector('.crew-reply strong').textContent).toBe('42');
      expect(card(1).hasAttribute('aria-busy')).toBe(false);
      expect(card(0).querySelector('.crew-log').textContent).not.toContain('pre-orders');
    });

    it('keeps one conversation per card, so a follow-up carries the context', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'First');
      convos[0].sends[0].resolve({ text: 'One', done: true });
      await flush();
      send(1, 'Second');
      expect(AgentExecutor.converse).toHaveBeenCalledTimes(1);
      expect(convos[0].sends[1].text).toBe('Second');
    });

    it('lets two cards work at the same time', () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(0, 'Plan tomorrow');
      send(1, 'Count orders');
      expect(convos).toHaveLength(2);
      expect(card(0).getAttribute('aria-busy')).toBe('true');
      expect(card(1).getAttribute('aria-busy')).toBe('true');
    });

    it('stops a card when asked, before its next step', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'Long job');
      card(1).querySelector('[data-crew-action="stop"]').click();
      expect(convos[0].opts.shouldStop()).toBe(true);
      expect(card(1).querySelector('.crew-log').textContent).toContain('Stopping…');
      convos[0].sends[0].resolve({ text: '', stopped: true, done: false });
      await flush();
      expect(card(1).querySelector('.crew-reply').textContent).toContain('Stopped.');
    });

    it('asks on the card before a tool that needs approval', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'Email the supplier');
      const answer = convos[0].opts.onApprovalNeeded({ tool: 'gmail_send', input: { to: 'a@b.c' } });
      const box = card(1).querySelector('.crew-approval');
      expect(box.textContent).toContain('wants to use gmail_send');
      expect(card(1).querySelector('.crew-status').textContent).toContain('Waiting for you');
      box.querySelector('[data-crew-action="allow"]').click();
      expect(await answer).toBe(true);
      expect(card(1).querySelector('.crew-approval')).toBeNull();
    });

    it('shows a failed reply on its card', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'Anything');
      convos[0].sends[0].reject(new Error('The model is busy. Try again.'));
      await flush();
      const reply = card(1).querySelector('.crew-reply.is-error');
      expect(reply.textContent).toContain('The model is busy. Try again.');
    });

    it('asks a signed-out user to sign in instead of sending', () => {
      fakeExecutor();
      State.set('user', null);
      globalThis.NICE = { openModal: vi.fn() };
      CrewView.render(el);
      send(1, 'Hello');
      expect(NICE.openModal).toHaveBeenCalledWith('modal-auth');
      expect(AgentExecutor.converse).not.toHaveBeenCalled();
    });

    it('says on the card, for screen readers, when a reply lands', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'Hi');
      convos[0].sends[0].resolve({ text: 'Hello', done: true });
      await flush();
      expect(el.querySelector('#crew-say-1').textContent).toBe('Orders & Payments replied.');
      expect(el.querySelector('#crew-say-1').getAttribute('aria-live')).toBe('polite');
    });

    it('refuses a second message while the card is answering', () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'First');
      const form = send(1, 'Second');
      expect(convos[0].sends).toHaveLength(1);
      expect(form.querySelector('input').value).toBe('Second');
      expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Still answering' }));
    });

    it('turns down a waiting approval when the card is stopped', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'Email the supplier');
      const answer = convos[0].opts.onApprovalNeeded({ tool: 'gmail_send', input: {} });
      const token = card(1).querySelector('[data-crew-action="allow"]').dataset.token;
      card(1).querySelector('[data-crew-action="stop"]').click();
      expect(await answer).toBe(false);
      expect(card(1).querySelector('.crew-approval')).toBeNull();
      expect(document.activeElement).toBe(card(1).querySelector('.crew-compose input'));
      // A click on the old box after the stop does nothing.
      const late = document.createElement('button');
      late.dataset.crewAction = 'allow'; late.dataset.slot = '1'; late.dataset.token = token;
      card(1).appendChild(late);
      late.click();
      expect(convos[0].opts.shouldStop()).toBe(true);
    });

    it('drops a reply that lands after the project changed', async () => {
      const convos = fakeExecutor();
      CrewView.render(el);
      send(1, 'Slow one');
      shipId = 'ship-2';
      CrewView.render(el);
      convos[0].sends[0].resolve({ text: 'Late answer', done: true });
      await flush();
      expect(el.textContent).not.toContain('Late answer');
      expect(convos[0].opts.shouldStop()).toBe(true);
    });

    it('drops a log read that comes back after the project changed', async () => {
      let release;
      const realGet = ShipLog.getEntries;
      ShipLog.getEntries = vi.fn((id) => id === 'ship-1'
        ? new Promise(r => { release = () => r([{ agent_id: 'a2', role: 'agent', content: 'From ship one', metadata: { event: 'final_answer' } }]); })
        : Promise.resolve([{ agent_id: 'a2', role: 'agent', content: 'From ship two', metadata: { event: 'final_answer' } }]));
      try {
        CrewView.render(el);
        shipId = 'ship-2';
        CrewView.render(el);
        await flush();
        release();
        await flush();
        await flush();
        expect(el.textContent).not.toContain('From ship one');
        // The new project's own log is still read.
        expect(ShipLog.getEntries).toHaveBeenCalledWith('ship-2', expect.any(Number));
        expect(card(1).querySelector('.crew-log').textContent).toContain('From ship two');
      } finally {
        ShipLog.getEntries = realGet;
      }
    });

    it('matches a sent exchange to its log row by the server clock, not the browser one', async () => {
      const convos = fakeExecutor();
      const t = (s) => new Date(Date.now() - s * 1000).toISOString();
      // The server's clock runs 30 seconds behind the browser's.
      entries = [
        { agent_id: 'a2', role: 'user', content: 'Earlier', metadata: { event: 'turn_start' }, created_at: t(90) },
        { agent_id: 'a2', role: 'agent', content: 'Earlier answer', metadata: { event: 'final_answer' }, created_at: t(89) },
      ];
      CrewView.render(el);
      await flush();
      send(1, 'Now');
      convos[0].sends[0].resolve({ text: 'Now answer', done: true });
      await flush();
      entries.push(
        { agent_id: 'a2', role: 'user', content: 'From a mission', metadata: { event: 'mission_start' }, created_at: t(40) },
        { agent_id: 'a2', role: 'agent', content: 'Mission answer', metadata: { event: 'final_answer' }, created_at: t(39) },
        { agent_id: 'a2', role: 'user', content: 'Now', metadata: { event: 'turn_start' }, created_at: t(31) },
        { agent_id: 'a2', role: 'agent', content: 'Now answer', metadata: { event: 'final_answer' }, created_at: t(30) },
      );
      CrewView.render(el);
      await flush();
      card(1).querySelector('[data-crew-action="expand"]').click();
      const text = card(1).querySelector('.crew-log').textContent;
      expect(text.match(/Now answer/g)).toHaveLength(1);
      expect(text).toContain('Mission answer');
      expect(text.indexOf('Mission answer')).toBeLessThan(text.indexOf('Now answer'));
    });

    it('shows the whole conversation on Show all, without repeating what the log already has', async () => {
      const convos = fakeExecutor();
      entries = [
        { agent_id: 'a2', role: 'user', content: 'Old question', metadata: { event: 'turn_start' } },
        { agent_id: 'a2', role: 'agent', content: 'Old answer', metadata: { event: 'final_answer' } },
      ];
      CrewView.render(el);
      await flush();
      send(1, 'New question');
      convos[0].sends[0].resolve({ text: 'New answer', done: true });
      await flush();
      // The log now holds the new exchange too, as AgentExecutor wrote it.
      entries.push(
        { agent_id: 'a2', role: 'user', content: 'New question', metadata: { event: 'turn_start' }, created_at: new Date().toISOString() },
        { agent_id: 'a2', role: 'agent', content: 'New answer', metadata: { event: 'final_answer' }, created_at: new Date().toISOString() },
      );
      CrewView.render(el);
      await flush();
      expect(card(1).querySelector('.crew-log').textContent).not.toContain('Old answer');
      const more = card(1).querySelector('[data-crew-action="expand"]');
      expect(more.textContent).toBe('Show all');
      more.click();
      const log = card(1).querySelector('.crew-log');
      expect(card(1).classList.contains('is-open')).toBe(true);
      expect(log.textContent).toContain('Old answer');
      expect(log.textContent.match(/New answer/g)).toHaveLength(1);
      expect(card(1).querySelector('[data-crew-action="expand"]').getAttribute('aria-expanded')).toBe('true');
    });
  });

  it("shows each agent's latest exchange, without tool chatter", async () => {
    entries = [
      { agent_id: 'a1', role: 'user', content: 'Plan tomorrow', metadata: { event: 'turn_start' } },
      { agent_id: 'a1', role: 'agent', content: '(tool call: gmail_search)', metadata: { event: 'tool_use' } },
      { agent_id: null, role: 'agent', content: '120 croissants', metadata: { event: 'final_answer', agent_blueprint_id: 'a1' } },
      { agent_id: 'a2', role: 'agent', content: 'Other agent', metadata: { event: 'final_answer' } },
    ];
    CrewView.render(el);
    await flush();
    const log = el.querySelector('#crew-log-0').textContent;
    expect(log).toContain('Plan tomorrow');
    expect(log).toContain('120 croissants');
    expect(log).not.toContain('gmail_search');
    expect(log).not.toContain('Other agent');
  });

  it('updates a card when its agent starts and finishes work', () => {
    CrewView.render(el);
    states.a1 = 'active';
    activityListeners.forEach(fn => fn('a1', 'active'));
    expect(el.querySelector('#crew-status-0').dataset.s).toBe('active');
    expect(el.querySelector('#crew-status-0').textContent).toContain('Working');
    states.a1 = 'recent';
    activityListeners.forEach(fn => fn('a1', 'recent'));
    expect(el.querySelector('#crew-status-0').textContent).toContain('Just finished');
  });

  it('asks signed-out visitors to sign in for runs', async () => {
    CrewView.render(el);
    await flush();
    expect(el.querySelector('[data-crew-action="signin"]')).not.toBeNull();
    expect(realtime.subscribe).not.toHaveBeenCalled();
  });

  it('lists recent runs and offers review for runs waiting on the user', async () => {
    State.set('user', { id: 'u1' });
    runs = [
      { id: 'r1', title: 'Morning roundup', status: 'review', created_at: new Date().toISOString() },
      { id: 'r2', title: 'Wholesale follow-up', status: 'completed', created_at: new Date().toISOString() },
    ];
    CrewView.render(el);
    await flush();
    expect([...el.querySelectorAll('.crew-run-title')].map(n => n.textContent)).toEqual(['Morning roundup', 'Wholesale follow-up']);
    expect(el.querySelectorAll('.crew-review')).toHaveLength(1);
    expect(realtime.subscribe).toHaveBeenCalledWith('mission_runs', expect.any(Function));

    el.querySelector('[data-crew-action="approve"]').click();
    await flush();
    expect(MissionRunner.approveRun).toHaveBeenCalledWith(runs[0]);
    expect(Notify.send).toHaveBeenCalled();
  });

  it('rejects a run from the approval bar', async () => {
    State.set('user', { id: 'u1' });
    runs = [{ id: 'r1', title: 'Morning roundup', status: 'review' }];
    CrewView.render(el);
    await flush();
    el.querySelector('[data-crew-action="reject"]').click();
    await flush();
    expect(MissionRunner.rejectRun).toHaveBeenCalledWith(runs[0]);
  });

  it('escapes names from crew data', () => {
    CREW[0].slot.label = '<img src=x onerror=alert(1)>';
    CrewView.render(el);
    expect(el.querySelector('.crew-card img')).toBeNull();
    CREW[0].slot.label = 'Head Baker';
  });

  it('stops listening after destroy', async () => {
    State.set('user', { id: 'u1' });
    CrewView.render(el);
    await flush();
    CrewView.destroy();
    expect(activityListeners).toHaveLength(0);
    expect(realtime.unsubscribe).toHaveBeenCalled();
  });
});
