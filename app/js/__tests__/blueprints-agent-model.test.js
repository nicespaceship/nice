/**
 * Blueprints.setAgentModel: the model a user puts one of their agents on,
 * from a team card's menu.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const update = vi.fn(async (id, patch) => ({ id, ...patch }));
globalThis.BlueprintsView = { SEED: [], SPACESHIP_SEED: [] };
globalThis.SB = {
  isReady: () => true,
  isOnline: () => true,
  client: { from: () => ({ select: async () => ({ data: [] }) }) },
  db: (table) => ({ list: async () => [], get: async () => null, create: async () => ({}), update: table === 'user_agents' ? update : async () => ({}), delete: async () => ({}) }),
  realtime: { subscribe: () => ({}) },
};
globalThis.ShipSlots = { fetchForShips: async () => ({}), setForShip: async () => true, setSlot: async () => true, clearSlot: async () => true, deleteForShip: async () => true };

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

beforeEach(() => {
  localStorage.clear();
  State._reset();
  update.mockClear();
});

describe('Blueprints.setAgentModel', () => {
  it('saves the pick on the user\'s own agent row and marks it as theirs', async () => {
    State.set('user', { id: 'u1' });
    State.set('agents', [{ id: 'ua-1', name: 'Baker', blueprint_id: 'bp-1', config: { llm_engine: 'gemini-2-5-flash', tools: ['web_search'], model_profile: { preferred: 'claude-opus-4-7', max_output_tokens: 900 } } }]);
    const saved = await Blueprints.setAgentModel('ua-1', 'grok-4-3');
    expect(update).toHaveBeenCalledWith('ua-1', { config: { llm_engine: 'grok-4-3', model_chosen: true, tools: ['web_search'], model_profile: { max_output_tokens: 900 } } });
    expect(saved.config.llm_engine).toBe('grok-4-3');
    expect(State.get('agents')[0].config.model_chosen).toBe(true);
    expect(State.get('agents')[0].config.model_profile.preferred).toBeUndefined();
  });

  it('refuses an agent that is not one of the user\'s', async () => {
    State.set('user', { id: 'u1' });
    State.set('agents', []);
    await expect(Blueprints.setAgentModel('catalog-agent', 'grok-4-3')).rejects.toThrow(/part of the catalog/);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps a guest\'s pick on their local copy', async () => {
    localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify([{ id: 'g-1', name: 'Mine', config: { llm_engine: 'gemini-2-5-flash' } }]));
    State.set('agents', [{ id: 'g-1', name: 'Mine', config: { llm_engine: 'gemini-2-5-flash' } }]);
    await Blueprints.setAgentModel('g-1', 'byo:openai:gpt-5');
    const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents));
    expect(stored[0].config).toEqual({ llm_engine: 'byo:openai:gpt-5', model_chosen: true });
    expect(State.get('agents')[0].config.llm_engine).toBe('byo:openai:gpt-5');
    expect(update).not.toHaveBeenCalled();
  });
});
