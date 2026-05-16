/**
 * Tests for the Stage B3b download-as-clone path:
 *   - downloadCommunityBlueprint clones a community snapshot into the
 *     caller's own user_agents / user_spaceships row, expands ship
 *     slot_placeholders into an empty slot_assignments map, bumps the
 *     listing download counter, and mirrors the new row into State.
 *   - hasDownloadedCommunity scans State for rows whose blueprint_id
 *     matches a community blueprint id.
 */
import { describe, it, expect, beforeEach } from 'vitest';

globalThis.BlueprintsView = {
  SEED: [{ id: 'sa1', name: 'Seed', rarity: 'Common' }],
  SPACESHIP_SEED: [],
};

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

/** Same chainable PostgREST-shape mock used by the publish tests. */
function makeMock({ readers = {}, insertErrors = {}, inserted } = {}) {
  const calls = { inserts: [], rpc: [] };
  return {
    calls,
    client: {
      from(table) {
        const state = { filters: {} };
        return {
          select() { return this; },
          eq(col, val) { state.filters[col] = val; return this; },
          maybeSingle() {
            const reader = readers[table];
            return Promise.resolve({ data: reader ? reader({ ...state.filters }) : null, error: null });
          },
          insert(payload) {
            calls.inserts.push({ table, payload });
            const err = insertErrors[table];
            if (err) return { select() { return { maybeSingle: () => Promise.resolve({ data: null, error: err }) }; } };
            return { select() { return { maybeSingle: () => Promise.resolve({ data: Object.assign({ id: inserted?.id || 'new-row-id' }, payload), error: null }) }; } };
          },
        };
      },
      rpc(fn, args) {
        calls.rpc.push({ fn, args });
        return Promise.resolve({ data: 1, error: null });
      },
    },
  };
}

/** ShipSlots mock — Phase C.1 routes slot writes through this lib. */
function installShipSlots() {
  const calls = [];
  globalThis.ShipSlots = {
    fetchForShips: async () => ({}),
    setForShip: async (shipId, assignments) => { calls.push({ shipId, assignments }); return true; },
    setSlot: async () => true,
    clearSlot: async () => true,
    deleteForShip: async () => true,
  };
  return calls;
}

describe('Blueprints.downloadCommunityBlueprint', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'user-dl' });
  });

  it('rejects unauthenticated callers', async () => {
    globalThis.State._reset();
    globalThis.SB = makeMock();
    await expect(Blueprints.downloadCommunityBlueprint('bp-1'))
      .rejects.toThrow('Sign in to install');
  });

  it('rejects when the blueprint has no community listing', async () => {
    globalThis.SB = makeMock({ readers: { marketplace_listings: () => null } });
    await expect(Blueprints.downloadCommunityBlueprint('bp-does-not-exist'))
      .rejects.toThrow('not available');
  });

  it('rejects when the listing exists but the blueprint row is missing', async () => {
    globalThis.SB = makeMock({
      readers: {
        marketplace_listings: () => ({ category: 'agent' }),
        agent_blueprints: () => null,
      },
    });
    await expect(Blueprints.downloadCommunityBlueprint('bp-orphan'))
      .rejects.toThrow('not available');
  });

  it('clones an agent blueprint into user_agents and hoists description/flavor/tags', async () => {
    const mock = makeMock({
      readers: {
        marketplace_listings: () => ({ category: 'agent' }),
        agent_blueprints: () => ({
          id: 'community-agent-1', scope: 'community',
          name: 'Research Bot', description: 'Crunches papers', flavor: 'Fast and clean',
          tags: ['research'], category: 'Research', rarity: 'Rare',
          config: { tools: ['browse'], temperature: 0.7 },
        }),
      },
    });
    globalThis.SB = mock;

    const created = await Blueprints.downloadCommunityBlueprint('community-agent-1', { listingId: 'list-123' });

    // Row insert shape
    const insert = mock.calls.inserts.find(c => c.table === 'user_agents');
    expect(insert).toBeDefined();
    expect(insert.payload.user_id).toBe('user-dl');
    expect(insert.payload.blueprint_id).toBe('community-agent-1'); // lineage
    expect(insert.payload.name).toBe('Research Bot');
    expect(insert.payload.rarity).toBe('Rare');
    expect(insert.payload.status).toBe('idle');
    expect(insert.payload.config.tools).toEqual(['browse']);
    expect(insert.payload.config.temperature).toBe(0.7);
    expect(insert.payload.config.description).toBe('Crunches papers');
    expect(insert.payload.config.flavor).toBe('Fast and clean');
    expect(insert.payload.config.tags).toEqual(['research']);

    // Counter RPC fired
    expect(mock.calls.rpc).toEqual([{ fn: 'increment_listing_download', args: { p_listing_id: 'list-123' } }]);

    // State mirrored
    const agents = globalThis.State.get('agents') || [];
    expect(agents.some(a => a.blueprint_id === 'community-agent-1')).toBe(true);

    expect(created).toBeDefined();
  });

  it('expands ship slot_placeholders into empty user_ship_slots rows on clone', async () => {
    const mock = makeMock({
      readers: {
        marketplace_listings: () => ({ category: 'spaceship' }),
        spaceship_blueprints: () => ({
          id: 'community-ship-1', scope: 'community',
          name: 'Analytics Cruiser', description: 'Data ops',
          category: 'Analytics', rarity: 'Epic',
          config: {
            slot_placeholders: [{ slot: 0 }, { slot: 1 }, { slot: 2 }],
            stats: { crew: '3', slots: '6' },
            caps: ['Analytics ops'],
          },
        }),
      },
    });
    globalThis.SB = mock;
    const slotCalls = installShipSlots();

    await Blueprints.downloadCommunityBlueprint('community-ship-1');

    const insert = mock.calls.inserts.find(c => c.table === 'user_spaceships');
    expect(insert).toBeDefined();
    expect(insert.payload.category).toBe('Analytics');
    // Slot data lives in user_ship_slots after Phase C.1, not in the row itself.
    expect(insert.payload.config.slot_assignments).toBeUndefined();
    expect(insert.payload.config.slot_placeholders).toBeUndefined(); // consumed
    expect(insert.payload.slots).toBeUndefined();
    expect(insert.payload.config.stats).toEqual({ crew: '3', slots: '6' });
    expect(insert.payload.config.caps).toEqual(['Analytics ops']);
    // Empty slot rows persisted via ShipSlots so the schematic knows the slot space.
    expect(slotCalls).toEqual([{ shipId: 'new-row-id', assignments: { '0': null, '1': null, '2': null } }]);
  });

  it('does not leak a private slot_assignments map from a malformed snapshot', async () => {
    // A malformed blueprint could carry slot_assignments with real UUIDs
    // (if the publish sanitizer is ever bypassed). The download path
    // regenerates the assignments map from slot_placeholders, so any
    // sneaked-in agent IDs should be discarded.
    const mock = makeMock({
      readers: {
        marketplace_listings: () => ({ category: 'spaceship' }),
        spaceship_blueprints: () => ({
          id: 'community-ship-evil', scope: 'community',
          name: 'Evil', category: 'Ops', rarity: 'Common',
          config: {
            slot_placeholders: [{ slot: 0 }],
            slot_assignments: { 0: 'leaked-agent-uuid' },
          },
        }),
      },
    });
    globalThis.SB = mock;
    const slotCalls = installShipSlots();

    await Blueprints.downloadCommunityBlueprint('community-ship-evil');

    const insert = mock.calls.inserts.find(c => c.table === 'user_spaceships');
    // The leaked map is dropped from config; ShipSlots gets the placeholder map (null values).
    expect(insert.payload.config.slot_assignments).toBeUndefined();
    expect(slotCalls).toEqual([{ shipId: 'new-row-id', assignments: { '0': null } }]);
    const serialized = JSON.stringify(insert.payload) + JSON.stringify(slotCalls);
    expect(serialized).not.toContain('leaked-agent-uuid');
  });

  it('swallows counter RPC errors so the install still succeeds', async () => {
    const mock = {
      calls: { inserts: [], rpc: [] },
      client: {
        from(table) {
          const state = { filters: {} };
          return {
            select() { return this; },
            eq(col, val) { state.filters[col] = val; return this; },
            maybeSingle() {
              if (table === 'marketplace_listings') return Promise.resolve({
                data: { category: 'agent' }, error: null });
              if (table === 'agent_blueprints') return Promise.resolve({
                data: { id: 'bp-1', scope: 'community', name: 'A', config: {} }, error: null });
              return Promise.resolve({ data: null, error: null });
            },
            insert(payload) {
              mock.calls.inserts.push({ table, payload });
              return { select() { return { maybeSingle: () => Promise.resolve({ data: Object.assign({ id: 'r' }, payload), error: null }) }; } };
            },
          };
        },
        rpc() { return Promise.reject(new Error('counter-rpc-down')); },
      },
    };
    globalThis.SB = mock;

    // Must not throw — counter is best-effort
    await expect(
      Blueprints.downloadCommunityBlueprint('bp-1', { listingId: 'list-1' })
    ).resolves.toBeDefined();
    expect(mock.calls.inserts.length).toBe(1);
  });
});

describe('Blueprints.hasDownloadedCommunity', () => {
  beforeEach(() => { globalThis.State._reset(); });

  it('returns true when an agent row links back to the community blueprint', () => {
    globalThis.State.set('agents', [{ id: 'local-1', blueprint_id: 'comm-agent-1' }]);
    expect(Blueprints.hasDownloadedCommunity('comm-agent-1')).toBe(true);
  });

  it('returns true when a ship row links back to the community blueprint', () => {
    globalThis.State.set('spaceships', [{ id: 'local-ship', blueprint_id: 'comm-ship-1' }]);
    expect(Blueprints.hasDownloadedCommunity('comm-ship-1')).toBe(true);
  });

  it('returns false when no rows link back', () => {
    globalThis.State.set('agents', [{ id: 'a', blueprint_id: 'other' }]);
    globalThis.State.set('spaceships', [{ id: 's', blueprint_id: 'other' }]);
    expect(Blueprints.hasDownloadedCommunity('comm-x')).toBe(false);
  });

  it('returns false on missing id', () => {
    expect(Blueprints.hasDownloadedCommunity(null)).toBe(false);
    expect(Blueprints.hasDownloadedCommunity('')).toBe(false);
  });
});
