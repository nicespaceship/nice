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
