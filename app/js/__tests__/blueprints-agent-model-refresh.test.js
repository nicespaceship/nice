/**
 * A model the user picked survives the catalog refresh that runs at start
 * (refreshActivatedAgentsFromCatalog), which otherwise copies the catalog's
 * llm_engine onto every linked agent.
 */
import { describe, it, expect } from 'vitest';

const umb = { id: '11111111-1111-4111-8111-111111111111', name: 'Umbrella', type: 'agent', config: { llm_engine: 'gemini-2-5-flash', tools: [] } };
globalThis.BlueprintsView = { SEED: [umb], SPACESHIP_SEED: [] };
globalThis.SB = { isReady: () => false, isOnline: () => false, client: null, db: () => ({}) };
globalThis.ShipSlots = { fetchForShips: async () => ({}) };

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('a picked model and the catalog refresh', () => {
  it('keeps the pick; an unpicked linked agent still follows the catalog', async () => {
    await Blueprints.init();
    const mine = { id: 'agent-1', name: 'Mine', blueprint_id: umb.id, config: { llm_engine: 'claude-4-6-sonnet' } };
    const other = { id: 'agent-2', name: 'Other', blueprint_id: umb.id, config: { llm_engine: 'claude-4-6-sonnet' } };
    localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify([mine, other]));
    State.set('agents', [mine, other]);
    await Blueprints.setAgentModel('agent-1', 'grok-4-3');
    await Blueprints.refreshActivatedAgentsFromCatalog();
    const local = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents));
    expect(local[0].config).toMatchObject({ llm_engine: 'grok-4-3', model_chosen: true });
    expect(State.get('agents')[0].config.llm_engine).toBe('grok-4-3');
    expect(local[1].config.llm_engine).toBe('gemini-2-5-flash');
  });

  it('keeps a model on the user\'s own key the same way', async () => {
    const own = { id: 'agent-3', name: 'Own', blueprint_id: umb.id, config: { llm_engine: 'byo:openai:gpt-5' } };
    expect(Blueprints.resolveLiveAgent(own).config.llm_engine).toBe('byo:openai:gpt-5');
  });
});
