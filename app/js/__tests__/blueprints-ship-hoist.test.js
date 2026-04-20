/**
 * Verifies that user_spaceships rows are hoisted into State.spaceships with
 * the right shape across the three row variants we have in the wild:
 *   1. Post-migration: top-level `category`/`rarity`, structured `config` JSONB
 *   2. Post-dock:      same as (1) but `slots` has been overwritten to a
 *                      plain { slotId: agentId } map by _addAgent/_removeAgentFromSlot
 *   3. Pre-migration:  legacy `slots` bag holding everything, empty `config`
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Blueprints depends on BlueprintsView for seeds
globalThis.BlueprintsView = {
  SEED: [
    { id: 'sa1', name: 'Web Researcher', config: { role: 'Research' }, category: 'Research', rarity: 'Common' },
  ],
  SPACESHIP_SEED: [
    { id: 'ship-01', name: 'Scout Mk I', class_id: 'class-1', category: 'Recon', rarity: 'Common' },
  ],
};

// Mock SB with a configurable `from()` so we can feed rows to _loadUserCreations
let _shipRows = [];
let _agentRows = [];
globalThis.SB = {
  isReady: () => true,
  isOnline: () => true,
  client: {
    from: (table) => ({
      select: async () => {
        if (table === 'user_spaceships') return { data: _shipRows };
        if (table === 'user_agents')     return { data: _agentRows };
        return { data: [] };
      },
    }),
  },
  db: () => ({ list: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}), delete: async () => ({}) }),
  realtime: { subscribe: () => ({}) },
};

// Load Blueprints into globals
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('Blueprints — user_spaceships hoisting', () => {
  beforeEach(() => {
    _shipRows = [];
    _agentRows = [];
  });

  it('hoists top-level category/rarity and reads structural fields from config', async () => {
    _shipRows = [{
      id: 'ship-uuid-1',
      name: 'Post-Migration Ship',
      blueprint_id: null,
      category: 'Analytics',       // top-level (new column)
      rarity: 'Rare',              // top-level (new column)
      status: 'standby',
      config: {
        description: 'Crunches data',
        flavor: 'Faster than thought',
        tags: ['data', 'bi'],
        slot_assignments: { 0: 'agent-a', 1: 'agent-b' },
        stats: { crew: '2', slots: '6' },
        caps: ['BI dashboards'],
      },
      slots: {},                   // empty — no legacy data
      created_at: '2026-04-16T00:00:00Z',
    }];
    await Blueprints.init();

    const ship = (globalThis.State.get('spaceships') || []).find(s => s.id === 'ship-uuid-1');
    expect(ship).toBeDefined();
    expect(ship.category).toBe('Analytics');
    expect(ship.rarity).toBe('Rare');
    expect(ship.description).toBe('Crunches data');
    expect(ship.flavor).toBe('Faster than thought');
    expect(ship.tags).toEqual(['data', 'bi']);
    expect(ship.config.slot_assignments).toEqual({ 0: 'agent-a', 1: 'agent-b' });
  });

  it('after in-place dock overwrites `slots` to a plain map, slot_assignments stay fresh', async () => {
    _shipRows = [{
      id: 'ship-uuid-2',
      name: 'Docked Ship',
      blueprint_id: null,
      category: 'Ops',
      rarity: 'Common',
      status: 'deployed',
      config: {
        description: 'Still here',
        slot_assignments: { 0: 'stale-agent' },   // config went stale after dock
      },
      slots: { 0: 'fresh-agent-a', 1: 'fresh-agent-b' },  // plain map written by _addAgent
      created_at: '2026-04-16T00:00:00Z',
    }];
    await Blueprints.init();

    const ship = (globalThis.State.get('spaceships') || []).find(s => s.id === 'ship-uuid-2');
    expect(ship).toBeDefined();
    // Fresh assignments come from the plain `slots` map, not stale config
    expect(ship.config.slot_assignments).toEqual({ 0: 'fresh-agent-a', 1: 'fresh-agent-b' });
    // Structural data still reads from config
    expect(ship.description).toBe('Still here');
  });

  it('legacy rows with only `slots` bag populate description/flavor/tags/slot_assignments', async () => {
    _shipRows = [{
      id: 'ship-uuid-3',
      name: 'Legacy Ship',
      blueprint_id: null,
      // category/rarity not hoisted yet for this row
      category: null,
      rarity: 'Common',    // column default
      status: 'standby',
      config: {},          // empty — predates the migration
      slots: {
        category: 'Research',
        description: 'Old school ship',
        flavor: 'Ancient wisdom',
        tags: ['legacy'],
        slot_assignments: { 0: 'legacy-agent' },
        stats: { crew: '1', slots: '6' },
        caps: ['old ops'],
      },
      created_at: '2026-04-01T00:00:00Z',
    }];
    await Blueprints.init();

    const ship = (globalThis.State.get('spaceships') || []).find(s => s.id === 'ship-uuid-3');
    expect(ship).toBeDefined();
    expect(ship.category).toBe('Research');           // from slots.category fallback
    expect(ship.description).toBe('Old school ship');
    expect(ship.flavor).toBe('Ancient wisdom');
    expect(ship.tags).toEqual(['legacy']);
    expect(ship.config.slot_assignments).toEqual({ 0: 'legacy-agent' });
  });

  it('empty-slots-empty-config row still initializes to sensible defaults', async () => {
    _shipRows = [{
      id: 'ship-uuid-4',
      name: 'Blank Ship',
      blueprint_id: null,
      category: null,
      rarity: 'Common',
      status: 'standby',
      config: {},
      slots: {},
      created_at: '2026-04-16T00:00:00Z',
    }];
    await Blueprints.init();

    const ship = (globalThis.State.get('spaceships') || []).find(s => s.id === 'ship-uuid-4');
    expect(ship).toBeDefined();
    expect(ship.category).toBe('');
    expect(ship.rarity).toBe('Common');
    expect(ship.description).toBe('');
    expect(ship.tags).toEqual([]);
    expect(ship.config.slot_assignments).toEqual({});
  });
});
