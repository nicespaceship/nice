/**
 * Verifies that user_spaceships rows are hoisted into State.spaceships with
 * slot assignments resolved from `user_ship_slots` (SSOT after Phase C.1).
 * Structural fields (description, flavor, tags, stats, caps) come from the
 * row's `config` JSONB; slot data never touches the row anymore.
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

// ShipSlots mock — feeds slot_assignments per ship via _slotsByShip.
let _slotsByShip = {};
globalThis.ShipSlots = {
  fetchForShips: async (ids) => {
    const out = {};
    for (const id of ids) if (_slotsByShip[id]) out[id] = _slotsByShip[id];
    return out;
  },
  setForShip: async () => true,
  setSlot: async () => true,
  clearSlot: async () => true,
  deleteForShip: async () => true,
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
    _slotsByShip = {};
  });

  it('hoists top-level category/rarity, reads config fields, and pulls slot_assignments from ShipSlots', async () => {
    _shipRows = [{
      id: 'ship-uuid-1',
      name: 'Post-Migration Ship',
      blueprint_id: null,
      category: 'Analytics',
      rarity: 'Rare',
      status: 'standby',
      config: {
        description: 'Crunches data',
        flavor: 'Faster than thought',
        tags: ['data', 'bi'],
        stats: { crew: '2', slots: '6' },
        caps: ['BI dashboards'],
      },
      created_at: '2026-04-16T00:00:00Z',
    }];
    _slotsByShip = { 'ship-uuid-1': { 0: 'agent-a', 1: 'agent-b' } };
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

  it('reads fresh assignments from user_ship_slots even when config has no slot data', async () => {
    _shipRows = [{
      id: 'ship-uuid-2',
      name: 'Docked Ship',
      blueprint_id: null,
      category: 'Ops',
      rarity: 'Common',
      status: 'deployed',
      config: { description: 'Still here' },
      created_at: '2026-04-16T00:00:00Z',
    }];
    _slotsByShip = { 'ship-uuid-2': { 0: 'fresh-agent-a', 1: 'fresh-agent-b' } };
    await Blueprints.init();

    const ship = (globalThis.State.get('spaceships') || []).find(s => s.id === 'ship-uuid-2');
    expect(ship).toBeDefined();
    expect(ship.config.slot_assignments).toEqual({ 0: 'fresh-agent-a', 1: 'fresh-agent-b' });
    expect(ship.description).toBe('Still here');
  });

  it('preserves null slot rows from user_ship_slots so the schematic knows the slot space', async () => {
    _shipRows = [{
      id: 'ship-uuid-3',
      name: 'Sparse Ship',
      blueprint_id: null,
      category: 'Research',
      rarity: 'Common',
      status: 'standby',
      config: { description: 'Half-staffed' },
      created_at: '2026-04-01T00:00:00Z',
    }];
    _slotsByShip = { 'ship-uuid-3': { 0: 'agent-a', 1: null, 2: null } };
    await Blueprints.init();

    const ship = (globalThis.State.get('spaceships') || []).find(s => s.id === 'ship-uuid-3');
    expect(ship).toBeDefined();
    expect(ship.config.slot_assignments).toEqual({ 0: 'agent-a', 1: null, 2: null });
  });

  it('row with no user_ship_slots and empty config initializes to sensible defaults', async () => {
    _shipRows = [{
      id: 'ship-uuid-4',
      name: 'Blank Ship',
      blueprint_id: null,
      category: null,
      rarity: 'Common',
      status: 'standby',
      config: {},
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
