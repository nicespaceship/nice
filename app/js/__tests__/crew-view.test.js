/**
 * CrewView (#/crew): one card per crew member framed in its model's
 * provider color, live status from AgentActivity, the agent's latest
 * exchange from ShipLog, direct sends through PromptPanel.sendToAgent, and
 * the ship's recent runs with an approval bar for runs in review.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
globalThis.PromptPanel = { sendToAgent: vi.fn(() => true) };
globalThis.MissionRunner = {
  approveRun: vi.fn(async () => ({ resumed: false, persisted: true })),
  rejectRun: vi.fn(async () => ({ persisted: true })),
};
globalThis.Notify = { send: vi.fn() };

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
  });

  it('renders one card per crew member, framed in its provider color', () => {
    CrewView.render(el);
    const cards = [...el.querySelectorAll('.crew-card:not(.crew-card-open)')];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('h3').textContent).toBe('Head Baker');
    expect(cards[0].querySelector('.crew-card-names span').textContent).toBe('Captain');
    expect(cards[0].querySelector('.crew-model').textContent).toContain('Claude 4.6 Sonnet');
    expect(cards[0].style.getPropertyValue('--crew-c')).toBe(ModelCatalog.providerColor('claude-4-6-sonnet'));
    expect(cards[1].style.getPropertyValue('--crew-c')).toBe(ModelCatalog.providerColor('gemini-2-5-flash'));
    expect(el.querySelector('.crew-card-open').textContent).toContain('Open station');
  });

  it('summarizes the crew in the header', () => {
    CrewView.render(el);
    expect(el.querySelector('.crew-head h1').textContent).toBe('Sunrise Bakery');
    expect(el.querySelector('.crew-head-text p:last-child').textContent).toBe('2 agents on 2 models, 1 open station');
  });

  it('opens the ship named in the URL', () => {
    history.replaceState(null, '', '#/crew?ship=ship-9');
    CrewView.render(el);
    expect(localStorage.getItem(Utils.KEYS.mcShip)).toBe('ship-9');
  });

  it('sends a card message straight to that agent', () => {
    CrewView.render(el);
    const form = el.querySelector('.crew-compose[data-slot="1"]');
    form.querySelector('input').value = 'How many pre-orders came in?';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(PromptPanel.sendToAgent).toHaveBeenCalledWith(CREW[1].agent, 'How many pre-orders came in?');
    expect(form.querySelector('input').value).toBe('');
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
