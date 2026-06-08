import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Capture every row that crew-generator writes to user_agents so we can
// assert the catalog config landed in the DB layer untouched.
const _agentInserts = [];
const _shipInserts = [];
const _privateAgentSpecs = []; // specs passed to Blueprints.createPrivateAgent (saveAndAssign)

globalThis.SB = {
  isReady: () => true,
  db: (table) => ({
    create: async (row) => {
      const id = 'uuid-' + Math.random().toString(36).slice(2, 8);
      const entry = { ...row, id, created_at: new Date().toISOString() };
      if (table === 'user_agents') _agentInserts.push(entry);
      if (table === 'user_spaceships') _shipInserts.push(entry);
      return entry;
    },
    update: async (_id, data) => data,
  }),
};

// generate() drives nice-ai via SB.functions.invoke; tests swap the impl per case.
let _invokeImpl = async () => ({ data: { content: '[]' }, error: null });
globalThis.SB.functions = { invoke: (...args) => _invokeImpl(...args) };

// saveAndAssign persists slots via ShipSlots and writes through createPrivateAgent.
globalThis.ShipSlots = { setForShip: vi.fn(async () => {}) };

globalThis.State = (() => {
  const _data = {};
  return {
    get: (k) => _data[k],
    set: (k, v) => { _data[k] = v; },
    _reset: () => { Object.keys(_data).forEach(k => delete _data[k]); },
  };
})();

globalThis.Gamification = { addXP: vi.fn() };

// crew-generator delegates activation tracking to Blueprints.activateAgent.
// Stub the surface needed for deployFromCatalog: getSpaceship + activateAgent +
// saveShipState; the spaceship blueprint defines the crew nodes that should
// flow verbatim into user_agents.config.
const _shipBp = {
  id: 'ship-test',
  name: 'Test Cruiser',
  rarity: 'Legendary',
  category: 'Operations',
  stats: { slots: '3' },
  metadata: {
    crew: [
      {
        label: 'Captain Adama',
        rarity: 'Legendary',
        config: {
          agentRole: 'Captain',
          role_type: 'captain',
          is_captain: true,
          system_prompt: 'You are Adama, captain of the Galactica.',
          tools: [],
          llm_engine: 'claude-4-6-sonnet',
          temperature: 0.4,
        },
      },
      {
        label: 'Comms Specialist',
        rarity: 'Common',
        config: {
          agentRole: 'Communications',
          role_type: 'communications',
          system_prompt: 'You handle Workspace.',
          tools: ['gmail-search', 'gmail-send', 'calendar-read'],
          llm_engine: 'gemini-2.5-flash',
        },
      },
    ],
  },
};

globalThis.Blueprints = {
  getSpaceship: (id) => (id === 'ship-test' || id === 'bp-ship-test' ? _shipBp : null),
  activateAgent: vi.fn(),
  saveShipState: vi.fn(),
  createPrivateAgent: async (spec) => {
    _privateAgentSpecs.push(spec);
    const id = 'pa-' + _privateAgentSpecs.length;
    return { agent: { id, config: { system_prompt: spec.system_prompt, description: spec.description } }, blueprint: { id: 'bp-' + id } };
  },
};

loadModule('lib/crew-generator.js');

describe('CrewGenerator.deployFromCatalog — activation persistence', () => {
  beforeEach(() => {
    _agentInserts.length = 0;
    _shipInserts.length = 0;
    State._reset();
    State.set('user', { id: 'user-x' });
    Blueprints.activateAgent.mockClear();
  });

  it('persists the full catalog node config into user_agents (system_prompt, tools, llm_engine)', async () => {
    await CrewGenerator.deployFromCatalog('ship-test');

    expect(_agentInserts.length).toBe(2);
    const captain = _agentInserts[0];
    expect(captain.config.system_prompt).toBe('You are Adama, captain of the Galactica.');
    expect(captain.config.is_captain).toBe(true);
    expect(captain.config.role_type).toBe('captain');
    expect(captain.config.llm_engine).toBe('claude-4-6-sonnet');
    expect(captain.config.tools).toEqual([]); // explicit empty stays explicit
    expect(captain.config.temperature).toBe(0.4); // node value wins over default
  });

  it('persists real catalog tools instead of the legacy fake list', async () => {
    await CrewGenerator.deployFromCatalog('ship-test');
    const comms = _agentInserts[1];
    expect(comms.config.tools).toEqual(['gmail-search', 'gmail-send', 'calendar-read']);
    // The legacy hardcoded fakes must not leak in.
    expect(comms.config.tools).not.toContain('Web Search');
    expect(comms.config.tools).not.toContain('Email');
  });

  it('writes a synthetic blueprint_id linking back to the ship and slot', async () => {
    await CrewGenerator.deployFromCatalog('ship-test');
    expect(_agentInserts[0].config.blueprint_id).toBe('ship-test-crew-0');
    expect(_agentInserts[1].config.blueprint_id).toBe('ship-test-crew-1');
  });

  it('keeps default fallbacks (type=Specialist, memory=false, temperature=0.7) when the catalog node omits them', async () => {
    await CrewGenerator.deployFromCatalog('ship-test');
    const comms = _agentInserts[1];
    expect(comms.config.type).toBe('Specialist');
    expect(comms.config.memory).toBe(false);
    expect(comms.config.temperature).toBe(0.7); // node didn't set it → default wins
  });

  it('mirrors the catalog config and blueprint_id onto the State.agents snapshot', async () => {
    await CrewGenerator.deployFromCatalog('ship-test');
    const stateAgents = State.get('agents') || [];
    expect(stateAgents.length).toBe(2);
    expect(stateAgents[0].blueprint_id).toBe('ship-test-crew-0');
    expect(stateAgents[0].config.system_prompt).toBe('You are Adama, captain of the Galactica.');
    expect(stateAgents[1].config.tools).toEqual(['gmail-search', 'gmail-send', 'calendar-read']);
  });

  it('activates each saved agent through Blueprints.activateAgent', async () => {
    await CrewGenerator.deployFromCatalog('ship-test');
    expect(Blueprints.activateAgent).toHaveBeenCalledTimes(2);
  });

  it('returns an error when the blueprint is missing', async () => {
    const result = await CrewGenerator.deployFromCatalog('nonexistent');
    expect(result.error).toMatch(/Blueprint not found/);
    expect(_agentInserts.length).toBe(0);
  });
});

describe('CrewGenerator.generate — system prompts + resilience', () => {
  beforeEach(() => {
    State._reset();
    State.set('user', { id: 'user-x' });
  });

  const arrayResponse = (agents) => ({ data: { content: JSON.stringify(agents) }, error: null });

  it('parses a per-agent system_prompt from the model output', async () => {
    _invokeImpl = async () => arrayResponse([
      { name: 'Intake Clerk', role: 'Ops', description: 'Handles new client intake.', tools: ['Email'], system_prompt: 'You are the intake clerk for the firm. Screen inbound leads and open files.' },
    ]);
    const result = await CrewGenerator.generate({ name: 'Firm', slotCount: 1 });
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].system_prompt).toMatch(/intake clerk/i);
  });

  it('accepts instructions/systemPrompt key variants and caps prompt length', async () => {
    _invokeImpl = async () => arrayResponse([
      { name: 'A', role: 'Ops', description: 'x', tools: [], instructions: 'I' + 'x'.repeat(5000) },
    ]);
    const r = await CrewGenerator.generate({ slotCount: 1 });
    expect(r.agents[0].system_prompt.startsWith('I')).toBe(true);
    expect(r.agents[0].system_prompt.length).toBeLessThanOrEqual(2000);
  });

  it('retries once when the first response fails to parse, then succeeds', async () => {
    let calls = 0;
    _invokeImpl = async () => {
      calls++;
      if (calls === 1) return { data: { content: 'sorry, here is your crew:' }, error: null };
      return arrayResponse([{ name: 'B', role: 'Ops', description: 'y', tools: [], system_prompt: 'You are B.' }]);
    };
    const r = await CrewGenerator.generate({ slotCount: 1 });
    expect(calls).toBe(2);
    expect(r.agents.length).toBe(1);
  });

  it('returns an error after both attempts fail to parse', async () => {
    _invokeImpl = async () => ({ data: { content: 'not json at all' }, error: null });
    const r = await CrewGenerator.generate({ slotCount: 1 });
    expect(r.agents).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it('scales max_tokens with crew size so a 12-slot ship is not truncated', async () => {
    let sentBody = null;
    _invokeImpl = async (_fn, opts) => { sentBody = opts.body; return arrayResponse([{ name: 'C', role: 'Ops', description: 'z', tools: [], system_prompt: 'You are C.' }]); };
    await CrewGenerator.generate({ slotCount: 12 });
    expect(sentBody.max_tokens).toBeGreaterThanOrEqual(4096);
  });
});

describe('CrewGenerator.saveAndAssign — system prompt threading', () => {
  beforeEach(() => {
    _privateAgentSpecs.length = 0;
    State._reset();
    State.set('user', { id: 'user-x' });
    State.set('spaceships', [{ id: 'ship-1' }]);
  });

  it('passes the generated system_prompt straight through to createPrivateAgent', async () => {
    const agents = [{ name: 'Intake', role: 'Ops', description: 'Intake.', tools: [], system_prompt: 'You are the intake agent.' }];
    await CrewGenerator.saveAndAssign('ship-1', agents, { name: 'Injury Law Firm' });
    expect(_privateAgentSpecs.length).toBe(1);
    expect(_privateAgentSpecs[0].system_prompt).toBe('You are the intake agent.');
  });

  it('synthesizes a business-specific fallback prompt when the agent has none', async () => {
    const agents = [{ name: 'Billing', role: 'Ops', description: 'Runs billing.', tools: [], system_prompt: '' }];
    await CrewGenerator.saveAndAssign('ship-1', agents, { name: 'Injury Law Firm' });
    const sp = _privateAgentSpecs[0].system_prompt;
    expect(sp).toBeTruthy();
    expect(sp).toContain('Injury Law Firm');
    expect(sp).toContain('Billing');
  });
});
